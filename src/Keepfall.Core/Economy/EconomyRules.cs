namespace Keepfall.Core.Economy;

/// <summary>Match timing and starting state ("Maç" sheet).</summary>
public sealed record MatchRules(
    double ShortModePrepSeconds,
    double LongModePrepSeconds,
    double ServerTickSeconds,
    int StartingPopulation,
    double StartingFood,
    double StartingWood,
    double StartingIron);

/// <summary>One row of the shared building table. Upgrade cost and time are what it takes to reach this level.</summary>
public sealed record BuildingLevel(
    int Level,
    int Capacity,
    double Multiplier,
    double UpgradeWood,
    double UpgradeIron,
    double UpgradeSeconds);

/// <summary>Consumption, growth and building rules ("Ekonomi" and "Binalar" sheets).</summary>
public sealed record EconomyRules(
    double WorkerFoodPerMinute,
    double SoldierFoodPerMinute,
    double StarvationMultiplier,
    double NewPersonBaseCost,
    double NewPersonCostGrowth,
    int NewPersonBasePopulation,
    IReadOnlyList<BuildingLevel> BuildingLevels)
{
    public int MaxBuildingLevel => BuildingLevels.Count;

    public BuildingLevel Level(int level) => BuildingLevels[level - 1];

    /// <summary>Food needed for one more person at the given population (same formula as the spreadsheet).</summary>
    public double NewPersonCost(int population) =>
        Math.Round(NewPersonBaseCost * Math.Pow(1 + NewPersonCostGrowth, population - NewPersonBasePopulation),
            MidpointRounding.AwayFromZero);
}
