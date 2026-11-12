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
    double ArmSeconds = 0,
    /// <summary>The guided first match: the humans' castles are left alone by computer players this long (game seconds) from the start of the war.</summary>
    double GuidedShieldSeconds = 180,
    /// <summary>During the preparation everything of the castle's economy (production, forge, arming, upgrades, growth) runs this many times faster than the clock, so a shorter preparation ends with the same castle (1: as it was).</summary>
    double PrepSpeed = 1,
    /// <summary>The guided first match (the tutorial) has this long a preparation (game seconds) at the plain speed (no prepSpeed): a new player is not hurried.</summary>
    double GuidedPrepSeconds = 480,
    /// <summary>The three match lengths (quick / standard / long). Null: only the short mode above exists and every mode means it.</summary>
    IReadOnlyDictionary<MatchMode, ModeRules>? Modes = null)
{
    /// <summary>The numbers of a mode; a config without a mode table gives the short mode for all of them.</summary>
    public ModeRules ModeOf(MatchMode mode)
    {
        ModeRules? m = null;
        Modes?.TryGetValue(mode, out m);
        // Quick IS the short mode the game always had: its lengths and speed stay the match.shortMode* / match.prepSpeed numbers (so every tool and test that sets them keeps working);
        // the table only adds its scouting lock.
        if (mode == MatchMode.Quick) return new ModeRules(ShortModePrepSeconds, PrepSpeed, ShortModeWarSeconds, m?.NoScoutLastPrepSeconds ?? -1);
        return m ?? new ModeRules(ShortModePrepSeconds, PrepSpeed, ShortModeWarSeconds, -1);
    }
}

/// <summary>The match lengths a host chooses from. Quick is the preparation the game always had.</summary>
public enum MatchMode { Quick = 0, Standard = 1, Long = 2 }

/// <param name="PrepSeconds">Preparation length (clock seconds).</param>
/// <param name="PrepSpeed">The castle's economy runs this many times faster than the clock during this preparation (1: plain).</param>
/// <param name="WarSeconds">War length.</param>
/// <param name="NoScoutLastPrepSeconds">The last this many seconds of the preparation nobody can send a scout (negative: scouting.noScoutLastPrepSeconds).</param>
public sealed record ModeRules(double PrepSeconds, double PrepSpeed, double WarSeconds, double NoScoutLastPrepSeconds);

/// <summary>War phase ("Maç" and "Binalar" sheets): famine, castle and siege.</summary>
public sealed record WarRules(
    double FamineStart,
    double FamineFoodMultiplier,
    double BattlePlayback,
    double EncounterRadius,
    double FallLootShare = 0,
    double FallWorkerShare = 0,
    double FamineStartSeconds = -1,
    double PrisonerShare = 0,
    double RaidBurnSeconds = 60,
    double RaidBurnFactor = 0.5,
    double MinBattleSeconds = 0,
    bool JoinSiege = true,
    int SiegeMaxAttackers = 3);

/// <summary>
/// The wall round every castle: it always stands (a castle falls when its attacker wins at the gate). <see cref="ArcherDefenseBonus"/>:
/// the archers defending the gate shoot this much harder from behind it (0.25 = +25 %).
/// </summary>
public sealed record WallRules(double ArcherDefenseBonus = 0);

/// <summary>
/// The deck: before the match every player picks <see cref="Size"/> of the units; only those can be forged, armed or hired.
/// Off: everybody has every unit.
/// </summary>
public sealed record DeckRules(bool Enabled, int Size)
{
    public static readonly DeckRules Off = new(false, 4);
}

/// <summary>Scout reports ("Maç" sheet): how wrong the soldier counts are. How long a mission takes depends on the map.</summary>
/// <param name="MaxScouts">Most scouts one player can have out at once (a spy, a tour of a quarter and a chest run all count).</param>
/// <param name="MaxCargo">An envoy carries at most this many goods in all (food, wood, iron and gold together).</param>
/// <param name="MaxMessageLength">Longest message an envoy carries (characters).</param>
/// <param name="ProfanityFilter">Messages have a short list of swear words masked with stars (on in the shipped config).</param>
/// <param name="MaxAtOnce">Most envoys one player can have on the road at once (out or walking home); a new one can go once it is back (or it was lost). Envoys no longer share the scout's slot.</param>
/// <param name="MaxPerMatch">Most envoys one player can send in a whole match (0 = no limit).</param>
public sealed record EnvoyRules(int MaxCargo = 40, int MaxMessageLength = 140, bool ProfanityFilter = false, int MaxAtOnce = 1, int MaxPerMatch = 0)
{
    public static EnvoyRules Default { get; } = new();
}

/// <summary>The numbers of the four kingdoms' abilities (see Match/Factions.cs).</summary>
public sealed record KingdomRules(
    bool Enabled = true,
    double DecoyGoldPerSoldier = 0.5, int DecoyMaxSoldiers = 20, double DecoyCooldownSeconds = 45, int DecoyMax = 2,
    double BribeGoldPerSoldier = 5, double BribeMaxShare = 0.4, double BribeCooldownSeconds = 45,
    double CampPriceSmall = 45, double CampPriceBig = 90, double CampLootShare = 0.4,
    int OddsSimulations = 24, double OddsMargin = 0.12,
    double DisguiseCooldownSeconds = 90, double DisguiseRevealSeconds = 120)
{
    public static KingdomRules Default { get; } = new();
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
