using System.Text.Json;
using System.Text.Json.Serialization;
using Keepfall.Core.Config;
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
builder.Services.AddSingleton<GameRegistry>();
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

app.Run();
