using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Server.Contracts;

// What the client receives, built under the room lock.
// CastleView/SummaryView only ever go to the castle's owner. RoomView goes to the whole room and
// carries nothing but public facts about players (seat, name, colour, ready, connected, host).

public sealed record ResourcesView(double Food, double Wood, double Iron);

public sealed record RatesView(double FoodIn, double FoodOut, double Wood, double Iron, double ForgeSpeed);

public sealed record JobView(Job Job, string Name, int Count, int? Capacity);

public sealed record CostView(double Wood, double Iron, double Seconds, double Multiplier);

/// <param name="Product">What the workers gather (null for the forge).</param>
/// <param name="UpgradeGain">Extra per minute (or forge speed) the next level gives with today's workers.</param>
public sealed record BuildingView(
    BuildingType Type, string Name, Job Worker, Resource? Product, int Level, int MaxLevel, int Capacity, double Multiplier,
    double? UpgradeRemaining, double UpgradeTotal, CostView? NextUpgrade, double? UpgradeGain);

public sealed record UnitView(string Id, string Name, double Wood, double Iron, double BuildSeconds, int Weapons, int Soldiers);

public sealed record OrderView(string UnitId, string Name, int Remaining, double Progress, double BuildSeconds);

public sealed record SummaryView(
    double DurationSeconds, int StartPopulation, int FinalPopulation, int PeakPopulation, int PeopleBorn,
    IReadOnlyList<JobView> Workers, IReadOnlyList<UnitView> Units, int WeaponsMade,
    ResourcesView Produced, ResourcesView Final, double StarvingSeconds, double IdleWorkerSeconds,
    IReadOnlyList<BuildingView> Buildings, IReadOnlyList<EconomySample> Samples);

// Scouting. A report is all the client ever learns about another castle: approximate soldier
// counts and building levels. Targets carry only public facts (seat, name, colour).
public sealed record ScoutTargetView(int Seat, string Name, PlayerColor Color, bool Busy);
public sealed record ScoutMissionView(int TargetSeat, double Progress, bool Arrived, double RemainingSeconds);
public sealed record ScoutedUnitView(string UnitId, string Name, int Count);
public sealed record ScoutBuildingView(BuildingType Type, string Name, int Level);
public sealed record ScoutReportView(
    int TargetSeat, string TargetName, PlayerColor TargetColor, double ObservedAt, double DeliveredAt,
    IReadOnlyList<ScoutedUnitView> Soldiers, IReadOnlyList<ScoutBuildingView> Buildings);
public sealed record ScoutingView(
    double MissionSeconds, int ScoutsAway, IReadOnlyList<ScoutTargetView> Targets,
    IReadOnlyList<ScoutMissionView> Missions, IReadOnlyList<ScoutReportView> Reports);

public sealed record CastleView(
    MatchPhase Phase, PlayerColor Color, double ElapsedSeconds, double RemainingSeconds, double PrepSeconds,
    int Speed, bool SpeedControl,
    ResourcesView Resources, RatesView Rates,
    int Population, int Soldiers, double NextPersonCost, double FoodReserve, bool GrowthEnabled, bool Starving,
    IReadOnlyList<JobView> Jobs, IReadOnlyList<BuildingView> Buildings,
    IReadOnlyList<UnitView> Units, IReadOnlyList<OrderView> Queue,
    ScoutingView Scouting,
    SummaryView? Summary);

public sealed record CommandResultView(bool Ok, string? Error);

/// <summary>Public facts about a player. Never the token.</summary>
public sealed record PlayerView(int Seat, string Name, PlayerColor Color, bool Ready, bool Connected, bool IsHost);

public sealed record RoomView(
    string Code, RoomPhase Phase, IReadOnlyList<PlayerView> Players, int MinPlayers, int MaxPlayers,
    bool CanStart, double? RemainingSeconds);

/// <summary>Answer to CreateRoom/JoinRoom: the caller's own secret token and seat.</summary>
public sealed record JoinView(bool Ok, string? Error, string? Code, string? Token, int Seat, RoomView? Room);

public static class ViewMapper
{
    public static RoomView ToView(Room room) => new(
        room.Code, room.Phase,
        room.Players.Select(p => new PlayerView(p.Seat, p.Name, p.Color, p.Ready, p.Connected, p.Seat == room.HostSeat)).ToList(),
        room.Options.MinPlayers, room.Options.MaxPlayers, room.CanStart, room.Game?.RemainingSeconds);

