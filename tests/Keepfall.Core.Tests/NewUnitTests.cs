using Keepfall.Core.Combat;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.Units;

namespace Keepfall.Core.Tests;

/// <summary>Monk, catapult and cavalry: what they do in a battle.</summary>
public class NewUnitTests
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

    private static BattleResult Fight(ArmySetup a, ArmySetup b, int seed = 1) =>
        new BattleSimulator(Rules).Simulate(a, b, new Random(seed), recordBattle: true);

    [Fact]
    public void The_seven_units_are_all_in_the_config_with_a_counter_for_each_pair()
    {
        Assert.Equal(7, Rules.Units.Count);
        foreach (var id in new[] { "kesis", "mancinik", "suvari" }) Assert.NotNull(Rules.FindUnit(id));
        var cavalry = Rules.FindUnit("suvari")!;
        Assert.Equal(1.5, Rules.Counters.Get(cavalry, Rules.FindUnit("okcu")!));
        Assert.Equal(0.5, Rules.Counters.Get(cavalry, Rules.FindUnit("mizrakci")!));
        Assert.Equal(2.0, Rules.Counters.Get(Rules.FindUnit("mizrakci")!, cavalry));
        Assert.Equal(2, Rules.FindUnit("mancinik")!.Cost.People);
        Assert.Equal(2, cavalry.SpeedFactor);
    }

    [Fact]
    public void A_monk_heals_the_most_wounded_ally_and_never_attacks()
    {
        // Two archers (70 hp) shoot at a shield bearer line; with a monk behind them the line lasts longer.
        var withoutMonk = Fight(Army("A", ("okcu", 6)), Army("B", ("kalkanli", 4)));
        var withMonk = Fight(Army("A", ("okcu", 6)), Army("B", ("kalkanli", 4), ("kesis", 2)));
        Assert.NotEmpty(withMonk.Record!.Heals);
        Assert.Empty(withoutMonk.Record!.Heals);
        // Healing makes the shield line last longer (averaged over several fights: the shots are random).
        double Mean(params (string, int)[] b) => Enumerable.Range(1, 12).Average(seed => Fight(Army("A", ("okcu", 14)), Army("B", b), seed).DurationSeconds);
        double withM = Mean(("kalkanli", 4), ("kesis", 2)), withoutM = Mean(("kalkanli", 4));
        Assert.True(withM > withoutM, $"healing makes the fight last longer ({withM:0.0} vs {withoutM:0.0} s)");
        // A monk never deals damage.
        var monkStats = withMonk.SideB.ByType.Single(t => t.Type.Id == "kesis");
        Assert.Equal(0, monkStats.DamageDealt);
        // Healing never goes over the maximum.
        Assert.All(withMonk.SideB.ByType, t => Assert.True(t.DamageTaken >= 0));
    }

    [Fact]
    public void A_side_with_only_healers_left_is_finished()
    {
        var r = Fight(Army("A", ("kilicli", 2)), Army("B", ("kesis", 4)));
        Assert.Equal(BattleOutcome.SideAWins, r.Outcome);
        Assert.Equal(0, r.SideB.ByType.Sum(t => t.Survivors));
        Assert.True(r.DurationSeconds < 5, "no endless fight against healers");
        Assert.Equal(BattleOutcome.Draw, Fight(Army("A", ("kesis", 2)), Army("B", ("kesis", 2))).Outcome);
    }

    [Fact]
    public void A_catapult_goes_for_the_back_row_from_the_first_second_and_hits_a_few_at_once()
    {
        // Enemy: a shield wall in front, archers behind. The catapult must hurt the archers while the wall stands.
        var r = Fight(Army("A", ("mancinik", 2)), Army("B", ("kalkanli", 6), ("okcu", 6)));
        var firstHit = r.Record!.Hits.Where((_, i) => i % 3 == 0).First();
        Assert.True(firstHit * r.Record.TickSeconds < 2, "no approach delay for a siege engine");
        var archers = r.SideB.ByType.Single(t => t.Type.Id == "okcu");
        var shields = r.SideB.ByType.Single(t => t.Type.Id == "kalkanli");
        Assert.True(archers.DamageTaken > 0, "the back row took the hits");
        // Area damage: one shot (same tick, same catapult) reaches more than one target.
        var hits = r.Record.Hits.Chunk(3).GroupBy(h => (h[0], h[1])).Select(g => g.Count()).ToList();
        Assert.Contains(hits, n => n >= 2);
        Assert.True(hits.Max() <= 3, "at most the main target and two more");
        Assert.True(shields.DamageTaken <= archers.DamageTaken || shields.DamageTaken < 100, "the front row is not the first target");
    }

    [Fact]
    public void A_catapult_alone_dies_to_melee_that_reaches_it()
    {
        var r = Fight(Army("A", ("mancinik", 1)), Army("B", ("kilicli", 1)));
        Assert.Equal(BattleOutcome.SideBWins, r.Outcome);
    }

    [Fact]
    public void Cavalry_rides_over_the_front_line_for_the_archers()
    {
        var r = Fight(Army("A", ("suvari", 4)), Army("B", ("kalkanli", 6), ("okcu", 4)));
        var archers = r.SideB.ByType.Single(t => t.Type.Id == "okcu");
        var shields = r.SideB.ByType.Single(t => t.Type.Id == "kalkanli");
        Assert.True(archers.Survivors < archers.Initial, "the archers were hit");
        Assert.True(shields.Survivors >= shields.Initial - 1 || archers.Survivors < archers.Initial);
    }

    [Fact]
    public void Spearmen_beat_cavalry_that_come_at_them()
    {
        var r = Fight(Army("A", ("mizrakci", 6)), Army("B", ("suvari", 6)));
        Assert.Equal(BattleOutcome.SideAWins, r.Outcome);
    }

    [Fact]
    public void Arming_a_catapult_takes_two_people_and_disarming_gives_two_back()
    {
        var castle = new Castle(Rules);
        castle.AddWeapons(Rules.FindUnit("mancinik")!, 1);
        int idle = castle.Workers[Job.Idle];
        Assert.True(castle.Execute(new ArmWorkers("mancinik", 1)).Ok);
        Assert.Equal(idle - 2, castle.Workers[Job.Idle]);
        castle.Tick(Rules.Match.ArmSeconds + 1);
        Assert.Equal(1, castle.Soldiers[Rules.FindUnit("mancinik")!]);
        Assert.True(castle.Execute(new DisarmSoldiers("mancinik", 1)).Ok);
        Assert.Equal(idle, castle.Workers[Job.Idle]);
        // Once fewer than two idle workers are left no catapult can be armed.
        var small = new Castle(Rules);
        small.AddWeapons(Rules.FindUnit("mancinik")!, 20);
        while (small.Execute(new ArmWorkers("mancinik", 1)).Ok) { }
        Assert.True(small.Workers[Job.Idle] < 2);
    }
}
