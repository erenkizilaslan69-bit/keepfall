namespace Keepfall.Core.Units;

public enum AttackRange { Melee, Ranged }

public enum Row { Front, Back }

public sealed record ResourceCost(double Iron, double Wood, double Food, int People);

/// <summary>A unit definition loaded from config. Immutable; shared by every soldier of this type.</summary>
public sealed record UnitType(
    int Index,
    string Id,
    string Name,
    int Phase,
    ResourceCost Cost,
    double BuildSeconds,
    double Hp,
    double Damage,
    double AttackInterval,
    AttackRange Range,
    Row DefaultRow,
    double Heal = 0,
    double HealInterval = 0,
    int SplashTargets = 0,
    double SplashFactor = 0,
    bool BackFirst = false,
    bool Flank = false,
    double SpeedFactor = 1,
    bool Raider = false,
    double HealBudget = 0)
{
    /// <summary>Damage per second (0 for a healer).</summary>
    public double Dps => Damage / AttackInterval;
    /// <summary>The soldier can hurt an enemy (a healer cannot).</summary>
    public bool Hurts => Damage > 0;
    /// <summary>Back-row support that a flanking unit goes for: shooters and healers.</summary>
    public bool IsSupport => Range == AttackRange.Ranged || Heal > 0;

    public override string ToString() => Name;
}
