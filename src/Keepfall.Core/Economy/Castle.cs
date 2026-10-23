using Keepfall.Core.Match;
using Keepfall.Core.Units;

namespace Keepfall.Core.Economy;

public sealed class Building(BuildingType type)
{
    public BuildingType Type { get; } = type;
    public int Level { get; internal set; } = 1;
    /// <summary>Seconds left on the running upgrade; null when not upgrading.</summary>
    public double? UpgradeRemaining { get; internal set; }
    public double UpgradeTotal { get; internal set; }
    public bool IsUpgrading => UpgradeRemaining is not null;
}

/// <summary>A line in the forge queue: <see cref="Remaining"/> weapons of one type, the first one <see cref="Progress"/> seconds along.</summary>
public sealed class WeaponOrder(UnitType type, int count)
{
    public UnitType Type { get; } = type;
    public int Remaining { get; internal set; } = count;
    public double Progress { get; internal set; }
}

/// <summary>Running totals for the end-of-prep summary.</summary>
public sealed class CastleStats
{
    public double ProducedFood { get; internal set; }
    public double ProducedWood { get; internal set; }
    public double ProducedIron { get; internal set; }
    public int WeaponsMade { get; internal set; }
    public int PeopleBorn { get; internal set; }
    public int PeakPopulation { get; internal set; }
    public double StarvingSeconds { get; internal set; }
    public double IdleWorkerSeconds { get; internal set; }
}

/// <summary>
/// One player's castle: people, jobs, resources, buildings, forge queue and soldiers.
/// All rules come from <see cref="GameRules"/>; nothing here talks to the network.
///
/// A tick, in order: production (halved while starving) → forge → upgrades → food consumption
/// → automatic growth (keeping a food reserve) → starvation check.
/// </summary>
public sealed class Castle
{
    private readonly GameRules _rules;
    private readonly Dictionary<Job, int> _workers = Jobs.All.ToDictionary(j => j, _ => 0);
    private readonly Dictionary<BuildingType, Building> _buildings = Jobs.Buildings.ToDictionary(b => b, b => new Building(b));
    private readonly Dictionary<UnitType, int> _weapons = [];
    private readonly Dictionary<UnitType, int> _soldiers = [];
    private readonly List<WeaponOrder> _queue = [];

    public Castle(GameRules rules)
    {
        _rules = rules;
        var m = rules.Match;
        _workers[Job.Idle] = m.StartingPopulation;
        Food = m.StartingFood;
        Wood = m.StartingWood;
        Iron = m.StartingIron;
        foreach (var u in rules.Units) { _weapons[u] = 0; _soldiers[u] = 0; }
        Stats.PeakPopulation = Population;
    }

    public double Food { get; private set; }
    public double Wood { get; private set; }
    public double Iron { get; private set; }
    public bool GrowthEnabled { get; private set; } = true;
    /// <summary>True when the last tick ended with no food; production runs at the starvation multiplier.</summary>
    public bool Starving { get; private set; }
    public CastleStats Stats { get; } = new();

    public IReadOnlyDictionary<Job, int> Workers => _workers;
    public IReadOnlyDictionary<UnitType, int> Weapons => _weapons;
    public IReadOnlyDictionary<UnitType, int> Soldiers => _soldiers;
    public IReadOnlyList<WeaponOrder> Queue => _queue;
    public IReadOnlyList<UnitType> UnitTypes => _rules.Units;
    public EconomyRules Economy => _rules.Economy;

    public int WorkerCount => _workers.Values.Sum();
    public int SoldierCount => _soldiers.Values.Sum();
    public int Population => WorkerCount + SoldierCount;
    public double NextPersonCost => _rules.Economy.NewPersonCost(Population);

    public Building Building(BuildingType type) => _buildings[type];
    public int Capacity(BuildingType type) => _rules.Economy.Level(_buildings[type].Level).Capacity;
    public double Multiplier(BuildingType type) => _rules.Economy.Level(_buildings[type].Level).Multiplier;
    public double ProductionMultiplier => Starving ? _rules.Economy.StarvationMultiplier : 1;

    /// <summary>Gathering rate of one resource per minute, at the current workers, levels and starvation.</summary>
    public double ProductionPerMinute(Resource resource)
    {
        var job = Jobs.Working.First(j => Jobs.ProductOf(j) == resource);
        double perPerson = resource switch
        {
            Resource.Food => _rules.Production.FoodPerMinute,
            Resource.Wood => _rules.Production.WoodPerMinute,
            _ => _rules.Production.IronPerMinute,
        };
        return _workers[job] * perPerson * Multiplier(Jobs.BuildingOf(job)!.Value) * ProductionMultiplier;
    }

