using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Progress;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>XP, levels, titles and the profile shown beside a name.</summary>
public class XpTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

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
    public void The_first_level_comes_after_the_first_match_then_the_curve_slows_down()
    {
        Assert.Equal(1, Levels.LevelOf(0));
        // a lost quick match pays 40 and a won one 100: the second level (80 XP) is one good match away, two bad ones
        Assert.Equal(80, Levels.XpFor(2));
        Assert.True(Xp.Of(Facts(f => f with { Won = true }), MatchMode.Quick).Total >= Levels.XpFor(2));
        Assert.Equal(2, Levels.LevelOf(Xp.Of(Facts(f => f with { Won = true }), MatchMode.Quick).Total));
        // strictly rising, and every step costs more than the one before (it slows down)
        for (int l = 2; l <= Levels.Max; l++) Assert.True(Levels.XpFor(l) > Levels.XpFor(l - 1));
        for (int l = 3; l <= Levels.Max; l++) Assert.True(Levels.XpFor(l) - Levels.XpFor(l - 1) >= Levels.XpFor(l - 1) - Levels.XpFor(l - 2));
        Assert.Equal(Levels.Max, Levels.LevelOf(long.MaxValue / 2));
        Assert.InRange(Levels.XpFor(Levels.Max), 9000, 10000);
    }

    [Fact]
    public void Every_match_pays_a_win_pays_more_and_a_longer_mode_pays_more()
    {
        var lost = Xp.Of(Facts(), MatchMode.Quick);
        var won = Xp.Of(Facts(f => f with { Won = true }), MatchMode.Quick);
        Assert.Equal(Xp.MatchBase, lost.Total);
        Assert.Equal(Xp.MatchBase + Xp.WinBonus, won.Total);
        var standard = Xp.Of(Facts(f => f with { Won = true }), MatchMode.Standard);
        var @long = Xp.Of(Facts(f => f with { Won = true }), MatchMode.Long);
        Assert.True(won.Total < standard.Total && standard.Total < @long.Total);
        Assert.Equal((int)Math.Round(100 * 1.8), @long.Total);
    }

    [Fact]
    public void Moments_pay_extra_once_each_and_only_for_what_happened()
    {
        Assert.Empty(Xp.Of(Facts(), MatchMode.Quick).Moments);
        var f = Facts(x => x with { Won = true, ByElimination = true, Opponents = 2, CastlesFelled = 2, FelledTriple = 1, DecoysSeen = 3, FakeReportsRead = 1, EnvoyLieHeld = true, Villages = 4 });
        var r = Xp.Of(f, MatchMode.Quick);
        var ids = r.Moments.Select(m => m.Id).ToList();
        Assert.Equal(ids.Distinct().Count(), ids.Count);
        Assert.Contains("decoy", ids); Assert.Contains("fake_report", ids); Assert.Contains("envoy_lie", ids);
        Assert.Contains("felled", ids); Assert.Contains("felled_triple", ids); Assert.Contains("last_castle", ids); Assert.Contains("village", ids);
        Assert.DoesNotContain("bribe", ids);
        Assert.Equal(100 + r.Moments.Sum(m => m.Xp), r.Total);
    }

    [Fact]
    public void A_lesson_pays_its_own_amount_with_no_mode_factor_and_goals_add_to_it()
    {
        var starter = Xp.Of(Facts(f => f with { Starter = true, Won = true }), MatchMode.Long);
        Assert.Equal(Xp.LessonBase + Xp.LessonWin, starter.Total);
        var challenge = Xp.Of(Facts(f => f with { IsChallenge = true, Won = true, GoalsPassed = 3 }), null);
        Assert.Equal(Xp.LessonBase + Xp.LessonWin + 3 * Xp.GoalXp, challenge.Total);
    }

    [Fact]
    public void Titles_and_patterns_are_closed_lists()
    {
        Assert.Contains("liar_king", Titles.All); Assert.Contains("ghost_general", Titles.All); Assert.Contains("castle_breaker", Titles.All);
        Assert.False(Titles.IsTitle("<b>x</b>")); Assert.False(Titles.IsTitle(null)); Assert.False(Titles.IsTitle(""));
        Assert.Equal(Titles.All.Count, Titles.All.Distinct().Count());
        Assert.True(Patterns.IsPattern("plain")); Assert.False(Patterns.IsPattern("golge"));
        // a pattern never names a kingdom
        Assert.DoesNotContain(Patterns.All, p => Cosmetics.Kingdoms.Contains(p));
    }

    private static (Room Room, RoomPlayer Host) Lobby()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1 });
        return (room, room.Join("Ada", null, false, DateTime.UtcNow).Player!);
    }

    [Fact]
    public void The_profile_is_checked_and_shows_in_the_room_view()
    {
        var (room, host) = Lobby();
        Assert.True(room.SetProfile(host.Token, "liar_king", 12, "chevron").Ok);
        var v = ViewMapper.ToView(room).Players.Single();
        Assert.Equal("liar_king", v.Title); Assert.Equal(12, v.Level); Assert.Equal("chevron", v.Pattern);
        Assert.True(room.SetProfile(host.Token, null, 1, null).Ok);
        Assert.Null(ViewMapper.ToView(room).Players.Single().Title);
    }

    [Theory]
    [InlineData("hacker", 5, "plain")]
    [InlineData("<script>", 5, "plain")]
    [InlineData("recruit", 0, "plain")]
    [InlineData("recruit", 31, "plain")]
    [InlineData("recruit", -4, "plain")]
    [InlineData("recruit", int.MaxValue, "plain")]
    [InlineData("recruit", 5, "golge")]
    [InlineData("recruit", 5, "../../etc")]
    public void A_bad_profile_is_refused_as_a_whole_and_nothing_changes(string title, int level, string pattern)
    {
        var (room, host) = Lobby();
        room.SetProfile(host.Token, "keeper", 7, "stripes");
        Assert.False(room.SetProfile(host.Token, title, level, pattern).Ok);
        var v = ViewMapper.ToView(room).Players.Single();
        Assert.Equal("keeper", v.Title); Assert.Equal(7, v.Level); Assert.Equal("stripes", v.Pattern);
    }

    [Fact]
    public void Nobody_can_set_the_profile_of_a_room_they_are_not_in()
    {
        var (room, _) = Lobby();
        Assert.False(room.SetProfile("not-a-token", "recruit", 3, "plain").Ok);
    }
}
