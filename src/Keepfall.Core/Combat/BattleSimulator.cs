using System.Globalization;
using Keepfall.Core.Units;

namespace Keepfall.Core.Combat;

/// <summary>
/// Resolves a field battle between two armies with fixed time steps.
///
/// Rules:
/// - Melee units always hit the frontmost enemies: the first row that still has living units (rows run 1 to 4, front to back, one unit type per row).
/// - Ranged units do the same by default. If the army picked a preferred unit type, they shoot that
///   type wherever it stands (back row included) while any of it is alive.
/// - Ranged units attack from any row. Melee units attack only from their army's frontmost row that still lives; melee units
///   further back are reserves and step forward when the rows before them are gone.
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
        var m = SimulateMulti([a, b], rng, null, recordLog, recordBattle);
        var outcome = m.WinnerSide switch { 0 => BattleOutcome.SideAWins, 1 => BattleOutcome.SideBWins, _ => BattleOutcome.Draw };
        return new BattleResult(outcome, m.DurationSeconds, m.TimedOut, m.Sides[0], m.Sides[1], m.Log, m.Record);
    }

    /// <summary>
    /// A battle of any number of sides at once (a siege with two attackers: the defender is side 1, the attackers 0, 2, ...).
    /// Everything is decided by the random generator and the events, so the same seed and events always tell the same story, and
    /// a battle can be told again from the start with one more event (a side that joins at a tick, a side that changes its foe):
    /// what came before that tick comes out exactly as before. With two sides and no events it is the classic duel, draw for draw.
    /// </summary>
    public MultiResult SimulateMulti(IReadOnlyList<ArmySetup> initial, Random rng, IReadOnlyList<SimEvent>? events = null,
        bool recordLog = false, bool recordBattle = false)
    {
        var log = recordLog ? new List<string>() : null;
        var setups = initial.ToList();
        var sides = new List<List<Soldier>>();
        int total = 0;
        foreach (var setup in setups) { sides.Add(Deploy(setup, rng, sides.Count, total)); total += setup.TotalCount; }
        var record = recordBattle
            ? new BattleRecord(sides.SelectMany(s => s).Select(s => new RecordedSoldier(s.Index, s.Side, s.Type, s.Row)).ToList(),
                _rules.Combat.TickSeconds)
            : null;
        var pending = (events ?? []).OrderBy(e => e.Tick).ToList();
        int nextEvent = 0;
        var combat = _rules.Combat;
        var lastFront = sides.Select(FrontRow).ToList();
        var focus = setups.Select(s => s.Foe).ToList();
        var kills = new List<int>(new int[sides.Count]);
        double dt = combat.TickSeconds;
        int maxTicks = (int)Math.Ceiling(combat.MaxBattleSeconds / dt);

        // Reused between attacks to avoid per-attack allocations.
        var candidates = new List<Soldier>();
        var order = new List<int>();

        int tick = 0;
        bool timedOut = false;
        while (true)
        {
            while (nextEvent < pending.Count && pending[nextEvent].Tick <= tick)
            {
                switch (pending[nextEvent++])
                {
                    case JoinEvent join:
                        sides.Add(Deploy(join.Setup, rng, sides.Count, total));
                        total += join.Setup.TotalCount;
                        setups.Add(join.Setup);
                        lastFront.Add(FrontRow(sides[^1]));
                        focus.Add(join.Setup.Foe);
                        kills.Add(0);
                        record?.AddSoldiers(sides[^1].Select(s => new RecordedSoldier(s.Index, s.Side, s.Type, s.Row)));
                        break;
                    case FocusEvent f when f.Side >= 0 && f.Side < sides.Count:
                        focus[f.Side] = f.Foe;
                        break;
                }
            }

            int n = sides.Count;
            var alive = new int[n];
            for (int s = 0; s < n; s++) alive[s] = CountAlive(sides[s]);
            if (alive.Count(x => x > 0) <= 1) break;
            // A side that can no longer hurt anybody (only healers left) is finished: what is left of it is gone.
            bool anyGone = false;
            for (int s = 0; s < n; s++)
            {
                if (alive[s] == 0 || HasDamageDealer(sides[s])) continue;
                foreach (var gone in sides[s]) if (gone.Alive) { gone.Hp = 0; record?.Death(tick, gone.Index); }
                anyGone = true;
            }
            if (anyGone) continue;
            if (tick >= maxTicks) { timedOut = true; break; }

            double now = tick * dt;
            for (int s = 0; s < n; s++)
                lastFront[s] = AdvanceReserves(sides[s], lastFront[s], log, record, tick, now, setups[s].Name);

            var aims = new Aim[n];
            for (int s = 0; s < n; s++)
            {
                for (int e = 0; e < n; e++)
                {
                    if (e == s || alive[e] == 0) continue;
                    var enemies = sides[e];
                    var enemyFront = FrontRow(enemies);
                    aims[e] = new Aim(
                        enemyFront,
                        setups[s].Targeting.PreferredType is { } p && HasAliveOfType(enemies, p) ? p : null,
                        RearRow(enemies), HasAliveSupportBehind(enemies, enemyFront),
                        _rules.Combat.RangedReachRows > 1 ? ActiveLimit(enemies, _rules.Combat.RangedReachRows) : enemyFront);
                }
                var ownFront = FrontRow(sides[s]);
                int activeRows = _rules.Combat.MeleeActiveRows;
                Row lastActiveRow = ownFront;
                if (activeRows > 1) lastActiveRow = ActiveLimit(sides[s], activeRows);
                foreach (var soldier in sides[s])
                {
                    if (!soldier.Alive) continue;
                    soldier.Cooldown -= dt;
                    if (soldier.Cooldown > 1e-9) continue;

                    if (soldier.Type.Range == AttackRange.Melee && soldier.Row > lastActiveRow)
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
                    bool offFocus = target is not null && focus[s] is { } fs && fs != target.Side && fs < n && alive[fs] > 0;
                    if (target is null || offFocus || !IsValidTarget(soldier, target, aims[target.Side]))
                    {
                        FoeOrder(s, n, alive, focus[s], setups[s], rng, order);
                        target = null;
                        foreach (int e in order)
                            if ((target = ChooseTarget(soldier, sides[e], aims[e], candidates, rng)) is not null) break;
                        soldier.Target = target;
                    }
                    if (target is null) { soldier.Cooldown = 0; continue; }

                    double damage = soldier.Type.Damage * _rules.Counters.Get(soldier.Type, target.Type)
                        * (soldier.Type.Range == AttackRange.Ranged ? setups[s].RangedDamageFactor : 1);
                    target.PendingDamage += damage;
                    target.LastHitSide = s;
                    soldier.DamageDealt += damage;
                    record?.Hit(tick, soldier.Index, target.Index);
                    soldier.Cooldown += soldier.Type.AttackInterval;

                    // Area damage: a few more of the same kind of target take a share.
                    if (soldier.Type.SplashTargets > 0)
                    {
                        candidates.Clear();
                        foreach (var e in sides[target.Side]) if (e != target && IsValidTarget(soldier, e, aims[target.Side])) candidates.Add(e);
                        for (int k = 0; k < soldier.Type.SplashTargets && candidates.Count > 0; k++)
                        {
                            int pick = rng.Next(candidates.Count);
                            var extra = candidates[pick];
                            candidates.RemoveAt(pick);
                            double part = soldier.Type.Damage * soldier.Type.SplashFactor * _rules.Counters.Get(soldier.Type, extra.Type);
                            extra.PendingDamage += part;
                            extra.LastHitSide = s;
                            soldier.DamageDealt += part;
                            record?.Hit(tick, soldier.Index, extra.Index);
                        }
                    }
                }
            }

            for (int s = 0; s < n; s++)
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
                    if (soldier.LastHitSide >= 0) kills[soldier.LastHitSide]++;
                    log?.Add(Fmt(now, $"{setups[s].Name}: {soldier.Type.Name} #{soldier.Number} düştü."));
                }
            }

            tick++;
        }

        var finals = sides.Select(CountAlive).ToList();
        int standing = finals.Count(x => x > 0);
        int? winner = timedOut || standing != 1 ? null : finals.FindIndex(x => x > 0);
        double duration = tick * dt;
        if (record is not null) record.Ticks = tick;
        log?.Add(Fmt(duration, winner is { } w ? $"{setups[w].Name} kazandı ({finals[w]}/{setups[w].TotalCount} hayatta)."
            : timedOut ? "Süre doldu: berabere." : "Herkes yok oldu: berabere."));

        return new MultiResult(winner, duration, timedOut,
            setups.Select((setup, i) => Report(setup, sides[i])).ToList(), kills, (IReadOnlyList<string>?)log ?? [], record);
    }

    /// <summary>
    /// The enemy sides a soldier of side <paramref name="s"/> looks at, in order: the chosen foe when it still stands, then the side's own order
    /// (or every other side from the first). A side that spreads its fire (a castle's defenders) picks one of them by chance, once per new target.
    /// </summary>
    private static void FoeOrder(int s, int n, int[] alive, int? focus, ArmySetup setup, Random rng, List<int> order)
    {
        order.Clear();
        bool chosen = focus is { } f && f != s && f < n && alive[f] > 0;
        if (chosen) order.Add(focus!.Value);
        if (setup.FoeOrder is { } own) { foreach (int e in own) if (e != s && e < n && alive[e] > 0 && !order.Contains(e)) order.Add(e); }
        for (int e = 0; e < n; e++) if (e != s && alive[e] > 0 && !order.Contains(e)) order.Add(e);
        if (!chosen && setup.SpreadFire && order.Count > 1)
        {
            int pick = rng.Next(order.Count);
            (order[0], order[pick]) = (order[pick], order[0]);
        }
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

    /// <summary>When the rows in front have died out, the melee soldiers of the new front row step forward (they were reserves until now).</summary>
    private static Row AdvanceReserves(List<Soldier> army, Row lastFront, List<string>? log, BattleRecord? record, int tick, double now, string name)
    {
        var front = FrontRow(army);
        if (front <= lastFront) return lastFront;
        int moved = 0;
        foreach (var soldier in army)
        {
            if (soldier.Alive && soldier.Row == front && soldier.Type.Range == AttackRange.Melee)
            {
                record?.Advance(tick, soldier.Index);
                moved++;
            }
        }
        if (moved > 0) log?.Add(Fmt(now, $"{name}: {moved} yedek birlik ön sıraya geçti."));
        return front;
    }

    /// <summary>The last row whose melee soldiers may strike: the n-th row (from the front) that still has a living soldier.</summary>
    private static Row ActiveLimit(List<Soldier> army, int n)
    {
        var alive = new bool[4];
        foreach (var s in army) if (s.Alive) alive[(int)s.Row] = true;
        Row limit = Row.First;
        for (int i = 0, seen = 0; i < 4; i++)
            if (alive[i] && ++seen <= n) limit = (Row)i;
        return limit;
    }

    /// <summary>The first row (front to back) that still has a living soldier; the last row when none is left.</summary>
    private static Row FrontRow(List<Soldier> army)
    {
        var best = Row.Fourth;
        foreach (var s in army) if (s.Alive && s.Row < best) best = s.Row;
        return best;
    }

    /// <summary>The rearmost row with a living soldier.</summary>
    private static Row RearRow(List<Soldier> army)
    {
        var best = Row.First;
        foreach (var s in army) if (s.Alive && s.Row > best) best = s.Row;
        return best;
    }

    /// <summary>What one side may hit this tick: the frontmost enemy row, and the preferred type if any is alive.</summary>
    private readonly record struct Aim(Row FrontmostRow, UnitType? PreferredAlive, Row RearRow, bool SupportAlive, Row ShooterLimit);

    private static bool IsValidTarget(Soldier attacker, Soldier target, Aim aim)
    {
        if (!target.Alive) return false;
        // Siege engines always go for the back row; flanking riders for shooters and healers there, while any are alive.
        if (attacker.Type.BackFirst) return target.Row == aim.RearRow;
        if (attacker.Type.Flank && aim.SupportAlive) return target.Row > aim.FrontmostRow && target.Type.IsSupport;
        if (attacker.Type.Range == AttackRange.Ranged && aim.PreferredAlive is { } preferred)
            return target.Type == preferred;
        if (attacker.Type.Range == AttackRange.Ranged) return target.Row <= aim.ShooterLimit;
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

    private static bool HasAliveSupportBehind(List<Soldier> army, Row front)
    {
        foreach (var s in army) if (s.Alive && s.Row > front && s.Type.IsSupport) return true;
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
        public Row Row { get; } = row;
        public double Hp { get; set; } = type.Hp;
        public double Cooldown { get; set; }
        public double PendingDamage { get; set; }
        public double PendingHeal { get; set; }
        /// <summary>What a healer may still restore this battle (unlimited when the unit has no budget).</summary>
        public double HealLeft { get; set; } = type.HealBudget > 0 ? type.HealBudget : double.PositiveInfinity;
        public Soldier? Target { get; set; }
        /// <summary>The side that last hurt this soldier (who gets the kill).</summary>
        public int LastHitSide { get; set; } = -1;
        public double DamageDealt { get; set; }
        public double DamageTaken { get; set; }
        public bool Alive => Hp > 1e-9;
    }
}
