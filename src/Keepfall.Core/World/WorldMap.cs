namespace Keepfall.Core.World;

/// <summary>A point or direction on the world map, in tiles (the client draws a tile as 64 px).</summary>
public readonly record struct Vec(double X, double Y)
{
    public static Vec operator +(Vec a, Vec b) => new(a.X + b.X, a.Y + b.Y);
    public static Vec operator -(Vec a, Vec b) => new(a.X - b.X, a.Y - b.Y);
    public static Vec operator *(Vec a, double k) => new(a.X * k, a.Y * k);

    public double Length => Math.Sqrt(X * X + Y * Y);
    public double DistanceTo(Vec other) => (other - this).Length;
}

public enum Corner { NorthWest, NorthEast, SouthWest, SouthEast }

/// <summary>Something on the map that is not a castle. Only the forest for now; chests, villages and bandit camps come next.</summary>
public enum FeatureKind { Forest }

public sealed record MapFeature(string Id, FeatureKind Kind, Vec Center, double Radius);

/// <summary>
/// A player's corner of the map: the castle scene (castle, farm, lumber camp, mine, forge), translated
/// into place. Regions are never mirrored, so the gate is at the same spot in every one of them.
/// </summary>
public sealed record Region(Corner Corner, Vec Origin, double Width, double Height, Vec Gate)
{
    public Vec Center => Origin + new Vec(Width / 2, Height / 2);
}

public sealed record RoadNode(string Id, Vec Position);

/// <summary>A stretch of road between two nodes; <see cref="Points"/> runs from <see cref="From"/> to <see cref="To"/>.</summary>
public sealed record RoadEdge(int Id, string From, string To, IReadOnlyList<Vec> Points)
{
    public double Length { get; } = PolylineLength(Points);

    internal static double PolylineLength(IReadOnlyList<Vec> points)
    {
        double length = 0;
        for (int i = 1; i < points.Count; i++) length += points[i - 1].DistanceTo(points[i]);
        return length;
    }
}

/// <summary>
/// The shared map: a square with a player region in each corner and a forest in the middle, joined
/// by roads. Everyone gets the same map; only what moves on it is hidden (fog of war).
///
/// Roads: each gate leaves its region sideways along the castle's front (the old scout path) and
/// turns along the region's inner edge to a junction. The four junctions form a square ring around
/// the forest, and four forest roads meet at the hub in the middle. Every gate→junction road has
/// the same length and the ring is a square centred on the hub, so from every corner both
/// neighbours are equally far (round the ring) and the opposite corner is equally far (through the
/// forest), whatever the corner.
/// </summary>
public sealed class WorldMap
{
    public const double RegionWidth = 16, RegionHeight = 12;
    /// <summary>The castle gate inside a region (the scene's GATE, 512 × 452 px).</summary>
    public static readonly Vec LocalGate = new(8, 452.0 / 64);

    private readonly Dictionary<string, RoadNode> _nodes;
    private readonly Dictionary<Corner, Region> _regions;

    private WorldMap(double size, IEnumerable<Region> regions, IEnumerable<RoadNode> nodes, IEnumerable<RoadEdge> edges,
        IEnumerable<MapFeature> features)
    {
        Size = size;
        _regions = regions.ToDictionary(r => r.Corner);
        _nodes = nodes.ToDictionary(n => n.Id);
        Edges = edges.ToList();
        Features = features.ToList();
    }

    public double Size { get; }
    public IReadOnlyCollection<Region> Regions => _regions.Values;
    public IReadOnlyCollection<RoadNode> Nodes => _nodes.Values;
    public IReadOnlyList<RoadEdge> Edges { get; }
    public IReadOnlyList<MapFeature> Features { get; }

    public Region RegionOf(Corner corner) => _regions[corner];
    public static string GateNode(Corner corner) => $"gate-{corner}";

    /// <summary>The 56 × 56 tile map every match is played on.</summary>
    public static WorldMap Standard { get; } = BuildStandard();

