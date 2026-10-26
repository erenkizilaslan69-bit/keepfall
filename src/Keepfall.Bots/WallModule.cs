using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// Raises the castle's wall (more hit points, and the archers at the gate shoot harder from behind it) when it can be paid without
/// taking the wood and iron the weapons need: level 2 once the preparation is half over, level 3 in the war. One upgrade at a time.
/// </summary>
public sealed class WallModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        if (!ctx.Level.WallUpgrade || ctx.Castle.Eliminated) return;
        var war = ctx.Castle.War;
        if (war.WallUpgrade is not { NextLevel: { } next, Remaining: null } up || war.WallHp <= 0) return;
        if (next == 2 ? ctx.PrepProgress < 0.5 : !ctx.AtWar) return;
        var res = ctx.Castle.Resources;
        // Leave a little over, so the forge is not starved by the wall.
        if (res.Wood < up.NextWood + 15 || res.Iron < up.NextIron + 10) return;
        ctx.Wish(88, new UpgradeWall(), up.NextWood, up.NextIron);
        ctx.Stats.Count("wallUpgrades");
    }
}
