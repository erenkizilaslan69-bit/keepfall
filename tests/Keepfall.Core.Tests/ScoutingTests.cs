using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Scout missions: timing, report accuracy and what a report must never reveal.</summary>
public class ScoutingTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";

    /// <summary>A (o1) and B (o2) sit in opposite corners; C (o3) is a neighbour of both.</summary>
    private static readonly Corner[] Corners = [Corner.NorthWest, Corner.SouthEast, Corner.NorthEast];

    private static GameState NewGame(int players = 2, int seed = 1)
    {
        var keys = Enumerable.Range(1, players).Select(i => $"o{i}").ToList();
        return new(Rules, keys, prepSeconds: 100_000, rng: new Random(seed),
            corners: keys.Select((k, i) => (k, i)).ToDictionary(x => x.k, x => Corners[x.i]));
    }

    /// <summary>Ticks until a scout sent now reaches the target's gate.</summary>
    private static int OneWay(GameState game, string from, string to) => (int)Math.Ceiling(game.ScoutSeconds(from, to) - 1e-9);

    /// <summary>Ticks until a scout sent now is home with its report.</summary>
    private static int RoundTrip(GameState game, string from, string to) => 2 * OneWay(game, from, to);

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static void Run(GameState game, double seconds)
    {
        for (int i = 0; i < seconds; i++) game.Tick(1);
    }

    /// <summary>Gives <paramref name="player"/> <paramref name="spearmen"/> spearmen (≤ 10) and growth off everywhere.</summary>
    private static void Arm(GameState game, string player, int spearmen)
    {
        Ok(game.Execute(player, new MoveWorkers(Job.Idle, Job.Blacksmith, 4)));
        Ok(game.Execute(player, new QueueWeapon("mizrakci", spearmen)));
        Run(game, spearmen * 5); // 4 blacksmiths: one 20 s spear every 5 s
        int fromIdle = Math.Min(spearmen, game.CastleOf(player)!.Workers[Job.Idle]);
        if (fromIdle > 0) Ok(game.Execute(player, new ArmWorkers("mizrakci", fromIdle)));
        if (spearmen > fromIdle) Ok(game.Execute(player, new ArmWorkers("mizrakci", spearmen - fromIdle, Job.Blacksmith)));
        Run(game, Rules.Match.ArmSeconds); // arming takes its time
    }

    private static GameState GameWithGrowthOff(int players = 2, int seed = 1)
    {
        var game = NewGame(players, seed);
        for (int i = 1; i <= players; i++) Ok(game.Execute($"o{i}", new SetGrowth(false)));
        return game;
    }

    // ---- timing ------------------------------------------------------------------------------

    [Fact]
    public void The_scout_walks_to_the_target_and_back_and_comes_home_idle()
    {
        var game = GameWithGrowthOff();
        var castle = game.CastleOf(A)!;
        Ok(game.Execute(A, new MoveWorkers(Job.Idle, Job.Farmer, 2)));
        double consumption = castle.FoodConsumptionPerMinute;

        Ok(game.Execute(A, new SendScout(B, Job.Farmer)));
        Assert.Equal(1, castle.Workers[Job.Farmer]);        // taken from the chosen job
        Assert.Equal(1, castle.ScoutsAway);
        Assert.Equal(12, castle.Population);                  // still counted
        Assert.Equal(consumption, castle.FoodConsumptionPerMinute); // and still eats

        int there = OneWay(game, A, B), back = RoundTrip(game, A, B);
        Run(game, back - 1);
        Assert.Single(game.MissionsOf(A));
        Assert.Empty(game.ReportsOf(A));                      // nothing until the scout is home

        game.Tick(1);
        Assert.Empty(game.MissionsOf(A));
        Assert.Equal(0, castle.ScoutsAway);
        Assert.Equal(11, castle.Workers[Job.Idle]);           // 10 idle + the returning scout
        var report = Assert.Single(game.ReportsOf(A));
        Assert.Equal(B, report.Target);
        Assert.Equal(there, report.ObservedAt);               // taken on arrival at the gate
        Assert.Equal(back, report.DeliveredAt);
    }

    [Fact]
    public void Only_one_scout_per_target_at_a_time()
    {
        var game = GameWithGrowthOff(players: 3);
        Ok(game.Execute(A, new SendScout(B)));
        var again = game.Execute(A, new SendScout(B));
        Assert.False(again.Ok);
        Assert.False(game.Execute(A, new SendScout(C)).Ok);  // one scout at a time: the first is not home yet
        Ok(game.Execute(C, new SendScout(B)));               // another player's scout is fine
        Run(game, RoundTrip(game, A, B));
        Ok(game.Execute(A, new SendScout(C)));               // after it is back: the next may go
    }

    [Fact]
    public void Invalid_scout_orders_are_rejected()
    {
        var game = GameWithGrowthOff();
        Assert.False(game.Execute(A, new SendScout(A)).Ok);            // own castle
        Assert.False(game.Execute(A, new SendScout("o9")).Ok);         // no such player
        Assert.False(game.Execute(A, new SendScout(B, Job.Miner)).Ok); // nobody in that job
        Assert.Equal(0, game.CastleOf(A)!.ScoutsAway);
    }

    // ---- notification ------------------------------------------------------------------------

    [Fact]
    public void The_scouted_player_is_told_when_the_scout_arrives_and_only_them()
    {
        var game = GameWithGrowthOff(players: 3);
        Ok(game.Execute(A, new SendScout(B)));
        Run(game, OneWay(game, A, B) - 1);
        Assert.Empty(game.TakeNotifications(B));             // not there yet
        game.Tick(1);
        var n = Assert.Single(game.TakeNotifications(B));
        Assert.Equal(NotificationKind.ScoutedBy, n.Kind);
        Assert.Equal(A, n.OtherPlayer);
        Assert.Empty(game.TakeNotifications(B));             // delivered once
        Assert.Empty(game.TakeNotifications(A));
        Assert.Empty(game.TakeNotifications(C));
    }

    [Fact]
    public void Room_turns_the_notification_into_text_with_the_scouts_colour()
    {
        var room = new Room("ABCD", Rules);
        var blue = room.Join("Ali", null, false, DateTime.UtcNow).Player!;
        var red = room.Join("Bora", null, false, DateTime.UtcNow).Player!;
        Ok(room.SetReady(blue.Token, true));
        Ok(room.SetReady(red.Token, true));
        Ok(room.Start(blue.Token));
        Ok(room.Execute(red.Token, new SendScout(Room.CastleKeyOf(blue.Seat))));
        int there = (int)Math.Ceiling(room.Game!.ScoutSeconds(Room.CastleKeyOf(red.Seat), Room.CastleKeyOf(blue.Seat)) - 1e-9);
        for (int i = 0; i < there; i++) room.Tick(1);

        Assert.Equal(["Kırmızı'nın gözcüsü kaleni gözetledi."], room.TakeNotifications(blue));
        Assert.Empty(room.TakeNotifications(red));
    }

    [Fact]
    public void Scouting_is_a_preparation_command()
    {
        var room = new Room("ABCD", Rules);
        var a = room.Join("Ali", null, false, DateTime.UtcNow).Player!;
        var b = room.Join("Bora", null, false, DateTime.UtcNow).Player!;
        Assert.False(room.Execute(a.Token, new SendScout(Room.CastleKeyOf(b.Seat))).Ok); // lobby
    }

    // ---- what the report shows ---------------------------------------------------------------

    [Fact]
    public void Soldier_counts_stay_within_twenty_percent_and_vary()
    {
        var game = GameWithGrowthOff(seed: 7);
        Arm(game, B, 10);
        Assert.Equal(10, game.CastleOf(B)!.Soldiers[Rules.FindUnit("mizrakci")!]);

        var seen = new List<int>();
        for (int i = 0; i < 200; i++)
        {
            Ok(game.Execute(A, new SendScout(B)));
            Run(game, RoundTrip(game, A, B));
            var report = Assert.Single(game.ReportsOf(A));
            int spears = report.Soldiers.Single(s => s.UnitId == "mizrakci").Count;
            Assert.InRange(spears, 8, 12);                    // 10 ± 20 %
            seen.Add(spears);
            // Types are exact: types with no soldiers always read 0.
            Assert.All(report.Soldiers.Where(s => s.UnitId != "mizrakci"), s => Assert.Equal(0, s.Count));
        }
        Assert.True(seen.Distinct().Count() >= 3, "reports should not always show the same number");
        Assert.Contains(seen, n => n != 10);
    }

    /// <summary>Small armies are off by at least ±1 (20 % of 3 would round to nothing), never shown as 0.</summary>
    [Theory]
    [InlineData(1, 1, 2)]  // ±1, but a type that exists is never reported as 0
    [InlineData(3, 2, 4)]  // ±1 (20 % would be 0.6)
    [InlineData(5, 4, 6)]  // ±1 (20 % is exactly 1)
    [InlineData(8, 6, 10)] // ±1.6
    public void Small_counts_are_off_by_at_least_one_but_never_zero(int real, int min, int max)
    {
        var seen = new HashSet<int>();
        for (int seed = 0; seed < 80; seed++)
        {
            var game = GameWithGrowthOff(seed: seed);
            Arm(game, B, real);
            Ok(game.Execute(A, new SendScout(B)));
            Run(game, RoundTrip(game, A, B));
            int count = game.ReportsOf(A)[0].Soldiers.Single(s => s.UnitId == "mizrakci").Count;
            Assert.InRange(count, min, max);
            seen.Add(count);
        }
        Assert.True(seen.Count >= 2, $"{real} soldiers were always reported as {string.Join(",", seen)}");
        Assert.Contains(seen, n => n != real);
    }

    [Fact]
    public void Weapons_in_storage_and_workers_are_not_in_the_report()
    {
        var game = GameWithGrowthOff();
        // B has bows in storage but no archers, and a busy economy.
        Ok(game.Execute(B, new MoveWorkers(Job.Idle, Job.Blacksmith, 4)));
        Ok(game.Execute(B, new QueueWeapon("okcu", 3)));
        Ok(game.Execute(B, new MoveWorkers(Job.Idle, Job.Farmer, 4)));
        Run(game, 25);
        Assert.Equal(3, game.CastleOf(B)!.Weapons[Rules.FindUnit("okcu")!]);

        Ok(game.Execute(A, new SendScout(B)));
        Run(game, RoundTrip(game, A, B));
        var report = game.ReportsOf(A).Single();
        Assert.All(report.Soldiers, s => Assert.Equal(0, s.Count)); // stored bows are not soldiers

        // Structurally, a report can only ever carry these fields.
        Assert.Equal(
            new[] { "BuildingLevels", "Deck", "DeliveredAt", "ObservedAt", "Soldiers", "Target" },
            typeof(ScoutReport).GetProperties().Select(p => p.Name).Order());
        Assert.Equal(
            new[] { "Count", "Name", "UnitId" },
            typeof(ScoutedUnit).GetProperties().Select(p => p.Name).Order());
    }

    [Fact]
    public void Building_levels_are_exact_and_the_report_is_taken_on_arrival()
    {
        var game = GameWithGrowthOff();
        Ok(game.Execute(B, new UpgradeBuilding(BuildingType.Farm)));
        Run(game, 30); // farm level 2

        Ok(game.Execute(A, new SendScout(B)));
        Run(game, OneWay(game, A, B)); // arrived: report taken now
        Arm(game, B, 4); // soldiers made after the scout has looked
        Run(game, RoundTrip(game, A, B));

        var report = game.ReportsOf(A).Single();
        Assert.Equal(2, report.BuildingLevels[BuildingType.Farm]);
        Assert.Equal(1, report.BuildingLevels[BuildingType.Mine]);
        Assert.All(report.Soldiers, s => Assert.Equal(0, s.Count));
    }

    [Fact]
    public void Each_player_only_gets_their_own_reports()
    {
        var game = GameWithGrowthOff(players: 3);
        Ok(game.Execute(A, new SendScout(B)));
        Run(game, RoundTrip(game, A, B));
        Assert.Single(game.ReportsOf(A));
        Assert.Empty(game.ReportsOf(B));
        Assert.Empty(game.ReportsOf(C));
    }
}
