using Keepfall.Core.Combat;
using Keepfall.Core.Config;
using Keepfall.Core.Units;

namespace Keepfall.Core.Tests;

/// <summary>The battle record a client replays must tell exactly the story the simulator computed.</summary>
public class BattleRecordTests
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

    private static BattleResult Fight(int seed, bool record = true) =>
        new BattleSimulator(Rules).Simulate(
            Army("A", ("kilicli", 6), ("okcu", 4), ("mizrakci", 2)),
            Army("B", ("kalkanli", 4), ("okcu", 3), ("kilicli", 4)),
            new Random(seed), recordBattle: record);

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public void The_record_matches_the_result(int seed)
    {
        var result = Fight(seed);
        var r = result.Record!;
        Assert.Equal(12 + 11, r.Soldiers.Count);
        Assert.Equal(Enumerable.Range(0, r.Soldiers.Count), r.Soldiers.Select(s => s.Index));
        Assert.All(r.Soldiers.Take(12), s => Assert.Equal(0, s.Side));
        Assert.All(r.Soldiers.Skip(12), s => Assert.Equal(1, s.Side));
        Assert.Equal(result.DurationSeconds, r.Ticks * r.TickSeconds, 9);

        // Everyone who fell is in the deaths list exactly once.
        var dead = Enumerable.Range(0, r.Deaths.Count / 2).Select(i => r.Deaths[i * 2 + 1]).ToList();
        Assert.Equal(dead.Count, dead.Distinct().Count());
        Assert.Equal(result.SideA.Initial - result.SideA.Survivors, dead.Count(i => r.Soldiers[i].Side == 0));
        Assert.Equal(result.SideB.Initial - result.SideB.Survivors, dead.Count(i => r.Soldiers[i].Side == 1));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(4)]
    public void Hits_add_up_to_the_damage_and_nobody_acts_after_falling(int seed)
    {
        var result = Fight(seed);
        var r = result.Record!;
        var diedAt = new Dictionary<int, int>();
        for (int i = 0; i < r.Deaths.Count; i += 2) diedAt[r.Deaths[i + 1]] = r.Deaths[i];

        var dealt = new double[2];
        for (int i = 0; i < r.Hits.Count; i += 3)
        {
            int tick = r.Hits[i], a = r.Hits[i + 1], b = r.Hits[i + 2];
            var attacker = r.Soldiers[a];
            var target = r.Soldiers[b];
            Assert.NotEqual(attacker.Side, target.Side);
            // Hits in a tick land together: a soldier may still strike in the tick it falls, never later.
            if (diedAt.TryGetValue(a, out int da)) Assert.True(tick <= da, $"{a} hit at {tick} after falling at {da}");
            if (diedAt.TryGetValue(b, out int db)) Assert.True(tick <= db, $"{b} hit at {tick} after falling at {db}");
            dealt[attacker.Side] += attacker.Type.Damage * Rules.Counters.Get(attacker.Type, target.Type);
        }
        Assert.Equal(result.SideA.ByType.Sum(t => t.DamageDealt), dealt[0], 6);
        Assert.Equal(result.SideB.ByType.Sum(t => t.DamageDealt), dealt[1], 6);
    }

    [Fact]
    public void Melee_only_strikes_after_the_approach_and_reserves_advance_when_the_front_falls()
    {
        var setup = Army("A", ("okcu", 3), ("kilicli", 2));
        setup.PlaceIn(Rules.FindUnit("kilicli")!, Row.Back); // swordsmen held back as reserves
        var r = new BattleSimulator(Rules).Simulate(setup, Army("B", ("kilicli", 2)), new Random(5), recordBattle: true).Record!;
        int approach = (int)Math.Round(Rules.Combat.ApproachTime / r.TickSeconds);
        for (int i = 0; i < r.Hits.Count; i += 3)
            if (r.Soldiers[r.Hits[i + 1]].Type.Range == AttackRange.Melee)
                Assert.True(r.Hits[i] >= approach - 1, $"melee hit at tick {r.Hits[i]}");
        // A's front (archers) is not melee, so its swordsmen are reserves only until the archers are gone.
        Assert.All(Enumerable.Range(0, r.Advances.Count / 2).Select(i => r.Soldiers[r.Advances[i * 2 + 1]]),
            s => Assert.Equal("kilicli", s.Type.Id));
    }

    [Fact]
    public void Recording_does_not_change_the_battle()
    {
        for (int seed = 0; seed < 10; seed++)
        {
            var with = Fight(seed);
            var without = Fight(seed, record: false);
            Assert.Null(without.Record);
            Assert.Equal((with.Outcome, with.DurationSeconds, with.SideA.Survivors, with.SideB.Survivors),
                (without.Outcome, without.DurationSeconds, without.SideA.Survivors, without.SideB.Survivors));
        }
    }

    [Fact]
    public void A_mid_sized_battle_record_is_small()
    {
        var r = new BattleSimulator(Rules).Simulate(
            Army("A", ("kilicli", 30), ("okcu", 20), ("kalkanli", 10)),
            Army("B", ("kalkanli", 20), ("okcu", 20), ("mizrakci", 20)),
            new Random(1), recordBattle: true).Record!;
        // Three ints per hit; a 60-against-60 battle stays in the low thousands of hits.
        Assert.InRange(r.HitCount, 300, 5000);
    }
}
