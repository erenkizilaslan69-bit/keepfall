using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace Keepfall.Server.Games;

/// <summary>
/// The friend-hosted game (the server runs on the host's own computer, strangers may come in through a public Steam lobby): what guards the host.
/// Guests reach nothing but the game hub and /version (<see cref="Allows"/>); the number of guest connections is capped, a connection that does
/// not take a seat in time is dropped, wrong room codes are counted per guest (not per connection), and the host can put a player out of the lobby
/// (the player's connections are closed and their address / Steam id may not join that room again). On every other server (the web one) nothing
/// here is ever reached: there are no guest connections.
/// </summary>
public sealed class GuestGate
{
    /// <summary>The header the desktop shell puts on a guest's request: the guest's LAN address or "steam:&lt;id&gt;". Only ever read on the guests' door, which nobody but the shell can reach.</summary>
    public const string PeerHeader = "X-Keepfall-Peer";
    /// <summary>Guest hub connections at once: three seats, with room for a reconnect overlapping the old line and somebody being told "full".</summary>
    public const int MaxConnections = 12;
    /// <summary>Guest connections bound to one room: three guests, two lines each (a reconnect overlaps).</summary>
    public const int MaxPerRoom = 6;
    /// <summary>A guest connection that has not taken a seat after this long is closed.</summary>
    public static readonly TimeSpan JoinTime = TimeSpan.FromSeconds(20);
    /// <summary>Wrong room codes a guest may send in a minute (over all of its connections).</summary>
    public const int MaxWrongCodes = 6;

    private sealed record Line(HubCallerContext Context, string Peer) { public string? Code; public string? Token; }
    private readonly ConcurrentDictionary<string, Line> _lines = new();
    private readonly ConcurrentDictionary<string, List<DateTime>> _misses = new();
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, bool>> _banned = new(); // room code → peers

    /// <summary>What a guest may ask of the host's server: the hub (its negotiate and socket) and the build's name. Nothing else: no files, no APIs.</summary>
    public static bool Allows(HttpRequest request)
    {
        var path = request.Path;
        if (path.StartsWithSegments("/hub", StringComparison.Ordinal)) return true;
        return HttpMethods.IsGet(request.Method) && path.Equals("/version", StringComparison.Ordinal);
    }

    public static string PeerOf(HttpContext? http)
    {
        var raw = http?.Request.Headers[PeerHeader].FirstOrDefault() ?? "";
        // (the shell writes its header first; anything a guest adds comes after it)
        var first = raw.Split(',')[0].Trim();
        return first.Length is > 0 and <= 64 && first.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or ':' or '-') ? first : "unknown";
    }

    /// <summary>A guest's hub connection opened. False: too many, close it.</summary>
    public bool Opened(HubCallerContext context)
    {
        if (_lines.Count >= MaxConnections) return false;
        var line = new Line(context, PeerOf(context.GetHttpContext()));
        _lines[context.ConnectionId] = line;
        // no seat taken in time: the line is closed (a stranger cannot sit on the host's connections)
        _ = Task.Delay(JoinTime).ContinueWith(_ => { if (_lines.TryGetValue(context.ConnectionId, out var l) && l.Code is null) context.Abort(); }, TaskScheduler.Default);
        return true;
    }

    public void Closed(string connectionId) => _lines.TryRemove(connectionId, out _);

    public string PeerOf(string connectionId) => _lines.TryGetValue(connectionId, out var l) ? l.Peer : "unknown";

    /// <summary>May this guest try a room code now? (Counted per guest, so opening new connections does not buy new guesses.)</summary>
    public bool MayGuess(string connectionId)
    {
        var list = _misses.GetOrAdd(PeerOf(connectionId), _ => []);
        lock (list) { list.RemoveAll(t => DateTime.UtcNow - t > TimeSpan.FromMinutes(1)); return list.Count < MaxWrongCodes; }
    }

    public void Missed(string connectionId)
    {
        if (_misses.Count > 512) _misses.Clear(); // (never grows without bound)
        var list = _misses.GetOrAdd(PeerOf(connectionId), _ => []);
        lock (list) list.Add(DateTime.UtcNow);
    }

    public bool IsBanned(string connectionId, string code) => _banned.TryGetValue(code, out var peers) && PeerOf(connectionId) is var p && p != "unknown" && peers.ContainsKey(p);

    /// <summary>Room for one more guest line in this room?</summary>
    public bool RoomHasSpace(string code) => _lines.Values.Count(l => l.Code == code) < MaxPerRoom;

    public void Bound(string connectionId, string code, string token)
    {
        if (_lines.TryGetValue(connectionId, out var l)) { l.Code = code; l.Token = token; }
    }

    public void Unbound(string connectionId)
    {
        // (back in the menu of the host's server there is nothing for a guest to do: the join clock runs again)
        if (_lines.TryGetValue(connectionId, out var l)) { l.Code = null; l.Token = null; _ = Task.Delay(JoinTime).ContinueWith(_ => { if (_lines.TryGetValue(connectionId, out var again) && again.Code is null) again.Context.Abort(); }, TaskScheduler.Default); }
    }

    /// <summary>The host put the player with this token out of the room: their lines (to close after the goodbye) and, from now on, no way back in for their address.</summary>
    public List<HubCallerContext> Kick(string code, string token)
    {
        var lines = _lines.Values.Where(l => l.Code == code && l.Token == token).ToList();
        var peers = _banned.GetOrAdd(code, _ => new());
        foreach (var l in lines) if (l.Peer != "unknown") peers[l.Peer] = true;
        return lines.Select(l => l.Context).ToList();
    }

    public void RoomClosed(string code) => _banned.TryRemove(code, out _);
}
