using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>
/// Upgrades the four buildings (farm, lumber camp, mine, forge), one at a time. The one it picks is the one whose room
/// is full while people stand idle, then by what the castle needs; if it cannot pay yet it saves up for it (a good bot
/// keeps the wood and iron out of the forge meanwhile).
/// </summary>
public sealed class BuildModule : IBotModule
{
    private static readonly Dictionary<BuildingType, double> Need = new()
    {
        [BuildingType.Farm] = 3.0, [BuildingType.LumberCamp] = 2.5, [BuildingType.Mine] = 2.4, [BuildingType.Forge] = 1.5,
    };

    public void Think(BotContext ctx)
    {
        var buildings = ctx.Castle.Buildings;
        if (buildings.Any(b => b.UpgradeRemaining is not null)) return; // one at a time
        if (ctx.Slip()) return;

        int idle = ctx.Count(Job.Idle);
        bool army = ctx.ForgingTime;
        var res = ctx.Castle.Resources;
        int backlog = ctx.Castle.Queue.Sum(o => o.Remaining);
        var best = buildings
            .Where(b => b.NextUpgrade is not null)
            .Select(b =>
            {
                int workers = ctx.Count(b.Worker);
                bool full = b.Capacity > 0 && workers >= b.Capacity;
                double score = Need[b.Type] + (full && idle > 0 ? 5 : 0) - (workers == 0 ? 4 : 0);
                // The one whose product runs short; the forge only when weapons wait for it.
                if (b.Type == BuildingType.Mine && res.Iron < 25 && res.Wood > 60) score += 2.5;
                if (b.Type == BuildingType.LumberCamp && res.Wood < 25 && res.Iron > 60) score += 2.5;
                if (b.Type == BuildingType.Forge) score += army && backlog >= 3 ? 3.0 : -1.0;
                // Not worth it while the room is hardly used.
                if (!full && workers < b.Capacity * 0.75) score -= 6;
                return (Building: b, Score: score);
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .Cast<(BuildingView Building, double Score)?>()
            .FirstOrDefault();
        if (best is not { } pick) return;

        var cost = pick.Building.NextUpgrade!;
        if (cost.Wood <= res.Wood + 1e-9 && cost.Iron <= res.Iron + 1e-9)
            ctx.Wish(90, new UpgradeBuilding(pick.Building.Type), cost.Wood, cost.Iron);
        else if (ctx.Difficulty == Core.Lobby.BotDifficulty.Medium)
            ctx.Reserve(cost.Wood, cost.Iron); // saving up
    }
}
