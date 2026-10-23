using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Server.Contracts;

// What the client receives. Only the player's own castle; built under the session lock.

public sealed record ResourcesView(double Food, double Wood, double Iron);

public sealed record RatesView(double FoodIn, double FoodOut, double Wood, double Iron, double ForgeSpeed);

public sealed record JobView(Job Job, string Name, int Count, int? Capacity);

public sealed record CostView(double Wood, double Iron, double Seconds);

public sealed record BuildingView(
    BuildingType Type, string Name, Job Worker, int Level, int MaxLevel, int Capacity, double Multiplier,
    double? UpgradeRemaining, double UpgradeTotal, CostView? NextUpgrade);

public sealed record UnitView(string Id, string Name, double Wood, double Iron, double BuildSeconds, int Weapons, int Soldiers);

public sealed record OrderView(string UnitId, string Name, int Remaining, double Progress, double BuildSeconds);

public sealed record SummaryView(
    double DurationSeconds, int StartPopulation, int FinalPopulation, int PeakPopulation, int PeopleBorn,
    IReadOnlyList<JobView> Workers, IReadOnlyList<UnitView> Units, int WeaponsMade,
    ResourcesView Produced, ResourcesView Final, double StarvingSeconds, double IdleWorkerSeconds,
    IReadOnlyList<BuildingView> Buildings, IReadOnlyList<EconomySample> Samples);

public sealed record CastleView(
    MatchPhase Phase, double ElapsedSeconds, double RemainingSeconds, double PrepSeconds,
    int Speed, bool SpeedControl,
    ResourcesView Resources, RatesView Rates,
    int Population, int Soldiers, double NextPersonCost, double FoodReserve, bool GrowthEnabled, bool Starving,
    IReadOnlyList<JobView> Jobs, IReadOnlyList<BuildingView> Buildings,
    IReadOnlyList<UnitView> Units, IReadOnlyList<OrderView> Queue,
    SummaryView? Summary);

public sealed record CommandResultView(bool Ok, string? Error);

public static class ViewMapper
{
    public static CastleView ToView(GameState game, int speed, bool speedControl)
    {
        var c = game.Castle;
        return new CastleView(
            game.Phase, game.ElapsedSeconds, game.RemainingSeconds, game.PrepSeconds, speed, speedControl,
            new ResourcesView(c.Food, c.Wood, c.Iron),
            new RatesView(c.ProductionPerMinute(Resource.Food), c.FoodConsumptionPerMinute,
                c.ProductionPerMinute(Resource.Wood), c.ProductionPerMinute(Resource.Iron), c.ForgeSpeed),
            c.Population, c.SoldierCount, c.NextPersonCost, c.GrowthReserve, c.GrowthEnabled, c.Starving,
            JobsOf(c), BuildingsOf(c), UnitsOf(c),
            c.Queue.Select(o => new OrderView(o.Type.Id, o.Type.Name, o.Remaining, o.Progress, o.Type.BuildSeconds)).ToList(),
            game.Summary is { } s ? ToView(s, c) : null);
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
            return new BuildingView(type, Jobs.Name(type), Jobs.WorkerOf(type), b.Level, max,
                c.Capacity(type), c.Multiplier(type), b.UpgradeRemaining, b.UpgradeTotal,
                next is null ? null : new CostView(next.UpgradeWood, next.UpgradeIron, next.UpgradeSeconds));
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
