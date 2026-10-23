using System.Globalization;
using Keepfall.GameCore.Units;

namespace Keepfall.GameCore.Combat;

/// <summary>
/// Resolves a field battle between two armies with fixed time steps.
///
/// Rules:
/// - Melee units always hit the frontmost enemies: the front row while it has living units, then the back row.
/// - Ranged units do the same by default. If the army picked a preferred unit type, they shoot that
///   type wherever it stands (back row included) while any of it is alive.
/// - Ranged units attack from either row. Melee units attack only from the front row; melee units
///   placed in the back are reserves and step forward when their own front row is gone.
/// - Melee units need ApproachTime seconds to reach the enemy at the start; ranged units shoot freely meanwhile.
/// - Damage = attacker damage × counter multiplier. All hits in a tick land simultaneously,
///   so neither side gets a first-strike advantage from processing order.
/// - A unit keeps its target until the target dies or becomes unreachable.
/// </summary>
public sealed class BattleSimulator
{
    private readonly GameRules _rules;

    public BattleSimulator(GameRules rules) => _rules = rules;

    public BattleResult Simulate(ArmySetup a, ArmySetup b, Random rng, bool recordLog = false)
    {
        var log = recordLog ? new List<string>() : null;
        var sides = new[] { Deploy(a, rng), Deploy(b, rng) };
        var setups = new[] { a, b };
        var combat = _rules.Combat;
        double dt = combat.TickSeconds;
        int maxTicks = (int)Math.Ceiling(combat.MaxBattleSeconds / dt);

        // Reused between attacks to avoid per-attack allocations.
        var candidates = new List<Soldier>();

        int tick = 0;
        bool timedOut = false;
        while (true)
        {
            int aliveA = CountAlive(sides[0]), aliveB = CountAlive(sides[1]);
            if (aliveA == 0 || aliveB == 0) break;
            if (tick >= maxTicks) { timedOut = true; break; }

            double now = tick * dt;
            for (int s = 0; s < 2; s++)
                AdvanceReserves(sides[s], log, now, setups[s].Name);

            for (int s = 0; s < 2; s++)
            {
                var enemies = sides[1 - s];
                var aim = new Aim(
                    HasAliveInRow(enemies, Row.Front) ? Row.Front : Row.Back,
                    setups[s].Targeting.PreferredType is { } p && HasAliveOfType(enemies, p) ? p : null);
                foreach (var soldier in sides[s])
                {
                    if (!soldier.Alive) continue;
                    soldier.Cooldown -= dt;
                    if (soldier.Cooldown > 1e-9) continue;

                    if (soldier.Type.Range == AttackRange.Melee && soldier.Row != Row.Front)
                    {
                        soldier.Cooldown = 0; // reserve: ready to strike as soon as it steps forward
                        continue;
                    }

                    var target = soldier.Target;
                    if (target is null || !IsValidTarget(soldier, target, aim))
                        target = soldier.Target = ChooseTarget(soldier, enemies, aim, candidates, rng);
                    if (target is null) { soldier.Cooldown = 0; continue; }

                    double damage = soldier.Type.Damage * _rules.Counters.Get(soldier.Type, target.Type);
                    target.PendingDamage += damage;
                    soldier.DamageDealt += damage;
                    soldier.Cooldown += soldier.Type.AttackInterval;
                }
            }

            for (int s = 0; s < 2; s++)
            {
                foreach (var soldier in sides[s])
                {
                    if (!soldier.Alive || soldier.PendingDamage == 0) continue;
                    soldier.DamageTaken += Math.Min(soldier.PendingDamage, soldier.Hp);
                    soldier.Hp -= soldier.PendingDamage;
                    soldier.PendingDamage = 0;
                    if (!soldier.Alive && log is not null)
                        log.Add(Fmt(now, $"{setups[s].Name}: {soldier.Type.Name} #{soldier.Number} düştü."));
                }
            }

            tick++;
        }

        int finalA = CountAlive(sides[0]), finalB = CountAlive(sides[1]);
        var outcome = timedOut || (finalA == 0 && finalB == 0) ? BattleOutcome.Draw
            : finalA > 0 ? BattleOutcome.SideAWins
            : BattleOutcome.SideBWins;
        double duration = tick * dt;
        log?.Add(Fmt(duration, outcome switch
        {
            BattleOutcome.SideAWins => $"{a.Name} kazandı ({finalA}/{a.TotalCount} hayatta).",
            BattleOutcome.SideBWins => $"{b.Name} kazandı ({finalB}/{b.TotalCount} hayatta).",
            _ => timedOut ? "Süre doldu: berabere." : "İki ordu da yok oldu: berabere.",
        }));

        return new BattleResult(outcome, duration, timedOut,
            Report(a, sides[0]), Report(b, sides[1]), (IReadOnlyList<string>?)log ?? []);
    }

