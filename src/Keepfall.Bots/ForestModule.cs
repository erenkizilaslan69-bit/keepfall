using Keepfall.Core.Combat;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>
/// Sends the army to the forest: plunders a village (no fight, but it needs a few soldiers) or clears a bandit camp (only when
/// the fight calculator says the army it can spare wins). It picks the place with the best reward for the time it takes, never sends
/// away what the castle needs at home during the war, and when it lacks soldiers it tells production how many it wants.
/// A poor bot judges a camp by a rough head count instead of calculating, and so sometimes loses.
/// </summary>
public sealed class ForestModule : IBotModule
{
    private const int Runs = 12;

    public void Think(BotContext ctx)
    {
        ctx.Memory.WantSoldiers = 0;
        if (ctx.Castle.Eliminated || ctx.Slip()) return;
        var c = ctx.Castle;
        if (c.War.Armies.Count >= 2) return; // two raids at a time are enough

        // At war the castle keeps a share of its soldiers at home; in the preparation nobody can attack it.
        var home = c.Units.ToDictionary(u => u.Id, u => u.Soldiers);
        double keep = ctx.AtWar ? 0.4 : 0.0;
        var spare = home.ToDictionary(kv => kv.Key, kv => (int)Math.Floor(kv.Value * (1 - keep)));
        int spareTotal = spare.Values.Sum();

        var candidates = new List<(SiteView Site, double Score, int Need, Dictionary<string, int>? Army)>();
        foreach (var s in ctx.Sites)
        {
            if (s.Kind == SiteKind.Chest || s.Gone || ctx.SiteBusy(s.Id)) continue;
            double trip = ctx.ArmyTravelSeconds(s.Position);
            // Not worth leaving if the war is about to begin before the army is back (the castle would be bare).
            if (!ctx.AtWar && c.RemainingSeconds < 2 * trip + 10) continue;

            if (s.Kind == SiteKind.Village)
            {
                int need = Math.Max(1, s.MinSoldiers);
                double value = 40 + 3 * 35; // gold and people
                candidates.Add((s, value / (2 * trip + 20), need, spareTotal >= need ? Take(spare, need) : null));
            }
            else
            {
                var plan = PlanCamp(ctx, s, spare);
                if (plan.Needed <= 0) continue;
                double gold = s.Kind == SiteKind.BigCamp ? 260 : 75, weapons = s.Kind == SiteKind.BigCamp ? 6 : 3;
                double value = gold + weapons * 25 - plan.Loss * 30;
                if (value <= 0) continue;
                candidates.Add((s, value / (2 * trip + 30), plan.Needed, spareTotal >= plan.Needed ? Take(spare, plan.Needed) : null));
            }
        }
        if (candidates.Count == 0) return;

        // The best place we could go to right now; failing that, ask production for the soldiers the best one needs.
        var ready = candidates.Where(x => x.Army is not null).OrderByDescending(x => x.Score).FirstOrDefault();
        if (ready.Site is not null)
        {
            ctx.Wish(75, new SendArmyToSite(ready.Site.Id, ready.Army!, null, null));
            ctx.Stats.Count(ready.Site.Kind == SiteKind.Village ? "villageRaids" : "campAttacks");
            return;
        }
        int want = candidates.OrderByDescending(x => x.Score).First().Need;
        ctx.Memory.WantSoldiers = (int)Math.Ceiling(want / (1 - keep));
    }

    /// <summary>The soldiers to send: <paramref name="count"/> of what is spare, in the proportion it is spare.</summary>
    private static Dictionary<string, int> Take(Dictionary<string, int> spare, int count)
    {
        int total = spare.Values.Sum();
        var army = spare.ToDictionary(kv => kv.Key, kv => (int)Math.Floor(count * (double)kv.Value / total));
        int left = count - army.Values.Sum();
        foreach (var kv in spare.OrderByDescending(kv => count * (double)kv.Value / total - army[kv.Key]))
        {
            if (left <= 0) break;
            if (army[kv.Key] < kv.Value) { army[kv.Key]++; left--; }
        }
        return army.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    /// <summary>How many soldiers a camp takes (of the mix we have), and how many of them we expect to lose. Needed 0: not possible or not safe.</summary>
    private static (int Needed, double Loss) PlanCamp(BotContext ctx, SiteView camp, Dictionary<string, int> spare)
    {
        var bandits = camp.Bandits.Where(b => b.Count > 0).ToList();
        if (bandits.Count == 0) return (0, 0);
        int soldiers = spare.Values.Sum();
        if (ctx.Memory.RaidPlans.TryGetValue(camp.Id, out var old) && ctx.Now - old.At < 25 && old.Soldiers == soldiers) return (old.Needed, old.Loss);

        double margin = ctx.Difficulty == BotDifficulty.Medium ? 1.15 : 0.85; // the picture of a camp is a little out of date
        var enemy = new ArmySetup("Haydutlar");
        foreach (var b in bandits) if (ctx.Rules.FindUnit(b.UnitId) is { } t) enemy.Add(t, (int)Math.Ceiling(b.Count * margin));

        (int, double) result;
        if (ctx.Difficulty == BotDifficulty.Medium)
        {
            // The smallest army (in the mix we have) that wins nearly always; searched by halving.
            int lo = 1, hi = soldiers;
            if (soldiers == 0 || Win(ctx, Mixed(ctx, spare, hi), enemy).Rate < 0.9) result = (0, 0);
            else
            {
                while (lo < hi)
                {
                    int mid = (lo + hi) / 2;
                    if (Win(ctx, Mixed(ctx, spare, mid), enemy).Rate >= 0.9) hi = mid; else lo = mid + 1;
                }
                var w = Win(ctx, Mixed(ctx, spare, lo), enemy);
                // Not worth a bloody win: lose at most half of what goes.
                result = w.Loss <= 0.5 * lo ? (lo, w.Loss) : (0, 0);
            }
        }
        else
        {
            // A rough head count: more soldiers than bandits seems enough.
            int enemies = enemy.TotalCount;
            result = soldiers >= enemies ? (enemies, enemies * 0.3) : (0, 0);
        }
        ctx.Memory.RaidPlans[camp.Id] = (ctx.Now, soldiers, result.Item1, result.Item2);
        return result;
    }

    private static ArmySetup Mixed(BotContext ctx, Dictionary<string, int> spare, int count)
    {
        var army = new ArmySetup("Ordu");
        foreach (var (id, n) in Take(spare, count)) if (ctx.Rules.FindUnit(id) is { } t) army.Add(t, n);
        return army;
    }

    private static (double Rate, double Loss) Win(BotContext ctx, ArmySetup mine, ArmySetup enemy)
    {
        int wins = 0;
        double lost = 0;
        for (int i = 0; i < Runs; i++)
        {
            var r = ctx.Simulator.Simulate(mine, enemy, ctx.Rng);
            if (r.Outcome != BattleOutcome.SideAWins) continue;
            wins++;
            lost += r.SideA.Initial - r.SideA.Survivors;
        }
        return (wins / (double)Runs, wins == 0 ? mine.TotalCount : lost / wins);
    }
}
