using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

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
        bool medium = ctx.Difficulty == BotDifficulty.Medium;
        if (c.War.Armies.Any(a => a.SiteId is null && a.Mode == ArmyMode.Attack && a.State == ArmyState.Marching)) return; // one assault at a time

        double maxAge = medium ? 120 : 400;
        double keep = medium ? 0.25 : 0.1;
        var home = c.Units.ToDictionary(u => u.Id, u => ctx.HomeSoldiers(u.Id));
        int homeTotal = home.Values.Sum();
        if (homeTotal == 0) return;
        var spare = home.ToDictionary(kv => kv.Key, kv => (int)Math.Floor(kv.Value * (1 - keep)));
        int spareTotal = spare.Values.Sum();

        var options = new List<(int Seat, double March, RivalEstimate Estimate, int Needed)>();
        int wanted = 0;
        foreach (var target in c.Scouting.Targets.Where(t => ctx.Rivals.Any(r => r.Seat == t.Seat)))
        {
            if (ctx.EstimateOf(target.Seat) is not { } est) { ctx.Stats.Count("attackNoReport"); continue; }
            if (ctx.Now - est.At > maxAge) { ctx.Stats.Count("attackStaleReport"); continue; }
            var guess = Grow(est, ctx.Now, medium);
            int needed;
            if (medium)
            {
                // The longer the war has gone on without a result the more it is willing to risk (the winner is whoever has the most people).
                double bold = Math.Max(0, ctx.WarProgress - 0.3) / 0.7;
                var enemy = Tactics.Setup(ctx, "Savunma", Scale(guess, 1.2 - 0.2 * bold));
                needed = Tactics.SmallestWinning(ctx, spare, enemy, 0.85 - 0.25 * bold).Needed;
                if (needed == 0) wanted = wanted == 0 ? guess.Values.Sum() : Math.Min(wanted, guess.Values.Sum());
            }
            else
            {
                // A head count: send everything if there are more of us than of them.
                int theirs = guess.Values.Sum();
                needed = spareTotal >= theirs ? spareTotal : 0;
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
        var units = Tactics.Take(spare, medium ? (int)Math.Ceiling(pick.Needed * 1.1) : pick.Needed);
        if (units.Count == 0) return;
        ctx.Wish(80, new SendArmy(CastleKeys.Of(pick.Seat), units, null, null, ArmyMode.Attack));
        ctx.Commit(units);
        ctx.Stats.Count("attacks");
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
