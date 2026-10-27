namespace Keepfall.Core.Lobby;

/// <summary>How a bot of one difficulty behaves (times are game seconds).</summary>
/// <param name="ThinkMin">It thinks again after a pause of at least this long…</param>
/// <param name="ThinkMax">…and at most this long.</param>
/// <param name="ReactMin">A new event (a warning, a report) reaches its mind after at least this long…</param>
/// <param name="ReactMax">…and at most this long.</param>
/// <param name="Commands">Most commands it gives in one go.</param>
/// <param name="Mistake">Chance (0–1) that a part of its mind slips on a given think: skips what it should do or does something else.</param>
/// <param name="Slack">How many people it lets stand in the wrong job before it moves them.</param>
/// <param name="EcoMistake">The same chance for the economy parts of its mind (people, buildings, weapons); the tactical parts use <paramref name="Mistake"/>.</param>
/// <param name="ExploreAll">It tours the other quarters of the forest too (not only its own).</param>
/// <param name="ChestsAnywhere">It picks up any chest it has found (not only those in its own quarter).</param>
/// <param name="Scouts">Most scouts it has out at once.</param>
/// <param name="MercBatch">Most mercenaries it hires in one go (…and <paramref name="MercThreatBatch"/> when an army is coming).</param>
/// <param name="Saves">It saves wood and iron for an upgrade it cannot pay yet, instead of forging with them.</param>
/// <param name="QueueDepth">Most weapons it keeps waiting in the forge queue.</param>
/// <param name="KeepHome">Share of its soldiers it keeps at home when it sends an army to a castle.</param>
/// <param name="Calculates">It works out fights with the game's own fight calculator (attacks, bandit camps) instead of counting heads.</param>
/// <param name="SmartDefense">When an army comes it also recalls raiders, aims its archers and goes out to cut the rival off; otherwise it only arms and lines up.</param>
/// <param name="ScoreAware">The bot plays for victory points (damage, kills) as well as for people, so it is bold from the first second of the war (only where it calculates its fights).</param>
/// <param name="HoldWeapons">It keeps forged weapons in the store (their people go on working) and arms them only when an army is coming or when it sends one out; a rival's scout sees no soldiers for them.</param>
/// <param name="CounterUnits">It forges the unit types that do best against what the scout reports say its rivals have.</param>
/// <param name="Opportunist">It watches the rivals: one that has an army out on the road, or whose gate is under siege by someone else, is weaker than its report says, and it goes for it with a smaller margin.</param>
/// <param name="ScoutFactor">Its pauses between spying on a rival are this much of the usual (below 1: it keeps its reports fresher).</param>
/// <param name="UpgradeEarly">It starts an upgrade as soon as a building's room is nearly full and saves for it, instead of waiting for people to stand idle.</param>
/// <param name="Foresight">Where arming takes time: it starts arming the weapons in its store the moment an army is seen coming (before its reaction time), and keeps a garrison ready at home.</param>
/// <param name="GarrisonShare">The garrison it keeps armed at home during the war: this share of the soldiers the biggest rival is thought to have (0 = none).</param>
/// <param name="HeadCountRatio">A poor bot, which judges a rival by a head count, goes when it has this many times the soldiers the last report shows.</param>
public sealed record BotLevelRules(double ThinkMin, double ThinkMax, double ReactMin, double ReactMax, int Commands, double Mistake, int Slack, double EcoMistake,
    bool ExploreAll = true, bool ChestsAnywhere = true, int Scouts = 2, int MercBatch = 3, int MercThreatBatch = 6, bool Saves = true, int QueueDepth = 3,
    double KeepHome = 0.25, double HeadCountRatio = 1.0, bool Calculates = true, bool SmartDefense = true, bool ScoreAware = false,
    bool HoldWeapons = false, bool CounterUnits = false, bool Opportunist = false, double ScoutFactor = 1.0, bool UpgradeEarly = false,
    bool Foresight = false, double GarrisonShare = 0);

/// <param name="Mix">The army it builds: share of each unit type (by id), summing to about 1.</param>
/// <param name="WeaponsFrom">Share of the preparation after which it starts forging weapons.</param>
/// <param name="ArmFrom">Share of the preparation after which it turns stored weapons into soldiers.</param>
/// <param name="ArmyShare">The most of its people it lets become soldiers (the rest keep the castle fed and forging).</param>
/// <param name="AttackMargin">A good bot expects this many times what the last report says (reports are approximate and out of date).</param>
/// <param name="AttackRate">…and goes only if its army wins at least this share of the fights it calculates.</param>
/// <param name="StaleReportSeconds">A good bot trusts a report (or a siege it fought) no longer than this.</param>
/// <param name="BlindMargin">…after that, or with no report at all, it may still attack on its last knowledge (or, with none, on its own army's size) if it demands this much more (0 = it waits for a fresh report).</param>
/// <param name="BlindAfterWarSeconds">…but not in the first stretch of the war: it tries to get a report first.</param>
/// <param name="BlindRivalShare">With no report at all it guesses a rival has this share of its own army.</param>
/// <param name="GiftThreshold">A gift (goods in all) of at least this much, brought by an envoy, makes a bot leave the sender alone…</param>
/// <param name="GiftPeaceSeconds">…for this long (it does not send armies against them; the message is ignored).</param>
/// <param name="OtherQuartersFrom">Share of the preparation after which a bot may tour and raid other players' quarters of the forest (before that: only its own; the big camp in the middle waits too).</param>
public sealed record BotRules(BotLevelRules Easy, BotLevelRules Medium, IReadOnlyDictionary<string, double> Mix, double WeaponsFrom, double ArmFrom, double ArmyShare,
    double AttackMargin = 1.2, double AttackRate = 0.85, double OtherQuartersFrom = 0.5,
    double StaleReportSeconds = 120, double BlindMargin = 0, double BlindRivalShare = 0.8, double BlindAfterWarSeconds = 0,
    BotLevelRules? Hard = null, double GiftThreshold = 30, double GiftPeaceSeconds = 90, IReadOnlyList<IReadOnlyList<string>>? Decks = null)
{
    public static readonly BotRules Default = new(
        new BotLevelRules(6, 10, 8, 15, 2, 0.25, 2, 0.25, false, false, 1, 1, 1, false, 2, 0.1, 1.0, false, false), new BotLevelRules(2, 3, 3, 6, 4, 0.05, 1, 0.05),
        new Dictionary<string, double> { ["kilicli"] = 0.35, ["kalkanli"] = 0.25, ["okcu"] = 0.25, ["mizrakci"] = 0.15 }, 0.3, 0.75, 0.5);

    public BotLevelRules Of(BotDifficulty level) => level switch { BotDifficulty.Easy => Easy, BotDifficulty.Hard => Hard ?? Medium, _ => Medium };
}
