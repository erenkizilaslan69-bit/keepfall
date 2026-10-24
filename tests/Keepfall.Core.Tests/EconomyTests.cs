using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;

namespace Keepfall.Core.Tests;

/// <summary>Economy rules against the numbers in config/balance.json (Excel v1).</summary>
public class EconomyTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static Castle NewCastle(bool growth = false)
    {
        var castle = new Castle(Rules);
        castle.Execute(new SetGrowth(growth));
        return castle;
    }

    private static void Run(Castle castle, double seconds)
    {
        for (int i = 0; i < seconds; i++) castle.Tick(1);
    }

    private static void Ok(CommandResult result) => Assert.True(result.Ok, result.Error);

    [Theory]
    [InlineData(10, 15)]
    [InlineData(12, 17)]
    [InlineData(16, 24)]
    [InlineData(20, 32)]
    [InlineData(30, 70)]
    [InlineData(40, 151)]
    public void New_person_cost_grows_8_percent_per_person(int population, double cost) =>
        Assert.Equal(cost, Rules.Economy.NewPersonCost(population));

    [Fact]
    public void Modes_split_into_preparation_and_war()
    {
        Assert.Equal((420, 480), (Rules.Match.ShortModePrepSeconds, Rules.Match.ShortModeWarSeconds));  // 7 + 8 min
        Assert.Equal((720, 1080), (Rules.Match.LongModePrepSeconds, Rules.Match.LongModeWarSeconds));   // 12 + 18 min
    }

    [Fact]
    public void Castle_starts_with_everyone_idle_and_the_starting_resources()
    {
        var castle = new Castle(Rules);
        Assert.Equal(12, castle.Workers[Job.Idle]);
        Assert.Equal(12, castle.Population);
        Assert.Equal((30.0, 40.0, 20.0), (castle.Food, castle.Wood, castle.Iron));
    }

    [Fact]
    public void Growth_adds_an_idle_person_and_pays_the_cost()
    {
        var castle = NewCastle(growth: true);
        castle.Tick(1);
        Assert.Equal(13, castle.Population);
        Assert.Equal(13, castle.Workers[Job.Idle]);
        Assert.Equal(1, castle.Stats.PeopleBorn);
        // 30 food − 12/60 eaten − 17 for the newcomer.
        Assert.Equal(30 - 12.0 / 60 - 17, castle.Food, 6);
    }

    [Fact]
    public void Growth_reserve_is_a_minute_of_consumption_by_default()
    {
        var castle = NewCastle();
        Assert.Equal(60, Rules.Economy.GrowthReserveSeconds);
        Assert.Equal(12, castle.GrowthReserve, 6); // 12 workers × 1 food/min × 1 min
        Assert.Equal(17 + 12, castle.GrowthThreshold, 6);
    }

    [Fact]
    public void Growth_waits_until_the_reserve_is_left_after_paying()
    {
        var castle = NewCastle(growth: true);
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 4))); // +32 −12..14 food/min
        castle.Tick(1); // 30 food covers 17 cost + 12 reserve: first birth
        Assert.Equal(13, castle.Population);

        // Next person: 19 food + 13 reserve. Track every tick: no birth while cost would eat into the reserve.
        int births = 0;
        for (int t = 0; t < 180; t++)
        {
            int before = castle.Population;
            double reserve = castle.GrowthReserve, cost = castle.NextPersonCost;
            double expectedFood = castle.Food + (castle.ProductionPerMinute(Resource.Food) - castle.FoodConsumptionPerMinute) / 60;
            castle.Tick(1);
            if (castle.Population > before)
            {
                births++;
                Assert.True(expectedFood - cost >= reserve - 1e-6, $"t={t}: {expectedFood:0.00} − {cost} < reserve {reserve:0.00}");
                Assert.True(castle.Food >= reserve - 1e-6);
            }
            else
            {
                Assert.True(expectedFood - cost < reserve + 1e-6, $"t={t}: could afford a birth with the reserve but none came");
            }
        }
        Assert.True(births >= 1);
        Assert.False(castle.Starving);
    }

    [Fact]
    public void Food_never_goes_negative_and_starvation_halves_production()
    {
        var castle = NewCastle();
        Run(castle, 180); // 12 people eat 12 food/min: 30 food lasts 2.5 minutes
        Assert.Equal(0, castle.Food);
        Assert.True(castle.Starving);

        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Lumberjack, 4)));
        double before = castle.Wood;
        Run(castle, 60);
        // 4 lumberjacks × 5 wood/min × 0.5 starvation.
        Assert.Equal(10, castle.Wood - before, 6);
        Assert.Equal(0, castle.Food);
    }

    [Fact]
    public void Starvation_ends_once_food_production_covers_consumption()
    {
        var castle = NewCastle();
        Run(castle, 180);
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 4)));
        castle.Tick(1); // 4 × 8 × 0.5 = 16/min in, 12/min out
        Assert.False(castle.Starving);
        Assert.True(castle.Food > 0);
    }

    [Fact]
    public void Soldiers_eat_more_than_workers()
    {
        var castle = NewCastle();
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Blacksmith, 1)));
        Ok(castle.Execute(new QueueWeapon("okcu", 2)));
        Run(castle, 50); // 2 bows at 25 s each
        Assert.Equal(2, castle.Weapons[Rules.FindUnit("okcu")!]);
        Assert.Equal(12, castle.FoodConsumptionPerMinute);

        Ok(castle.Execute(new ArmWorkers("okcu", 2)));
        Assert.Equal(10 * 1 + 2 * 1.5, castle.FoodConsumptionPerMinute);
    }

    [Fact]
    public void Building_capacity_limits_workers_until_upgraded()
    {
        var castle = NewCastle();
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 4)));
        Assert.False(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 1)).Ok);

        // Level 2 costs 20 wood + 10 iron and takes 30 s; we start with 40 wood and 20 iron.
        Ok(castle.Execute(new UpgradeBuilding(BuildingType.Farm)));
        Assert.Equal((20.0, 10.0), (castle.Wood, castle.Iron));
        Assert.True(castle.Building(BuildingType.Farm).IsUpgrading);

        Run(castle, 29);
        Assert.Equal(4, castle.Capacity(BuildingType.Farm)); // still level 1 while upgrading
        castle.Tick(1);
        Assert.Equal(2, castle.Building(BuildingType.Farm).Level);
        Assert.Equal(6, castle.Capacity(BuildingType.Farm));
        Assert.Equal(1.5, castle.Multiplier(BuildingType.Farm));
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 2)));
        Assert.Equal(6 * 8 * 1.5, castle.ProductionPerMinute(Resource.Food));

        // Level 3 costs 40 wood + 25 iron: not affordable with what is left.
        Assert.False(castle.Execute(new UpgradeBuilding(BuildingType.Farm)).Ok);
        Assert.Equal((40.0, 25.0, 60.0), (Rules.Economy.Level(3).UpgradeWood, Rules.Economy.Level(3).UpgradeIron, Rules.Economy.Level(3).UpgradeSeconds));
    }

    [Fact]
    public void Upgrade_gain_is_the_extra_output_of_todays_workers()
    {
        var castle = NewCastle();
        Assert.Equal(0, castle.UpgradeGain(BuildingType.Farm)); // nobody works there yet

        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 4)));
        Assert.Equal(4 * 8 * 0.5, castle.UpgradeGain(BuildingType.Farm)); // ×1 → ×1.5: +16 food/min
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Miner, 2)));
        Assert.Equal(2 * 4 * 0.5, castle.UpgradeGain(BuildingType.Mine)); // +4 iron/min
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Blacksmith, 2)));
        Assert.Equal(2 * 0.5, castle.UpgradeGain(BuildingType.Forge)); // forge speed 2 → 3

        // The gain ignores starvation: it is what the building adds when people are fed.
        Ok(castle.Execute(new UpgradeBuilding(BuildingType.Farm)));
        Run(castle, 30);
        Assert.Equal(2, castle.Building(BuildingType.Farm).Level);
        Assert.Equal(4 * 8 * 0.5, castle.UpgradeGain(BuildingType.Farm)); // ×1.5 → ×2

        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Lumberjack, 2)));
        Run(castle, 120); // gather enough for level 3
        Ok(castle.Execute(new UpgradeBuilding(BuildingType.Farm)));
        Run(castle, 60);
        Assert.Null(castle.UpgradeGain(BuildingType.Farm)); // max level
    }

    [Fact]
    public void Weapon_queue_charges_up_front_and_refunds_on_cancel()
    {
        var castle = NewCastle();
        Ok(castle.Execute(new QueueWeapon("okcu", 2))); // 1 iron + 4 wood each
        Assert.Equal((32.0, 18.0), (castle.Wood, castle.Iron));
        Assert.False(castle.Execute(new QueueWeapon("kilicli", 7)).Ok); // 21 iron needed, 18 left

        Ok(castle.Execute(new CancelWeapon(0)));
        Assert.Equal((40.0, 20.0), (castle.Wood, castle.Iron));
        Assert.Empty(castle.Queue);
    }

    [Fact]
    public void Forge_speed_scales_with_blacksmiths_and_stops_without_them()
    {
        var castle = NewCastle();
        Ok(castle.Execute(new QueueWeapon("mizrakci", 2))); // 20 s each
        Run(castle, 30);
        Assert.Equal(0, castle.Stats.WeaponsMade);

        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Blacksmith, 2)));
        Run(castle, 10); // 2 blacksmiths: one spear per 10 s
        Assert.Equal(1, castle.Stats.WeaponsMade);
        Run(castle, 10);
        Assert.Equal(2, castle.Stats.WeaponsMade);
        Assert.Empty(castle.Queue);
    }

    [Fact]
    public void Arming_takes_from_the_chosen_job_and_disarming_returns_to_idle()
    {
        var castle = NewCastle();
        var spear = Rules.FindUnit("mizrakci")!;
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Blacksmith, 2)));
        Ok(castle.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 3)));
        Ok(castle.Execute(new QueueWeapon("mizrakci", 1)));
        Run(castle, 10);

        Assert.False(castle.Execute(new ArmWorkers("mizrakci", 2, Job.Farmer)).Ok); // only 1 spear
        Ok(castle.Execute(new ArmWorkers("mizrakci", 1, Job.Farmer)));
        Assert.Equal(2, castle.Workers[Job.Farmer]);
        Assert.Equal(1, castle.Soldiers[spear]);
        Assert.Equal(0, castle.Weapons[spear]);
        Assert.Equal(12, castle.Population);

        Ok(castle.Execute(new DisarmSoldiers("mizrakci", 1)));
        Assert.Equal(0, castle.Soldiers[spear]);
        Assert.Equal(1, castle.Weapons[spear]);
        Assert.Equal(8, castle.Workers[Job.Idle]);
    }

    [Fact]
    public void Preparation_then_war_then_a_summary_and_no_more_commands()
    {
        var game = new GameState(Rules, ["o1"], prepSeconds: 90, warSeconds: 60);
        game.Execute("o1", new SetGrowth(false));
        for (int i = 0; i < 90; i++) game.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        Assert.Null(game.SummaryOf("o1"));
        Assert.True(game.Execute("o1", new MoveWorkers(Job.Idle, Job.Farmer, 1)).Ok); // economy goes on

        for (int i = 0; i < 100; i++) game.Tick(1);
        Assert.Equal(MatchPhase.Ended, game.Phase);
        Assert.Equal(150, game.ElapsedSeconds);
        var summary = game.SummaryOf("o1");
        Assert.NotNull(summary);
        Assert.Equal(150, summary!.DurationSeconds);
        Assert.Equal(new[] { 0.0, 30, 60, 90, 120, 150 }, summary.Samples.Select(s => s.Seconds));
        Assert.False(game.Execute("o1", new MoveWorkers(Job.Idle, Job.Farmer, 1)).Ok);
    }
}
