using Keepfall.Core.Units;

namespace Keepfall.Core.Combat;

/// <summary>One soldier in a recorded battle. Indices run over side A first, then side B.</summary>
public sealed record RecordedSoldier(int Index, int Side, UnitType Type, Row Row);

/// <summary>
/// Everything that happened in a battle, compact enough to send to a client and replay exactly:
/// who hit whom, who fell and when reserves stepped forward. Times are simulation ticks
/// (<see cref="TickSeconds"/> each); the flat lists hold fixed-size groups of ints.
/// </summary>
public sealed class BattleRecord
{
    private readonly List<int> _hits = [];
    private readonly List<int> _deaths = [];
    private readonly List<int> _advances = [];

    internal BattleRecord(IReadOnlyList<RecordedSoldier> soldiers, double tickSeconds)
    {
        Soldiers = soldiers;
        TickSeconds = tickSeconds;
    }

    public IReadOnlyList<RecordedSoldier> Soldiers { get; }
    public double TickSeconds { get; }
    /// <summary>How many ticks the battle lasted.</summary>
    public int Ticks { get; internal set; }

    /// <summary>[tick, attacker, target] per hit.</summary>
    public IReadOnlyList<int> Hits => _hits;
    /// <summary>[tick, soldier] per death.</summary>
    public IReadOnlyList<int> Deaths => _deaths;
    /// <summary>[tick, soldier] per reserve stepping into the front row.</summary>
    public IReadOnlyList<int> Advances => _advances;

    public int HitCount => _hits.Count / 3;

    internal void Hit(int tick, int attacker, int target) { _hits.Add(tick); _hits.Add(attacker); _hits.Add(target); }
    internal void Death(int tick, int soldier) { _deaths.Add(tick); _deaths.Add(soldier); }
    internal void Advance(int tick, int soldier) { _advances.Add(tick); _advances.Add(soldier); }
}
