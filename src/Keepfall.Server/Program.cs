using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.Core.Config;
using Keepfall.Server;
using Keepfall.Server.Games;
using Keepfall.Server.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Hosting platforms (Render, Railway, ...) hand the port over in PORT; without it the usual --urls / ASPNETCORE_URLS rules apply.
if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var hostPort) && hostPort is > 0 and < 65536
    && string.IsNullOrEmpty(builder.Configuration["urls"]))
    builder.WebHost.UseUrls($"http://0.0.0.0:{hostPort}");

builder.Services.Configure<KeepfallOptions>(builder.Configuration.GetSection("Keepfall"));
var options = builder.Configuration.GetSection("Keepfall").Get<KeepfallOptions>() ?? new KeepfallOptions();

string balancePath = !string.IsNullOrWhiteSpace(options.BalancePath)
    ? options.BalancePath
    : BalanceConfigLoader.FindDefaultPath(builder.Environment.ContentRootPath)
      ?? BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
      ?? throw new BalanceConfigException("config/balance.json bulunamadı; Keepfall:BalancePath ile yol ver.");
var rules = BalanceConfigLoader.LoadFromFile(balancePath);

builder.Services.AddSingleton(rules);
builder.Services.AddSingleton(Keepfall.Core.Challenges.ChallengeCatalog.LoadBeside(balancePath, rules));
builder.Services.AddSingleton<RoomRegistry>();
builder.Services.AddSingleton<Director>();
builder.Services.AddSingleton<ServerStats>();
builder.Services.AddSingleton<ClientErrorLog>();
builder.Services.AddHostedService<TickLoop>();
// The page may be served from another address than the game server (an itch.io / CrazyGames iframe talking to the hosted server).
// There are no cookies or passwords, a seat is held by a token the page sends itself, so any origin may call (a game portal's iframe has a changing
// origin). SetIsOriginAllowed(true) rather than AllowAnyOrigin so that AllowCredentials is possible too (the wildcard cannot be combined with it).
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(o =>
{
    // behind the host's proxy: the real client address (the error log's rate limit) and scheme come from X-Forwarded-*
    o.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});
builder.Services.AddSignalR(o =>
{
    // A phone on Wi-Fi/4G has short gaps: the server waits a minute for a sign of life (the client sends one every 10 s) before it calls a connection dead.
    o.KeepAliveInterval = TimeSpan.FromSeconds(10);
    o.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
}).AddJsonProtocol(o =>
    o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

var app = builder.Build();
app.Logger.LogInformation("Ayar dosyası: {Path}", Path.GetFullPath(balancePath));
if (Director.OffReason(options) is { } directorOff)
{
    if (!string.IsNullOrEmpty(options.DirectorKey)) app.Logger.LogWarning("Director (cameraman) connection OFF: {Reason}", directorOff);
}
else app.Logger.LogWarning("Director (cameraman) connection ON: a page with ?director=<key> sees the whole map. Recording/dev only.");
app.UseForwardedHeaders();
app.UseRouting(); // CORS needs the endpoint (the hub's negotiate and WebSocket upgrade) to be routed first: UseRouting -> UseCors -> MapHub
app.UseCors();

// A production build of the client (client/dist) can be served from here; in development Vite serves it.
var clientDist = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(balancePath)!, "..", "client", "dist"));
if (Directory.Exists(clientDist))
{
    var files = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(clientDist);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
}

app.MapHub<GameHub>("/hub");
app.MapGet("/health", () => "ok");
// For an uptime pinger (cron-job.org, UptimeRobot): a free host sleeps after ~15 minutes without a request, and a sleeping server loses its rooms.
app.MapGet("/ping", () => "pong");
// What the running server is (for checking that a deploy went out): the conversation version and the build it was made from (RENDER_GIT_COMMIT on Render).
app.MapGet("/version", () => Results.Json(new { protocol = Keepfall.Server.Hubs.GameHub.Protocol, commit = Environment.GetEnvironmentVariable("RENDER_GIT_COMMIT") ?? "local", build = options.Build, hosted = options.GuestPort > 0 }));
// The friend-hosted game (the desktop shell): the host is quitting. Every running match that friends are in ends where it stands and they get the end screen
// and the summary; the shell calls this from its own machine just before it stops the server. Guests (and every other server) get 404.
app.MapPost("/api/host/stop", async (HttpContext http, RoomRegistry registry, Microsoft.AspNetCore.SignalR.IHubContext<GameHub> hub) =>
{
    if (options.GuestPort <= 0 || GameHub.IsGuestConnection(http, options)) return Results.NotFound();
    int ended = 0;
    foreach (var session in registry.Sessions)
        if (await HostedMatch.End(hub.Clients, session)) ended++;
    return Results.Json(new { ended });
});
// The numbers of the "how to play" page: public rules only, read from the balance config (so the page follows the config).
var guide = Keepfall.Views.GuideMapper.Of(rules);
app.MapGet("/api/guide", () => Results.Json(guide));
// Script errors and unhandled rejections from the browser (see client/src/error-report.ts); the body is capped and the address rate-limited.
app.MapPost("/api/client-log", async (HttpContext http, ClientErrorLog log) =>
{
    if (http.Request.ContentLength is null or > 8192) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
    ClientError? error;
    try { error = await http.Request.ReadFromJsonAsync<ClientError>(); }
    catch (Exception e) when (e is JsonException or BadHttpRequestException) { return Results.BadRequest(); }
    if (error is null) return Results.BadRequest();
    return log.Write(http.Connection.RemoteIpAddress?.ToString() ?? "?", error, DateTimeOffset.UtcNow) ? Results.NoContent() : Results.StatusCode(StatusCodes.Status429TooManyRequests);
});

// Client-side routes such as /oda/ABCD load the single-page app.
if (Directory.Exists(clientDist))
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(clientDist),
    });

// The desktop shell of the offline Steam demo starts this server and names itself in KEEPFALL_PARENT_PID: if that process is gone (killed, crashed)
// the server stops too, so no orphan keeps running. Unset everywhere else (Render, Production, tests).
if (int.TryParse(Environment.GetEnvironmentVariable("KEEPFALL_PARENT_PID"), out var parentPid) && parentPid > 0)
{
    try
    {
        var parent = System.Diagnostics.Process.GetProcessById(parentPid);
        _ = parent.WaitForExitAsync().ContinueWith(_ => app.Lifetime.StopApplication());
    }
    catch (ArgumentException) { app.Lifetime.StopApplication(); } // the parent is already gone
}

app.Run();