    /// <summary>Food automatic growth leaves untouched: GrowthReserveSeconds of the current consumption.</summary>
    public double GrowthReserve => FoodConsumptionPerMinute * _rules.Economy.GrowthReserveSeconds / 60;

    /// <summary>Food needed before the next person is born: their cost plus the reserve.</summary>
    public double GrowthThreshold => NextPersonCost + GrowthReserve;

    public double FoodConsumptionPerMinute =>
        WorkerCount * _rules.Economy.WorkerFoodPerMinute + SoldierCount * _rules.Economy.SoldierFoodPerMinute;

    /// <summary>Forge speed in weapon-seconds per second (0 without blacksmiths).</summary>
    public double ForgeSpeed => _workers[Job.Blacksmith] * Multiplier(BuildingType.Forge) * ProductionMultiplier;

    // ---- Tick -------------------------------------------------------------------------------

    public void Tick(double dt)
    {
        double food = ProductionPerMinute(Resource.Food) / 60 * dt;
        double wood = ProductionPerMinute(Resource.Wood) / 60 * dt;
        double iron = ProductionPerMinute(Resource.Iron) / 60 * dt;
        Food += food; Wood += wood; Iron += iron;
        Stats.ProducedFood += food; Stats.ProducedWood += wood; Stats.ProducedIron += iron;

        RunForge(ForgeSpeed * dt);

        foreach (var b in _buildings.Values)
        {
            if (b.UpgradeRemaining is not { } left) continue;
            left -= dt;
            if (left <= 1e-9) { b.Level++; b.UpgradeRemaining = null; }
            else b.UpgradeRemaining = left;
        }

        Food = Math.Max(0, Food - FoodConsumptionPerMinute / 60 * dt);

        // A newcomer is born only if the reserve is still there after paying for them.
        // Strictly more than the cost as well, so growth never leaves exactly 0 food when the reserve is 0.
        if (GrowthEnabled && Food > NextPersonCost && Food - NextPersonCost + 1e-9 >= GrowthReserve)
        {
            Food -= NextPersonCost;
            _workers[Job.Idle]++;
            Stats.PeopleBorn++;
        }

        Starving = Food <= 1e-9;
        if (Starving) Stats.StarvingSeconds += dt;
        Stats.IdleWorkerSeconds += _workers[Job.Idle] * dt;
        Stats.PeakPopulation = Math.Max(Stats.PeakPopulation, Population);
    }

    private void RunForge(double work)
    {
        while (work > 1e-9 && _queue.Count > 0)
        {
            var order = _queue[0];
            double needed = order.Type.BuildSeconds - order.Progress;
            if (work < needed) { order.Progress += work; return; }
            work -= needed;
            order.Progress = 0;
            order.Remaining--;
            _weapons[order.Type]++;
            Stats.WeaponsMade++;
            if (order.Remaining == 0) _queue.RemoveAt(0);
        }
    }

    // ---- Commands ---------------------------------------------------------------------------

    public CommandResult Execute(GameCommand command) => command switch
    {
        MoveWorkers c => Move(c),
        QueueWeapon c => Enqueue(c),
        CancelWeapon c => Cancel(c),
        ArmWorkers c => Arm(c),
        DisarmSoldiers c => Disarm(c),
        UpgradeBuilding c => Upgrade(c),
        SetGrowth c => ToggleGrowth(c),
        _ => CommandResult.Fail("Bilinmeyen komut."),
    };

    private CommandResult Move(MoveWorkers c)
    {
        if (c.Count <= 0) return CommandResult.Fail("Sayı en az 1 olmalı.");
        if (c.From == c.To) return CommandResult.Fail("Kaynak ve hedef meslek aynı.");
        if (_workers[c.From] < c.Count)
            return CommandResult.Fail($"{Jobs.Name(c.From)} olarak sadece {_workers[c.From]} kişi var.");
        if (Jobs.BuildingOf(c.To) is { } building && _workers[c.To] + c.Count > Capacity(building))
            return CommandResult.Fail($"{Jobs.Name(building)} dolu: kapasite {Capacity(building)}, şu an {_workers[c.To]} kişi.");
        _workers[c.From] -= c.Count;
        _workers[c.To] += c.Count;
        return CommandResult.Success;
    }

