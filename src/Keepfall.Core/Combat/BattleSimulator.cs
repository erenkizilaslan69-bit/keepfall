using System.Globalization;
using Keepfall.Core.Units;

namespace Keepfall.Core.Combat;

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

    /// <param name="recordLog">A readable, line-by-line log (BattleSim).</param>
    /// <param name="recordBattle">A <see cref="BattleRecord"/> of every hit, death and advance, for replaying the battle.</param>
    public BattleResult Simulate(ArmySetup a, ArmySetup b, Random rng, bool recordLog = false, bool recordBattle = false)
    {
        var log = recordLog ? new List<string>() : null;
        var sides = new[] { Deploy(a, rng, 0, 0), Deploy(b, rng, 1, a.TotalCount) };
        var record = recordBattle
            ? new BattleRecord(sides.SelectMany(s => s).Select(s => new RecordedSoldier(s.Index, s.Side, s.Type, s.Row)).ToList(),
                _rules.Combat.TickSeconds)
            : null;
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
            // A side that can no longer hurt anybody (only healers left) is finished: what is left of it is gone.
            bool dealA = HasDamageDealer(sides[0]), dealB = HasDamageDealer(sides[1]);
            if (!dealA || !dealB)
            {
                for (int side = 0; side < 2; side++)
                    if (!(side == 0 ? dealA : dealB))
                        foreach (var gone in sides[side]) if (gone.Alive) { gone.Hp = 0; record?.Death(tick, gone.Index); }
                break;
            }
            if (tick >= maxTicks) { timedOut = true; break; }

            double now = tick * dt;
            for (int s = 0; s < 2; s++)
                AdvanceReserves(sides[s], log, record, tick, now, setups[s].Name);

            for (int s = 0; s < 2; s++)
            {
                var enemies = sides[1 - s];
                var aim = new Aim(
                    HasAliveInRow(enemies, Row.Front) ? Row.Front : Row.Back,
                    setups[s].Targeting.PreferredType is { } p && HasAliveOfType(enemies, p) ? p : null,
                    HasAliveInRow(enemies, Row.Back), HasAliveSupportInBack(enemies));
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

                    if (soldier.Type.Heal > 0)
                    {
                        var patient = soldier.HealLeft > 0 ? MostWounded(sides[s], soldier) : null;
                        if (patient is null) { soldier.Cooldown = 0; continue; }
                        if (soldier.Type.HealBudget > 0) soldier.HealLeft -= soldier.Type.Heal;
                        patient.PendingHeal += soldier.Type.Heal;
                        record?.Heal(tick, soldier.Index, patient.Index);
                        soldier.Cooldown += soldier.Type.HealInterval;
                        continue;
                    }
                    if (!soldier.Type.Hurts) { soldier.Cooldown = 0; continue; }

                    var target = soldier.Target;
                    if (target is null || !IsValidTarget(soldier, target, aim))
                        target = soldier.Target = ChooseTarget(soldier, enemies, aim, candidates, rng);
                    if (target is null) { soldier.Cooldown = 0; continue; }

                    double damage = soldier.Type.Damage * _rules.Counters.Get(soldier.Type, target.Type)
                        * (soldier.Type.Range == AttackRange.Ranged ? setups[s].RangedDamageFactor : 1);
                    target.PendingDamage += damage;
                    soldier.DamageDealt += damage;
                    record?.Hit(tick, soldier.Index, target.Index);
                    soldier.Cooldown += soldier.Type.AttackInterval;

                    // Area damage: a few more of the same kind of target take a share.
                    if (soldier.Type.SplashTargets > 0)
                    {
                        candidates.Clear();
                        foreach (var e in enemies) if (e != target && IsValidTarget(soldier, e, aim)) candidates.Add(e);
                        for (int n = 0; n < soldier.Type.SplashTargets && candidates.Count > 0; n++)
                        {
                            int pick = rng.Next(candidates.Count);
                            var extra = candidates[pick];
                            candidates.RemoveAt(pick);
                            double part = soldier.Type.Damage * soldier.Type.SplashFactor * _rules.Counters.Get(soldier.Type, extra.Type);
                            extra.PendingDamage += part;
                            soldier.DamageDealt += part;
                            record?.Hit(tick, soldier.Index, extra.Index);
                        }
                    }
                }
            }

            for (int s = 0; s < 2; s++)
            {
                foreach (var soldier in sides[s])
                {
                    if (soldier.Alive && soldier.PendingHeal > 0) soldier.Hp = Math.Min(soldier.Type.Hp, soldier.Hp + soldier.PendingHeal);
                    soldier.PendingHeal = 0;
                    if (!soldier.Alive || soldier.PendingDamage == 0) continue;
                    soldier.DamageTaken += Math.Min(soldier.PendingDamage, soldier.Hp);
                    soldier.Hp -= soldier.PendingDamage;
                    soldier.PendingDamage = 0;
                    if (soldier.Alive) continue;
                    record?.Death(tick, soldier.Index);
                    log?.Add(Fmt(now, $"{setups[s].Name}: {soldier.Type.Name} #{soldier.Number} düştü."));
                }
            }

            tick++;
        }

        int finalA = CountAlive(sides[0]), finalB = CountAlive(sides[1]);
        var outcome = timedOut || (finalA == 0 && finalB == 0) ? BattleOutcome.Draw
            : finalA > 0 ? BattleOutcome.SideAWins
            : BattleOutcome.SideBWins;
        double duration = tick * dt;
        if (record is not null) record.Ticks = tick;
        log?.Add(Fmt(duration, outcome switch
        {
            BattleOutcome.SideAWins => $"{a.Name} kazandı ({finalA}/{a.TotalCount} hayatta).",
            BattleOutcome.SideBWins => $"{b.Name} kazandı ({finalB}/{b.TotalCount} hayatta).",
            _ => timedOut ? "Süre doldu: berabere." : "İki ordu da yok oldu: berabere.",
        }));

        return new BattleResult(outcome, duration, timedOut,
            Report(a, sides[0]), Report(b, sides[1]), (IReadOnlyList<string>?)log ?? [], record);
    }

    /// <param name="firstIndex">Index of this side's first soldier in the battle record (side A first).</param>
    private List<Soldier> Deploy(ArmySetup setup, Random rng, int side, int firstIndex)
    {
        var soldiers = new List<Soldier>(setup.TotalCount);
        foreach (var (type, count) in setup.Counts.OrderBy(kv => kv.Key.Index))
        {
            for (int i = 0; i < count; i++)
            {
                double firstAttack = _rules.Combat.RandomizeFirstAttack ? rng.NextDouble() * type.AttackInterval : 0;
                if (type.Range == AttackRange.Melee) firstAttack += _rules.Combat.ApproachTime;
                soldiers.Add(new Soldier(type, i + 1, setup.RowOf(type), side, firstIndex + soldiers.Count) { Cooldown = firstAttack });
            }
        }
        return soldiers;
    }

    private static void AdvanceReserves(List<Soldier> army, List<string>? log, BattleRecord? record, int tick, double now, string name)
    {
        if (HasAliveInRow(army, Row.Front)) return;
        int moved = 0;
        foreach (var soldier in army)
        {
            if (soldier.Alive && soldier.Row == Row.Back && soldier.Type.Range == AttackRange.Melee)
            {
                soldier.Row = Row.Front;
                record?.Advance(tick, soldier.Index);
                moved++;
            }
        }
        if (moved > 0) log?.Add(Fmt(now, $"{name}: {moved} yedek birlik ön sıraya geçti."));
    }

    /// <summary>What one side may hit this tick: the frontmost enemy row, and the preferred type if any is alive.</summary>
    private readonly record struct Aim(Row FrontmostRow, UnitType? PreferredAlive, bool BackAlive, bool SupportAlive);

    private static bool IsValidTarget(Soldier attacker, Soldier target, Aim aim)
    {
        if (!target.Alive) return false;
        // Siege engines always go for the back row; flanking riders for shooters and healers there, while any are alive.
        if (attacker.Type.BackFirst) return target.Row == (aim.BackAlive ? Row.Back : Row.Front);
        if (attacker.Type.Flank && aim.SupportAlive) return target.Row == Row.Back && target.Type.IsSupport;
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

    private static bool HasDamageDealer(List<Soldier> army)
    {
        foreach (var s in army) if (s.Alive && s.Type.Hurts) return true;
        return false;
    }

    private static bool HasAliveSupportInBack(List<Soldier> army)
    {
        foreach (var s in army) if (s.Alive && s.Row == Row.Back && s.Type.IsSupport) return true;
        return false;
    }

    /// <summary>The wounded ally with the lowest share of hit points left (never the healer itself).</summary>
    private static Soldier? MostWounded(List<Soldier> army, Soldier healer)
    {
        Soldier? best = null; double bestShare = 1;
        foreach (var s in army)
        {
            if (!s.Alive || s == healer) continue;
            double share = s.Hp / s.Type.Hp;
            if (share < bestShare - 1e-9) { bestShare = share; best = s; }
        }
        return best;
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

    private sealed class Soldier(UnitType type, int number, Row row, int side, int index)
    {
        public UnitType Type { get; } = type;
        public int Number { get; } = number;
        public int Side { get; } = side;
        public int Index { get; } = index;
        public Row Row { get; set; } = row;
        public double Hp { get; set; } = type.Hp;
        public double Cooldown { get; set; }
        public double PendingDamage { get; set; }
        public double PendingHeal { get; set; }
        /// <summary>What a healer may still restore this battle (unlimited when the unit has no budget).</summary>
        public double HealLeft { get; set; } = type.HealBudget > 0 ? type.HealBudget : double.PositiveInfinity;
        public Soldier? Target { get; set; }
        public double DamageDealt { get; set; }
        public double DamageTaken { get; set; }
        public bool Alive => Hp > 1e-9;
    }
}
