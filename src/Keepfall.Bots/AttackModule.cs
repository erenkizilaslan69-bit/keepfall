using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;

namespace Keepfall.Bots;

/// <summary>
/// In the war: picks the rival that looks weakest (nearest if it is close) from the scout reports and what happened at its gate,
/// and sends the army that beats what it expects there, keeping part of the soldiers at home. If the army is not big enough yet it
/// tells production how many soldiers it wants. A poor bot goes by a head count of the last report, however old, and sends
/// nearly everything.
/// </summary>
public sealed class AttackModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        if (!ctx.AtWar || ctx.Castle.Eliminated || ctx.UnderThreat || ctx.Slip()) return;
        var c = ctx.Castle;
        bool medium = ctx.Level.Calculates;
        if (c.War.Armies.Any(a => a.SiteId is null && a.Mode == ArmyMode.Attack && a.State == ArmyState.Marching)) return; // one assault at a time

        var botRules = ctx.Rules.Bots;
        double maxAge = medium ? botRules.StaleReportSeconds : 400;
        bool mayGoBlind = medium && botRules.BlindMargin > 0;
        double keep = ctx.Level.KeepHome;
        var home = c.Units.ToDictionary(u => u.Id, u => ctx.HomeSoldiers(u.Id));
        int homeTotal = home.Values.Sum();
        if (homeTotal == 0) return;
        var spare = home.ToDictionary(kv => kv.Key, kv => (int)Math.Floor(kv.Value * (1 - keep)));
        int spareTotal = spare.Values.Sum();

        var options = new List<(int Seat, double March, RivalEstimate Estimate, int Needed)>();
        int wanted = 0;
        foreach (var target in c.Scouting.Targets.Where(t => ctx.Rivals.Any(r => r.Seat == t.Seat)))
        {
            // No fresh report: a good bot goes on what it last knew (or on its own army's size) but expects more of the rival.
            double doubt = 0;
            var est = ctx.EstimateOf(target.Seat);
            if (est is null)
            {
                ctx.Stats.Count("attackNoReport");
                if (!mayGoBlind) continue;
                est = new RivalEstimate(OwnShare(ctx, botRules.BlindRivalShare), ctx.Now, false);
                doubt = botRules.BlindMargin;
                ctx.Stats.Count("attackBlind");
            }
            else if (ctx.Now - est.At > maxAge)
            {
                ctx.Stats.Count("attackStaleReport");
                if (!mayGoBlind) continue;
                doubt = botRules.BlindMargin;
                ctx.Stats.Count("attackBlind");
            }
            var guess = Grow(est, ctx.Now, medium);
            int needed;
            if (medium)
            {
                // The longer the war has gone on without a result the more it is willing to risk (the winner is whoever has the most people).
                var rules = ctx.Rules.Bots;
                double bold = ctx.Level.ScoreAware ? 1 : Math.Max(0, ctx.WarProgress - 0.3) / 0.7;
                var enemy = Tactics.Setup(ctx, "Savunma", Scale(guess, (rules.AttackMargin - (rules.AttackMargin - 1.0) * bold) * (1 + doubt)));
                needed = Tactics.SmallestWinning(ctx, spare, enemy, rules.AttackRate - 0.25 * bold).Needed;
                if (needed == 0) wanted = wanted == 0 ? guess.Values.Sum() : Math.Min(wanted, guess.Values.Sum());
            }
            else
            {
                // A head count: send everything if there are more of us than of them.
                int theirs = guess.Values.Sum();
                needed = spareTotal >= theirs * ctx.Level.HeadCountRatio ? spareTotal : 0;
                if (needed == 0) wanted = wanted == 0 ? theirs : Math.Min(wanted, theirs);
            }
            if (needed > 0) options.Add((target.Seat, target.MarchSeconds, est, needed));
        }

        if (options.Count == 0)
        {
            ctx.Stats.Count("attackNoOption");
            // Nobody we can beat yet: ask production for a bit more than the weakest looks to have.
            if (wanted > 0) ctx.Memory.WantSoldiers = Math.Max(ctx.Memory.WantSoldiers, (int)Math.Ceiling(wanted * (medium ? 1.3 : 1.0) / (1 - keep)));
            return;
        }

        // The one we beat most cheaply; a nearer one wins a tie.
        var pick = options.OrderBy(o => o.Needed + o.March * 0.1).First();
        // Enough to win the fight, and if the rival is weak enough, enough to break the gate too (the last castle standing wins).
        int send = medium ? (int)Math.Ceiling(pick.Needed * 1.1) : pick.Needed;
        if (medium) send = Math.Max(send, SoldiersToBreak(ctx, spare, GateHp(ctx, pick.Seat)));
        var units = Tactics.Take(spare, Math.Min(send, spareTotal));
        if (units.Count == 0) return;
        ctx.Wish(80, new SendArmy(CastleKeys.Of(pick.Seat), units, null, null, ArmyMode.Attack));
        ctx.Commit(units);
        ctx.Stats.Count("attacks");
        if (ctx.Stats["firstAttackAt"] == 0) ctx.Stats.Count("firstAttackAt", Math.Max(1, (int)ctx.Now));
        ctx.Stats.Count("attackSoldiers", units.Values.Sum());
        ctx.Stats.Max("biggestAttack", units.Values.Sum());
    }

    /// <summary>What we know of a rival's gate: the hit points it had after the last siege we fought there (whole if we never have).</summary>
    private static double GateHp(BotContext ctx, int seat)
    {
        var last = ctx.Castle.War.Battles.Where(b => b.Kind == BattleKind.Siege && b.Attacking && b.OpponentSeat == seat).OrderByDescending(b => b.At).FirstOrDefault();
        return last is null ? ctx.Rules.War.CastleHp : Math.Max(1, last.CastleHpAfter);
    }

    /// <summary>The fewest soldiers (in the mix we have) whose survivors would break a gate with <paramref name="hp"/> left, allowing for losses.</summary>
    private static int SoldiersToBreak(BotContext ctx, IReadOnlyDictionary<string, int> spare, double hp)
    {
        int total = spare.Values.Sum();
        for (int n = 1; n <= total; n++)
        {
            double damage = 0;
            foreach (var (id, count) in Tactics.Take(spare, n))
            {
                var type = ctx.Rules.FindUnit(id)!;
                damage += count * type.Dps * ctx.Rules.War.SiegeSeconds * (type.Range == AttackRange.Ranged ? ctx.Rules.War.ArcherSiegeMultiplier : 1);
            }
            if (damage * 0.7 >= hp) return n; // about 70 % of them are still standing at the gate
        }
        return total;
    }

    /// <summary>With nothing known of a rival: this share of the soldiers we have ourselves (at home and out), in our own mix.</summary>
    private static Dictionary<string, int> OwnShare(BotContext ctx, double share)
    {
        var away = ctx.Castle.War.Armies.SelectMany(a => a.Units).GroupBy(u => u.UnitId).ToDictionary(g => g.Key, g => g.Sum(u => u.Count));
        return ctx.Castle.Units.ToDictionary(u => u.Id, u => (int)Math.Round((u.Soldiers + away.GetValueOrDefault(u.Id)) * share));
    }

    /// <summary>A rival has been making soldiers since we looked: about one more every 45 seconds, in the proportion it had (a good bot allows for it).</summary>
    private static Dictionary<string, int> Grow(RivalEstimate est, double now, bool medium)
    {
        var units = est.Units.ToDictionary(kv => kv.Key, kv => kv.Value);
        if (!medium || units.Count == 0) return units;
        int extra = (int)((now - est.At) / 45);
        int total = Math.Max(1, units.Values.Sum());
        foreach (var id in units.Keys.ToList()) units[id] += (int)Math.Round(extra * (double)units[id] / total);
        return units;
    }

    private static Dictionary<string, int> Scale(IReadOnlyDictionary<string, int> units, double factor) =>
        units.ToDictionary(kv => kv.Key, kv => (int)Math.Ceiling(kv.Value * factor));
}
