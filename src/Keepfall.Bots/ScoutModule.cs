using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;
using Keepfall.Views;

namespace Keepfall.Bots;

/// <summary>
/// The scouts: it tours its own quarter of the forest early (that is where its own chests, village and camp are),
/// picks up the chests it has found, spies on the rivals now and then (the reports are what it plans attacks and
/// defence by) and, if it is a good bot, tours the other quarters too. One scout at a time, two for a good bot.
/// </summary>
public sealed class ScoutModule : IBotModule
{
    public void Think(BotContext ctx)
    {
        var sc = ctx.Castle.Scouting;
        bool medium = ctx.Difficulty == BotDifficulty.Medium;
        if (sc.Missions.Count >= (medium ? 2 : 1)) return;
        if (ctx.Now < 15 || ctx.Slip()) return;
        if (ctx.Castle.Eliminated) return;
        if (ctx.ScoutSource() is not { } from) return;

        var own = sc.Quarters.FirstOrDefault(q => q.Seat == ctx.Seat);

        // 1. the own quarter, first thing.
        if (own is { Explored: false, Busy: false } && !sc.Missions.Any(m => m.Kind == MissionKind.Explore))
        {
            ctx.Wish(100, new SendExplore(own.Corner, from));
            return;
        }

        // 2. a chest that is known and not taken (nearest first).
        var chest = ctx.Sites.Where(s => s.Kind == SiteKind.Chest && !s.Gone && !ctx.SiteBusy(s.Id))
            .OrderBy(s => ctx.ArmyTravelSeconds(s.Position)).FirstOrDefault();
        if (chest is not null && (medium || chest.Quarter == own?.Corner))
        {
            ctx.Wish(80, new SendChestScout(chest.Id, from));
            ctx.Stats.Count("chestScouts");
            return;
        }

        // 3. spy on the rivals once the army is being built; the one we know least about first.
        double interval = ctx.AtWar ? (medium ? 70 : 300) : medium ? 150 : 400;
        double from_ = medium ? 0.35 : 0.6;
        if (ctx.AtWar || ctx.PrepProgress >= from_)
        {
            var target = sc.Targets.Where(t => !t.Busy && ctx.Rivals.Any(r => r.Seat == t.Seat))
                .Select(t => (Target: t, Age: ctx.LatestReport(t.Seat) is { } r ? ctx.Now - r.ObservedAt : double.MaxValue))
                .Where(x => x.Age > interval)
                .OrderByDescending(x => x.Age).ThenBy(x => x.Target.ScoutSeconds)
                .Select(x => x.Target).FirstOrDefault();
            if (target is not null)
            {
                ctx.Wish(70, new SendScout(CastleKeys.Of(target.Seat), from));
                ctx.Stats.Count("spies");
                return;
            }
        }

        // 4. the other quarters of the forest, nearest first (more places to raid).
        if (medium && own is { Explored: true } && ctx.Now >= 60 && !sc.Missions.Any(m => m.Kind == MissionKind.Explore))
        {
            var quarter = sc.Quarters.Where(q => q.Seat != ctx.Seat && !q.Explored && !q.Busy).OrderBy(q => q.Seconds).FirstOrDefault();
            if (quarter is not null) ctx.Wish(50, new SendExplore(quarter.Corner, from));
        }
    }
}