    private CommandResult Enqueue(QueueWeapon c)
    {
        if (FindUnit(c.UnitId) is not { } type) return CommandResult.Fail($"Bilinmeyen silah \"{c.UnitId}\".");
        if (c.Count <= 0) return CommandResult.Fail("Sayı en az 1 olmalı.");
        double iron = type.Cost.Iron * c.Count, wood = type.Cost.Wood * c.Count, food = type.Cost.Food * c.Count;
        if (!CanAfford(wood, iron, food))
            return CommandResult.Fail($"{c.Count} {type.Name} silahı için {wood:0} odun ve {iron:0} demir gerekiyor.");
        Pay(wood, iron, food);
        if (_queue.Count > 0 && _queue[^1].Type == type) _queue[^1].Remaining += c.Count;
        else _queue.Add(new WeaponOrder(type, c.Count));
        return CommandResult.Success;
    }

    private CommandResult Cancel(CancelWeapon c)
    {
        if (c.OrderIndex < 0 || c.OrderIndex >= _queue.Count) return CommandResult.Fail("Böyle bir sipariş yok.");
        var order = _queue[c.OrderIndex];
        Iron += order.Type.Cost.Iron * order.Remaining;
        Wood += order.Type.Cost.Wood * order.Remaining;
        Food += order.Type.Cost.Food * order.Remaining;
        _queue.RemoveAt(c.OrderIndex);
        return CommandResult.Success;
    }

    private CommandResult Arm(ArmWorkers c)
    {
        if (FindUnit(c.UnitId) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{c.UnitId}\".");
        if (c.Count <= 0) return CommandResult.Fail("Sayı en az 1 olmalı.");
        if (_weapons[type] < c.Count) return CommandResult.Fail($"Depoda sadece {_weapons[type]} {type.Name} silahı var.");
        if (_workers[c.From] < c.Count) return CommandResult.Fail($"{Jobs.Name(c.From)} olarak sadece {_workers[c.From]} kişi var.");
        _weapons[type] -= c.Count;
        _workers[c.From] -= c.Count;
        _soldiers[type] += c.Count;
        return CommandResult.Success;
    }

    private CommandResult Disarm(DisarmSoldiers c)
    {
        if (FindUnit(c.UnitId) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{c.UnitId}\".");
        if (c.Count <= 0) return CommandResult.Fail("Sayı en az 1 olmalı.");
        if (_soldiers[type] < c.Count) return CommandResult.Fail($"Sadece {_soldiers[type]} {type.Name} var.");
        _soldiers[type] -= c.Count;
        _weapons[type] += c.Count;
        _workers[Job.Idle] += c.Count;
        return CommandResult.Success;
    }

    private CommandResult Upgrade(UpgradeBuilding c)
    {
        var b = _buildings[c.Building];
        if (b.IsUpgrading) return CommandResult.Fail($"{Jobs.Name(b.Type)} zaten yükseltiliyor.");
        if (b.Level >= _rules.Economy.MaxBuildingLevel) return CommandResult.Fail($"{Jobs.Name(b.Type)} en üst seviyede.");
        var next = _rules.Economy.Level(b.Level + 1);
        if (!CanAfford(next.UpgradeWood, next.UpgradeIron, 0))
            return CommandResult.Fail($"Yükseltme için {next.UpgradeWood:0} odun ve {next.UpgradeIron:0} demir gerekiyor.");
        Pay(next.UpgradeWood, next.UpgradeIron, 0);
        if (next.UpgradeSeconds <= 0) b.Level++;
        else { b.UpgradeRemaining = next.UpgradeSeconds; b.UpgradeTotal = next.UpgradeSeconds; }
        return CommandResult.Success;
    }

    private CommandResult ToggleGrowth(SetGrowth c)
    {
        GrowthEnabled = c.Enabled;
        return CommandResult.Success;
    }

    // Resources accumulate in fractions each tick (e.g. 29.9999… after 30 s at 20/min), so allow a tiny tolerance.
    private const double CostTolerance = 1e-6;

    private bool CanAfford(double wood, double iron, double food) =>
        Wood + CostTolerance >= wood && Iron + CostTolerance >= iron && Food + CostTolerance >= food;

    private void Pay(double wood, double iron, double food)
    {
        Wood = Math.Max(0, Wood - wood);
        Iron = Math.Max(0, Iron - iron);
        Food = Math.Max(0, Food - food);
    }

    private UnitType? FindUnit(string id) =>
        _rules.Units.FirstOrDefault(u => string.Equals(u.Id, id, StringComparison.OrdinalIgnoreCase));
}
