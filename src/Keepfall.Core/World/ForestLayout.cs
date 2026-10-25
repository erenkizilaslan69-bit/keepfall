namespace Keepfall.Core.World;

public enum SiteKind { Chest, Village, Camp, BigCamp }

/// <summary>
/// One place in the forest. Where it is, its trail from the forest road and what it holds are decided when the
/// match starts and never change; what is left of it (looted, bandits fallen) is the match's business.
/// Nothing here is ever sent to a player who has not found it.
/// </summary>
/// <param name="Id">Random: says nothing about the kind, the corner or the order.</param>
/// <param name="Quadrant">The corner whose quarter of the forest this lies in; null for the big camp in the middle.</param>
/// <param name="RoadEdgeId">The forest road the trail leaves from (-1 for the big camp, which stands on the hub).</param>
/// <param name="Spur">The trail from the road to the place (two points: the foot, then the place).</param>
public sealed record ForestSite(
    string Id, SiteKind Kind, Corner? Quadrant, Vec Position, Vec Foot, int RoadEdgeId, IReadOnlyList<Vec> Spur,
    int Gold, int People, IReadOnlyDictionary<string, int> Bandits, IReadOnlyDictionary<string, int> Weapons,
    int Iron = 0, int Food = 0, int Wood = 0);

/// <summary>
/// Scatters the forest's places: random every match, but fair. Each slot (the first chest, the second chest, the
/// village, the camp) gets one random distance along the forest road and one trail length, used by every corner,
/// and each corner only picks on which side of its road the trail turns off. So every corner has the same kinds
/// and numbers of places, each the same road distance from its gate and holding the same reward.
/// </summary>
public static class ForestLayout
{
    public static IReadOnlyList<ForestSite> Generate(WorldMap map, ForestRules rules, Random rng)
    {
        var hub = map.Nodes.First(n => n.Id == "hub").Position;
        var roads = Enum.GetValues<Corner>().ToDictionary(c => c,
            c => map.Edges.First(e => e.From == $"junction-{c}" && e.To == "hub"));
        var half = Math.Abs(roads[Corner.NorthWest].Points[0].X - hub.X) - rules.EdgeMargin;

        var slots = new List<SiteKind>();
        slots.AddRange(Enumerable.Repeat(SiteKind.Chest, rules.ChestsPerCorner));
        slots.AddRange(Enumerable.Repeat(SiteKind.Village, rules.VillagesPerCorner));
        slots.AddRange(Enumerable.Repeat(SiteKind.Camp, rules.CampsPerCorner));

        // A layout can paint itself into a corner (the last slot has no room left in some corner): start over then.
        List<ForestSite>? sites = null;
        for (int tries = 0; tries < 200 && sites is null; tries++) sites = TryPlace(slots, roads, hub, half, rules, rng);
        if (sites is null) throw new InvalidOperationException("Could not place the forest's places.");

        var big = rules.BigCamp;
        sites.Add(new ForestSite(NewId(rng), SiteKind.BigCamp, null, hub, hub, -1, [],
            rng.Next(big.GoldMin, big.GoldMax + 1), 0, big.Bandits, big.Weapons, Wood: Roll(rng, big.WoodMin, big.WoodMax)));
        return sites;
    }

    private static List<ForestSite>? TryPlace(List<SiteKind> slots, Dictionary<Corner, RoadEdge> roads, Vec hub, double half,
        ForestRules rules, Random rng)
    {
        var sites = new List<ForestSite>();
        foreach (var kind in slots)
        {
            var reward = RollReward(kind, rules, rng);
            ForestSite[]? placed = null;
            for (int attempt = 0; attempt < 3_000 && placed is null; attempt++)
            {
                double t = Between(rng, rules.FootMin, rules.FootMax), s = Between(rng, rules.SpurMin, rules.SpurMax);
                var candidate = new List<ForestSite>();
                foreach (var (corner, road) in roads)
                {
                    // Each corner picks, at random, a side of its road where the place fits (it may have to take the other).
                    bool first = rng.Next(2) == 0;
                    var fitting = new[] { first ? -1 : 1, first ? 1 : -1 }
                        .Select(side => Make(rng, kind, corner, road, t, s, side, reward))
                        .FirstOrDefault(c => Fits(c, hub, road.Points[0], half, rules) && Clear(c, sites, rules) && Clear(c, candidate, rules));
                    if (fitting is null) break;
                    candidate.Add(fitting);
                }
                if (candidate.Count == roads.Count) placed = [.. candidate];
            }
            if (placed is null) return null;
            sites.AddRange(placed);
        }
        return sites;
    }