    /// <summary>The castle of <paramref name="player"/>; null while the room has no match.</summary>
    public static CastleView? CastleOf(Room room, RoomPlayer player)
    {
        if (room.Game is not { } game || game.CastleOf(player.CastleKey) is not { } c) return null;
        bool speedControl = room.Options.AllowSpeedControl && player.Seat == room.HostSeat;
        return new CastleView(
            game.Phase, player.Color, game.ElapsedSeconds, game.RemainingSeconds, game.PrepSeconds, room.Speed, speedControl,
            new ResourcesView(c.Food, c.Wood, c.Iron),
            new RatesView(c.ProductionPerMinute(Resource.Food), c.FoodConsumptionPerMinute,
                c.ProductionPerMinute(Resource.Wood), c.ProductionPerMinute(Resource.Iron), c.ForgeSpeed),
            c.Population, c.SoldierCount, c.NextPersonCost, c.GrowthReserve, c.GrowthEnabled, c.Starving,
            JobsOf(c), BuildingsOf(c), UnitsOf(c),
            c.Queue.Select(o => new OrderView(o.Type.Id, o.Type.Name, o.Remaining, o.Progress, o.Type.BuildSeconds)).ToList(),
            ScoutingOf(room, game, player, c),
            game.SummaryOf(player.CastleKey) is { } s ? ToView(s, c) : null);
    }

    private static ScoutingView ScoutingOf(Room room, GameState game, RoomPlayer player, Castle c)
    {
        var missions = game.MissionsOf(player.CastleKey);
        int SeatOf(string key) => room.PlayerOfCastle(key)?.Seat ?? 0;
        return new ScoutingView(
            game.Rules.Scouting.MissionSeconds,
            c.ScoutsAway,
            room.Players.Where(p => p.Seat != player.Seat)
                .Select(p => new ScoutTargetView(p.Seat, p.Name, p.Color, missions.Any(m => m.Target == p.CastleKey)))
                .ToList(),
            missions.Select(m => new ScoutMissionView(
                SeatOf(m.Target), m.Progress(game.ElapsedSeconds), m.Arrived, Math.Max(0, m.ReturnsAt - game.ElapsedSeconds))).ToList(),
            game.ReportsOf(player.CastleKey).Select(r =>
            {
                var target = room.PlayerOfCastle(r.Target);
                return new ScoutReportView(
                    target?.Seat ?? 0, target?.Name ?? "?", target?.Color ?? PlayerColor.Blue, r.ObservedAt, r.DeliveredAt,
                    r.Soldiers.Select(u => new ScoutedUnitView(u.UnitId, u.Name, u.Count)).ToList(),
                    r.BuildingLevels.Select(kv => new ScoutBuildingView(kv.Key, Jobs.Name(kv.Key), kv.Value)).ToList());
            }).ToList());
    }

    private static List<JobView> JobsOf(Castle c) =>
        Jobs.All.Select(j => new JobView(j, Jobs.Name(j), c.Workers[j],
            Jobs.BuildingOf(j) is { } b ? c.Capacity(b) : null)).ToList();

    private static List<BuildingView> BuildingsOf(Castle c) =>
        Jobs.Buildings.Select(type =>
        {
            var b = c.Building(type);
            var max = c.Economy.MaxBuildingLevel;
            var next = b.Level < max ? c.Economy.Level(b.Level + 1) : null;
            return new BuildingView(type, Jobs.Name(type), Jobs.WorkerOf(type), Jobs.ProductOf(Jobs.WorkerOf(type)),
                b.Level, max, c.Capacity(type), c.Multiplier(type), b.UpgradeRemaining, b.UpgradeTotal,
                next is null ? null : new CostView(next.UpgradeWood, next.UpgradeIron, next.UpgradeSeconds, next.Multiplier),
                c.UpgradeGain(type));
        }).ToList();

    private static List<UnitView> UnitsOf(Castle c) =>
        c.UnitTypes.Select(u => new UnitView(u.Id, u.Name, u.Cost.Wood, u.Cost.Iron, u.BuildSeconds,
            c.Weapons[u], c.Soldiers[u])).ToList();

    private static SummaryView ToView(EconomySummary s, Castle c) => new(
        s.DurationSeconds, s.StartPopulation, s.FinalPopulation, s.PeakPopulation, s.PeopleBorn,
        JobsOf(c), UnitsOf(c), s.WeaponsMade,
        new ResourcesView(s.ProducedFood, s.ProducedWood, s.ProducedIron),
        new ResourcesView(s.FinalFood, s.FinalWood, s.FinalIron),
        s.StarvingSeconds, s.IdleWorkerSeconds, BuildingsOf(c), s.Samples);
}
