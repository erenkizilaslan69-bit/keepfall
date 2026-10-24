using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Server.Contracts;

namespace Keepfall.Server.Games;

/// <summary>
/// Pictures of the whole world for the fallen players to watch, <c>delay</c> game seconds late (0 = live). After
/// their castle falls they get a countdown for <c>wait</c> game seconds; their view then starts, from that moment
/// on. Everything here runs under the room's lock.
/// </summary>
public sealed class SpectatorFeed
{
    private readonly List<SpectatorStateView> _frames = [];
    /// <summary>Seat → game time their castle was seen fallen.</summary>
    private readonly Dictionary<int, double> _fellAt = [];
    /// <summary>Seat → the earliest picture still to be sent to them.</summary>
    private readonly Dictionary<int, double> _next = [];
    private readonly Dictionary<int, SpectatorStateView> _last = [];
    private GameState? _game;
    private double _now;

    /// <summary>Take this tick's picture (call after the game ticked) and forget the ones nobody needs any more.</summary>
    public void Capture(Room room, double delay, double wait)
    {
        if (room.Game is not { } game) { Reset(null); return; }
        if (!ReferenceEquals(game, _game)) Reset(game);
        if (SpectatorMapper.Capture(room) is not { } frame) return;
        _now = frame.ElapsedSeconds;
        foreach (var castle in frame.Castles)
            if (castle.Eliminated && _fellAt.TryAdd(castle.Seat, frame.ElapsedSeconds))
                _next[castle.Seat] = frame.ElapsedSeconds + wait;
        _frames.Add(frame);
        var keepFrom = _now - delay;
        foreach (var next in _next.Values) keepFrom = Math.Min(keepFrom, next);
        _frames.RemoveAll(f => f.ElapsedSeconds < keepFrom);
    }

    /// <summary>
    /// What to send now, per fallen player: the pictures that are due (in order), or how long until the
    /// first one. Players still in the match are never in the result.
    /// </summary>
    public List<(int Seat, List<SpectatorStateView> Frames, SpectatorWaitView? Wait)> TakeDue(Room room, double delay, double wait)
    {
        var result = new List<(int, List<SpectatorStateView>, SpectatorWaitView?)>();
        if (room.Game is not { } game || !ReferenceEquals(game, _game)) return result;
        foreach (var p in room.Players)
        {
            if (!game.IsEliminated(p.CastleKey) || !_fellAt.TryGetValue(p.Seat, out var fell)) continue;
            var next = _next[p.Seat];
            var due = _frames.Where(f => f.ElapsedSeconds >= next && f.ElapsedSeconds <= _now - delay + 1e-9)
                .OrderBy(f => f.ElapsedSeconds).ToList();
            if (due.Count > 0)
            {
                _next[p.Seat] = due[^1].ElapsedSeconds + 1e-6;
                _last[p.Seat] = due[^1] with { Started = [] };
                result.Add((p.Seat, due, null));
            }
            else if (!_last.ContainsKey(p.Seat))
                result.Add((p.Seat, [], new SpectatorWaitView(Math.Max(0, fell + wait + delay - _now))));
        }
        return result;
    }

    /// <summary>The latest picture this fallen player was sent (for a reconnect); null if none yet or if they are still playing.</summary>
    public SpectatorStateView? LatestFor(Room room, RoomPlayer player) =>
        room.IsEliminated(player) && _last.TryGetValue(player.Seat, out var frame) ? frame : null;

    private void Reset(GameState? game)
    {
        _game = game;
        _frames.Clear();
        _fellAt.Clear();
        _next.Clear();
        _last.Clear();
    }
}
