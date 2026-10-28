using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>
/// A bot uses its own kingdom's abilities, simply but sensibly, and only through the pictures a player gets:
/// the Shadow writes a scary army table and now and then sends a phantom at the rival that looks weakest; the Merchant bribes the biggest army
/// walking at it and hires a camp against a weak rival when it has the gold; the Schemer goes under a third player's name when it attacks
/// (<see cref="Disguise"/>, used by the attack module); the Oracle needs nothing extra (its estimates are for a human's eyes).
/// </summary>
public sealed class KingdomModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        if (ctx.Castle.Kingdom is not { } k || ctx.Castle.Eliminated || !ctx.Level.Calculates) return;
        switch (k.Id)
        {
            case Factions.Shadow: Shadow(ctx, k); break;
            case Factions.Merchant: Merchant(ctx, k); break;
        }
    }

    /// <summary>The seat a disguised army should go under (a rival that is not the target), or null when the bot cannot or need not.</summary>
    public static int? Disguise(BotContext ctx, int targetSeat)
    {
        if (ctx.Castle.Kingdom is not { Id: Factions.Schemer } k || k.DisguiseReadyIn > 0 || !ctx.Level.Calculates) return null;
        var others = ctx.Rivals.Where(r => r.Seat != targetSeat).ToList();
        return others.Count == 0 ? null : others[ctx.Rng.Next(others.Count)].Seat;
    }

    private static void Shadow(BotContext ctx, KingdomView k)
    {
        if (!ctx.AtWar) return;
        // The false report: a big army of the deck's best fighting unit, set once.
        if (!ctx.Memory.FakeReportSet && k.FakeReport is null)
        {
            var fighter = ctx.Castle.Units.FirstOrDefault(u => u.Id is "kilicli" or "mizrakci" or "kalkanli" or "okcu") ?? ctx.Castle.Units[0];
            ctx.Wish(60, new SetFakeReport(new Dictionary<string, int> { [fighter.Id] = 30 }));
            ctx.Memory.FakeReportSet = true;
        }
        if (k.DecoyReadyIn > 0 || k.DecoysOut >= k.Numbers.DecoyMax || ctx.Now - ctx.Memory.KingdomAt < 150 || ctx.Slip()) return;
        int size = Math.Min(k.Numbers.DecoyMaxSoldiers, 14);
        double cost = Math.Ceiling(size * k.Numbers.DecoyGoldPerSoldier);
        if (ctx.Castle.Resources.Gold < cost + 20) return;
        // At the rival that looks weakest: its defenders are the ones that react to a warning.
        var target = ctx.Rivals.OrderBy(r => ctx.EstimateOf(r.Seat)?.Total ?? 1000).FirstOrDefault();
        if (target is null) return;
        var fighterId = ctx.Castle.Units.FirstOrDefault(u => u.Id is "kilicli" or "mizrakci" or "kalkanli")?.Id ?? ctx.Castle.Units[0].Id;
        ctx.Wish(55, new SendDecoy(CastleKeys.Of(target.Seat), new Dictionary<string, int> { [fighterId] = size }), gold: cost);
        ctx.Memory.KingdomAt = ctx.Now;
        ctx.Stats.Count("decoys");
    }

    private static void Merchant(BotContext ctx, KingdomView k)
    {
        if (!ctx.AtWar) return;
        double gold = ctx.Castle.Resources.Gold;
        // Bribe the biggest army we can see walking at us (it is one thing to see it, another that it is for us: the warning says so).
        if (k.BribeReadyIn <= 0 && ctx.Castle.War.Incoming.Count > 0 && ctx.MyGate is { } gate)
        {
            var army = (ctx.Map?.Seen ?? []).Where(s => s.Kind == MoverKind.Army && s.Units.Sum(u => u.Count) >= 5
                    && Math.Sqrt((s.Position.X - gate.X) * (s.Position.X - gate.X) + (s.Position.Y - gate.Y) * (s.Position.Y - gate.Y)) < ctx.Rules.Map.CastleVision)
                .OrderByDescending(s => s.Units.Sum(u => u.Count)).FirstOrDefault();
            if (army is not null)
            {
                int n = (int)Math.Floor(army.Units.Sum(u => u.Count) * k.Numbers.BribeMaxShare);
                double cost = Math.Ceiling(n * k.Numbers.BribeGoldPerSoldier);
                if (n >= 1 && gold >= cost)
                {
                    ctx.Wish(95, new BribeArmy(army.Id, n), gold: cost);
                    ctx.Stats.Count("bribes");
                    return;
                }
            }
        }
        // Hire a camp against the rival that looks weakest, when there is gold to spare.
        if (ctx.Now - ctx.Memory.KingdomAt < 120 || ctx.Slip()) return;
        var camp = ctx.Sites.Where(s => s.Kind is SiteKind.Camp or SiteKind.BigCamp && !s.Gone && !ctx.SiteBusy(s.Id))
            .OrderBy(s => s.Kind == SiteKind.BigCamp ? 1 : 0).FirstOrDefault();
        if (camp is null) return;
        double price = camp.Kind == SiteKind.BigCamp ? k.Numbers.CampPriceBig : k.Numbers.CampPriceSmall;
        if (gold < price + 40) return;
        var target = ctx.Rivals.OrderBy(r => ctx.EstimateOf(r.Seat)?.Total ?? 1000).FirstOrDefault();
        if (target is null) return;
        ctx.Wish(58, new HireCamp(camp.Id, CastleKeys.Of(target.Seat)), gold: price);
        ctx.Memory.KingdomAt = ctx.Now;
        ctx.Stats.Count("campsHired");
    }
}
