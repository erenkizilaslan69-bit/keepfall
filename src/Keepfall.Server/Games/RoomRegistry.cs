using System.Collections.Concurrent;
using Keepfall.Core;
using Keepfall.Core.Lobby;

namespace Keepfall.Server.Games;

public sealed class KeepfallOptions
{
    public string BalancePath { get; set; } = "";
    /// <summary>Dev-only ×5 / ×20 speed (host only).</summary>
    public bool AllowSpeedControl { get; set; }
    /// <summary>Dev-only: let a single player start a match.</summary>
    public bool AllowSoloStart { get; set; }
    /// <summary>Rooms with nobody connected for this long are dropped.</summary>
    public double AbandonedRoomMinutes { get; set; } = 10;
    public double LobbyGraceMinutes { get; set; } = 2;
}

/// <summary>A room plus the lock that guards it. Every read or write of <see cref="Room"/> happens under <see cref="Lock"/>.</summary>
public sealed class RoomSession(Room room)
{
    public Room Room { get; } = room;
    public Lock Lock { get; } = new();
    /// <summary>The delayed pictures of the whole world that fallen players watch (guarded by <see cref="Lock"/>).</summary>
    public SpectatorFeed Spectators { get; } = new();
}

/// <summary>Room code → room.</summary>
public sealed class RoomRegistry(GameRules rules, Microsoft.Extensions.Options.IOptions<KeepfallOptions> options)
{
    private readonly ConcurrentDictionary<string, RoomSession> _rooms = new();

    public IEnumerable<RoomSession> Sessions => _rooms.Values;

    public RoomSession Create()
    {
        var o = options.Value;
        var roomOptions = new RoomOptions
        {
            MinPlayers = o.AllowSoloStart ? 1 : 2,
            AllowSpeedControl = o.AllowSpeedControl,
            LobbyGrace = TimeSpan.FromMinutes(o.LobbyGraceMinutes),
        };
        while (true)
        {
            var code = Tokens.NewRoomCode();
            var session = new RoomSession(new Room(code, rules, roomOptions));
            if (_rooms.TryAdd(code, session)) return session;
        }
    }

    public RoomSession? Find(string? code) =>
        Tokens.NormalizeRoomCode(code) is { } c ? _rooms.GetValueOrDefault(c) : null;

    public void Remove(string code) => _rooms.TryRemove(code, out _);
}
