using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>The shared map: its layout, the roads between the corners and walking along them.</summary>
public class WorldMapTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly WorldMap Map = WorldMap.Standard;
    private static readonly Corner[] All = Enum.GetValues<Corner>();

    private static bool Adjacent(Corner a, Corner b) => (a, b) switch
    {
        (Corner.NorthWest, Corner.SouthEast) or (Corner.SouthEast, Corner.NorthWest)
            or (Corner.NorthEast, Corner.SouthWest) or (Corner.SouthWest, Corner.NorthEast) => false,
        _ => true,
    };

    [Fact]
    public void Every_corner_has_the_same_distances_to_its_neighbours_and_to_the_opposite_corner()
    {
        // The regions are not mirrored, so this only holds because the roads are laid out for it.
        double neighbour = Map.RouteBetween(Corner.NorthWest, Corner.NorthEast).Length;
        double opposite = Map.RouteBetween(Corner.NorthWest, Corner.SouthEast).Length;
        foreach (var from in All)
            foreach (var to in All.Where(c => c != from))
                Assert.Equal(Adjacent(from, to) ? neighbour : opposite, Map.RouteBetween(from, to).Length, 9);

        Assert.True(opposite > neighbour, "the opposite corner is further away than a neighbour");
    }

    [Fact]
    public void Roads_to_the_opposite_corner_go_through_the_forest_and_neighbours_round_it()
    {
        var hub = Map.Nodes.Single(n => n.Id == "hub").Position;
        var forest = Map.Features.Single(f => f.Kind == FeatureKind.Forest);
        Assert.Equal(hub, forest.Center);
        Assert.Contains(hub, Map.RouteBetween(Corner.NorthWest, Corner.SouthEast).Points);
        Assert.Contains(hub, Map.RouteBetween(Corner.SouthWest, Corner.NorthEast).Points);
        Assert.All(Map.RouteBetween(Corner.NorthWest, Corner.NorthEast).Points,
            p => Assert.True(p.DistanceTo(forest.Center) > forest.Radius, $"{p} is in the forest"));
    }

    [Fact]
    public void Regions_are_in_the_corners_and_roads_never_cross_another_region()
    {
        foreach (var r in Map.Regions)
        {
            Assert.InRange(r.Origin.X, 0, Map.Size - r.Width);
            Assert.InRange(r.Origin.Y, 0, Map.Size - r.Height);
            Assert.Equal(r.Origin + WorldMap.LocalGate, r.Gate);
        }
        Assert.True(Map.RegionOf(Corner.NorthWest).Center.X < Map.Size / 2 && Map.RegionOf(Corner.NorthWest).Center.Y < Map.Size / 2);
        Assert.True(Map.RegionOf(Corner.SouthEast).Center.X > Map.Size / 2 && Map.RegionOf(Corner.SouthEast).Center.Y > Map.Size / 2);

        foreach (var from in All)
            foreach (var to in All.Where(c => c != from))
            {
                var route = Map.RouteBetween(from, to);
                for (double d = 0; d <= route.Length; d += 0.25)
                {
                    var p = route.PointAt(d);
                    foreach (var other in Map.Regions.Where(r => r.Corner != from && r.Corner != to))
                        Assert.False(p.X > other.Origin.X + 1e-6 && p.X < other.Origin.X + other.Width - 1e-6
                                     && p.Y > other.Origin.Y + 1e-6 && p.Y < other.Origin.Y + other.Height - 1e-6,
                            $"{from}→{to} crosses {other.Corner} at {p}");
                }
            }
    }

    [Fact]
    public void A_route_runs_gate_to_gate_and_knows_its_road_edges()
    {
        var route = Map.RouteBetween(Corner.NorthWest, Corner.NorthEast);
        Assert.Equal(Map.RegionOf(Corner.NorthWest).Gate, route.Start);
        Assert.Equal(Map.RegionOf(Corner.NorthEast).Gate, route.End);
        Assert.Equal(route.Length, route.Legs.Sum(l => l.Length), 9);
        Assert.Equal(0, route.Legs[0].Start);
        Assert.Equal(route.Legs[1].EdgeId, route.LegAt(route.Legs[1].Start + 0.5)!.EdgeId);

        var back = route.Reversed();
        Assert.Equal(route.End, back.Start);
        Assert.Equal(route.Length, back.Length, 9);
        Assert.Equal(route.Legs.Select(l => (l.EdgeId, !l.Forward)).Reverse(), back.Legs.Select(l => (l.EdgeId, l.Forward)));
        Assert.Equal(route.PointAt(10), back.PointAt(route.Length - 10));
    }

    [Fact]
    public void A_traveller_walks_at_its_speed_and_stops_at_the_end()
    {
        var route = Map.RouteBetween(Corner.NorthWest, Corner.SouthEast);
        var t = new Traveller(route, Rules.Map.ArmySpeed);
        t.Advance(2);
        Assert.Equal(2 * Rules.Map.ArmySpeed, route.Start.DistanceTo(t.Position), 9); // first stretch is straight
        Assert.Equal((route.Length - 3) / Rules.Map.ArmySpeed, t.SecondsLeft, 9);
        t.Advance(1000);
        Assert.True(t.Arrived);
        Assert.Equal(route.End, t.Position);
        Assert.Equal(0, t.SecondsLeft);
    }

    [Fact]
    public void Travel_times_follow_the_roads_and_the_configured_speeds()
    {
        Assert.Equal((1.5, 2.5), (Rules.Map.ArmySpeed, Rules.Map.ScoutSpeed));
        var game = new GameState(Rules, ["a", "b", "c"], rng: new Random(1),
            corners: new Dictionary<string, Corner> { ["a"] = Corner.NorthWest, ["b"] = Corner.NorthEast, ["c"] = Corner.SouthEast });
        double neighbour = Map.RouteBetween(Corner.NorthWest, Corner.NorthEast).Length;
        double opposite = Map.RouteBetween(Corner.NorthWest, Corner.SouthEast).Length;
        Assert.Equal(neighbour / 1.5, game.MarchSeconds("a", "b"), 9);
        Assert.Equal(opposite / 1.5, game.MarchSeconds("a", "c"), 9);
        Assert.Equal(opposite / Rules.Map.ScoutSpeed, game.ScoutSeconds("c", "a"), 9);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void Corners_are_handed_out_one_per_player_and_two_players_face_each_other(int players)
    {
        for (int i = 0; i < 20; i++)
        {
            var keys = Enumerable.Range(1, players).Select(n => $"o{n}").ToList();
            var corners = GameState.AssignCorners(keys);
            Assert.Equal(keys.Order(), corners.Keys.Order());
            Assert.Equal(players, corners.Values.Distinct().Count());
            if (players == 2) Assert.False(Adjacent(corners["o1"], corners["o2"]));
        }
        Assert.Throws<ArgumentException>(() => new GameState(Rules, ["a", "b", "c", "d", "e"]));
    }
}
