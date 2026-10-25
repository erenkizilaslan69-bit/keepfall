using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>Puts idle people to work (food, wood and iron in a fixed ratio, never past a building's room).</summary>
public sealed class EconomyModule : IBotModule
{
    private static readonly (Job Job, double Share)[] Shares =
        [(Job.Farmer, 0.40), (Job.Lumberjack, 0.30), (Job.Miner, 0.30)];

    public void Think(BotContext ctx)
    {
        var jobs = ctx.Castle.Jobs;
        int idle = jobs.First(j => j.Job == Job.Idle).Count;
        if (idle <= 0) return;

        var now = Shares.ToDictionary(s => s.Job, s => jobs.First(j => j.Job == s.Job).Count);
        var room = Shares.ToDictionary(s => s.Job, s => jobs.First(j => j.Job == s.Job).Capacity);
        var added = Shares.ToDictionary(s => s.Job, _ => 0);
        int working = now.Values.Sum();

        for (int n = 0; n < idle; n++)
        {
            // The job furthest below its share that still has room.
            var pick = Shares
                .Where(s => room[s.Job] is not { } cap || now[s.Job] + added[s.Job] < cap)
                .OrderBy(s => (now[s.Job] + added[s.Job]) / Math.Max(1.0, (working + n + 1) * s.Share))
                .Select(s => s.Job)
                .Cast<Job?>()
                .FirstOrDefault();
            if (pick is not { } job) break;
            added[job]++;
        }
        foreach (var (job, count) in added)
            if (count > 0) ctx.Wish(100, new MoveWorkers(Job.Idle, job, count));
    }
}
