using Keepfall.Core.Combat;

namespace Keepfall.Bots;

/// <summary>What the bot works out about a rival's soldiers from what it has seen: a scout report (approximate) or a battle at the gate (exact).</summary>
/// <param name="Units">Soldiers by unit id, as seen at <paramref name="At"/>.</param>
public sealed record RivalEstimate(IReadOnlyDictionary<string, int> Units, double At, bool Exact)
{
    public int Total => Units.Values.Sum();
}

/// <summary>Working out fights: which of our soldiers to send, and whether they win. The calculator is the game's own rules, played on armies made up on the spot.</summary>
public static class Tactics
{
    public const int Runs = 12;

    /// <summary><paramref name="count"/> soldiers out of what is spare, in the proportion it is spare (never more of a type than there is).</summary>
    public static Dictionary<string, int> Take(IReadOnlyDictionary<string, int> spare, int count)
    {
        int total = spare.Values.Sum();
        if (total == 0 || count <= 0) return [];
        count = Math.Min(count, total);
        var army = spare.ToDictionary(kv => kv.Key, kv => (int)Math.Floor(count * (double)kv.Value / total));
        int left = count - army.Values.Sum();
        foreach (var kv in spare.OrderByDescending(kv => count * (double)kv.Value / total - army[kv.Key]))
        {
            if (left <= 0) break;
            if (army[kv.Key] < kv.Value) { army[kv.Key]++; left--; }
        }
        return army.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    /// <summary>
    /// A castle falls only to an army that has something besides raiders (cavalry) left: if the picked army is all raiders, one of
    /// them is swapped for a soldier of another kind from the spare ones.
    /// </summary>
    public static Dictionary<string, int> WithBreaker(BotContext ctx, IReadOnlyDictionary<string, int> spare, Dictionary<string, int> army)
    {
        bool Raider(string id) => ctx.Rules.FindUnit(id)?.Raider == true;
        if (army.Count == 0 || army.Keys.Any(id => !Raider(id))) return army;
        var other = spare.Where(kv => kv.Value > 0 && !Raider(kv.Key)).Select(kv => kv.Key).FirstOrDefault();
        if (other is null) return army;
        var biggest = army.OrderByDescending(kv => kv.Value).First().Key;
        if (army[biggest] > 1) army[biggest]--; else army.Remove(biggest);
        army[other] = army.GetValueOrDefault(other) + 1;
        return army;
    }

    /// <summary>An army of nothing but raiders (cavalry): it burns fields, it does not take a castle.</summary>
    public static bool IsRaid(BotContext ctx, Keepfall.Views.ArmyView army) =>
        army.Units.Any(u => u.Count > 0) && army.Units.Where(u => u.Count > 0).All(u => ctx.Rules.FindUnit(u.UnitId)?.Raider == true);

    public static ArmySetup Setup(BotContext ctx, string name, IReadOnlyDictionary<string, int> units)
    {
        var army = new ArmySetup(name);
        foreach (var (id, n) in units) if (n > 0 && ctx.Rules.FindUnit(id) is { } t) army.Add(t, n);
        return army;
    }

    /// <summary>The share of fights <paramref name="mine"/> wins against <paramref name="enemy"/>, and how many of ours die in the ones it wins.</summary>
    public static (double Rate, double Loss) Win(BotContext ctx, ArmySetup mine, ArmySetup enemy)
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

    /// <summary>
    /// The smallest army (in the mix we have to spare) that beats <paramref name="enemy"/> in at least <paramref name="rate"/> of the fights,
    /// found by halving. Needed 0: even all of it does not.
    /// </summary>
    public static (int Needed, double Loss) SmallestWinning(BotContext ctx, IReadOnlyDictionary<string, int> spare, ArmySetup enemy, double rate)
    {
        int total = spare.Values.Sum();
        if (total == 0 || Win(ctx, Setup(ctx, "Ordu", Take(spare, total)), enemy).Rate < rate) return (0, 0);
        int lo = 1, hi = total;
        while (lo < hi)
        {
            int mid = (lo + hi) / 2;
            if (Win(ctx, Setup(ctx, "Ordu", Take(spare, mid)), enemy).Rate >= rate) hi = mid; else lo = mid + 1;
        }
        return (lo, Win(ctx, Setup(ctx, "Ordu", Take(spare, lo)), enemy).Loss);
    }
}
