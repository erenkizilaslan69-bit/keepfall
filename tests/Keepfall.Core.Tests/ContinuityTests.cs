using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Armies never jump: whatever the orders, a tick moves one no further than it can walk.</summary>
public class ContinuityTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;

    private static GameState Game(int seed)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: 5, warSeconds: 100_000, rng: new Random(seed),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast }, forestSeed: seed);
        foreach (var p in new[] { A, B, C }) game.Execute(p, new SetGrowth(false));
        return game;
    }

    [Fact]
    public void A_redirected_army_that_goes_home_walks_to_its_own_castle()
    {
        var game = Game(3);
        game.Tick(5);
        game.CastleOf(A)!.AddSoldiers(Sword, 6);
        Assert.True(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 6 })).Ok);
        game.Tick(10);
        var army = game.ArmiesOf(A).Single();
        Assert.True(game.Execute(A, new RedirectArmy(army.Id, TargetKey: C)).Ok);
        game.Tick(2);
        Assert.True(game.Execute(A, new RecallArmy(army.Id)).Ok);
        Assert.Equal(ArmyState.Returning, army.State);
        var home = game.Map.RegionOf(game.Corners[A]).Gate;
        Assert.True(army.Back!.Route.End.DistanceTo(home) < 1.0, "the way home ends at its own gate");
        Assert.True(army.SecondsLeft > 5, "it still has a long walk, it does not arrive at once");
        for (int i = 0; i < 400 && game.ArmiesOf(A).Count > 0; i++) game.Tick(1);
        Assert.Equal(0, game.ContinuityViolations);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 5)]
    [InlineData(3, 20)]
    [InlineData(4, 1)]
    [InlineData(5, 20)]
    [InlineData(6, 3)]
    public void Random_orders_never_make_an_army_jump(int seed, int dt)
    {
        var game = Game(seed);
        var rng = new Random(seed * 7919);
        game.Tick(5);
        var all = new[] { A, B, C };
        foreach (var p in all)
            foreach (var q in new[] { Corner.NorthWest, Corner.NorthEast, Corner.SouthEast, Corner.SouthWest })
            {
                if (game.Execute(p, new SendExplore(q)).Ok)
                    for (int t = 0; game.MissionsOf(p).Count > 0 && t < 900; t++) game.Tick(1);
            }

        for (int step = 0; step < 3000 / dt && game.Phase != MatchPhase.Ended; step++)
        {
            foreach (var p in all)
            {
                if (rng.NextDouble() > 0.25) continue;
                var castle = game.CastleOf(p)!;
                if (rng.NextDouble() < 0.6) castle.AddSoldiers(Sword, 4);
                var others = all.Where(x => x != p).ToArray();
                var sites = game.KnownSitesOf(p);
                var mine = game.ArmiesOf(p);
                var units = new Dictionary<string, int> { ["kilicli"] = rng.Next(3, 7) };
                switch (rng.Next(5))
                {
                    case 0: game.Execute(p, new SendArmy(others[rng.Next(others.Length)], units, Mode: rng.Next(3) == 0 ? ArmyMode.Intercept : ArmyMode.Attack)); break;
                    case 1:
                        if (sites.Count > 0) game.Execute(p, new SendArmyToSite(sites[rng.Next(sites.Count)].Site.Id, units));
                        break;
                    case 2:
                        if (mine.Count > 0)
                        {
                            var a = mine[rng.Next(mine.Count)];
                            game.Execute(p, rng.Next(2) == 0 || sites.Count == 0
                                ? new RedirectArmy(a.Id, TargetKey: others[rng.Next(others.Length)])
                                : new RedirectArmy(a.Id, SiteId: sites[rng.Next(sites.Count)].Site.Id));
                        }
                        break;
                    case 3:
                        if (mine.Count > 0) game.Execute(p, new RecallArmy(mine[rng.Next(mine.Count)].Id));
                        break;
                }
            }
            game.Tick(dt);
            // One army, one entry: an id is never in the game twice.
            var ids = all.SelectMany(p => game.ArmiesOf(p)).Select(a => a.PublicId).ToList();
            Assert.Equal(ids.Count, ids.Distinct().Count());
        }
        Assert.True(game.ContinuityViolations == 0, $"{game.ContinuityViolations} jumps, worst {game.WorstJump:F2} tiles beyond walking");
    }
}