    private static WorldMap BuildStandard()
    {
        const double size = 56, margin = 2;
        // Regions sit in the corners; the 20-tile gap between them holds the ring and the forest.
        double west = margin, east = size - margin - RegionWidth;
        double north = margin, south = size - margin - RegionHeight;
        var regions = new[]
        {
            NewRegion(Corner.NorthWest, west, north), NewRegion(Corner.NorthEast, east, north),
            NewRegion(Corner.SouthWest, west, south), NewRegion(Corner.SouthEast, east, south),
        };

        // Ring: a square through the regions' inner edges, centred between the gates.
        double ringLeft = west + RegionWidth, ringRight = east;
        double half = (ringRight - ringLeft) / 2;
        var hub = new Vec((ringLeft + ringRight) / 2, (regions[0].Gate.Y + regions[2].Gate.Y) / 2);
        double ringTop = hub.Y - half, ringBottom = hub.Y + half;

        var nodes = new List<RoadNode> { new("hub", hub) };
        var edges = new List<RoadEdge>();
        var junction = new Dictionary<Corner, Vec>();
        foreach (var r in regions)
        {
            bool isWest = r.Corner is Corner.NorthWest or Corner.SouthWest;
            bool isNorth = r.Corner is Corner.NorthWest or Corner.NorthEast;
            var side = new Vec(isWest ? ringLeft : ringRight, r.Gate.Y);
            var j = junction[r.Corner] = new Vec(side.X, isNorth ? ringTop : ringBottom);
            nodes.Add(new RoadNode(GateNode(r.Corner), r.Gate));
            nodes.Add(new RoadNode(JunctionNode(r.Corner), j));
            edges.Add(new RoadEdge(edges.Count, GateNode(r.Corner), JunctionNode(r.Corner), [r.Gate, side, j]));
        }
        foreach (var (a, b) in new[]
                 {
                     (Corner.NorthWest, Corner.NorthEast), (Corner.SouthWest, Corner.SouthEast),
                     (Corner.NorthWest, Corner.SouthWest), (Corner.NorthEast, Corner.SouthEast),
                 })
            edges.Add(new RoadEdge(edges.Count, JunctionNode(a), JunctionNode(b), [junction[a], junction[b]]));
        foreach (var r in regions)
            edges.Add(new RoadEdge(edges.Count, JunctionNode(r.Corner), "hub", [junction[r.Corner], hub]));

        var forest = new MapFeature("forest", FeatureKind.Forest, hub, half - 2);
        return new WorldMap(size, regions, nodes, edges, [forest]);
    }

    private static Region NewRegion(Corner corner, double x, double y) =>
        new(corner, new Vec(x, y), RegionWidth, RegionHeight, new Vec(x, y) + LocalGate);

    private static string JunctionNode(Corner corner) => $"junction-{corner}";

    /// <summary>The shortest road from one castle gate to another.</summary>
    public Route RouteBetween(Corner from, Corner to) => ShortestRoute(GateNode(from), GateNode(to));

    /// <summary>Dijkstra over the road graph (a handful of nodes).</summary>
    public Route ShortestRoute(string fromNode, string toNode)
    {
        if (!_nodes.ContainsKey(fromNode) || !_nodes.ContainsKey(toNode))
            throw new ArgumentException($"Unknown road node: {fromNode} → {toNode}.");
        var dist = _nodes.Keys.ToDictionary(k => k, _ => double.PositiveInfinity);
        var via = new Dictionary<string, (RoadEdge Edge, string Prev)>();
        var open = new HashSet<string>(_nodes.Keys);
        dist[fromNode] = 0;
        while (open.Count > 0)
        {
            var node = open.MinBy(n => dist[n])!;
            open.Remove(node);
            if (node == toNode || double.IsPositiveInfinity(dist[node])) break;
            foreach (var e in Edges.Where(e => e.From == node || e.To == node))
            {
                var next = e.From == node ? e.To : e.From;
                double d = dist[node] + e.Length;
                if (open.Contains(next) && d < dist[next] - 1e-9)
                {
                    dist[next] = d;
                    via[next] = (e, node);
                }
            }
        }
        if (fromNode != toNode && !via.ContainsKey(toNode)) throw new InvalidOperationException($"No road from {fromNode} to {toNode}.");

        var legs = new List<(RoadEdge Edge, bool Forward)>();
        for (var n = toNode; n != fromNode; n = via[n].Prev)
            legs.Add((via[n].Edge, via[n].Edge.To == n));
        legs.Reverse();
        return Route.FromEdges(_nodes[fromNode].Position, legs);
    }
}
