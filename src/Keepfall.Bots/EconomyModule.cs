using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// People and food: keeps growth on, and spreads the people over the farm, the lumber camp, the mine and the forge
/// by what the castle needs now (food first when it runs short, the forge once the army is being built), never past
/// a building's room. People kept back for weapons that are waiting to be armed are left alone.
/// </summary>
public sealed class EconomyModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        var c = ctx.Castle;
        if (!c.GrowthEnabled) ctx.Wish(95, new SetGrowth(true));

        var current = Jobs.All.ToDictionary(j => j, ctx.Count);
        int total = current.Values.Sum();
        if (total <= 0) return;

        // From the arming time on, people are kept back (idle) for the weapons that wait to be armed.
        int wanted = ctx.ArmingTime ? ctx.WeaponsWaiting : Math.Max(0, Math.Min(ctx.WeaponsWaiting, ctx.Memory.WantSoldiers - ctx.SoldiersTotal));
        int kept = Math.Min(wanted, total);
        var target = Targets(ctx, total - kept, current);
        target[Job.Idle] = total - target.Values.Sum();

        // Idle people go where the shortfall is biggest (a poor bot sometimes just picks a job); people stand idle only up to their target.
        var over = Jobs.All.Where(j => current[j] - target[j] > (j == Job.Idle ? 0 : ctx.Level.Slack))
            .OrderBy(j => j == Job.Idle ? 0 : 1).ThenByDescending(j => current[j] - target[j]).ToList();
        foreach (var from in over)
        {
            if (from != Job.Idle && ctx.Slip()) continue;
            var shortJobs = Jobs.All.Where(j => j != from && target[j] > current[j]).OrderByDescending(j => target[j] - current[j]).ToList();
            foreach (var to in shortJobs)
            {
                int n = Math.Min(current[from] - target[from], target[to] - current[to]);
                if (n <= 0) continue;
                var dest = from == Job.Idle && to != Job.Idle && ctx.Slip() ? PickAnyWithRoom(ctx, current) ?? to : to;
                ctx.Wish(from == Job.Idle ? 100 : 85, new MoveWorkers(from, dest, n));
                current[from] -= n;
                current[dest] += n;
            }
        }
    }

    private static Job? PickAnyWithRoom(BotContext ctx, Dictionary<Job, int> current) =>
        Jobs.Working.Where(j => ctx.Capacity(j) is not { } cap || current[j] < cap).OrderBy(_ => ctx.Rng.Next()).Cast<Job?>().FirstOrDefault();

    /// <summary>How many people each job should have: shares by need, filled in up to each building's room.</summary>
    private static Dictionary<Job, int> Targets(BotContext ctx, int people, Dictionary<Job, int> current)
    {
        var c = ctx.Castle;
        var res = c.Resources;
        double net = c.Rates.FoodIn - c.Rates.FoodOut;
        bool foodShort = c.Starving || (net < 0 && res.Food < c.Rates.FoodOut * 0.5);

        double food = foodShort ? 0.55 : net > c.Rates.FoodOut * 0.6 && res.Food > c.FoodReserve * 2 + c.NextPersonCost ? 0.25 : 0.34;
        double wood = 0.28, iron = 0.24;
        if (res.Wood < 15 && res.Iron >= 40) { wood += 0.08; iron -= 0.08; }
        else if (res.Iron < 10 && res.Wood >= 50) { iron += 0.08; wood -= 0.08; }
        // Wood and iron piling up unused: people are worth more feeding the castle (births are paid in food).
        if (res.Wood > 120) { wood = 0.08; if (!foodShort) food = Math.Max(food, 0.45); }
        if (res.Iron > 100) { iron = 0.08; if (!foodShort) food = Math.Max(food, 0.45); }
        // The forge is idle until there are weapons to forge; the army phase wants it busy while there is room for soldiers.
        double smith = ctx.ForgingTime ? (c.Queue.Count > 0 || ctx.ArmyRoom > 0 ? 0.22 : 0.04) : 0.0;

        var weight = new Dictionary<Job, double>
        {
            [Job.Farmer] = food, [Job.Lumberjack] = wood, [Job.Miner] = iron, [Job.Blacksmith] = smith,
        };
        var target = Jobs.Working.ToDictionary(j => j, _ => 0);
        var room = Jobs.Working.ToDictionary(j => j, j => ctx.Capacity(j) ?? int.MaxValue);
        var active = Jobs.Working.Where(j => weight[j] > 0 && room[j] > 0).ToList();
        int remaining = people;

        // Water-filling: hand out by weight, and whoever hits its room keeps just that and drops out.
        while (active.Count > 0 && remaining > 0)
        {
            double total = active.Sum(j => weight[j]);
            var capped = active.Where(j => remaining * weight[j] / total >= room[j] - target[j]).ToList();
            if (capped.Count == 0)
            {
                var shares = active.Select(j => (Job: j, Exact: remaining * weight[j] / total)).ToList();
                int given = 0;
                foreach (var s in shares) { target[s.Job] += (int)Math.Floor(s.Exact); given += (int)Math.Floor(s.Exact); }
                // The leftover people go to the biggest fractions.
                foreach (var s in shares.OrderByDescending(s => s.Exact - Math.Floor(s.Exact)).Take(remaining - given)) target[s.Job]++;
                remaining = 0;
                break;
            }
            foreach (var j in capped)
            {
                remaining -= room[j] - target[j];
                target[j] = room[j];
                active.Remove(j);
            }
        }
        // Enough farmers to feed everybody (and the next births), whatever the shares say: the other jobs give up people for it.
        int perFarmer = ctx.Count(Job.Farmer) > 0 ? (int)Math.Floor(c.Rates.FoodIn / ctx.Count(Job.Farmer) * 100) : 0;
        double perFarmerFood = perFarmer > 0 ? perFarmer / 100.0 : 8.0 * (c.Starving ? 0.5 : 1.0);
        int needed = Math.Min(room[Job.Farmer], (int)Math.Ceiling(c.Rates.FoodOut * 1.25 / Math.Max(1.0, perFarmerFood)));
        while (target[Job.Farmer] < needed)
        {
            var from = Jobs.Working.Where(j => j != Job.Farmer && target[j] > 0).OrderByDescending(j => target[j]).Cast<Job?>().FirstOrDefault();
            if (from is not { } give) break;
            target[give]--;
            target[Job.Farmer]++;
        }
        foreach (var j in Jobs.Working) target[j] = Math.Min(target[j], room[j]);
        return target;
    }
}
