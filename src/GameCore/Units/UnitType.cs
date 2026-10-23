namespace Keepfall.GameCore.Units;

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
    Row DefaultRow)
{
    public double Dps => Damage / AttackInterval;

    public override string ToString() => Name;
}
