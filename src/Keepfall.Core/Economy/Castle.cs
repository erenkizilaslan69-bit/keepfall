using Keepfall.Core.Combat;
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
    public double GoldGained { get; internal set; }
    public double GoldSpent { get; internal set; }
    public int MercenariesHired { get; internal set; }
    public int PeakPopulation { get; internal set; }
    public double StarvingSeconds { get; internal set; }
    public double IdleWorkerSeconds { get; internal set; }
    // War
    public int AttacksLaunched { get; internal set; }
    public int SoldiersLost { get; internal set; }
    public int EnemiesKilled { get; internal set; }
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
    /// <summary>Soldiers of each type that were hired for gold (wherever they are now): they cannot be turned back into workers.</summary>
    private readonly Dictionary<UnitType, int> _mercenaries = [];
    /// <summary>Soldiers of each type that are away with an army.</summary>
    private readonly Dictionary<UnitType, int> _away = [];
    private readonly List<WeaponOrder> _queue = [];
    private readonly Dictionary<UnitType, Row> _defenseRows = [];

    public Castle(GameRules rules)
    {
        _rules = rules;
        var m = rules.Match;
        _workers[Job.Idle] = m.StartingPopulation;
        Food = m.StartingFood;
        Wood = m.StartingWood;
        Iron = m.StartingIron;
        foreach (var u in rules.Units) { _weapons[u] = 0; _soldiers[u] = 0; _mercenaries[u] = 0; _away[u] = 0; }
        Stats.PeakPopulation = Population;
    }

    public double Food { get; private set; }
    public double Wood { get; private set; }
    public double Iron { get; private set; }
    /// <summary>Gold from the forest (chests, villages, bandit camps); spent on mercenaries.</summary>
    public double Gold { get; private set; }
    public bool GrowthEnabled { get; private set; } = true;
    /// <summary>True when the last tick ended with no food; production runs at the starvation multiplier.</summary>
    public bool Starving { get; private set; }
    public CastleStats Stats { get; } = new();

    /// <summary>Food production factor set by the match (famine late in the war); 1 otherwise.</summary>
    public double FoodFactor { get; internal set; } = 1;
    /// <summary>Soldiers marching with an army: they count and eat like soldiers, but do not defend.</summary>
    public int SoldiersAway { get; private set; }
    /// <summary>Soldiers down at the gate in a battle: they cannot be sent or disarmed until it is over.</summary>
    public int SoldiersDefending { get; private set; }
    /// <summary>How the soldiers at home line up when attacked: row per type, archers' preferred target.</summary>
    public IReadOnlyDictionary<UnitType, Row> DefenseRows => _defenseRows;
    public UnitType? DefensePriority { get; private set; }

    public IReadOnlyDictionary<Job, int> Workers => _workers;
    public IReadOnlyDictionary<UnitType, int> Weapons => _weapons;
    public IReadOnlyDictionary<UnitType, int> Soldiers => _soldiers;
    /// <summary>Hired soldiers per type (alive, at home or away).</summary>
    public IReadOnlyDictionary<UnitType, int> Mercenaries => _mercenaries;
    /// <summary>How many soldiers of this type could still be disarmed: the hired ones never can.</summary>
    public int Disarmable(UnitType type) => Math.Max(0, _soldiers[type] - _mercenaries[type]);
    public double MercenaryPrice(UnitType type) => _rules.MercenaryPrices.GetValueOrDefault(type.Id);
    public IReadOnlyList<WeaponOrder> Queue => _queue;
    public IReadOnlyList<UnitType> UnitTypes => _rules.Units;
    public EconomyRules Economy => _rules.Economy;

    public int WorkerCount => _workers.Values.Sum();
    public int SoldierCount => _soldiers.Values.Sum();
    /// <summary>People away on scout missions: they count and eat, but do not work.</summary>
    public int ScoutsAway { get; private set; }
    /// <summary>People being armed (match.armSeconds): out of their jobs, not soldiers yet.</summary>
    public int Arming => _arming.Sum((a) => a.Count);
    public int ArmingOf(UnitType type) => _arming.Where((a) => a.Type == type).Sum((a) => a.Count);
    private readonly List<(UnitType Type, int Count, double Left)> _arming = [];
    public int Population => WorkerCount + ScoutsAway + Arming + SoldierCount + SoldiersAway + SoldiersDefending;
    public double NextPersonCost => _rules.Economy.NewPersonCost(Population);

    public Building Building(BuildingType type) => _buildings[type];
    public int Capacity(BuildingType type) => _rules.Economy.Level(_buildings[type].Level).Capacity;
    public double Multiplier(BuildingType type) => _rules.Economy.Level(_buildings[type].Level).Multiplier;
    public double ProductionMultiplier => Starving ? _rules.Economy.StarvationMultiplier : 1;

    /// <summary>Gathering rate of one resource per minute, at the current workers, levels and starvation.</summary>
    public double ProductionPerMinute(Resource resource)
    {
        var job = Jobs.Working.First(j => Jobs.ProductOf(j) == resource);
        double factor = resource == Resource.Food ? FoodFactor : 1;
        return _workers[job] * PerPersonPerMinute(resource) * Multiplier(Jobs.BuildingOf(job)!.Value) * ProductionMultiplier * factor;
    }

    /// <summary>
    /// What the next level of a building adds with the workers it has now, ignoring starvation:
    /// resource per minute for gathering buildings, forge speed for the forge. Null at max level.
    /// </summary>
    public double? UpgradeGain(BuildingType type)
    {
        var level = _buildings[type].Level;
        if (level >= _rules.Economy.MaxBuildingLevel) return null;
        double extra = _rules.Economy.Level(level + 1).Multiplier - _rules.Economy.Level(level).Multiplier;
        var job = Jobs.WorkerOf(type);
        double perPerson = Jobs.ProductOf(job) is { } resource ? PerPersonPerMinute(resource) : 1;
        return _workers[job] * perPerson * extra;
    }

    private double PerPersonPerMinute(Resource resource) => resource switch
    {
        Resource.Food => _rules.Production.FoodPerMinute,
        Resource.Wood => _rules.Production.WoodPerMinute,
        _ => _rules.Production.IronPerMinute,
    };

    /// <summary>Food automatic growth leaves untouched: GrowthReserveSeconds of the current consumption.</summary>
    public double GrowthReserve => FoodConsumptionPerMinute * _rules.Economy.GrowthReserveSeconds / 60;

    /// <summary>Food needed before the next person is born: their cost plus the reserve.</summary>
    public double GrowthThreshold => NextPersonCost + GrowthReserve;

    public double FoodConsumptionPerMinute =>
        (WorkerCount + ScoutsAway + Arming) * _rules.Economy.WorkerFoodPerMinute
        + (SoldierCount + SoldiersAway + SoldiersDefending) * _rules.Economy.SoldierFoodPerMinute;

    /// <summary>Sends one person from <paramref name="from"/> out as a scout (see <see cref="Match.GameState"/>).</summary>
    internal CommandResult SendScout(Job from)
    {
        if (_workers[from] < 1) return CommandResult.Fail($"{Jobs.Name(from)} olarak kimse yok.");
        _workers[from]--;
        ScoutsAway++;
        return CommandResult.Success;
    }

    /// <summary>A scout is back home and idle.</summary>
    internal void ReturnScout()
    {
        if (ScoutsAway == 0) return;
        ScoutsAway--;
        _workers[Job.Idle]++;
    }

    // ---- war (called by GameState) -------------------------------------------------------------

    /// <summary>Soldiers leave home with an army.</summary>
    internal CommandResult DispatchArmy(IReadOnlyDictionary<UnitType, int> units)
    {
        if (units.Values.Sum() <= 0) return CommandResult.Fail("En az bir asker seçmelisin.");
        foreach (var (type, n) in units)
        {
            if (n < 0) return CommandResult.Fail("Asker sayısı negatif olamaz.");
            if (_soldiers[type] < n) return CommandResult.Fail($"Kalede sadece {_soldiers[type]} {type.Name} var.");
        }
        foreach (var (type, n) in units) { _soldiers[type] -= n; _away[type] += n; }
        SoldiersAway += units.Values.Sum();
        Stats.AttacksLaunched++;
        return CommandResult.Success;
    }

    /// <summary>Soldiers of a marching army died (or disbanded): they stop eating.</summary>
    internal void ArmyLost(IReadOnlyDictionary<UnitType, int> lost)
    {
        int count = lost.Values.Sum();
        SoldiersAway = Math.Max(0, SoldiersAway - count);
        Stats.SoldiersLost += count;
        foreach (var (type, n) in lost)
        {
            if (n <= 0) continue;
            Fell(type, n, _soldiers[type] + _away[type]);
            _away[type] = Math.Max(0, _away[type] - n);
        }
    }

    /// <summary>A returning army is home: its soldiers can defend again.</summary>
    internal void ArmyReturned(IReadOnlyDictionary<UnitType, int> survivors)
    {
        foreach (var (type, n) in survivors) { _soldiers[type] += n; _away[type] = Math.Max(0, _away[type] - n); }
        SoldiersAway = Math.Max(0, SoldiersAway - survivors.Values.Sum());
    }

    /// <summary>Casualties are taken from hired and regular soldiers in proportion (nobody can tell them apart in a battle).</summary>
    private void Fell(UnitType type, int lost, int totalBefore)
    {
        if (_mercenaries[type] == 0 || totalBefore <= 0) return;
        int hired = (int)Math.Round(lost * (double)_mercenaries[type] / totalBefore, MidpointRounding.AwayFromZero);
        _mercenaries[type] = Math.Max(0, _mercenaries[type] - Math.Min(hired, _mercenaries[type]));
        // Never more hired soldiers than soldiers.
        _mercenaries[type] = Math.Min(_mercenaries[type], Math.Max(0, totalBefore - lost));
    }

    /// <summary>The soldiers at home go down to the gate to fight; they are out of reach until the battle is over.</summary>
    internal void CommitDefenders(IReadOnlyDictionary<UnitType, int> defenders)
    {
        foreach (var (type, n) in defenders) _soldiers[type] -= n;
        SoldiersDefending += defenders.Values.Sum();
    }

    /// <summary>The battle at the gate is over: the survivors are home again, the fallen are gone.</summary>
    internal void DefendersBack(IReadOnlyDictionary<UnitType, int> survivors, IReadOnlyDictionary<UnitType, int> lost)
    {
        int fallen = lost.Values.Sum();
        foreach (var (type, n) in survivors) _soldiers[type] += n;
        SoldiersDefending = Math.Max(0, SoldiersDefending - survivors.Values.Sum() - fallen);
        Stats.SoldiersLost += fallen;
        foreach (var (type, n) in lost)
            if (n > 0) Fell(type, n, _soldiers[type] + n + _away[type]);
    }

    /// <summary>Takes goods out of the stores for an envoy; false (and nothing taken) when the castle does not have them.</summary>
    internal bool TrySpendCargo(int food, int wood, int iron, int gold)
    {
        if (Food + 1e-9 < food || Wood + 1e-9 < wood || Iron + 1e-9 < iron || Gold + 1e-9 < gold) return false;
        Food = Math.Max(0, Food - food);
        Wood = Math.Max(0, Wood - wood);
        Iron = Math.Max(0, Iron - iron);
        Gold = Math.Max(0, Gold - gold);
        return true;
    }

    /// <summary>Loot arrives: gold is added to the treasury.</summary>
    internal void AddGold(double amount)
    {
        if (amount <= 0) return;
        Gold += amount;
        Stats.GoldGained += amount;
    }

    /// <summary>Loot arrives: food, wood and iron go to the stores (the loot is not produced, so it is no output).</summary>
    internal void AddGoods(double food, double wood, double iron)
    {
        if (food > 0) Food += food;
        if (wood > 0) Wood += wood;
        if (iron > 0) Iron += iron;
    }

    /// <summary>
    /// The castle has fallen: its conqueror takes this share of the stores and the gold, and this share of the
    /// workers (idle ones first). Whole units only; what is taken is gone from here.
    /// </summary>
    internal (int Food, int Wood, int Iron, int Gold, int Workers) Plunder(double lootShare, double workerShare)
    {
        int food = (int)Math.Floor(Food * lootShare), wood = (int)Math.Floor(Wood * lootShare);
        int iron = (int)Math.Floor(Iron * lootShare), gold = (int)Math.Floor(Gold * lootShare);
        Food -= food; Wood -= wood; Iron -= iron; Gold -= gold;
        int workers = (int)Math.Floor(WorkerCount * workerShare), left = workers;
        foreach (var job in Jobs.All.OrderBy(j => j == Job.Idle ? 0 : 1))
        {
            int take = Math.Min(left, _workers[job]);
            _workers[job] -= take;
            left -= take;
        }
        return (food, wood, iron, gold, workers);
    }

    /// <summary>Loot or a reward: ready weapons go to the stockpile.</summary>
    internal void AddWeapons(UnitType type, int count)
    {
        if (count > 0) _weapons[type] += count;
    }

    /// <summary>Loot: people who join the castle as idle workers.</summary>
    internal void AddPeople(int count)
    {
        if (count > 0) _workers[Job.Idle] += count;
        Stats.PeakPopulation = Math.Max(Stats.PeakPopulation, Population);
    }

    /// <summary>Setup helper for tests and dev tools: soldiers appear at home (as extra people).</summary>
    internal void AddSoldiers(UnitType type, int count) => _soldiers[type] += count;

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

        for (int i = _arming.Count - 1; i >= 0; i--)
        {
            var (type, count, left) = _arming[i];
            left -= dt;
            if (left > 1e-9) { _arming[i] = (type, count, left); continue; }
            _soldiers[type] += count;
            _arming.RemoveAt(i);
        }

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
        SetDefense c => SetDefense_(c),
        HireMercenary c => Hire(c),
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
        if (_rules.Match.ArmSeconds > 0) _arming.Add((type, c.Count, _rules.Match.ArmSeconds));
        else _soldiers[type] += c.Count;
        return CommandResult.Success;
    }

    private CommandResult Disarm(DisarmSoldiers c)
    {
        if (FindUnit(c.UnitId) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{c.UnitId}\".");
        if (c.Count <= 0) return CommandResult.Fail("Sayı en az 1 olmalı.");
        if (_soldiers[type] < c.Count) return CommandResult.Fail($"Sadece {_soldiers[type]} {type.Name} var.");
        if (Disarmable(type) < c.Count)
            return CommandResult.Fail($"{type.Name} askerlerinin {_mercenaries[type]} tanesi paralı asker; işçiye dönemez (en fazla {Disarmable(type)}).");
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

    private CommandResult SetDefense_(SetDefense c)
    {
        var rows = new Dictionary<UnitType, Row>();
        foreach (var (id, row) in c.Rows ?? new Dictionary<string, Row>())
        {
            if (FindUnit(id) is not { } type) return CommandResult.Fail($"Bilinmeyen birlik \"{id}\".");
            rows[type] = row;
        }
        UnitType? priority = null;
        if (!string.IsNullOrEmpty(c.ArcherPriority) && (priority = FindUnit(c.ArcherPriority)) is null)
            return CommandResult.Fail($"Bilinmeyen birlik \"{c.ArcherPriority}\".");
        _defenseRows.Clear();
        foreach (var (type, row) in rows) _defenseRows[type] = row;
        DefensePriority = priority;
        return CommandResult.Success;
    }

    /// <summary>Hire soldiers for gold: they appear at home at once, extra to the workers, and eat like soldiers.</summary>
    private CommandResult Hire(HireMercenary c)
    {
        if (FindUnit(c.UnitId) is not { } type) return CommandResult.Fail($"Bilinmeyen birim \"{c.UnitId}\".");
        if (c.Count <= 0) return CommandResult.Fail("Sayı en az 1 olmalı.");
        var price = MercenaryPrice(type);
        if (price <= 0) return CommandResult.Fail($"{type.Name} kiralanamaz.");
        double cost = price * c.Count;
        if (Gold + CostTolerance < cost) return CommandResult.Fail($"{c.Count} {type.Name} için {cost:0} altın gerekiyor (kasada {Gold:0}).");
        Gold = Math.Max(0, Gold - cost);
        Stats.GoldSpent += cost;
        Stats.MercenariesHired += c.Count;
        _soldiers[type] += c.Count;
        _mercenaries[type] += c.Count;
        Stats.PeakPopulation = Math.Max(Stats.PeakPopulation, Population);
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
