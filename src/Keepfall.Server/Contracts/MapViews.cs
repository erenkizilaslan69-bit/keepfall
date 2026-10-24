using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Server.Contracts;

// The shared map. MapLayoutView is public and the same for everyone in the room: terrain, roads and
// whose castle sits in which corner. MapStateView goes to one player only, every tick: what that
// player sees right now (fog of war is applied here, on the server). Another player's army or scout
// outside the player's vision is simply not in it; one inside it carries only where it is, which way
// it goes, whose it is and (for an army) its soldiers — never its target, road or arrival time.

public sealed record VecView(double X, double Y)
{
    public static VecView Of(Vec v) => new(v.X, v.Y);
}

public sealed record RegionView(Corner Corner, VecView Origin, double Width, double Height, VecView Gate, int? Seat, PlayerColor? Color, string? Name);
public sealed record RoadView(int Id, IReadOnlyList<VecView> Points);
public sealed record FeatureView(string Id, FeatureKind Kind, VecView Center, double Radius);
public sealed record MapLayoutView(double Size, IReadOnlyList<RegionView> Regions, IReadOnlyList<RoadView> Roads, IReadOnlyList<FeatureView> Features);

public sealed record VisionView(VecView Center, double Radius);

/// <summary>One of the player's own armies or scouts, with its whole road (so the client can walk it smoothly) and how far it sees.</summary>
public sealed record OwnMoverView(
    string Id, MoverKind Kind, int TargetSeat, bool Returning, VecView Position, VecView Velocity,
    IReadOnlyList<ArmyUnitView> Units, IReadOnlyList<VecView> Route, double Travelled, double Speed, double VisionRadius, bool Fighting);

/// <summary>Someone else's army or scout inside the player's vision. Nothing more than this.</summary>
public sealed record SeenMoverView(
    string Id, MoverKind Kind, int OwnerSeat, PlayerColor OwnerColor, VecView Position, VecView Velocity, IReadOnlyList<ArmyUnitView> Units);

public sealed record MapStateView(double ElapsedSeconds, IReadOnlyList<VisionView> Vision, IReadOnlyList<OwnMoverView> Own, IReadOnlyList<SeenMoverView> Seen);

public static class MapViewMapper
{
    public static MapLayoutView? LayoutOf(Room room)
    {
        if (room.Game is not { } game) return null;
        var map = game.Map;
        return new MapLayoutView(
            map.Size,
            map.Regions.OrderBy(r => r.Corner).Select(r =>
            {
                var owner = game.Corners.FirstOrDefault(kv => kv.Value == r.Corner).Key is { } key ? room.PlayerOfCastle(key) : null;
                return new RegionView(r.Corner, VecView.Of(r.Origin), r.Width, r.Height, VecView.Of(r.Gate), owner?.Seat, owner?.Color, owner?.Name);
            }).ToList(),
            map.Edges.Select(e => new RoadView(e.Id, e.Points.Select(VecView.Of).ToList())).ToList(),
            map.Features.Select(f => new FeatureView(f.Id, f.Kind, VecView.Of(f.Center), f.Radius)).ToList());
    }

    /// <summary>What <paramref name="player"/> sees right now; null while the room has no match.</summary>
    public static MapStateView? StateOf(Room room, RoomPlayer player)
    {
        if (room.Game is not { } game || game.CastleOf(player.CastleKey) is null) return null;
        var key = player.CastleKey;
        int SeatOf(string k) => room.PlayerOfCastle(k)?.Seat ?? 0;

        var own = new List<OwnMoverView>();
        foreach (var a in game.ArmiesOf(key))
            own.Add(new OwnMoverView(a.PublicId, MoverKind.Army, SeatOf(a.Target), a.State == ArmyState.Returning,
                VecView.Of(a.Position), VecView.Of(a.Velocity), Units(a.Walking),
                a.Leg.Route.Points.Select(VecView.Of).ToList(), a.Leg.Travelled, a.Leg.Speed, game.Rules.Map.ArmyVision, a.Battle is not null));
        foreach (var m in game.MissionsOf(key))
            own.Add(new OwnMoverView(m.PublicId, MoverKind.Scout, SeatOf(m.Target), m.Back is not null,
                VecView.Of(m.Position), VecView.Of(m.Velocity), [],
                m.Leg.Route.Points.Select(VecView.Of).ToList(), m.Leg.Travelled, m.Leg.Speed, game.Rules.Map.ScoutVision, false));

        var seen = game.SeenBy(key).Select(s =>
        {
            var owner = room.PlayerOfCastle(s.Owner);
            return new SeenMoverView(s.Id, s.Kind, owner?.Seat ?? 0, owner?.Color ?? PlayerColor.Blue,
                VecView.Of(s.Position), VecView.Of(s.Velocity), Units(s.Units));
        }).ToList();

        return new MapStateView(game.ElapsedSeconds,
            game.VisionOf(key).Select(v => new VisionView(VecView.Of(v.Center), v.Radius)).ToList(), own, seen);
    }

    private static List<ArmyUnitView> Units(IReadOnlyDictionary<UnitType, int> units) =>
        units.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index).Select(kv => new ArmyUnitView(kv.Key.Id, kv.Key.Name, kv.Value)).ToList();
}
