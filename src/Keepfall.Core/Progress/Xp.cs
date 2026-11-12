using Keepfall.Core.Economy;

namespace Keepfall.Core.Progress;

/// <summary>One "moment" of a match that earned extra XP (an id the client words; the XP it paid).</summary>
public sealed record MomentXp(string Id, int Xp);

/// <summary>
/// The XP of one finished match, worked out on the server from the player's own facts and the end-of-match deception log (nothing here is
/// sent while the match runs). The client adds it to the player's own progress; it never gives any power in a match.
/// </summary>
public sealed record XpResult(int Match, int Win, double ModeFactor, IReadOnlyList<MomentXp> Moments, int Goals, int Total);

/// <summary>The XP rules: every match pays, winning pays more, longer modes pay more, and "moments" (deceiving, felling a castle …) pay extra.</summary>
public static class Xp
{
    /// <summary>XP for every finished match, whatever the result.</summary>
    public const int MatchBase = 40;
    /// <summary>Extra XP for a win (a shared win counts).</summary>
    public const int WinBonus = 60;
    /// <summary>A lesson (a challenge or a starter match) pays this much for playing it, and the win bonus is the lesson's own.</summary>
    public const int LessonBase = 25, LessonWin = 40;
    /// <summary>XP for every challenge goal passed (the first time a challenge is cleared the client adds its own bonus).</summary>
    public const int GoalXp = 15;

    /// <summary>The longer the match, the more it pays: quick 1.0, standard 1.4, long 1.8 (the lengths are 15, 20 and 25 minutes).</summary>
    public static double ModeFactor(MatchMode? mode) => mode switch { MatchMode.Standard => 1.4, MatchMode.Long => 1.8, _ => 1.0 };

    /// <summary>The moments and what each pays. Ids are the contract with the client (names and the tracker's goals).</summary>
    public static readonly IReadOnlyList<(string Id, int Xp)> Moments =
    [
        ("decoy", 40),         // a phantom army of yours came into sight of its target or reached its gate
        ("fake_report", 40),   // a scout read the false army table you wrote
        ("envoy_lie", 40),     // an envoy under another's name arrived and you were never unmasked
        ("disguise", 40),      // an army marched under another's name and you were never unmasked
        ("bribe", 30),         // you turned soldiers of an army back with gold
        ("camp_rent", 20),     // you rented a bandit camp
        ("village", 15),       // you plundered a forest village
        ("camp", 15),          // you cleared a bandit camp
        ("felled", 60),        // you felled a rival castle
        ("felled_triple", 100),// you felled a castle in a three-sided siege
        ("last_castle", 80),   // you were the last castle standing
    ];

    public static int MomentXp(string id) => Moments.FirstOrDefault(m => m.Id == id).Xp;

    /// <summary>The moments this match holds for the player (each at most once, in the list's order).</summary>
    public static IReadOnlyList<MomentXp> MomentsOf(MatchFacts f)
    {
        bool Has(string id) => id switch
        {
            "decoy" => f.DecoysSeen >= 1,
            "fake_report" => f.FakeReportsRead >= 1,
            "envoy_lie" => f.EnvoyLieHeld,
            "disguise" => f.DisguiseHeld,
            "bribe" => f.Bribed >= 1,
            "camp_rent" => f.CampsRented >= 1,
            "village" => f.Villages >= 1,
            "camp" => f.Camps >= 1,
            "felled" => f.CastlesFelled >= 1,
            "felled_triple" => f.FelledTriple >= 1,
            "last_castle" => f.Won && !f.Shared && f.ByElimination && f.Opponents >= 1,
            _ => false,
        };
        return Moments.Where(m => Has(m.Id)).Select(m => new MomentXp(m.Id, m.Xp)).ToList();
    }

    public static XpResult Of(MatchFacts f, MatchMode? mode)
    {
        bool lesson = !f.Plain;
        int match = lesson ? LessonBase : MatchBase;
        int win = f.Won ? (lesson ? LessonWin : WinBonus) : 0;
        double factor = lesson ? 1.0 : ModeFactor(mode);
        var moments = MomentsOf(f);
        int goals = f.IsChallenge ? f.GoalsPassed * GoalXp : 0;
        int total = (int)Math.Round((match + win) * factor) + moments.Sum(m => m.Xp) + goals;
        return new XpResult(match, win, factor, moments, goals, total);
    }
}

/// <summary>The level curve: about thirty levels. The first reward comes after the first match, then it slows down (about 25–30 hours for the last).</summary>
public static class Levels
{
    public const int Max = 30;

    /// <summary>Total XP needed to be at <paramref name="level"/> (level 1 = 0). 80 · (level − 1)^1.42, to the nearest ten.</summary>
    public static int XpFor(int level)
    {
        if (level <= 1) return 0;
        level = Math.Min(level, Max);
        return (int)(Math.Round(80 * Math.Pow(level - 1, 1.42) / 10.0) * 10);
    }

    public static int LevelOf(long xp)
    {
        int level = 1;
        while (level < Max && xp >= XpFor(level + 1)) level++;
        return level;
    }
}

/// <summary>Titles shown beside a name. Only these ids are ever accepted from a client. Whether the player earned one is the client's own progress (levels and moments).</summary>
public static class Titles
{
    public static readonly IReadOnlyList<string> All =
    [
        "recruit", "keeper", "warlord", "commander", "marshal", "grandmaster",  // by level
        "ghost_general", "liar_king", "masked_envoy", "gold_tongue", "castle_breaker", "triple_conqueror", "last_standing",  // by moments
    ];
    public static bool IsTitle(string? id) => id is not null && All.Contains(id);
}

/// <summary>Banner patterns (looks only, drawn in the player's own colour, never tied to a kingdom).</summary>
public static class Patterns
{
    public static readonly IReadOnlyList<string> All = ["plain", "stripes", "chevron", "cross", "diamond", "ribbon", "star", "crest"];
    public static bool IsPattern(string? id) => id is not null && All.Contains(id);
}
