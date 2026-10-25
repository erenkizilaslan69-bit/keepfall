namespace Keepfall.Core.Lobby;

/// <summary>How a bot of one difficulty behaves (times are game seconds).</summary>
/// <param name="ThinkMin">It thinks again after a pause of at least this long…</param>
/// <param name="ThinkMax">…and at most this long.</param>
/// <param name="ReactMin">A new event (a warning, a report) reaches its mind after at least this long…</param>
/// <param name="ReactMax">…and at most this long.</param>
/// <param name="Commands">Most commands it gives in one go.</param>
/// <param name="Mistake">Chance (0–1) that a part of its mind slips on a given think: skips what it should do or does something else.</param>
/// <param name="Slack">How many people it lets stand in the wrong job before it moves them.</param>
public sealed record BotLevelRules(double ThinkMin, double ThinkMax, double ReactMin, double ReactMax, int Commands, double Mistake, int Slack);

/// <param name="Mix">The army it builds: share of each unit type (by id), summing to about 1.</param>
/// <param name="WeaponsFrom">Share of the preparation after which it starts forging weapons.</param>
/// <param name="ArmFrom">Share of the preparation after which it turns stored weapons into soldiers.</param>
/// <param name="ArmyShare">The most of its people it lets become soldiers (the rest keep the castle fed and forging).</param>
public sealed record BotRules(BotLevelRules Easy, BotLevelRules Medium, IReadOnlyDictionary<string, double> Mix, double WeaponsFrom, double ArmFrom, double ArmyShare)
{
    public static readonly BotRules Default = new(
        new BotLevelRules(6, 10, 8, 15, 2, 0.25, 2), new BotLevelRules(2, 3, 3, 6, 4, 0.05, 1),
        new Dictionary<string, double> { ["kilicli"] = 0.35, ["kalkanli"] = 0.25, ["okcu"] = 0.25, ["mizrakci"] = 0.15 }, 0.3, 0.75, 0.5);

    public BotLevelRules Of(BotDifficulty level) => level == BotDifficulty.Easy ? Easy : Medium;
}
