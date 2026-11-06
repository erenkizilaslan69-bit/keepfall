using Keepfall.Core.Challenges;

namespace Keepfall.Views;

// Challenge mode (one player against computer players). The list is the same for everybody and holds nothing of any match: the player's
// own kingdom and deck (they are told them at the start anyway), the number and level of the bots, the goals. The rivals' kingdoms and decks
// are NOT in it: they stay secret like in any match. The result goes to the one player it is about.

public sealed record ChallengeTextView(string Tr, string En);
public sealed record ChallengeGoalView(string Id, string Type, double Value, int Star);
public sealed record ChallengeCardView(
    string Id, int Order, bool Daily, ChallengeTextView Name, ChallengeTextView Description, ChallengeTextView Tip,
    string Kingdom, IReadOnlyList<string>? Deck, IReadOnlyList<string> BotLevels, double? WarSeconds, IReadOnlyList<ChallengeGoalView> Goals);
public sealed record ChallengeListView(IReadOnlyList<ChallengeCardView> Challenges, ChallengeCardView Daily);

public sealed record GoalResultView(string Id, string Type, double Target, double Actual, bool Passed, int Star);
public sealed record ChallengeResultView(string Id, bool Won, int Stars, IReadOnlyList<GoalResultView> Goals);

public static class ChallengeMapper
{
    public static ChallengeCardView CardOf(ChallengeDef c) => new(
        c.Id, c.Order, c.Daily, Text(c.Name), Text(c.Description), Text(c.Tip), c.Kingdom, c.PlayerDeck,
        c.Bots.Select(b => b.Difficulty).ToList(), c.WarSeconds,
        c.Goals.Select(g => new ChallengeGoalView(g.Id, g.Type, g.Value, g.Star)).ToList());

    public static ChallengeListView ListOf(ChallengeCatalog catalog, ChallengeDef daily) =>
        new(catalog.All.Select(CardOf).ToList(), CardOf(daily));

    public static ChallengeResultView ResultOf(ChallengeOutcome o) => new(
        o.Id, o.Won, o.Stars, o.Goals.Select(g => new GoalResultView(g.Id, g.Type, g.Target, g.Actual, g.Passed, g.Star)).ToList());

    private static ChallengeTextView Text(ChallengeText t) => new(t.Tr, t.En);
}
