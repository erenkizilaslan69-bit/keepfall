using Keepfall.Core.Combat;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Views;

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
    IReadOnlyList<ArmyUnitView> Units, IReadOnlyList<VecView> Route, double Travelled, double Speed, double VisionRadius, bool Fighting,
    MissionKind? MissionKind = null, Corner? Quarter = null, string? SiteId = null);

/// <summary>Someone else's army or scout inside the player's vision. Nothing more than this.</summary>
public sealed record SeenMoverView(
    string Id, MoverKind Kind, int OwnerSeat, PlayerColor OwnerColor, VecView Position, VecView Velocity, IReadOnlyList<ArmyUnitView> Units);

/// <summary>A battle going on that the player can see. Deliberately only where it is: not who, not how it goes.</summary>
public sealed record BattleMarkerView(string Id, VecView At);

/// <summary>Ground one of the player's scouts walked over that is still in view (fading out as it closes).</summary>
public sealed record TrailView(VecView Center, double Radius, double Fade);

/// <summary>
/// A place of the forest the player has found, as they last saw it: what it is, where, the trail to it, whether it was
/// used up and (for a camp) about how many bandits. Places nobody on the player's side has found are never in here.
/// </summary>
public sealed record SiteView(
    string Id, SiteKind Kind, VecView Position, IReadOnlyList<VecView> Spur, Corner? Quarter, bool Gone,
    IReadOnlyList<ArmyUnitView> Bandits, double DiscoveredAt, double SeenAt, int MinSoldiers = 0);

public sealed record MapStateView(
    double ElapsedSeconds, IReadOnlyList<VisionView> Vision, IReadOnlyList<OwnMoverView> Own, IReadOnlyList<SeenMoverView> Seen,
    IReadOnlyList<BattleMarkerView> Battles, IReadOnlyList<TrailView> Trail, IReadOnlyList<SiteView> Sites);

// A battle, for the two sides fighting it and nobody else: both armies soldier by soldier and the whole
// record (hits [tick, attacker, target], deaths [tick, soldier], advances [tick, soldier]; soldiers are
// numbered side A first). Ticks are TickSeconds of simulation; the battle plays at Playback times that.
public sealed record BattleSoldierView(string UnitId, Row Row);
public sealed record BattleSideView(int Seat, PlayerColor Color, string Name, bool Attacker, IReadOnlyList<BattleSoldierView> Soldiers);
public sealed record BattleStartedView(
    string Id, BattleKind Kind, VecView At, VecView Facing, double StartedAt, double Playback, double TickSeconds, int Ticks,
    double FightSeconds, IReadOnlyList<BattleSideView> Sides,
    IReadOnlyList<int> Hits, IReadOnlyList<int> Deaths, IReadOnlyList<int> Advances, BattleWinner Winner, IReadOnlyList<int>? Heals = null);

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
            own.Add(new OwnMoverView(m.PublicId, m.Kind == MissionKind.Envoy ? MoverKind.Envoy : MoverKind.Scout, SeatOf(m.Target), m.Back is not null,
                VecView.Of(m.Position), VecView.Of(m.Velocity), [],
                m.Leg.Route.Points.Select(VecView.Of).ToList(), m.Leg.Travelled, m.Leg.Speed, m.Kind == MissionKind.Envoy ? 0 : game.Rules.Map.ScoutVision, false,
                m.Kind, m.Quarter, m.Site?.Site.Id));

        var seen = game.SeenBy(key).Select(s =>
        {
            var owner = room.PlayerOfCastle(s.Owner);
            return new SeenMoverView(s.Id, s.Kind, owner?.Seat ?? 0, owner?.Color ?? PlayerColor.Blue,
                VecView.Of(s.Position), VecView.Of(s.Velocity), Units(s.Units));
        }).ToList();

        return new MapStateView(game.ElapsedSeconds,
            game.VisionOf(key).Select(v => new VisionView(VecView.Of(v.Center), v.Radius)).ToList(), own, seen,
            game.BattlesSeenBy(key).Select(b => new BattleMarkerView(b.PublicId, VecView.Of(b.Position))).ToList(),
            game.TrailOf(key).Select(t => new TrailView(VecView.Of(t.Center), t.Radius, t.Fade)).ToList(),
            game.KnownSitesOf(key).Select(k => new SiteView(k.Site.Id, k.Site.Kind, VecView.Of(k.Site.Position),
                k.Site.Spur.Select(VecView.Of).ToList(), k.Site.Quadrant, k.Gone, Units(k.BanditsSeen), k.DiscoveredAt, k.SeenAt,
                k.Site.Kind == SiteKind.Village ? game.Rules.Forest.Village.MinSoldiers : 0)).ToList());
    }

    /// <summary>More hits than this and only the deaths are sent (the client then animates attacks loosely).</summary>
    private const int MaxHits = 20_000;

    /// <summary>The full battle; only ever for a player who fights in it.</summary>
    public static BattleStartedView BattleOf(Room room, GameState game, ActiveBattle b)
    {
        var record = b.Record;
        BattleSideView Side(int side, string key, bool attacker)
        {
            if (key.StartsWith("site:")) // the bandits of a camp
                return new BattleSideView(0, PlayerColor.Black, "Haydutlar", attacker,
                    record.Soldiers.Where(s => s.Side == side).Select(s => new BattleSoldierView(s.Type.Id, s.Row)).ToList());
            var p = room.PlayerOfCastle(key);
            return new BattleSideView(p?.Seat ?? 0, p?.Color ?? PlayerColor.Blue, p?.Name ?? "?", attacker,
                record.Soldiers.Where(s => s.Side == side).Select(s => new BattleSoldierView(s.Type.Id, s.Row)).ToList());
        }
        return new BattleStartedView(
            b.PublicId, b.Kind, VecView.Of(b.Position), VecView.Of(b.Facing), b.StartedAt, game.Rules.War.BattlePlayback,
            record.TickSeconds, record.Ticks, b.FightSeconds,
            [Side(0, b.Attacker.From, true), Side(1, b.Defender, false)],
            record.HitCount > MaxHits ? [] : record.Hits, record.Deaths, record.Advances, b.Winner, record.Heals);
    }

    /// <summary>Battles <paramref name="player"/> fights in that started since the last call.</summary>
    public static List<BattleStartedView> StartedBattlesOf(Room room, RoomPlayer player) =>
        room.Game is { } game ? game.TakeStartedBattles(player.CastleKey).Select(b => BattleOf(room, game, b)).ToList() : [];

    /// <summary>Every battle <paramref name="player"/> is fighting right now (after a reconnect).</summary>
    public static List<BattleStartedView> ActiveBattlesOf(Room room, RoomPlayer player) =>
        room.Game is { } game ? game.ActiveBattlesOf(player.CastleKey).Select(b => BattleOf(room, game, b)).ToList() : [];

    private static List<ArmyUnitView> Units(IReadOnlyDictionary<UnitType, int> units) =>
        units.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index).Select(kv => new ArmyUnitView(kv.Key.Id, kv.Key.Name, kv.Value)).ToList();
}
