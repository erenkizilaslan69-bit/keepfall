using System.Collections.Concurrent;
using Keepfall.Core;
using Keepfall.Core.Match;

namespace Keepfall.Server.Games;

public sealed class KeepfallOptions
{
    public string BalancePath { get; set; } = "";
    public bool AllowSpeedControl { get; set; }
    public double AbandonedGameMinutes { get; set; } = 10;
}

/// <summary>One player's game. Every read or write of <see cref="State"/> happens under <see cref="Lock"/>.</summary>
public sealed class GameSession(string playerId, GameState state)
{
    public static readonly int[] AllowedSpeeds = [1, 5, 20];

    public string PlayerId { get; } = playerId;
    public Lock Lock { get; } = new();
    public GameState State { get; set; } = state;
    public int Speed { get; set; } = 1;
    public bool SummarySent { get; set; }
    public int Connections { get; set; }
    public DateTime LastSeenUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Player id → game. Single-player for now: each player has their own castle.</summary>
public sealed class GameRegistry(GameRules rules)
{
    private readonly ConcurrentDictionary<string, GameSession> _sessions = new();

    public GameRules Rules { get; } = rules;

    public IEnumerable<GameSession> Sessions => _sessions.Values;

    public GameSession GetOrCreate(string playerId) =>
        _sessions.GetOrAdd(playerId, id => new GameSession(id, NewGame()));

    public GameSession? Find(string playerId) => _sessions.GetValueOrDefault(playerId);

    public GameState NewGame() => new(Rules);

    public void Remove(string playerId) => _sessions.TryRemove(playerId, out _);
}
