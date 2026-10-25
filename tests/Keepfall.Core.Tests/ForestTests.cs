using Keepfall.Core.Config;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>The forest's places: random every match, but the same for every corner.</summary>
public class ForestTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly Corner[] Corners = Enum.GetValues<Corner>();

    private static (IReadOnlyList<ForestSite> Sites, WorldMap Map) Match(int seed)
    {
        var sites = ForestLayout.Generate(WorldMap.Standard, Rules.Forest, new Random(seed));
        return (sites, WorldMap.Standard.WithSites(sites));
    }

    [Fact]
    public void Every_corner_gets_the_same_kinds_and_numbers_and_the_big_camp_stands_alone_in_the_middle()
    {
        var f = Rules.Forest;
        for (int seed = 1; seed <= 40; seed++)
        {
            var (sites, _) = Match(seed);
            Assert.Equal(4 * (f.ChestsPerCorner + f.VillagesPerCorner + f.CampsPerCorner) + 1, sites.Count);
            foreach (var corner in Corners)
            {
                var mine = sites.Where(s => s.Quadrant == corner).ToList();
                Assert.Equal(f.ChestsPerCorner, mine.Count(s => s.Kind == SiteKind.Chest));
                Assert.Equal(f.VillagesPerCorner, mine.Count(s => s.Kind == SiteKind.Village));
                Assert.Equal(f.CampsPerCorner, mine.Count(s => s.Kind == SiteKind.Camp));
            }
            var big = Assert.Single(sites, s => s.Kind == SiteKind.BigCamp);
            Assert.Null(big.Quadrant);
            Assert.Equal(WorldMap.Standard.Nodes.First(n => n.Id == "hub").Position, big.Position);
        }
    }

    [Fact]
    public void Every_place_is_the_same_road_distance_from_its_own_gate_in_every_corner_and_holds_the_same()
    {
        for (int seed = 1; seed <= 40; seed++)
        {
            var (sites, map) = Match(seed);
            List<(SiteKind Kind, double Road, int Gold, int People)> Profile(Corner c) => sites.Where(s => s.Quadrant == c)
                .Select(s => (Kind: s.Kind, Road: Math.Round(map.RouteToSite(c, s).Length, 6), Gold: s.Gold, People: s.People))
                .OrderBy(x => x.Kind).ThenBy(x => x.Road).ToList();
            var reference = Profile(Corner.NorthWest);
            foreach (var corner in Corners) Assert.Equal(reference, Profile(corner));

            var big = sites.Single(s => s.Kind == SiteKind.BigCamp);
            var lengths = Corners.Select(c => Math.Round(map.RouteToSite(c, big).Length, 6)).Distinct().ToList();
            Assert.Single(lengths);
        }
    }

    [Fact]
    public void A_place_is_much_closer_to_its_own_corner_than_to_anybody_elses()
    {
        for (int seed = 1; seed <= 40; seed++)
        {
            var (sites, map) = Match(seed);
            foreach (var s in sites.Where(s => s.Quadrant is not null))
            {
                double own = map.RouteToSite(s.Quadrant!.Value, s).Length;
                foreach (var other in Corners.Where(c => c != s.Quadrant))
                    Assert.True(map.RouteToSite(other, s).Length - own >= 5, $"seed {seed}: {s.Kind} only {map.RouteToSite(other, s).Length - own:0.0} nearer");
            }
        }
    }

    [Fact]
    public void Places_keep_their_distance_stay_inside_the_ring_and_their_trails_never_cross()
    {
        var f = Rules.Forest;
        var hub = WorldMap.Standard.Nodes.First(n => n.Id == "hub").Position;
        for (int seed = 1; seed <= 40; seed++)
        {
            var (sites, _) = Match(seed);
            foreach (var a in sites)
            {
                if (a.Kind != SiteKind.BigCamp)
                {
                    Assert.True(a.Position.DistanceTo(hub) >= f.HubClearing, "too close to the middle");
                    Assert.InRange(Math.Abs(a.Position.X - hub.X), 0, 10 - f.EdgeMargin + 1e-9);
                    Assert.InRange(Math.Abs(a.Position.Y - hub.Y), 0, 10 - f.EdgeMargin + 1e-9);
                    Assert.InRange(a.Foot.DistanceTo(a.Spur[1]), f.SpurMin - 1e-9, f.SpurMax + 1e-9);
                }
                foreach (var b in sites.Where(b => b.Id != a.Id))
                    Assert.True(a.Position.DistanceTo(b.Position) >= f.MinSpacing - 1e-9, $"seed {seed}: two places only {a.Position.DistanceTo(b.Position):0.0} apart");
            }
        }
    }

    [Fact]
    public void The_layout_is_random_between_matches_and_repeatable_for_a_seed()
    {
        var one = Match(7).Sites.Select(s => (s.Kind, s.Position)).ToList();
        Assert.Equal(one, Match(7).Sites.Select(s => (s.Kind, s.Position)).ToList());
        var positions = Enumerable.Range(1, 10).Select(i => Match(i).Sites.First(s => s.Kind == SiteKind.Chest).Position).Distinct().Count();
        Assert.True(positions >= 8, "ten matches should not share one layout");
        Assert.All(Match(3).Sites, s => Assert.Matches("^[0-9a-f]{16}$", s.Id));
        Assert.Equal(Match(3).Sites.Count, Match(3).Sites.Select(s => s.Id).Distinct().Count());
    }

    [Fact]
    public void The_public_roads_do_not_change_and_say_nothing_about_the_trails()
    {
        var (sites, map) = Match(5);
        Assert.Equal(WorldMap.Standard.Edges.Select(e => (e.Id, e.From, e.To, e.Length)), map.Edges.Select(e => (e.Id, e.From, e.To, e.Length)));
        Assert.Equal(WorldMap.Standard.Nodes.Select(n => n.Id).Order(), map.Nodes.Select(n => n.Id).Order());
        Assert.DoesNotContain(map.Features, f => sites.Any(s => s.Kind != SiteKind.BigCamp && s.Position.DistanceTo(f.Center) < 1e-9));
        // Routing between castles is the old one (trails are dead ends).
        foreach (var a in Corners)
            foreach (var b in Corners.Where(b => b != a))
                Assert.Equal(WorldMap.Standard.RouteBetween(a, b).Length, map.RouteBetween(a, b).Length, 9);
    }

    [Fact]
    public void A_trail_is_walked_over_the_forest_road_and_ends_at_the_place()
    {
        var (sites, map) = Match(9);
        foreach (var s in sites.Where(s => s.Quadrant is not null))
        {
            var route = map.RouteToSite(s.Quadrant!.Value, s);
            Assert.Equal(map.RegionOf(s.Quadrant!.Value).Gate, route.Start);
            Assert.Equal(s.Position, route.End);
            Assert.Contains(route.Points, p => p.DistanceTo(s.Foot) < 1e-9);
        }
    }

    [Fact]
    public void Exploring_a_quarter_is_shorter_at_home_and_longer_the_further_it_is_and_finds_all_its_places()
    {
        var f = Rules.Forest;
        for (int seed = 1; seed <= 20; seed++)
        {
            var (sites, map) = Match(seed);
            foreach (var home in Corners)
            {
                var lengths = Corners.ToDictionary(q => q, q => map.ExploreRoute(home, q).Length);
                var others = Corners.Where(c => c != home).Select(c => lengths[c]).ToList();
                Assert.All(others, l => Assert.True(lengths[home] + 10 < l, $"home {lengths[home]:0.0} vs {l:0.0}"));
                foreach (var q in Corners)
                {
                    var route = map.ExploreRoute(home, q);
                    Assert.Equal(map.RegionOf(home).Gate, route.Start);
                    Assert.Equal(map.RegionOf(home).Gate, route.End);
                    foreach (var s in sites.Where(s => s.Quadrant == q || s.Kind == SiteKind.BigCamp))
                        Assert.True(Enumerable.Range(0, (int)route.Length * 4 + 1).Min(i => route.PointAt(i / 4.0).DistanceTo(s.Position)) <= f.DiscoverRadius,
                            $"seed {seed}: a {s.Kind} of quarter {q} is out of the explorer's reach");
                }
            }
        }
    }

    [Fact]
    public void A_match_has_its_own_forest_and_hands_it_to_the_map()
    {
        var keys = new[] { "o1", "o2" };
        var corners = new Dictionary<string, Corner> { ["o1"] = Corner.NorthWest, ["o2"] = Corner.SouthEast };
        var a = new Keepfall.Core.Match.GameState(Rules, keys, corners: corners, forestSeed: 11);
        var b = new Keepfall.Core.Match.GameState(Rules, keys, corners: corners, forestSeed: 11);
        var c = new Keepfall.Core.Match.GameState(Rules, keys, corners: corners, forestSeed: 12);
        Assert.Equal(a.ForestSites.Select(s => s.Position), b.ForestSites.Select(s => s.Position));
        Assert.NotEqual(a.ForestSites.Select(s => s.Position), c.ForestSites.Select(s => s.Position));
        var site = a.ForestSites.First(s => s.Kind == SiteKind.Chest);
        Assert.True(a.Map.RouteToSite(site.Quadrant!.Value, site).Length > 0);
    }
}
