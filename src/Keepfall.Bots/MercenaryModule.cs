using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// Spends the gold from the forest on soldiers: late in the preparation, in the war, or when a raid is waiting for soldiers.
/// It hires the type the army lacks most (the mix from the balance file) and not while the castle is short of food (hired
/// soldiers eat too).
/// </summary>
public sealed class MercenaryModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        var c = ctx.Castle;
        double gold = c.Resources.Gold;
        if (gold <= 0 || c.Eliminated) return;
        bool needed = ctx.ArmingTime || ctx.UnderThreat || ctx.Memory.WantSoldiers > ctx.Castle.Soldiers;
        if (!needed) return;
        if (c.Starving || (c.Resources.Food < 25 && c.Rates.FoodIn < c.Rates.FoodOut)) return;
        if (ctx.Difficulty == BotDifficulty.Easy && ctx.Slip()) return;

        var mix = ctx.Rules.Bots.Mix;
        double share = mix.Values.Sum();
        int total = c.Units.Sum(u => ctx.Owned(u.Id)) + 1;
        var pick = mix.Select(kv => (Id: kv.Key, Deficit: kv.Value / share * total - ctx.Owned(kv.Key)))
            .Where(x => ctx.Unit(x.Id).Price > 0).OrderByDescending(x => x.Deficit).FirstOrDefault();
        if (pick.Id is null) return;

        var price = ctx.Unit(pick.Id).Price;
        int n = Math.Min((int)Math.Floor(gold / price), ctx.UnderThreat ? 6 : ctx.Difficulty == BotDifficulty.Medium ? 3 : 1);
        if (n > 0) ctx.Wish(75, new HireMercenary(pick.Id, n), gold: price * n);
    }
}
