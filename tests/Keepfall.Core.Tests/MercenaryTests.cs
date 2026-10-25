using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Gold and hired soldiers: instant, extra to the workers, counted and fed, never workers again.</summary>
public class MercenaryTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;
    private static readonly UnitType Archer = Rules.FindUnit("okcu")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static Castle Rich(double gold)
    {
        var castle = new Castle(Rules);
        castle.Execute(new SetGrowth(false));
        castle.AddGold(gold);
        return castle;
    }

    [Fact]
    public void Prices_come_from_the_config_and_every_unit_has_one()
    {
        Assert.Equal(new[] { "kalkanli", "kilicli", "mizrakci", "okcu" }, Rules.MercenaryPrices.Keys.Order());
        Assert.All(Rules.MercenaryPrices.Values, p => Assert.True(p > 0));
        Assert.Equal(29, Rules.MercenaryPrices["kilicli"]);
    }

    [Fact]
    public void Hiring_costs_gold_and_gives_soldiers_at_once_on_top_of_the_workers()
    {
        var castle = Rich(100);
        int workers = castle.WorkerCount, population = castle.Population;
        Ok(castle.Execute(new HireMercenary("kilicli", 3)));

        Assert.Equal(100 - 3 * Rules.MercenaryPrices["kilicli"], castle.Gold);
        Assert.Equal(3, castle.Soldiers[Sword]);
        Assert.Equal(3, castle.Mercenaries[Sword]);
        Assert.Equal(workers, castle.WorkerCount); // nobody was taken from the workers
        Assert.Equal(population + 3, castle.Population);
        Assert.Equal((3, 3.0 * Rules.MercenaryPrices["kilicli"], 3), (castle.Stats.MercenariesHired, castle.Stats.GoldSpent, castle.Soldiers[Sword]));
    }

    [Fact]
    public void Hired_soldiers_eat_like_soldiers()
    {
        var castle = Rich(100);
        double before = castle.FoodConsumptionPerMinute;
        Ok(castle.Execute(new HireMercenary("okcu", 2)));
        Assert.Equal(before + 2 * Rules.Economy.SoldierFoodPerMinute, castle.FoodConsumptionPerMinute, 9);
    }

    [Fact]
    public void Hiring_needs_the_gold_and_a_known_unit()
    {
        var castle = Rich(30);
        Assert.False(castle.Execute(new HireMercenary("kilicli", 2)).Ok); // 58 > 30
        Assert.False(castle.Execute(new HireMercenary("kilicli", 0)).Ok);
        Assert.False(castle.Execute(new HireMercenary("ejderha", 1)).Ok);
        Assert.Equal(30, castle.Gold);
        Assert.Equal(0, castle.SoldierCount);
    }

    [Fact]
    public void Hired_soldiers_cannot_become_workers_but_the_rest_still_can()
    {
        var castle = Rich(100);
        castle.AddSoldiers(Sword, 2); // trained the normal way
        Ok(castle.Execute(new HireMercenary("kilicli", 2)));
        Assert.Equal(2, castle.Disarmable(Sword));

        Assert.False(castle.Execute(new DisarmSoldiers("kilicli", 3)).Ok);
        Ok(castle.Execute(new DisarmSoldiers("kilicli", 2)));
        Assert.Equal((2, 2), (castle.Soldiers[Sword], castle.Mercenaries[Sword]));
        Assert.False(castle.Execute(new DisarmSoldiers("kilicli", 1)).Ok);
    }

    [Fact]
    public void Gold_is_part_of_the_summary_stats()
    {
        var castle = Rich(60);
        Ok(castle.Execute(new HireMercenary("okcu", 1)));
        Assert.Equal((60.0, (double)Rules.MercenaryPrices["okcu"], 1), (castle.Stats.GoldGained, castle.Stats.GoldSpent, castle.Stats.MercenariesHired));
    }

    [Fact]
    public void Hired_soldiers_die_with_the_rest_and_free_the_count()
    {
        var keys = new[] { "o1", "o2" };
        var game = new GameState(Rules, keys, 1, 600, new Random(1),
            new Dictionary<string, Corner> { ["o1"] = Corner.NorthWest, ["o2"] = Corner.NorthEast });
        foreach (var k in keys) Ok(game.Execute(k, new SetGrowth(false)));
        game.Tick(1);
        var a = game.CastleOf("o1")!;
        a.AddGold(500);
        Ok(game.Execute("o1", new HireMercenary("kilicli", 4)));
        game.CastleOf("o2")!.AddSoldiers(Sword, 12);
        Ok(game.Execute("o1", new SendArmy("o2", new Dictionary<string, int> { ["kilicli"] = 4 })));
        while (game.ArmiesOf("o1").Count > 0) game.Tick(1);

        Assert.Equal(0, a.Soldiers[Sword]); // the four were wiped out by twelve
        Assert.Equal(0, a.Mercenaries[Sword]); // so no ghost "hired" count stays behind
    }
}
