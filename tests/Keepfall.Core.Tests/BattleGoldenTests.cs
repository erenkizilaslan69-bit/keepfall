using Keepfall.Core.Combat;
using Keepfall.Core.Config;

namespace Keepfall.Core.Tests;

/// <summary>
/// The classic two-sided battle must come out draw for draw as it did before the simulator learned to fight with more sides:
/// every earlier bot and deck measurement depends on it. The fingerprints were taken from the two-sided simulator.
/// </summary>
public class BattleGoldenTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static ArmySetup Army(string name, params (string Id, int Count)[] units)
    {
        var setup = new ArmySetup(name);
        foreach (var (id, n) in units) setup.Add(Rules.FindUnit(id)!, n);
        return setup;
    }

    internal static long Fingerprint(BattleResult r)
    {
        long h = 1469598103934665603;
        void Mix(long v) { h = unchecked((h ^ v) * 1099511628211); }
        var rec = r.Record!;
        Mix(rec.Ticks);
        foreach (var x in rec.Hits) Mix(x);
        Mix(-1);
        foreach (var x in rec.Deaths) Mix(x);
        Mix(-2);
        foreach (var x in rec.Advances) Mix(x);
        Mix(-3);
        foreach (var x in rec.Heals) Mix(x);
        Mix((int)r.Outcome);
        return h;
    }

    private static BattleResult Run(int seed) => new BattleSimulator(Rules).Simulate(
        Army("A", ("kilicli", 8), ("okcu", 5), ("mizrakci", 3), ("kesis", 2)),
        Army("B", ("kalkanli", 6), ("okcu", 4), ("kilicli", 5), ("mancinik", 2)),
        new Random(seed), recordBattle: true);

    private static BattleResult RunRiders(int seed) => new BattleSimulator(Rules).Simulate(
        Army("A", ("suvari", 6), ("mizrakci", 4), ("okcu", 4)),
        Army("B", ("kalkanli", 5), ("okcu", 5), ("kesis", 2), ("mancinik", 1)),
        new Random(seed), recordBattle: true);

    [Fact]
    public void Two_sided_battles_keep_their_fingerprints()
    {
        var got = new List<long>();
        for (int seed = 1; seed <= 4; seed++) got.Add(Fingerprint(Run(seed)));
        for (int seed = 1; seed <= 3; seed++) got.Add(Fingerprint(RunRiders(seed)));
        Assert.Equal(Expected, got);
    }

    private static readonly long[] Expected =
    [-259996819472990690L, 1984639999616461985L, -270785081718784438L, 5745169755049760376L, 6223575421073515818L, 5008001342535597670L, 3401224473973252744L];
}
