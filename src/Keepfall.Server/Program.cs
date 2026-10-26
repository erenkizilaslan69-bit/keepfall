using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.Core.Config;
using Keepfall.Server;
using Keepfall.Server.Games;
using Keepfall.Server.Hubs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<KeepfallOptions>(builder.Configuration.GetSection("Keepfall"));
var options = builder.Configuration.GetSection("Keepfall").Get<KeepfallOptions>() ?? new KeepfallOptions();

string balancePath = !string.IsNullOrWhiteSpace(options.BalancePath)
    ? options.BalancePath
    : BalanceConfigLoader.FindDefaultPath(builder.Environment.ContentRootPath)
      ?? BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
      ?? throw new BalanceConfigException("config/balance.json bulunamadı; Keepfall:BalancePath ile yol ver.");
var rules = BalanceConfigLoader.LoadFromFile(balancePath);

builder.Services.AddSingleton(rules);
builder.Services.AddSingleton<RoomRegistry>();
builder.Services.AddSingleton<ClientErrorLog>();
builder.Services.AddHostedService<TickLoop>();
builder.Services.AddSignalR().AddJsonProtocol(o =>
    o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

var app = builder.Build();
app.Logger.LogInformation("Ayar dosyası: {Path}", Path.GetFullPath(balancePath));

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

app.Run();
