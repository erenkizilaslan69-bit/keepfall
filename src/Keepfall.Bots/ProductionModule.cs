using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// Weapons and soldiers: keeps the forge queue short and filled with the unit type the army lacks most (the mix comes
/// from the balance file), and turns stored weapons into soldiers once it is time (late in the preparation, and in the war).
/// </summary>
public sealed class ProductionModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        if (ctx.ForgingTime && !ctx.Slip()) QueueWeapons(ctx);
        if (ctx.ArmingTime) Arm(ctx);
    }

    private static void QueueWeapons(BotContext ctx)
    {
        var c = ctx.Castle;
        if (c.Queue.Sum(o => o.Remaining) >= (ctx.Difficulty == Core.Lobby.BotDifficulty.Medium ? 3 : 2)) return;
        if (ctx.ArmyRoom <= 0) return; // enough soldiers for the people we have
        if (ctx.Count(Job.Blacksmith) == 0 && c.Queue.Count > 0) return;

        var mix = ctx.Rules.Bots.Mix;
        double share = mix.Values.Sum();
        var have = c.Units.ToDictionary(u => u.Id, u => ctx.Owned(u.Id));
        int total = have.Values.Sum() + 1;

        // The type furthest below its share of the army (a poor bot sometimes just forges something).
        var pick = ctx.Slip()
            ? c.Units.Select(u => u.Id).Where(mix.ContainsKey).OrderBy(_ => ctx.Rng.Next()).FirstOrDefault()
            : mix.OrderByDescending(kv => kv.Value / share * total - have.GetValueOrDefault(kv.Key)).First().Key;
        if (pick is null) return;

        var unit = ctx.Unit(pick);
        double wood = c.Resources.Wood - ctx.Reserved.Wood, iron = c.Resources.Iron - ctx.Reserved.Iron;
        if (unit.Wood > wood + 1e-9 || unit.Iron > iron + 1e-9) return;
        ctx.Wish(60, new QueueWeapon(pick, 1), unit.Wood, unit.Iron);
    }

    private static void Arm(BotContext ctx)
    {
        int idle = ctx.Count(Job.Idle);
        foreach (var u in ctx.Castle.Units.Where(u => u.Weapons > 0))
        {
            int n = Math.Min(u.Weapons, idle);
            if (n <= 0) continue;
            ctx.Wish(70, new ArmWorkers(u.Id, n, Job.Idle));
            idle -= n;
        }
    }
}
