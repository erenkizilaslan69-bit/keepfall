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
        if (medium && Regroup(ctx)) return;
        if (c.War.Armies.Any(a => a.SiteId is null && a.Mode == ArmyMode.Attack && a.State == ArmyState.Marching && !Tactics.IsRaid(ctx, a))) return; // one assault at a time (a raid of riders does not count)

        var botRules = ctx.Rules.Bots;
        double maxAge = medium ? botRules.StaleReportSeconds : 400;
        bool mayGoBlind = medium && botRules.BlindMargin > 0;
        bool blindWaits = ctx.Castle.ElapsedSeconds - ctx.Castle.PrepSeconds < botRules.BlindAfterWarSeconds; // the first stretch of the war
        double keep = ctx.Level.KeepHome;
        // A bot that keeps its weapons in the store counts them as soldiers it can have at once.
        // (Those being armed will be soldiers soon: they count too, or the plan would fall apart while they are being armed.)
        var home = c.Units.ToDictionary(u => u.Id, u => ctx.HomeSoldiers(u.Id) + (ctx.Level.HoldWeapons ? c.Units.First(x => x.Id == u.Id).Weapons + c.Units.First(x => x.Id == u.Id).Arming : 0));
        int homeTotal = home.Values.Sum();
        if (homeTotal == 0) return;
        // A foresighted bot always leaves a garrison at home.
        keep = Math.Max(keep, Math.Min(1.0, ctx.Garrison() / (double)homeTotal));
        var spare = home.ToDictionary(kv => kv.Key, kv => (int)Math.Floor(kv.Value * (1 - keep)));
        int spareTotal = spare.Values.Sum();

        var options = new List<(int Seat, double March, RivalEstimate Estimate, int Needed)>();
        int wanted = 0;
        foreach (var target in c.Scouting.Targets.Where(t => ctx.Rivals.Any(r => r.Seat == t.Seat) && !ctx.Memory.AtPeaceWith(t.Seat, ctx.Now)))
        {
            // No fresh report: a good bot goes on what it last knew (or on its own army's size) but expects more of the rival.
            double doubt = 0;
            var est = ctx.EstimateOf(target.Seat);
            if (est is null)
            {
                ctx.Stats.Count("attackNoReport");
                if (!mayGoBlind) continue;
                if (blindWaits) { ctx.Stats.Count("attackBlindWait"); continue; }
                est = new RivalEstimate(OwnShare(ctx, botRules.BlindRivalShare), ctx.Now, false);
                doubt = botRules.BlindMargin;
                ctx.Stats.Count("attackBlind");
            }
            else if (ctx.Now - est.At > maxAge)
            {
                ctx.Stats.Count("attackStaleReport");
                if (!mayGoBlind) continue;
                if (blindWaits) { ctx.Stats.Count("attackBlindWait"); continue; }
                doubt = botRules.BlindMargin;
                ctx.Stats.Count("attackBlind");
            }
            var guess = Grow(est, ctx.Now, medium);
            if (ctx.Level.Opportunist) guess = Weakened(ctx, target.Seat, guess);
            int needed;
            if (medium)
            {
                // The longer the war has gone on without a result the more it is willing to risk (the winner is whoever has the most people).
                var rules = ctx.Rules.Bots;
                double bold = ctx.Level.ScoreAware ? 1 : Math.Max(0, ctx.WarProgress - 0.3) / 0.7;
                var enemy = Tactics.Setup(ctx, "Savunma", Scale(guess, (rules.AttackMargin - (rules.AttackMargin - 1.0) * bold) * (1 + doubt)));
                enemy.RangedDamageFactor = ctx.WallArcherFactor; // its archers stand behind a wall
                ctx.AddGuards(enemy, ctx.Rules.Walls.Guards);
                needed = Tactics.SmallestWinning(ctx, spare, enemy, rules.AttackRate - 0.25 * bold).Needed;
                if (needed == 0) wanted = wanted == 0 ? guess.Values.Sum() : Math.Min(wanted, guess.Values.Sum());
            }
            else
            {
                // A head count: send everything if there are more of us than of them.
                int theirs = guess.Values.Sum() + ctx.Rules.Walls.Guards; // the gate guards count as heads too
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
        // An opportunist goes first for the rival somebody else is busy with (a besieged rival has less to throw at us).
        double Eager(int seat) => ctx.Level.Opportunist && ctx.Memory.GateFights.TryGetValue(seat, out var at) && ctx.Now - at < 90 ? 6 : 0;
        var pick = options.OrderBy(o => o.Needed + o.March * 0.1 - Eager(o.Seat)).First();
        // Enough to win the fight at the gate (the winner brings the castle down).
        int send = medium ? (int)Math.Ceiling(pick.Needed * 1.1) : pick.Needed;
        var units = Tactics.WithBreaker(ctx, spare, Tactics.Take(spare, Math.Min(send, spareTotal)));
        if (units.Count == 0) return;
        if (ctx.Level.HoldWeapons && !ctx.ReadyToSend(units)) { ctx.Stats.Count("armingWaits"); return; }
        int? mask = KingdomModule.Disguise(ctx, pick.Seat);
        ctx.Wish(80, new SendArmy(CastleKeys.Of(pick.Seat), units, null, null, ArmyMode.Attack, mask is { } m ? CastleKeys.Of(m) : null));
        ctx.Commit(units);
        ctx.Stats.Count("attacks");
        if (ctx.Stats["firstAttackAt"] == 0) ctx.Stats.Count("firstAttackAt", Math.Max(1, (int)ctx.Now));
        ctx.Stats.Count("attackSoldiers", units.Values.Sum());
        ctx.Stats.Max("biggestAttack", units.Values.Sum());
    }

    /// <summary>
    /// A good bot's army that is walking home from an attack but is still in the half of the road nearer the rivals does not go
    /// all the way back if a rival it knows about recently is one it beats with what is left of it: it turns to that castle.
    /// </summary>
    private static bool Regroup(BotContext ctx)
    {
        var c = ctx.Castle;
        var rules = ctx.Rules.Bots;
        var army = c.War.Armies.FirstOrDefault(a => a.SiteId is null && a.State == ArmyState.Returning && !a.Fighting && a.Distance > 0.5 && !Tactics.IsRaid(ctx, a));
        if (army is null) return false;
        var units = army.Units.Where(u => u.Count > 0).ToDictionary(u => u.UnitId, u => u.Count);
        int total = units.Values.Sum();
        if (total == 0) return false;

        double bold = ctx.Level.ScoreAware ? 1 : Math.Max(0, ctx.WarProgress - 0.3) / 0.7;
        (int Seat, double Cost)? best = null;
        foreach (var target in c.Scouting.Targets.Where(t => ctx.Rivals.Any(r => r.Seat == t.Seat) && !ctx.Memory.AtPeaceWith(t.Seat, ctx.Now)))
        {
            // Only on what it knows: a report (or a siege) that is still worth trusting.
            if (ctx.EstimateOf(target.Seat) is not { } est || ctx.Now - est.At > rules.StaleReportSeconds) continue;
            var enemy = Tactics.Setup(ctx, "Savunma", Scale(Grow(est, ctx.Now, true), rules.AttackMargin - (rules.AttackMargin - 1.0) * bold));
            enemy.RangedDamageFactor = ctx.WallArcherFactor;
            ctx.AddGuards(enemy, ctx.Rules.Walls.Guards);
            int needed = Tactics.SmallestWinning(ctx, units, enemy, rules.AttackRate - 0.25 * bold).Needed;
            if (needed == 0 || needed > total) continue;
            double cost = needed + target.MarchSeconds * 0.1;
            if (best is null || cost < best.Value.Cost) best = (target.Seat, cost);
        }
        if (best is not { } pick) return false;
        ctx.Wish(85, new RedirectArmy(army.Id, CastleKeys.Of(pick.Seat)));
        ctx.Stats.Count("regroups");
        return true;
    }

    /// <summary>
    /// A rival whose gate somebody else has been fighting at lately has lost soldiers since our report: an opportunist expects a little less of it.
    /// (Armies seen on the road are not counted: they are usually home again before ours arrives.)
    /// </summary>
    private static Dictionary<string, int> Weakened(BotContext ctx, int seat, Dictionary<string, int> guess)
    {
        if (!ctx.Memory.GateFights.TryGetValue(seat, out var fight) || ctx.Now - fight > 60) return guess;
        ctx.Stats.Count("opportunities");
        return guess.ToDictionary(kv => kv.Key, kv => (int)Math.Ceiling(kv.Value * 0.85));
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
