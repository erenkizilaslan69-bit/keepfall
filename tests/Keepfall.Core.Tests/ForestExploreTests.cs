using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Exploring a quarter of the forest: what a scout finds, who knows it, and when what they know gets old.</summary>
public class ForestExploreTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    /// <summary>A in the north-west, B in the south-east, C in the north-east; already at war.</summary>
    private static GameState Game(int seed = 5)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: 1, warSeconds: 100_000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast }, forestSeed: seed);
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        return game;
    }

    private static void RunUntilHome(GameState game, string player)
    {
        for (int t = 0; game.MissionsOf(player).Count > 0; t++)
        {
            Assert.True(t < 600, "the scout never came home");
            game.Tick(1);
        }
    }

    [Fact]
    public void Nothing_is_known_until_a_scout_has_been_there()
    {
        var game = Game();
        Assert.All(new[] { A, B, C }, p => Assert.Empty(game.KnownSitesOf(p)));
        Assert.Empty(game.ExploredBy(A));
        game.Tick(60);
        Assert.Empty(game.KnownSitesOf(A)); // even with the castle looking out over the forest's edge
    }

    [Fact]
    public void Exploring_the_own_quarter_finds_its_places_and_the_big_camp_and_nothing_else()
    {
        var game = Game();
        Ok(game.Execute(A, new SendExplore(Corner.NorthWest)));
        RunUntilHome(game, A);

        var found = game.KnownSitesOf(A);
        var f = Rules.Forest;
        Assert.Equal(f.ChestsPerCorner + f.VillagesPerCorner + f.CampsPerCorner + 1, found.Count);
        Assert.All(found, k => Assert.True(k.Site.Quadrant == Corner.NorthWest || k.Site.Kind == SiteKind.BigCamp));
        Assert.Contains(found, k => k.Site.Kind == SiteKind.BigCamp);
        Assert.Equal([Corner.NorthWest], game.ExploredBy(A));
        Assert.Equal(0, game.CastleOf(A)!.ScoutsAway); // the scout is home (and idle again)
        // Nobody else learns anything from it.
        Assert.Empty(game.KnownSitesOf(B));
        Assert.Empty(game.KnownSitesOf(C));
    }

    [Fact]
    public void Any_quarter_shows_the_big_camp_but_only_its_own_places()
    {
        var game = Game();
        Ok(game.Execute(A, new SendExplore(Corner.SouthEast)));
        RunUntilHome(game, A);
        var found = game.KnownSitesOf(A);
        Assert.Contains(found, k => k.Site.Kind == SiteKind.BigCamp);
        Assert.All(found.Where(k => k.Site.Kind != SiteKind.BigCamp), k => Assert.Equal(Corner.SouthEast, k.Site.Quadrant));
        Assert.Equal(1 + Rules.Forest.ChestsPerCorner + Rules.Forest.VillagesPerCorner + Rules.Forest.CampsPerCorner, found.Count);
    }

    [Fact]
    public void A_rival_quarter_takes_longer_than_your_own()
    {
        var game = Game();
        var seconds = new Dictionary<Corner, double>();
        foreach (var q in Enum.GetValues<Corner>())
        {
            var g = Game();
            Ok(g.Execute(A, new SendExplore(q)));
            seconds[q] = g.MissionsOf(A).Single().SecondsLeft;
        }
        Assert.All(seconds.Where(kv => kv.Key != Corner.NorthWest), kv => Assert.True(kv.Value > seconds[Corner.NorthWest] + 4, $"{kv.Key}: {kv.Value}"));
        Assert.True(seconds[Corner.NorthWest] is > 20 and < 40, $"own quarter {seconds[Corner.NorthWest]:0} s");
    }

    [Fact]
    public void Places_are_found_as_the_scout_comes_near_not_all_at_once()
    {
        var game = Game();
        Ok(game.Execute(A, new SendExplore(Corner.NorthWest)));
        game.Tick(3);
        Assert.Empty(game.KnownSitesOf(A)); // still on the road out of the castle
        int before = 0, max = 0;
        for (int t = 0; game.MissionsOf(A).Count > 0 && t < 200; t++)
        {
            game.Tick(1);
            int n = game.KnownSitesOf(A).Count;
            Assert.True(n >= before, "a found place is never lost");
            before = n;
            max = Math.Max(max, n);
        }
        Assert.Equal(max, game.KnownSitesOf(A).Count);
        Assert.True(max > 3);
    }

    [Fact]
    public void One_scout_per_quarter_and_the_scout_comes_out_of_a_job()
    {
        var game = Game();
        Assert.False(game.Execute(A, new SendExplore(Corner.SouthWest, Job.Farmer)).Ok); // nobody works the farm yet
        Ok(game.Execute(A, new SendExplore(Corner.NorthWest)));
        Assert.False(game.Execute(A, new SendExplore(Corner.NorthWest)).Ok);
        Assert.Equal(1, game.CastleOf(A)!.ScoutsAway);
    }

    [Fact]
    public void A_player_has_one_scout_out_at_a_time_whatever_it_is_out_for()
    {
        var game = Game();
        Ok(game.Execute(A, new SendExplore(Corner.NorthWest)));
        var second = game.Execute(A, new SendExplore(Corner.NorthEast));
        Assert.False(second.Ok);
        Assert.Contains("dönmedi", second.Error);
        Assert.Equal(1, game.CastleOf(A)!.ScoutsAway);
        RunUntilHome(game, A);
        Ok(game.Execute(A, new SendExplore(Corner.NorthEast))); // the first is home: the next may go
    }

    [Fact]
    public void What_a_player_knows_gets_old_until_they_see_the_place_again()
    {
        var game = Game();
        Ok(game.Execute(A, new SendExplore(Corner.SouthEast)));
        RunUntilHome(game, A);
        var chest = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Chest);
        for (int t = 0; t < 400; t++) game.Tick(1); // the trail has closed long ago
        Assert.Empty(game.TrailOf(A));

        // Somebody else empties it (the match's own state changes; A is not looking).
        var state = game.AllSites.First(s => s.Site.Id == chest.Site.Id);
        state.Gone = true;
        state.Version++;
        game.Tick(5);
        var stale = game.KnownSitesOf(A).First(k => k.Site.Id == chest.Site.Id);
        Assert.False(stale.Gone, "A has not seen it since: still looks full");
        Assert.True(stale.SeenAt < game.ElapsedSeconds - 200, "the last time it was in sight is long ago (while the trail still covered it)");

        // A sends a scout over the same ground again: the chest is in sight, and A learns.
        Ok(game.Execute(A, new SendExplore(Corner.SouthEast)));
        RunUntilHome(game, A);
        var fresh = game.KnownSitesOf(A).First(k => k.Site.Id == chest.Site.Id);
        Assert.True(fresh.Gone);
        Assert.True(fresh.SeenAt > stale.SeenAt);
    }

    [Fact]
    public void Camps_are_seen_with_approximate_numbers()
    {
        var game = Game();
        Ok(game.Execute(A, new SendExplore(Corner.NorthWest)));
        RunUntilHome(game, A);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        int real = Rules.Forest.Camp.Bandits.Values.Sum();
        int seen = camp.BanditsSeen.Values.Sum();
        Assert.InRange(seen, 1, real * 2);
        Assert.Equal(Rules.Forest.Camp.Bandits.Keys.Order(), camp.BanditsSeen.Keys.Select(u => u.Id).Order());
        Assert.Empty(game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Chest).BanditsSeen);
    }

    [Fact]
    public void A_fallen_castle_explores_no_more()
    {
        var game = Game();
        game.CastleOf(B)!.AddSoldiers(Rules.FindUnit("kilicli")!, 0);
        game.CastleOf(A)!.AddSoldiers(Rules.FindUnit("kilicli")!, 25);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 25 })));
        while (!game.IsEliminated(B)) game.Tick(1);
        Assert.False(game.Execute(B, new SendExplore(Corner.SouthEast)).Ok);
    }
}
