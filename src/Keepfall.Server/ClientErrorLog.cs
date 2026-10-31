using System.Collections.Concurrent;
using System.Text;

namespace Keepfall.Server;

/// <summary>What the browser sends when a script error or an unhandled promise rejection happens in the client.</summary>
public sealed record ClientError(string? Kind, string? Message, string? Stack, string? Source, int? Line, int? Col, string? Url, string? Room, int? Seat,
    string? Phase, string? UserAgent, double? ElapsedSeconds, string? Context);

/// <summary>
/// Client errors end up in the server log and in logs/client-errors.log, so a freeze that happened on someone's screen can be read afterwards.
/// Anyone can post here, so the body is small, every field is cut short, and one address gets only a handful per minute.
/// </summary>
public sealed class ClientErrorLog(ILogger<ClientErrorLog> logger, IHostEnvironment env)
{
    private const int MaxFieldLength = 2000, PerMinute = 30;
    private readonly string _path = Path.Combine(env.ContentRootPath, "logs", "client-errors.log");
    private readonly ConcurrentDictionary<string, (long Minute, int Count)> _seen = new();
    private readonly object _lock = new();

    public bool Write(string address, ClientError e, DateTimeOffset now)
    {
        long minute = now.ToUnixTimeSeconds() / 60;
        var count = _seen.AddOrUpdate(address, (minute, 1), (_, old) => old.Minute == minute ? (minute, old.Count + 1) : (minute, 1));
        if (count.Count > PerMinute) return false;

        var sb = new StringBuilder();
        sb.Append(now.ToString("u")).Append(" [").Append(Clean(e.Kind) ?? "error").Append("] ").AppendLine(Clean(e.Message) ?? "(no message)");
        sb.Append("    room=").Append(Clean(e.Room) ?? "-").Append(" seat=").Append(e.Seat?.ToString() ?? "-").Append(" phase=").Append(Clean(e.Phase) ?? "-")
          .Append(" t=").Append(e.ElapsedSeconds?.ToString("0.#") ?? "-").Append(" at=").Append(Clean(e.Source) ?? "-").Append(':').Append(e.Line).Append(':').Append(e.Col).AppendLine();
        sb.Append("    url=").Append(Clean(e.Url) ?? "-").Append(" ua=").AppendLine(Clean(e.UserAgent) ?? "-");
        if (!string.IsNullOrWhiteSpace(e.Context)) sb.Append("    context=").AppendLine(Clean(e.Context));
        if (!string.IsNullOrWhiteSpace(e.Stack))
            foreach (var line in Cut(e.Stack).Split('\n').Take(25)) sb.Append("      ").AppendLine(line.TrimEnd('\r'));

        logger.LogWarning("İstemci hatası: {Kind} {Message} (oda {Room}, koltuk {Seat})", Clean(e.Kind), Clean(e.Message), Clean(e.Room), e.Seat);
        try
        {
            lock (_lock)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                File.AppendAllText(_path, sb.ToString());
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { logger.LogError(ex, "İstemci hata günlüğü yazılamadı"); }
        return true;
    }

    private static string Cut(string s) => s.Length <= MaxFieldLength ? s : s[..MaxFieldLength] + "…";

    /// <summary>One line, cut short: nothing the browser sends can start a fake log entry.</summary>
    private static string? Clean(string? s) => s is null ? null : Cut(s).Replace('\r', ' ').Replace('\n', ' ');
}
