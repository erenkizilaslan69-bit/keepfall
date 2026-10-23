using Keepfall.GameCore.Units;

namespace Keepfall.GameCore;

public sealed record CombatSettings(
    double TickSeconds,
    double MaxBattleSeconds,
    bool RandomizeFirstAttack);

public sealed record ProductionRates(double FoodPerMinute, double WoodPerMinute, double IronPerMinute);

/// <summary>Everything the simulation needs, resolved from the balance config.</summary>
public sealed class GameRules
{
    public GameRules(IReadOnlyList<UnitType> units, CounterMatrix counters, CombatSettings combat, ProductionRates production)
    {
        Units = units;
        Counters = counters;
        Combat = combat;
        Production = production;
    }

    public IReadOnlyList<UnitType> Units { get; }
    public CounterMatrix Counters { get; }
    public CombatSettings Combat { get; }
    public ProductionRates Production { get; }

    public UnitType? FindUnit(string idOrName) =>
        Units.FirstOrDefault(u => string.Equals(u.Id, idOrName, StringComparison.OrdinalIgnoreCase)
                               || string.Equals(u.Name, idOrName, StringComparison.CurrentCultureIgnoreCase));

    /// <summary>
    /// Resource cost expressed in wood: each resource is weighted by how long one worker needs to
    /// produce it relative to wood (e.g. 1 iron = woodRate / ironRate wood).
    /// </summary>
    public double ResourceValueInWood(UnitType unit) =>
        unit.Cost.Wood
        + unit.Cost.Iron * Production.WoodPerMinute / Production.IronPerMinute
        + unit.Cost.Food * Production.WoodPerMinute / Production.FoodPerMinute;
}
