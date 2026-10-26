using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// For a bot that keeps its weapons in the store where arming takes time (match.armSeconds): prepares ahead instead of reacting.
/// The moment an army is seen coming (before its reaction time) it arms everything in the store; in the war it also keeps a garrison
/// armed at home (a share of what the biggest rival is thought to have), so a surprise does not find only workers at home.
/// </summary>
public sealed class ForesightModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        if (!ctx.Level.Foresight || ctx.Rules.Match.ArmSeconds <= 0 || ctx.Castle.Eliminated) return;
        var c = ctx.Castle;
        if (ctx.Memory.Sighted(ctx.Now))
        {
            foreach (var u in c.Units.Where(u => u.Weapons > 0)) ctx.ArmFromStore(u.Id, u.Weapons);
            ctx.Stats.Count("sightArms");
            return;
        }
        int missing = ctx.Garrison() - c.Soldiers - c.Units.Sum(u => u.Arming);
        if (missing <= 0) return;
        // The kind that does best against the rivals first, then whatever there is.
        var counter = ctx.CounterPick();
        foreach (var u in c.Units.Where(u => u.Weapons > 0).OrderByDescending(u => u.Id == counter).ThenByDescending(u => u.Weapons))
        {
            int n = Math.Min(missing, u.Weapons);
            ctx.ArmFromStore(u.Id, n);
            missing -= n;
            ctx.Stats.Count("garrisonArms", n);
            if (missing <= 0) break;
        }
    }
}
