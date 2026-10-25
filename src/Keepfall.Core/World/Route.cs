namespace Keepfall.Core.World;

/// <summary>One road edge of a route, walked from <see cref="Start"/> (distance along the route) in the given direction.</summary>
public sealed record RouteLeg(int EdgeId, bool Forward, double Start, double Length);

/// <summary>
/// A path along the roads: the polyline to walk and which road edges it uses (so later rules, like
/// cutting off an army on the road, can ask who is on which stretch and in which direction).
/// </summary>
public sealed class Route
{
    private readonly double[] _cumulative;

    private Route(IReadOnlyList<Vec> points, IReadOnlyList<RouteLeg> legs)
    {
        Points = points;
        Legs = legs;
        _cumulative = new double[points.Count];
        for (int i = 1; i < points.Count; i++) _cumulative[i] = _cumulative[i - 1] + points[i - 1].DistanceTo(points[i]);
    }

    public IReadOnlyList<Vec> Points { get; }
    public IReadOnlyList<RouteLeg> Legs { get; }
    public double Length => _cumulative[^1];
    public Vec Start => Points[0];
    public Vec End => Points[^1];

    internal static Route FromEdges(Vec start, IReadOnlyList<(RoadEdge Edge, bool Forward)> edges)
    {
        var points = new List<Vec> { start };
        var legs = new List<RouteLeg>();
        double at = 0;
        foreach (var (edge, forward) in edges)
        {
            var pts = forward ? edge.Points : edge.Points.Reverse().ToList();
            points.AddRange(pts.Skip(1));
            legs.Add(new RouteLeg(edge.Id, forward, at, edge.Length));
            at += edge.Length;
        }
        return new Route(points, legs);
    }

    /// <summary>Routes walked one after the other (each starts where the one before ended).</summary>
    internal static Route Join(params Route[] parts)
    {
        var points = new List<Vec> { parts[0].Start };
        var legs = new List<RouteLeg>();
        double at = 0;
        foreach (var part in parts)
        {
            if (part.Points.Count < 2) continue;
            points.AddRange(part.Points.Skip(1));
            foreach (var l in part.Legs) legs.Add(l with { Start = at + l.Start });
            at += part.Length;
        }
        return new Route(points, legs);
    }

    /// <summary>The same road walked the other way.</summary>
    public Route Reversed()
    {
        double length = Length;
        var legs = Legs.Reverse().Select(l => new RouteLeg(l.EdgeId, !l.Forward, length - l.Start - l.Length, l.Length)).ToList();
        return new Route(Points.Reverse().ToList(), legs);
    }

    /// <summary>The point <paramref name="distance"/> tiles along the route (clamped to its ends).</summary>
    public Vec PointAt(double distance)
    {
        if (distance <= 0) return Points[0];
        if (distance >= Length) return Points[^1];
        int i = Segment(distance);
        double t = (distance - _cumulative[i]) / (_cumulative[i + 1] - _cumulative[i]);
        return Points[i] + (Points[i + 1] - Points[i]) * t;
    }

    /// <summary>Unit direction of travel at <paramref name="distance"/>.</summary>
    public Vec DirectionAt(double distance)
    {
        if (Points.Count < 2) return new Vec(0, 0);
        int i = Segment(Math.Clamp(distance, 0, Length));
        var d = Points[i + 1] - Points[i];
        double l = d.Length;
        return l < 1e-12 ? new Vec(0, 0) : d * (1 / l);
    }

    /// <summary>The road edge being walked at <paramref name="distance"/>.</summary>
    public RouteLeg? LegAt(double distance) =>
        Legs.LastOrDefault(l => distance >= l.Start - 1e-9) ?? Legs.FirstOrDefault();

    private int Segment(double distance)
    {
        int i = Array.BinarySearch(_cumulative, distance);
        if (i < 0) i = ~i - 1;
        return Math.Clamp(i, 0, Points.Count - 2);
    }
}

/// <summary>
/// Something walking a route: an army or a scout. It advances by its speed every tick rather than
/// being a fixed function of time, so a later rule can stop it, slow it or turn it around.
/// </summary>
public sealed class Traveller
{
    /// <param name="travelled">Where on the route it starts (for turning back half way).</param>
    public Traveller(Route route, double speed, double travelled = 0)
    {
        if (speed <= 0) throw new ArgumentOutOfRangeException(nameof(speed));
        Route = route;
        Speed = speed;
        Travelled = Math.Clamp(travelled, 0, route.Length);
    }

    public Route Route { get; }
    /// <summary>Tiles per second.</summary>
    public double Speed { get; }
    public double Travelled { get; private set; }
    public bool Arrived => Travelled >= Route.Length - 1e-9;
    public Vec Position => Route.PointAt(Travelled);
    public Vec Direction => Route.DirectionAt(Travelled);
    public double Fraction => Route.Length <= 0 ? 1 : Math.Clamp(Travelled / Route.Length, 0, 1);
    public double SecondsLeft => Math.Max(0, Route.Length - Travelled) / Speed;

    public void Advance(double seconds) => Travelled = Math.Min(Route.Length, Travelled + Speed * seconds);
}

/// <summary>
/// Moving and seeing on the map ("map" in the balance config): speeds in tiles per second, vision
/// radii in tiles around the castle gate, one's own armies and one's own scouts.
/// </summary>
/// <param name="ScoutTrailSeconds">How long the ground a scout walked over stays in view after it passed (0 = to the end of the match).</param>
public sealed record MapRules(double ArmySpeed, double ScoutSpeed, double CastleVision, double ArmyVision, double ScoutVision, double ScoutTrailSeconds);
