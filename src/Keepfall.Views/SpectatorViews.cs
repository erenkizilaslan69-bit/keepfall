using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Views;

// What a fallen player watches: the whole map with no fog, every castle's inside, every army and scout, every
// battle with its record. It is the one view that breaks the hidden-information rule, so it goes ONLY to
// players whose castle has fallen, and only after match.spectatorWaitSeconds (and, if set, match.spectatorDelaySeconds late; see Games/SpectatorFeed).
// A player still in the match never gets one of these.

/// <summary>One castle as a spectator sees it: what its owner would see of the inside (buildings, workers, soldiers) and its walls.</summary>
public sealed record SpectatorCastleView(
    int Seat, bool Eliminated,
    IReadOnlyList<BuildingView> Buildings, IReadOnlyList<JobView> Jobs, IReadOnlyList<UnitView> Units,
    string? Kingdom = null, int Guards = 0);

/// <param name="ElapsedSeconds">The game time this picture is of (the live game, or match.spectatorDelaySeconds behind it).</param>
/// <param name="Movers">Every army and scout; they carry no route, like what a player sees of others.</param>
/// <param name="Battles">Every battle going on.</param>
/// <param name="Started">Battles that began since the previous picture, with their records, to be replayed.</param>
/// <param name="Sites">Every place of the forest with its true state (a spectator needs no scout).</param>
public sealed record SpectatorStateView(
    double ElapsedSeconds, IReadOnlyList<SpectatorCastleView> Castles, IReadOnlyList<SeenMoverView> Movers,
    IReadOnlyList<BattleMarkerView> Battles, IReadOnlyList<BattleStartedView> Started, IReadOnlyList<SiteView> Sites);

/// <summary>"The view starts in this many (game) seconds": all a fallen player gets before the first picture.</summary>
public sealed record SpectatorWaitView(double StartsIn);

public static class SpectatorMapper
{
    /// <summary>The whole world right now; null while the room has no match. Call once per tick: it takes the battles that started.</summary>
    public static SpectatorStateView? Capture(Room room)
    {
        if (room.Game is not { } game) return null;
        var castles = new List<SpectatorCastleView>();
        foreach (var p in room.Players)
        {
            if (game.CastleOf(p.CastleKey) is not { } c) continue;
            castles.Add(new SpectatorCastleView(p.Seat, game.IsEliminated(p.CastleKey),
                ViewMapper.BuildingsOf(c), ViewMapper.JobsOf(c), ViewMapper.UnitsOf(c), game.FactionOf(p.CastleKey), c.Guards));
        }
        var movers = game.AllMovers().Select(s =>
        {
            var owner = room.PlayerOfCastle(s.Owner);
            return new SeenMoverView(s.Id, s.Kind, owner?.Seat ?? 0, owner?.Color ?? PlayerColor.Blue,
                VecView.Of(s.Position), VecView.Of(s.Velocity), Units(s.Units));
        }).ToList();
        return new SpectatorStateView(
            game.ElapsedSeconds, castles, movers,
            game.ActiveBattles.Select(b => new BattleMarkerView(b.PublicId, VecView.Of(b.Position))).ToList(),
            game.TakeAllStartedBattles().Select(b => MapViewMapper.BattleOf(room, game, b)).ToList(),
            game.AllSites.Select(s => new SiteView(s.Site.Id, s.Site.Kind, VecView.Of(s.Site.Position), s.Site.Spur.Select(VecView.Of).ToList(),
                s.Site.Quadrant, s.Gone, Units(s.Bandits), 0, game.ElapsedSeconds,
                s.Site.Kind == SiteKind.Village ? game.Rules.Forest.Village.MinSoldiers : 0)).ToList());
    }

    private static List<ArmyUnitView> Units(IReadOnlyDictionary<UnitType, int> units) =>
        units.Where(kv => kv.Value > 0).OrderBy(kv => kv.Key.Index).Select(kv => new ArmyUnitView(kv.Key.Id, kv.Key.Name, kv.Value)).ToList();
}
