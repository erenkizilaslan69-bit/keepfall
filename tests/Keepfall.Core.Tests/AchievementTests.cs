using Keepfall.Core.Challenges;
using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Progress;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>Achievement rules over plain match facts, the cosmetic allow-list, and what the views carry of both.</summary>
public class AchievementTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly DateTime T0 = new(2026, 11, 7, 12, 0, 0, DateTimeKind.Utc);

    private static MatchFacts Facts(Func<MatchFacts, MatchFacts>? edit = null)
    {
        var f = new MatchFacts(
            Won: false, Shared: false, ByElimination: false, Eliminated: false, Kingdom: "tuccar", Opponents: 1, HardBotPlayed: false,
            WarElapsed: 400, FamineAfter: 240, Population: 30,
            SoldiersLost: 5, EnemiesKilled: 10, BattlesWon: 1, BattlesLost: 1, CastlesFelled: 0,
            Villages: 0, Camps: 0, Chests: 0, Scouts: 0, Reports: 0, Envoys: 0,
            Decoys: 0, FakeReports: 0, Bribed: 0, CampsRented: 0, Disguises: 0,
            IsChallenge: false, IsDaily: false, ChallengeStars: 0, Starter: false);
        return edit is null ? f : edit(f);
    }

    [Fact]
    public void Ids_are_unique_and_snake_case()
    {
        Assert.Equal(Achievements.Ids.Count, Achievements.Ids.Distinct().Count());
        Assert.All(Achievements.Ids, id => Assert.Matches("^[a-z][a-z0-9_]*$", id));
        Assert.InRange(Achievements.Ids.Count, 20, 30);
    }

    [Fact]
    public void A_lost_match_with_nothing_special_earns_nothing()
        => Assert.Empty(Achievements.Evaluate(Facts()));

    [Fact]
    public void A_win_earns_first_win_and_a_shared_win_does_not()
    {
        Assert.Contains("first_win", Achievements.Evaluate(Facts(f => f with { Won = true })));
        Assert.DoesNotContain("first_win", Achievements.Evaluate(Facts(f => f with { Won = true, Shared = true })));
    }

    [Fact]
    public void Win_with_a_ghost_army_needs_both_the_ghost_and_the_win()
    {
        Assert.Contains("ghost_win", Achievements.Evaluate(Facts(f => f with { Won = true, Decoys = 1 })));
        Assert.DoesNotContain("ghost_win", Achievements.Evaluate(Facts(f => f with { Decoys = 2 })));
    }

    [Fact]
    public void Winning_before_the_famine_is_early_and_after_it_is_not()
    {
        Assert.Contains("early_win", Achievements.Evaluate(Facts(f => f with { Won = true, WarElapsed = 200 })));
        Assert.DoesNotContain("early_win", Achievements.Evaluate(Facts(f => f with { Won = true, WarElapsed = 240 })));
    }

    [Fact]
    public void Plunder_counters_have_their_thresholds()
    {
        var one = Achievements.Evaluate(Facts(f => f with { Villages = 1, Camps = 1 }));
        Assert.Contains("village_raid", one); Assert.Contains("camp_clear", one);
        Assert.DoesNotContain("village_x3", one);
        var more = Achievements.Evaluate(Facts(f => f with { Villages = 3 }));
        Assert.Contains("village_x3", more);
    }

    [Fact]
    public void Flawless_needs_a_win_without_losses_and_at_least_one_battle()
    {
        Assert.Contains("flawless", Achievements.Evaluate(Facts(f => f with { Won = true, SoldiersLost = 0, BattlesWon = 1 })));
        Assert.DoesNotContain("flawless", Achievements.Evaluate(Facts(f => f with { Won = true, SoldiersLost = 0, BattlesWon = 0 })));
        Assert.DoesNotContain("flawless", Achievements.Evaluate(Facts(f => f with { Won = true, SoldiersLost = 1 })));
    }

    [Fact]
    public void Table_achievements_follow_the_number_of_rivals()
    {
        var two = Achievements.Evaluate(Facts(f => f with { Won = true, ByElimination = true, Opponents = 2 }));
        Assert.Contains("last_standing", two); Assert.DoesNotContain("full_table", two);
        Assert.Contains("full_table", Achievements.Evaluate(Facts(f => f with { Won = true, Opponents = 3 })));
        Assert.DoesNotContain("last_standing", Achievements.Evaluate(Facts(f => f with { Won = true, ByElimination = true, Opponents = 1 })));
    }

    [Fact]
    public void Challenge_achievements_need_a_challenge()
    {
        Assert.Contains("challenge_win", Achievements.Evaluate(Facts(f => f with { Won = true, IsChallenge = true, ChallengeStars = 1 })));
        Assert.DoesNotContain("challenge_win", Achievements.Evaluate(Facts(f => f with { Won = true })));
        Assert.Contains("challenge_3star", Achievements.Evaluate(Facts(f => f with { Won = true, IsChallenge = true, ChallengeStars = 3 })));
        Assert.Contains("daily_win", Achievements.Evaluate(Facts(f => f with { Won = true, IsChallenge = true, IsDaily = true })));
    }

    [Fact]
    public void Kingdom_tricks_earn_their_own_achievements()
    {
        var ids = Achievements.Evaluate(Facts(f => f with { FakeReports = 1, Bribed = 1, CampsRented = 1, Disguises = 1, Envoys = 1, Scouts = 1, Reports = 1 }));
        foreach (var id in new[] { "fake_report", "bribe", "camp_rent", "disguise", "envoy", "scout_report" }) Assert.Contains(id, ids);
    }

    [Fact]
    public void Lessons_do_not_count_for_record_achievements()
    {
        // Falling bravely in a starter match is not the record feat; the same in a plain match is.
        Assert.DoesNotContain("brave_fall", Achievements.Evaluate(Facts(f => f with { Eliminated = true, Opponents = 2, BattlesWon = 3, Starter = true })));
        Assert.Contains("brave_fall", Achievements.Evaluate(Facts(f => f with { Eliminated = true, Opponents = 2, BattlesWon = 3 })));
        // ...but a first win in a starter match is still a first win.
        Assert.Contains("first_win", Achievements.Evaluate(Facts(f => f with { Won = true, Starter = true })));
    }

    [Fact]
    public void Cosmetic_ids_are_a_closed_list()
    {
        Assert.True(Cosmetics.IsFrame("gold"));
        Assert.False(Cosmetics.IsFrame("<img src=x>"));
        Assert.False(Cosmetics.IsFrame(null));
        Assert.True(Cosmetics.TryParseBanner("tuccar:b", out var k, out var d)); Assert.Equal(("tuccar", "b"), (k, d));
        foreach (var bad in new[] { "tuccar", "tuccar:z", "orc:a", "tuccar:a:b", "", "../x:a" }) Assert.False(Cosmetics.TryParseBanner(bad, out _, out _), bad);
        Assert.Equal("c", Cosmetics.DesignFor(["golge:b", "kahin:c"], "kahin"));
        Assert.Equal("a", Cosmetics.DesignFor(["golge:b"], "kahin"));
        Assert.Equal("a", Cosmetics.DesignFor(null, "kahin"));
    }

    [Fact]
    public void The_room_refuses_unknown_cosmetics_as_a_whole_and_shows_the_frame_to_everybody()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 2 });
        var ada = room.Join("Ada", null, false, T0).Player!;
        Assert.False(room.SetCosmetics(ada.Token, "diamond", null).Ok);
        Assert.False(room.SetCosmetics(ada.Token, "gold", ["tuccar:b", "tuccar:c"]).Ok);   // two picks for one kingdom
        Assert.False(room.SetCosmetics(ada.Token, "gold", ["x:b"]).Ok);
        Assert.Null(ada.Frame);                                                            // nothing of the refused calls stuck
        Assert.True(room.SetCosmetics(ada.Token, "gold", ["tuccar:b", "kahin:c"]).Ok);
        Assert.Equal("gold", ViewMapper.ToView(room).Players.Single().Frame);
        Assert.True(room.SetCosmetics(ada.Token, null, null).Ok);
        Assert.Null(ViewMapper.ToView(room).Players.Single().Frame);
    }

    [Fact]
    public void Facts_of_a_finished_match_come_from_the_room_and_the_banner_shows_only_after_the_match()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1 });
        var human = room.Join("Ada", null, false, T0).Player!;
        Assert.True(room.SetCosmetics(human.Token, "silver", ["tuccar:b", "golge:c", "kahin:b", "entrikaci:c"]).Ok);
        var def = new ChallengeDef
        {
            Id = "t", Order = 1, Name = new() { Tr = "t", En = "t" }, Description = new() { Tr = "t", En = "t" }, Kingdom = Factions.Merchant, Seed = 5,
            PlayerDeck = ["okcu", "kilicli", "mizrakci", "kalkanli"], Bots = [new ChallengeBot { Difficulty = "easy" }], WarSeconds = 300,
            Goals = [new ChallengeGoal { Id = "win", Type = GoalTypes.Win, Value = 1, Star = 1 }, new ChallengeGoal { Id = "a", Type = GoalTypes.MaxSoldiersLost, Value = 50, Star = 2 }, new ChallengeGoal { Id = "b", Type = GoalTypes.WinWithin, Value = 250, Star = 3 }],
        };
        Assert.True(room.StartChallenge(human.Token, def).Ok);
        Assert.Null(Achievements.FactsOf(room, human));                                    // no result yet
        for (int t = 0; t < 4000 && room.Phase != RoomPhase.Ended; t++) room.Tick(1);
        Assert.Equal(RoomPhase.Ended, room.Phase);
        var facts = Achievements.FactsOf(room, human)!;
        Assert.True(facts.IsChallenge);
        Assert.Equal(Factions.Merchant, facts.Kingdom);
        var view = ViewMapper.ToView(room).Result!;
        var mine = view.Ranking.Single(r => r.Seat == human.Seat);
        Assert.Equal("silver", mine.Frame);
        Assert.Equal("b", mine.Banner);                                                    // the pick for the kingdom the player actually had
    }
}
