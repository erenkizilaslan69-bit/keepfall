using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Bots;

/// <summary>
/// An army is coming (the warning names who, nothing else). After its reaction time the bot arms the weapons in the store, sets
/// its soldiers up (archers behind the front, firing at the kind of soldier the rival is strongest in), and if the rival looks stronger
/// than what is at home it also hires mercenaries (see <see cref="MercenaryModule"/>), calls raiding armies home and, when it is clearly
/// stronger, goes out to cut the rival off on the road. A poor bot only arms and lines up.
/// </summary>
public sealed class DefenseModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        var threats = ctx.Memory.Threats(ctx.Now).ToList();
        if (threats.Count == 0 || ctx.Castle.Eliminated || ctx.Slip()) return;
        var c = ctx.Castle;
        bool medium = ctx.Level.SmartDefense;
        ctx.Stats.Count("defenceThinks");

        // The strongest of the armies coming, as far as we can tell (nothing known: assume as many as we have at home).
        // What is walking at us in plain sight counts for more than an old scout report: its soldiers are on the map.
        var estimates = threats.Select(t => (Threat: t, Estimate: WithSeen(ctx, t.Seat, ctx.EstimateOf(t.Seat)))).ToList();
        var rival = estimates.OrderByDescending(x => x.Estimate?.Total ?? 0).First();
        var theirs = rival.Estimate is { } known
            ? Tactics.Setup(ctx, "Rival", Scale(known.Units, medium ? 1.2 : 1.0))
            : Tactics.Setup(ctx, "Rival", c.Units.Where(u => u.Soldiers > 0).ToDictionary(u => u.Id, u => u.Soldiers));

        // 1. The weapons in the store become soldiers now; people leave their jobs for it if nobody is idle.
        int idle = ctx.Count(Job.Idle);
        int stock = c.Units.Sum(u => u.Weapons);
        int pull = Math.Max(0, stock - idle);
        if (pull > 0)
        {
            var from = Jobs.Working.Where(j => j != Job.Farmer).OrderByDescending(ctx.Count).FirstOrDefault();
            int n = Math.Min(pull, ctx.Count(from));
            if (n > 0) ctx.Wish(112, new MoveWorkers(from, Job.Idle, n));
            idle += n;
        }
        foreach (var u in c.Units.Where(u => u.Weapons > 0))
        {
            int n = Math.Min(u.Weapons, idle);
            if (n <= 0) continue;
            ctx.Wish(110, new ArmWorkers(u.Id, n, Job.Idle));
            idle -= n;
        }

        // 2. How the soldiers at home line up when the gate is attacked: archers behind, firing at the rival's best type.
        string? priority = rival.Estimate is { } e ? e.Units.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).FirstOrDefault() : null;
        ctx.Wish(100, new SetDefense(null, medium ? priority : null));
        if (!medium) return;

        // 3. Is what is at home enough? If not, bring the raiders back (hiring is the mercenary module's job, which sees the threat too).
        var home = c.Units.ToDictionary(u => u.Id, u => u.Soldiers + u.Weapons);
        var mine = Tactics.Setup(ctx, "Biz", home);
        mine.RangedDamageFactor = ctx.WallArcherFactor; // our archers shoot from behind the wall
        ctx.AddGuards(mine, c.Guards);
        bool enough = mine.TotalCount > 0 && Tactics.Win(ctx, mine, theirs).Rate >= 0.8;
        if (!enough)
        {
            foreach (var army in c.War.Armies.Where(a => !a.Fighting && a.State == ArmyState.Marching && a.SiteId is not null))
                ctx.Wish(108, new RecallArmy(army.Id));
            return;
        }

        // 4. Clearly stronger: meet them on the road with just enough, keeping the rest at home.
        double arrives = rival.Threat.Value - ctx.Now;
        if (arrives < 8 || rival.Estimate is null || c.War.Armies.Any(a => a.Mode == ArmyMode.Intercept)) return;
        var (needed, _) = Tactics.SmallestWinning(ctx, home.ToDictionary(kv => kv.Key, kv => ctx.HomeSoldiers(kv.Key)), theirs, 0.9);
        int send = (int)Math.Ceiling(needed * 1.2);
        if (needed > 0 && send <= 0.7 * c.Soldiers)
        {
            var units = Tactics.Take(c.Units.ToDictionary(u => u.Id, u => ctx.HomeSoldiers(u.Id)), send);
            ctx.Wish(104, new SendArmy(CastleKeys.Of(rival.Threat.Seat), units, null, null, ArmyMode.Intercept));
            ctx.Commit(units);
            ctx.Stats.Count("intercepts");
        }
    }

    /// <summary>The estimate of a rival, raised to the army of theirs that is in view right now when that is bigger (what the bot sees, nothing more).</summary>
    private static RivalEstimate? WithSeen(BotContext ctx, int seat, RivalEstimate? known)
    {
        var seen = new Dictionary<string, int>();
        foreach (var m in (ctx.Map?.Seen ?? []).Where(m => m.Kind == Keepfall.Core.World.MoverKind.Army && m.OwnerSeat == seat))
            foreach (var u in m.Units) seen[u.UnitId] = seen.GetValueOrDefault(u.UnitId) + u.Count;
        int total = seen.Values.Sum();
        if (total == 0 || (known is not null && known.Total >= total)) return known;
        return new RivalEstimate(seen, ctx.Now, false);
    }

    private static Dictionary<string, int> Scale(IReadOnlyDictionary<string, int> units, double factor) =>
        units.ToDictionary(kv => kv.Key, kv => (int)Math.Ceiling(kv.Value * factor));
}
