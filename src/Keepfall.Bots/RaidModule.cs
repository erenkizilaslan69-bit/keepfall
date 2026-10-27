using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// A bot with cavalry in its deck now and then sends a few riders alone to a rival it beats at the gate with them (best when the rival's
/// army is out on the road): an army of nothing but raiders that wins burns the fields instead of taking the castle. At most one raid out
/// at a time and one per <c>raidEvery</c> seconds; the fight is worked out first, so the riders are not thrown away.
/// </summary>
public sealed class RaidModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        var level = ctx.Level;
        if (level.RaidEverySeconds <= 0 || !ctx.AtWar || ctx.Castle.Eliminated || ctx.UnderThreat || ctx.Slip()) return;
        if (ctx.Now - ctx.Memory.RaidAt < level.RaidEverySeconds) return;
        if (ctx.Castle.War.Armies.Any(a => a.SiteId is null && Tactics.IsRaid(ctx, a))) return; // the last raid is still out

        var home = ctx.Castle.Units.Where(u => ctx.Rules.FindUnit(u.Id)?.Raider == true)
            .ToDictionary(u => u.Id, u => ctx.HomeSoldiers(u.Id) + (level.HoldWeapons ? u.Weapons + u.Arming : 0))
            .Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
        if (home.Values.Sum() < 2) return;
        var spare = Tactics.Take(home, level.RaidMax);

        var rules = ctx.Rules.Bots;
        (int Seat, int Needed, double Cost)? best = null;
        foreach (var target in ctx.Castle.Scouting.Targets.Where(t => ctx.Rivals.Any(r => r.Seat == t.Seat) && !ctx.Memory.AtPeaceWith(t.Seat, ctx.Now)))
        {
            if (ctx.EstimateOf(target.Seat) is not { } est || ctx.Now - est.At > rules.StaleReportSeconds) continue;
            // A rival whose army was seen on the road lately has only part of its soldiers at home.
            double athome = 1;
            if (ctx.Memory.ArmiesAway.TryGetValue(target.Seat, out var away) && ctx.Now - away.At < 30 && est.Total > 0)
                athome = Math.Max(0.1, 1 - away.Soldiers / (double)est.Total);
            var defenders = est.Units.ToDictionary(kv => kv.Key, kv => (int)Math.Ceiling(kv.Value * athome * rules.AttackMargin));
            var enemy = Tactics.Setup(ctx, "Savunma", defenders);
            enemy.RangedDamageFactor = ctx.WallArcherFactor;
            int needed = Tactics.SmallestWinning(ctx, spare, enemy, rules.AttackRate).Needed;
            if (needed < 2) continue;
            double cost = needed + target.MarchSeconds * 0.1 - (athome < 1 ? 3 : 0);
            if (best is null || cost < best.Value.Cost) best = (target.Seat, needed, cost);
        }
        if (best is not { } pick) { ctx.Stats.Count("raidNoOption"); return; }

        var units = Tactics.Take(spare, pick.Needed);
        if (level.HoldWeapons && !ctx.ReadyToSend(units)) { ctx.Stats.Count("armingWaits"); return; }
        ctx.Wish(82, new SendArmy(CastleKeys.Of(pick.Seat), units, null, null, ArmyMode.Attack));
        ctx.Commit(units);
        ctx.Memory.RaidAt = ctx.Now;
        ctx.Stats.Count("raids");
        ctx.Stats.Count("raidRiders", units.Values.Sum());
    }
}
