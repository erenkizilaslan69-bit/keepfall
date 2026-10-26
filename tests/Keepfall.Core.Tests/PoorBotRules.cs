using Keepfall.Core;
using Keepfall.Core.Lobby;

namespace Keepfall.Core.Tests;

/// <summary>
/// The shipped Easy bot is tuned in balance.json (it plays a good economy and works out fights, only its tactics and speed are weak).
/// Tests of the plain "poor bot" behaviours (head counts, no road interception, one hire at a time) pin those switches off here, so they
/// keep checking the code paths and do not move when the balance does.
/// </summary>
internal static class PoorBotRules
{
    public static GameRules From(GameRules rules)
    {
        var easy = rules.Bots.Easy with
        {
            EcoMistake = 0.1, ExploreAll = false, ChestsAnywhere = false, Scouts = 1, MercBatch = 1, MercThreatBatch = 1, Saves = false,
            QueueDepth = 2, KeepHome = 0.1, HeadCountRatio = 1.0, Calculates = false, SmartDefense = false,
        };
        return new GameRules(rules.Units, rules.Counters, rules.Combat, rules.Production, rules.Match, rules.Economy, rules.Scouting, rules.War,
            rules.Map, rules.MercenaryPrices, rules.Forest, rules.Bots with { Easy = easy }, rules.Envoy, rules.Walls);
    }
}
