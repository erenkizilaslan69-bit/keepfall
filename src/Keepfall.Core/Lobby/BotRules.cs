namespace Keepfall.Core.Lobby;

/// <summary>How a bot of one difficulty behaves in time (game seconds).</summary>
/// <param name="ThinkMin">It thinks again after a pause of at least this long…</param>
/// <param name="ThinkMax">…and at most this long.</param>
/// <param name="ReactMin">A new event (a warning, a report) reaches its mind after at least this long…</param>
/// <param name="ReactMax">…and at most this long.</param>
/// <param name="Commands">Most commands it gives in one go.</param>
public sealed record BotLevelRules(double ThinkMin, double ThinkMax, double ReactMin, double ReactMax, int Commands);

public sealed record BotRules(BotLevelRules Easy, BotLevelRules Medium)
{
    public static readonly BotRules Default = new(new BotLevelRules(6, 10, 8, 15, 2), new BotLevelRules(2, 3, 3, 6, 4));

    public BotLevelRules Of(BotDifficulty level) => level == BotDifficulty.Easy ? Easy : Medium;
}
