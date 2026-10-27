namespace Keepfall.Core.Economy;

/// <summary>Match timing and starting state ("Maç" sheet).</summary>
public sealed record MatchRules(
    double ShortModePrepSeconds,
    double LongModePrepSeconds,
    double ShortModeWarSeconds,
    double LongModeWarSeconds,
    double ServerTickSeconds,
    int StartingPopulation,
    double StartingFood,
    double StartingWood,
    double StartingIron,
    double SpectatorDelaySeconds,
    double SpectatorWaitSeconds,
    double SpectatorMinSeconds = 0,
    /// <summary>Turning a worker into a soldier takes this long: in between they neither work nor fight (0: at once). Hiring a mercenary is always at once.</summary>
    double ArmSeconds = 0);

/// <summary>War phase ("Maç" and "Binalar" sheets): famine, castle and siege.</summary>
public sealed record WarRules(
    double FamineStart,
    double FamineFoodMultiplier,
    double CastleHp,
    double SiegeSeconds,
    double ArcherSiegeMultiplier,
    double BattlePlayback,
    double EncounterRadius,
    double FallLootShare = 0,
    double FallWorkerShare = 0,
    double FamineStartSeconds = -1);

/// <summary>What it takes to raise the wall to a level: the wall's hit points at that level and the wood, iron and seconds of the upgrade.</summary>
public sealed record WallLevelRules(double Hp, double UpgradeWood, double UpgradeIron, double UpgradeSeconds);

/// <summary>
/// The wall round the castle ("Binalar" sheet, Sur): level 1 has <see cref="Level1Hp"/> (war.castleHp) and exists from the start; the upgrades are levels 2, 3…
/// The wall's hit points are what a siege has to bring down. <see cref="ArcherDefenseBonus"/>: the archers defending the gate shoot this much harder
/// (0.25 = +25 %) while the wall stands.
/// </summary>
public sealed record WallRules(double Level1Hp, IReadOnlyList<WallLevelRules> Upgrades, double ArcherDefenseBonus = 0)
{
    public int MaxLevel => 1 + Upgrades.Count;
    public double HpOf(int level) => level <= 1 ? Level1Hp : Upgrades[Math.Min(level, MaxLevel) - 2].Hp;
    /// <summary>The cost of raising the wall to <paramref name="level"/> (2 or more).</summary>
    public WallLevelRules UpgradeTo(int level) => Upgrades[level - 2];
}

/// <summary>Scout reports ("Maç" sheet): how wrong the soldier counts are. How long a mission takes depends on the map.</summary>
/// <param name="MaxScouts">Most scouts one player can have out at once (a spy, a tour of a quarter and a chest run all count).</param>
/// <param name="MaxCargo">An envoy carries at most this many goods in all (food, wood, iron and gold together).</param>
/// <param name="MaxMessageLength">Longest message an envoy carries (characters).</param>
/// <param name="ProfanityFilter">Messages have a short list of swear words masked with stars (off by default).</param>
public sealed record EnvoyRules(int MaxCargo = 40, int MaxMessageLength = 140, bool ProfanityFilter = false)
{
    public static EnvoyRules Default { get; } = new();
}

/// <param name="NoScoutLastPrepSeconds">No scout (spying, touring a quarter, a chest run) can leave in the last this many seconds of the preparation (0 = always allowed).</param>
public sealed record ScoutingRules(double ReportError, int MaxScouts = 1, double NoScoutLastPrepSeconds = 0);

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
    double GrowthReserveSeconds,
    IReadOnlyList<BuildingLevel> BuildingLevels)
{
    public int MaxBuildingLevel => BuildingLevels.Count;

    public BuildingLevel Level(int level) => BuildingLevels[level - 1];

    /// <summary>Food needed for one more person at the given population (same formula as the spreadsheet).</summary>
    public double NewPersonCost(int population) =>
        Math.Round(NewPersonBaseCost * Math.Pow(1 + NewPersonCostGrowth, population - NewPersonBasePopulation),
            MidpointRounding.AwayFromZero);
}
