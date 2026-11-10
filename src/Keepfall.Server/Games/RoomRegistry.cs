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
    public double LobbyGraceMinutes { get; set; } = 1;
    /// <summary>Most rooms the server holds at once (lobbies and matches); 0 = no limit. A full server turns room creation and quick play away.</summary>
    public int MaxRooms { get; set; }
    /// <summary>How often the server writes its load line (active rooms, tick time, memory) to the log; 0 = never.</summary>
    public double StatsLogSeconds { get; set; } = 60;
    /// <summary>The director (cameraman) key: empty = no director. Never on on Render or in the Steam build (see <see cref="Director"/>).</summary>
    public string DirectorKey { get; set; } = "";
    /// <summary>
    /// The friend-hosted game (the Steam build's desktop shell): the local port that friends' connections arrive on (through the shell's LAN door or its Steam
    /// tunnel). 0 = not a hosted game. A connection on this port is a guest: it may join rooms but not make them, and never ends anybody's match.
    /// </summary>
    public int GuestPort { get; set; }
    /// <summary>Seconds without a connection after which a computer player plays a human's castle in a running match; 0 = never (the web server).</summary>
    public double TakeoverSeconds { get; set; }
    /// <summary>The build's name, told by /version: host and guest of a friend-hosted game must have the same one.</summary>
    public string Build { get; set; } = "";
}

/// <summary>A room plus the lock that guards it. Every read or write of <see cref="Room"/> happens under <see cref="Lock"/>.</summary>
public sealed class RoomSession(Room room, GameRules rules)
{
    public Room Room { get; } = room;
    public Lock Lock { get; } = new();
    /// <summary>The delayed pictures of the whole world that fallen players watch (guarded by <see cref="Lock"/>).</summary>
    public SpectatorFeed Spectators { get; } = new();
    /// <summary>The room's computer players; run before every simulated step (guarded by <see cref="Lock"/>).</summary>
    public Keepfall.BotHost.BotHost Bots { get; private set; } = new(rules, Random.Shared.Next());

    /// <summary>A challenge's bots roll their dice from the challenge's seed (call before the match starts).</summary>
    public void SeedBots(int seed) => Bots = new Keepfall.BotHost.BotHost(rules, seed);
}

/// <summary>Room code → room.</summary>
public sealed class RoomRegistry(GameRules rules, Microsoft.Extensions.Options.IOptions<KeepfallOptions> options)
{
    private readonly ConcurrentDictionary<string, RoomSession> _rooms = new();

    public IEnumerable<RoomSession> Sessions => _rooms.Values;

    public int Count => _rooms.Count;

    /// <summary>The room limit (<see cref="KeepfallOptions.MaxRooms"/>) is reached.</summary>
    public bool IsFull => options.Value.MaxRooms > 0 && _rooms.Count >= options.Value.MaxRooms;

    /// <summary>A new room, or null when the server is full.</summary>
    public RoomSession? Create()
    {
        if (IsFull) return null;
        var o = options.Value;
        var roomOptions = new RoomOptions
        {
            MinPlayers = o.AllowSoloStart ? 1 : 2,
            AllowSpeedControl = o.AllowSpeedControl,
            LobbyGrace = TimeSpan.FromMinutes(o.LobbyGraceMinutes),
            TakeoverGrace = o.TakeoverSeconds > 0 ? TimeSpan.FromSeconds(o.TakeoverSeconds) : null,
        };
        while (true)
        {
            var code = Tokens.NewRoomCode();
            var session = new RoomSession(new Room(code, rules, roomOptions), rules);
            if (_rooms.TryAdd(code, session)) return session;
        }
    }

    public RoomSession? Find(string? code) =>
        Tokens.NormalizeRoomCode(code) is { } c ? _rooms.GetValueOrDefault(c) : null;

    public void Remove(string code) => _rooms.TryRemove(code, out _);
}
