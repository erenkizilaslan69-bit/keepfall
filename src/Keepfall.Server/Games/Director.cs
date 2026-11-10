using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Keepfall.Core.Lobby;
using Keepfall.Views;

namespace Keepfall.Server.Games;

/// <summary>
/// The "director" (cameraman) connection, for recording trailer and store footage of real matches: a hidden watcher that sees the whole world live
/// (no fog, phantom armies marked), is not a player, is not in the room's list, and sends no commands. It exists only when the server is started with
/// <c>Keepfall__DirectorKey</c> (16+ characters) and is never on in the hosted (Render) or Steam builds, whatever the configuration says.
/// The page asks with <c>?director=&lt;key&gt;</c> (tools/director.mjs). See docs/kameraman.md.
/// </summary>
public sealed class Director(Microsoft.Extensions.Options.IOptions<KeepfallOptions> options)
{
    public const int MinKeyLength = 16;

    /// <summary>Group of the director connections watching one room.</summary>
    public static string Group(string code) => $"yonetmen:{code}";

    /// <summary>Why the director is off, or null when it is on.</summary>
    public static string? OffReason(KeepfallOptions o)
    {
        if (string.IsNullOrEmpty(o.DirectorKey)) return "no Keepfall:DirectorKey";
        if (o.DirectorKey.Length < MinKeyLength) return $"Keepfall:DirectorKey is shorter than {MinKeyLength} characters";
        if (Environment.GetEnvironmentVariable("RENDER") is not null) return "hosted server (Render)";
        if (Environment.GetEnvironmentVariable("KEEPFALL_STEAM") is not null) return "Steam build";
        return null;
    }

    public bool Enabled => OffReason(options.Value) is null;

    /// <summary>The key is right (and the director is on at all). Constant time.</summary>
    public bool Accepts(string? key)
    {
        if (!Enabled || key is null) return false;
        var a = Encoding.UTF8.GetBytes(key);
        var b = Encoding.UTF8.GetBytes(options.Value.DirectorKey);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    /// <summary>Room code → how many director connections watch it (the tick loop sends the director pictures only to rooms that have one).</summary>
    private readonly ConcurrentDictionary<string, int> _watchers = new();
    public void Watch(string code) => _watchers.AddOrUpdate(code, 1, (_, n) => n + 1);
    public void Unwatch(string code) => _watchers.AddOrUpdate(code, 0, (_, n) => Math.Max(0, n - 1));
    public bool IsWatched(string code) => _watchers.TryGetValue(code, out var n) && n > 0;

    /// <summary>The seat whose castle the director's page is built around (the first human, else the first seat): the page draws every castle anyway.</summary>
    public static RoomPlayer? Anchor(Room room) =>
        room.Players.Where(p => !p.IsBot).OrderBy(p => p.Seat).FirstOrDefault() ?? room.Players.OrderBy(p => p.Seat).FirstOrDefault();

    /// <summary>This tick's whole-world picture for the director: the fallen players' picture, live, with phantom armies marked (<c>Fake</c>).</summary>
    public static SpectatorStateView? Frame(RoomSession session)
    {
        if (session.Spectators.Latest is not { } frame || session.Room.Game is not { } game) return null;
        var decoys = game.DecoyIds();
        if (decoys.Count == 0) return frame;
        return frame with { Movers = frame.Movers.Select(m => decoys.Contains(m.Id) ? m with { Fake = true } : m).ToList() };
    }
}

/// <summary>A room the director can watch.</summary>
public sealed record DirectorRoomView(string Code, string Phase, int Humans, int Bots, double ElapsedSeconds);
