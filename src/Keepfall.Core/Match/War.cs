using Keepfall.Core.Economy;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Match;

public enum ArmyState { Marching, Returning }

/// <summary>
/// An army on the road, walking from its castle's gate to the target's along the map's roads and
/// back. Its owner knows everything about it. Anybody else only learns what they see: while it is in
/// their vision they see where it is, which way it goes and its soldiers (<see cref="SeenMover"/>),
/// and the target is warned once it comes into sight of the castle.
/// </summary>
public sealed class ArmyMarch
{
    internal ArmyMarch(int id, string publicId, string from, string target, IReadOnlyDictionary<UnitType, int> units,
        IReadOnlyDictionary<UnitType, Row> rows, UnitType? archerPriority, double departedAt, Route route, double speed,
        ArmyMode mode = ArmyMode.Attack)
    {
        Mode = mode;
        Id = id;
        PublicId = publicId;
        From = from;
        Target = target;
        Units = units;
        Rows = rows;
        ArcherPriority = archerPriority;
        DepartedAt = departedAt;
        Out = new Traveller(route, speed);
    }

    public int Id { get; }
    /// <summary>What other players see it as: random, so it gives nothing away.</summary>
    public string PublicId { get; }
    public string From { get; }
    public string Target { get; }
    /// <summary>Who marches (fewer after a battle on the road).</summary>
    public IReadOnlyDictionary<UnitType, int> Units { get; internal set; }
    /// <summary>Attack the castle or cut off the road. Only the owner ever knows.</summary>
    public ArmyMode Mode { get; }
    public IReadOnlyDictionary<UnitType, Row> Rows { get; }
    public UnitType? ArcherPriority { get; }
    public double DepartedAt { get; }
    /// <summary>The way to the target.</summary>
    public Traveller Out { get; }
    /// <summary>The way home after the battle; null while marching.</summary>
    public Traveller? Back { get; internal set; }
    public Traveller Leg => Back ?? Out;
    /// <summary>The battle it is fighting right now; it does not move until that is over.</summary>
    public ActiveBattle? Battle { get; internal set; }
    /// <summary>The target has seen it coming (and been warned).</summary>
    public bool Sighted { get; internal set; }
    public ArmyState State { get; internal set; } = ArmyState.Marching;
    /// <summary>Who is walking home after the battle (empty while marching).</summary>
    public IReadOnlyDictionary<UnitType, int> Survivors { get; internal set; } = new Dictionary<UnitType, int>();

    public int Size => State == ArmyState.Marching ? Units.Values.Sum() : Survivors.Values.Sum();
    /// <summary>Who is walking right now: everyone on the way there, the survivors on the way back.</summary>
    public IReadOnlyDictionary<UnitType, int> Walking => State == ArmyState.Marching ? Units : Survivors;
    public Vec Velocity => Leg.Arrived ? new Vec(0, 0) : Leg.Direction * Leg.Speed;

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
    bool DefenderEliminated,
    BattleKind Kind = BattleKind.Siege);

/// <summary>Place 1 is the winner (several players can share it on a tie).</summary>
public sealed record RankedPlayer(string Player, int Place, int Population, bool Eliminated, double? EliminatedAt);

public sealed record MatchResult(IReadOnlyList<string> Winners, IReadOnlyList<RankedPlayer> Ranking, bool ByElimination);

/// <summary>War figures for the end-of-match summary.</summary>
public sealed record WarStats(
    int AttacksLaunched, int SoldiersLost, int EnemiesKilled, double CastleDamageDealt, double CastleDamageTaken,
    double WallHp, double MaxWallHp, bool Eliminated, double GoldGained = 0, double GoldSpent = 0, int MercenariesHired = 0);
