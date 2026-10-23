using System.Globalization;
using Keepfall.GameCore.Units;

namespace Keepfall.GameCore.Combat;

/// <summary>
/// Resolves a field battle between two armies with fixed time steps.
///
/// Rules:
/// - Ranged units can hit any enemy, in either row. Melee units can only hit the enemy front row
///   while it has living units; the back row is open to them once it falls.
/// - Ranged units attack from either row. Melee units attack only from the front row; melee units
///   placed in the back are reserves and step forward when their own front row is gone.
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
                bool enemyFrontStanding = HasAliveInRow(enemies, Row.Front);
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
                    if (target is null || !target.Alive || !CanReach(soldier, target, enemyFrontStanding))
                        target = soldier.Target = ChooseTarget(soldier, enemies, enemyFrontStanding, setups[s].Targeting, candidates, rng);
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
                soldiers.Add(new Soldier(type, i + 1, setup.RowOf(type))
                {
                    Cooldown = _rules.Combat.RandomizeFirstAttack ? rng.NextDouble() * type.AttackInterval : 0,
                });
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

    private static bool CanReach(Soldier attacker, Soldier target, bool enemyFrontStanding) =>
        attacker.Type.Range == AttackRange.Ranged || target.Row == Row.Front || !enemyFrontStanding;

    private Soldier? ChooseTarget(Soldier attacker, List<Soldier> enemies, bool enemyFrontStanding, TargetPriority priority,
        List<Soldier> candidates, Random rng)
    {
        candidates.Clear();
        foreach (var e in enemies)
            if (e.Alive && CanReach(attacker, e, enemyFrontStanding)) candidates.Add(e);
        if (candidates.Count == 0) return null;

        switch (priority.Kind)
        {
            case TargetPriorityKind.Weakest:
                KeepBest(candidates, e => -e.Hp);
                break;
            case TargetPriorityKind.Counter:
                KeepBest(candidates, e => _rules.Counters.Get(attacker.Type, e.Type));
                break;
            case TargetPriorityKind.PreferType:
                if (candidates.Exists(e => e.Type == priority.PreferredType))
                    candidates.RemoveAll(e => e.Type != priority.PreferredType);
                break;
        }
        return candidates[rng.Next(candidates.Count)];
    }

    /// <summary>Keeps only the candidates with the highest score (ties are broken randomly by the caller).</summary>
    private static void KeepBest(List<Soldier> candidates, Func<Soldier, double> score)
    {
        double best = double.NegativeInfinity;
        foreach (var c in candidates) best = Math.Max(best, score(c));
        candidates.RemoveAll(c => score(c) < best - 1e-9);
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
