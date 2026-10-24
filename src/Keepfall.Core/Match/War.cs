using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

public enum ArmyState { Marching, Returning }

/// <summary>
/// An army on the road, walking from its castle's gate to the target's along the map's roads and
/// back. Only its owner ever learns about it; the target gets a warning shortly before it arrives
/// that says who it comes from — never how big it is or what it is made of.
/// </summary>
public sealed class ArmyMarch
{
    internal ArmyMarch(int id, string from, string target, IReadOnlyDictionary<UnitType, int> units,
        IReadOnlyDictionary<UnitType, Row> rows, UnitType? archerPriority, double departedAt, Route route, double speed)
    {
        Id = id;
        From = from;
        Target = target;
        Units = units;
        Rows = rows;
        ArcherPriority = archerPriority;
        DepartedAt = departedAt;
        Out = new Traveller(route, speed);
    }

    public int Id { get; }
    public string From { get; }
    public string Target { get; }
    public IReadOnlyDictionary<UnitType, int> Units { get; }
    public IReadOnlyDictionary<UnitType, Row> Rows { get; }
    public UnitType? ArcherPriority { get; }
    public double DepartedAt { get; }
    /// <summary>The way to the target.</summary>
    public Traveller Out { get; }
    /// <summary>The way home after the battle; null while marching.</summary>
    public Traveller? Back { get; internal set; }
    public Traveller Leg => Back ?? Out;
    public bool Warned { get; internal set; }
    public ArmyState State { get; internal set; } = ArmyState.Marching;
    /// <summary>Who is walking home after the battle (empty while marching).</summary>
    public IReadOnlyDictionary<UnitType, int> Survivors { get; internal set; } = new Dictionary<UnitType, int>();

    public int Size => State == ArmyState.Marching ? Units.Values.Sum() : Survivors.Values.Sum();

    public Vec Position => Leg.Position;
    /// <summary>Seconds until it reaches the target (marching) or home (returning).</summary>
    public double SecondsLeft => Leg.SecondsLeft;

    /// <summary>0 → 1 out to the target, then 1 → 0 back home.</summary>
    public double Distance => Back is null ? Out.Fraction : 1 - Back.Fraction;
}

public enum BattleWinner { Attacker, Defender, Draw }

/// <summary>One soldier type on one side of a battle: how many fought and how many fell.</summary>
public sealed record BattleUnitLine(string UnitId, string Name, int Count, int Lost);

/// <summary>
/// The outcome of an attack, given to the two players involved and nobody else. Both see both
/// armies exactly as they fought.
/// </summary>
public sealed record BattleReport(
    int Id,
    double At,
    string Attacker,
    string Defender,
    IReadOnlyList<BattleUnitLine> AttackerUnits,
    IReadOnlyList<BattleUnitLine> DefenderUnits,
    BattleWinner Winner,
    double CastleDamage,
    double CastleHpAfter,
    double CastleHpMax,
    bool DefenderEliminated);

/// <summary>Place 1 is the winner (several players can share it on a tie).</summary>
public sealed record RankedPlayer(string Player, int Place, int Population, bool Eliminated, double? EliminatedAt);

public sealed record MatchResult(IReadOnlyList<string> Winners, IReadOnlyList<RankedPlayer> Ranking, bool ByElimination);

/// <summary>War figures for the end-of-match summary.</summary>
public sealed record WarStats(
    int AttacksLaunched, int SoldiersLost, int EnemiesKilled, double CastleDamageDealt, double CastleDamageTaken,
    double WallHp, double MaxWallHp, bool Eliminated);