    private List<Soldier> Deploy(ArmySetup setup, Random rng)
    {
        var soldiers = new List<Soldier>(setup.TotalCount);
        foreach (var (type, count) in setup.Counts.OrderBy(kv => kv.Key.Index))
        {
            for (int i = 0; i < count; i++)
            {
                double firstAttack = _rules.Combat.RandomizeFirstAttack ? rng.NextDouble() * type.AttackInterval : 0;
                if (type.Range == AttackRange.Melee) firstAttack += _rules.Combat.ApproachTime;
                soldiers.Add(new Soldier(type, i + 1, setup.RowOf(type)) { Cooldown = firstAttack });
            }
        }
        return soldiers;
    }

    private static void AdvanceReserves(List<Soldier> army, List<string>? log, double now, string name)
    {
        if (HasAliveInRow(army, Row.Front)) return;
        int moved = 0;
        foreach (var soldier in army)
        {
            if (soldier.Alive && soldier.Row == Row.Back && soldier.Type.Range == AttackRange.Melee)
            {
                soldier.Row = Row.Front;
                moved++;
            }
        }
        if (moved > 0) log?.Add(Fmt(now, $"{name}: {moved} yedek birlik ön sıraya geçti."));
    }

    /// <summary>What one side may hit this tick: the frontmost enemy row, and the preferred type if any is alive.</summary>
    private readonly record struct Aim(Row FrontmostRow, UnitType? PreferredAlive);

    private static bool IsValidTarget(Soldier attacker, Soldier target, Aim aim)
    {
        if (!target.Alive) return false;
        if (attacker.Type.Range == AttackRange.Ranged && aim.PreferredAlive is { } preferred)
            return target.Type == preferred;
        return target.Row == aim.FrontmostRow;
    }

    /// <summary>A random valid target; several soldiers usually qualify, e.g. the whole front row.</summary>
    private static Soldier? ChooseTarget(Soldier attacker, List<Soldier> enemies, Aim aim, List<Soldier> candidates, Random rng)
    {
        candidates.Clear();
        foreach (var e in enemies)
            if (IsValidTarget(attacker, e, aim)) candidates.Add(e);
        return candidates.Count == 0 ? null : candidates[rng.Next(candidates.Count)];
    }

    private static bool HasAliveOfType(List<Soldier> army, UnitType type)
    {
        foreach (var s in army)
            if (s.Alive && s.Type == type) return true;
        return false;
    }

    private static bool HasAliveInRow(List<Soldier> army, Row row)
    {
        foreach (var s in army)
            if (s.Alive && s.Row == row) return true;
        return false;
    }

    private static int CountAlive(List<Soldier> army)
    {
        int n = 0;
        foreach (var s in army) if (s.Alive) n++;
        return n;
    }

    private static SideReport Report(ArmySetup setup, List<Soldier> soldiers) =>
        new(setup.Name, soldiers
            .GroupBy(s => s.Type)
            .OrderBy(g => g.Key.Index)
            .Select(g => new UnitTypeStats(g.Key, g.Count(), g.Count(s => s.Alive),
                g.Sum(s => s.DamageDealt), g.Sum(s => s.DamageTaken)))
            .ToList());

    private static string Fmt(double t, string message) =>
        string.Create(CultureInfo.InvariantCulture, $"[{t,6:0.0}s] {message}");

    private sealed class Soldier(UnitType type, int number, Row row)
    {
        public UnitType Type { get; } = type;
        public int Number { get; } = number;
        public Row Row { get; set; } = row;
        public double Hp { get; set; } = type.Hp;
        public double Cooldown { get; set; }
        public double PendingDamage { get; set; }
        public Soldier? Target { get; set; }
        public double DamageDealt { get; set; }
        public double DamageTaken { get; set; }
        public bool Alive => Hp > 1e-9;
    }
}