    private static ForestSite Make(Random rng, SiteKind kind, Corner corner, RoadEdge road, double t, double s, int side, Reward reward)
    {
        var junction = road.Points[0];
        var hub = road.Points[^1];
        var d = (hub - junction) * (1 / (hub - junction).Length);
        var foot = junction + d * t;
        var position = foot + new Vec(-d.Y, d.X) * (side * s);
        return new ForestSite(NewId(rng), kind, corner, position, foot, road.Id, [foot, position],
            reward.Gold, reward.People, reward.Bandits, reward.Weapons, reward.Iron, reward.Food, reward.Wood);
    }

    private sealed record Reward(int Gold, int People, IReadOnlyDictionary<string, int> Bandits, IReadOnlyDictionary<string, int> Weapons,
        int Iron = 0, int Food = 0, int Wood = 0);

    private static readonly IReadOnlyDictionary<string, int> None = new Dictionary<string, int>();

    // The extra goods (iron, food, wood) are rolled after the gold and people, and only when the range is set, so a
    // config without them draws exactly the numbers it always did and the layout of the places does not move.
    private static Reward RollReward(SiteKind kind, ForestRules r, Random rng) => kind switch
    {
        SiteKind.Chest => Chest(r, rng),
        SiteKind.Village => Village(r, rng),
        _ => Camp(r, rng),
    };

    private static Reward Chest(ForestRules r, Random rng)
    {
        int gold = rng.Next(r.Chest.GoldMin, r.Chest.GoldMax + 1);
        return new Reward(gold, 0, None, None, Iron: Roll(rng, r.Chest.IronMin, r.Chest.IronMax));
    }

    private static Reward Village(ForestRules r, Random rng)
    {
        int gold = rng.Next(r.Village.GoldMin, r.Village.GoldMax + 1), people = rng.Next(r.Village.PeopleMin, r.Village.PeopleMax + 1);
        return new Reward(gold, people, None, None, Food: Roll(rng, r.Village.FoodMin, r.Village.FoodMax));
    }

    private static Reward Camp(ForestRules r, Random rng)
    {
        int gold = rng.Next(r.Camp.GoldMin, r.Camp.GoldMax + 1);
        return new Reward(gold, 0, r.Camp.Bandits, r.Camp.Weapons, Wood: Roll(rng, r.Camp.WoodMin, r.Camp.WoodMax));
    }

    private static int Roll(Random rng, int min, int max) => max <= 0 ? 0 : rng.Next(min, max + 1);

    private static double Between(Random rng, double min, double max) => min + rng.NextDouble() * (max - min);

    private static string NewId(Random rng) => rng.NextInt64().ToString("x16");

    /// <summary>
    /// Inside the ring road with its margin, in the corner's own quarter (on its side of the middle in both
    /// directions) and away from the middle.
    /// </summary>
    private static bool Fits(ForestSite c, Vec hub, Vec junction, double half, ForestRules rules) =>
        Math.Abs(c.Position.X - hub.X) <= half && Math.Abs(c.Position.Y - hub.Y) <= half
        && Math.Sign(junction.X - hub.X) * (c.Position.X - hub.X) >= 0.5
        && Math.Sign(junction.Y - hub.Y) * (c.Position.Y - hub.Y) >= 0.5
        && c.Position.DistanceTo(hub) >= rules.HubClearing + 1;

    /// <summary>Far enough from the places already there: the places themselves, and the trails.</summary>
    private static bool Clear(ForestSite c, IEnumerable<ForestSite> others, ForestRules rules)
    {
        foreach (var o in others)
        {
            if (c.Position.DistanceTo(o.Position) < rules.MinSpacing) return false;
            if (SegmentDistance(c.Foot, c.Position, o.Foot, o.Position) < 1.2) return false;
        }
        return true;
    }

    private static double SegmentDistance(Vec a1, Vec a2, Vec b1, Vec b2)
    {
        if (Intersect(a1, a2, b1, b2)) return 0;
        return Math.Min(Math.Min(PointSegment(a1, b1, b2), PointSegment(a2, b1, b2)),
            Math.Min(PointSegment(b1, a1, a2), PointSegment(b2, a1, a2)));
    }

    private static double PointSegment(Vec p, Vec a, Vec b)
    {
        var ab = b - a;
        double l2 = ab.X * ab.X + ab.Y * ab.Y;
        double k = l2 < 1e-12 ? 0 : Math.Clamp(((p.X - a.X) * ab.X + (p.Y - a.Y) * ab.Y) / l2, 0, 1);
        return p.DistanceTo(a + ab * k);
    }

    private static bool Intersect(Vec a1, Vec a2, Vec b1, Vec b2)
    {
        static double Cross(Vec o, Vec a, Vec b) => (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);
        double d1 = Cross(b1, b2, a1), d2 = Cross(b1, b2, a2), d3 = Cross(a1, a2, b1), d4 = Cross(a1, a2, b2);
        return d1 * d2 < 0 && d3 * d4 < 0;
    }
}
