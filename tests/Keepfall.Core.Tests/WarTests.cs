using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;

namespace Keepfall.Core.Tests;

/// <summary>War phase: marching, the approach warning, battles, siege, elimination and the winner.</summary>
public class WarTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Archer = Rules.FindUnit("okcu")!;
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;
    private static readonly UnitType Spear = Rules.FindUnit("mizrakci")!;
    private static readonly UnitType Shield = Rules.FindUnit("kalkanli")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static void Run(GameState game, double seconds)
    {
        for (int i = 0; i < seconds; i++) game.Tick(1);
    }

    /// <summary>A match already in its war phase, growth off so populations stay put.</summary>
    private static GameState War(int players = 2, double prep = 10, double war = 600, int seed = 1)
    {
        var game = new GameState(Rules, Enumerable.Range(1, players).Select(i => $"o{i}"), prep, war, new Random(seed));
        for (int i = 1; i <= players; i++) Ok(game.Execute($"o{i}", new SetGrowth(false)));
        Run(game, prep);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    private static SendArmy Attack(string target, params (UnitType Type, int Count)[] units) =>
        new(target, units.ToDictionary(u => u.Type.Id, u => u.Count));

    // ---- phases and famine -------------------------------------------------------------------

    [Fact]
    public void Short_mode_is_five_minutes_of_preparation_then_ten_of_war()
    {
        Assert.Equal(300, Rules.Match.ShortModePrepSeconds);
        Assert.Equal(600, Rules.Match.ShortModeWarSeconds);
        var game = new GameState(Rules, [A, B]);
        Run(game, 300);
        Assert.Equal(MatchPhase.War, game.Phase);
        Assert.Equal(600, game.RemainingSeconds);
        Run(game, 600);
        Assert.Equal(MatchPhase.Ended, game.Phase);
    }

    [Fact]
    public void Famine_halves_food_production_in_the_last_30_percent_of_the_war()
    {
        var game = War(war: 100);
        Ok(game.Execute(A, new MoveWorkers(Job.Idle, Job.Farmer, 4)));
        var castle = game.CastleOf(A)!;
        Run(game, 69);
        Assert.False(game.Famine);
        Assert.Equal(4 * 8, castle.ProductionPerMinute(Resource.Food));
        Run(game, 1);
        Assert.True(game.Famine);
        Run(game, 1);
        Assert.Equal(4 * 8 * 0.5, castle.ProductionPerMinute(Resource.Food));
        Ok(game.Execute(A, new MoveWorkers(Job.Idle, Job.Lumberjack, 2)));
        Assert.Equal(2 * 5, castle.ProductionPerMinute(Resource.Wood)); // only food suffers
    }

    // ---- sending an army ---------------------------------------------------------------------

    [Fact]
    public void Attacks_only_in_the_war_and_only_with_soldiers_you_have()
    {
        var game = new GameState(Rules, [A, B], prepSeconds: 10, warSeconds: 600);
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Assert.False(game.Execute(A, Attack(B, (Sword, 1))).Ok); // preparation
        Run(game, 10);
        Assert.False(game.Execute(A, Attack(A, (Sword, 1))).Ok); // own castle
        Assert.False(game.Execute(A, Attack(B, (Sword, 4))).Ok); // only 3
        Assert.False(game.Execute(A, Attack(B, (Sword, 0))).Ok); // nobody
        Ok(game.Execute(A, Attack(B, (Sword, 3))));
    }

    [Fact]
    public void Marching_soldiers_are_not_at_home_but_still_count_and_eat()
    {
        var game = War();
        var castle = game.CastleOf(A)!;
        castle.AddSoldiers(Sword, 5);
        int population = castle.Population;
        double eating = castle.FoodConsumptionPerMinute;

        Ok(game.Execute(A, Attack(B, (Sword, 3))));
        Assert.Equal(2, castle.Soldiers[Sword]);
        Assert.Equal(3, castle.SoldiersAway);
        Assert.Equal(population, castle.Population);
        Assert.Equal(eating, castle.FoodConsumptionPerMinute);
        var army = Assert.Single(game.ArmiesOf(A));
        Assert.Equal(3, army.Size);
        Assert.Empty(game.ArmiesOf(B)); // B never sees A's army
    }

    // ---- the approach warning ----------------------------------------------------------------

    [Fact]
    public void The_target_is_warned_ten_seconds_before_arrival_with_only_the_sender()
    {
        var game = War(players: 3);
        game.CastleOf(A)!.AddSoldiers(Sword, 5);
        Ok(game.Execute(A, Attack(B, (Sword, 5))));
        Run(game, 19);
        Assert.Empty(game.TakeNotifications(B));
        Assert.Empty(game.IncomingWarningsOf(B));

        game.Tick(1); // 20 s after departure = 10 s before arrival
        var warning = Assert.Single(game.TakeNotifications(B));
        Assert.Equal(NotificationKind.ArmyIncoming, warning.Kind);
        Assert.Equal(A, warning.OtherPlayer);
        Assert.Equal(game.ElapsedSeconds + 10, warning.ArrivesAt);
        Assert.Equal((A, game.ElapsedSeconds + 10), Assert.Single(game.IncomingWarningsOf(B)));
        Assert.Empty(game.TakeNotifications(A));
        Assert.Empty(game.TakeNotifications(C));
        Assert.Empty(game.IncomingWarningsOf(C));

        // A warning can only carry these fields: kind, who, when, arrival time (and a battle id for reports).
        Assert.Equal(new[] { "ArrivesAt", "At", "BattleId", "Kind", "OtherPlayer" },
            typeof(GameNotification).GetProperties().Select(p => p.Name).Order());
    }

    [Fact]
    public void Room_warns_with_the_attackers_colour_only()
    {
        var room = new Room("ABCD", Rules, new RoomOptions { PrepSeconds = 1 });
        var blue = room.Join("Ali", null, false, DateTime.UtcNow).Player!;
        var red = room.Join("Bora", null, false, DateTime.UtcNow).Player!;
        Ok(room.SetReady(blue.Token, true));
        Ok(room.SetReady(red.Token, true));
        Ok(room.Start(blue.Token));
        room.Tick(1);
        Assert.Equal(RoomPhase.War, room.Phase);
        room.CastleOf(red)!.AddSoldiers(Sword, 7);
        Ok(room.Execute(red.Token, Attack(Room.CastleKeyOf(blue.Seat), (Sword, 7))));
        for (int i = 0; i < 20; i++) room.Tick(1);

        var text = Assert.Single(room.TakeNotifications(blue));
        Assert.Equal("Kırmızı'dan bir ordu yaklaşıyor!", text);
        Assert.DoesNotContain("7", text);
        Assert.Empty(room.TakeNotifications(red));
    }

    [Fact]
    public void Defenders_armed_during_the_warning_fight_the_battle()
    {
        // B forges 6 spears in preparation but keeps them in storage.
        var game = new GameState(Rules, [A, B], prepSeconds: 40, warSeconds: 600, rng: new Random(3));
        Ok(game.Execute(B, new SetGrowth(false)));
        Ok(game.Execute(B, new MoveWorkers(Job.Idle, Job.Blacksmith, 4)));
        Ok(game.Execute(B, new QueueWeapon("mizrakci", 6)));
        Run(game, 40);
        Assert.Equal(6, game.CastleOf(B)!.Weapons[Spear]);

        game.CastleOf(A)!.AddSoldiers(Archer, 3);
        Ok(game.Execute(A, Attack(B, (Archer, 3))));
        Run(game, 20);
        Assert.Single(game.IncomingWarningsOf(B));
        Ok(game.Execute(B, new ArmWorkers("mizrakci", 6, Job.Idle))); // react to the warning
        Run(game, 10);

        var report = Assert.Single(game.BattlesOf(B));
        var spears = Assert.Single(report.DefenderUnits);
        Assert.Equal(("mizrakci", 6), (spears.UnitId, spears.Count));
    }

    // ---- battles -----------------------------------------------------------------------------

    [Fact]
    public void An_empty_castle_takes_siege_damage_and_the_army_comes_home()
    {
        var game = War();
        var a = game.CastleOf(A)!;
        a.AddSoldiers(Sword, 4);
        Ok(game.Execute(A, Attack(B, (Sword, 4))));
        Run(game, 30);

        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal(BattleWinner.Attacker, report.Winner);
        Assert.Empty(report.DefenderUnits);
        Assert.Equal(4 * 8.5 * 5, report.CastleDamage, 6); // 4 swordsmen × 8.5 DPS × 5 s
        Assert.Equal(500 - 170, game.CastleOf(B)!.WallHp, 6);
        Assert.Equal(0, a.Soldiers[Sword]); // still walking home

        Run(game, 30);
        Assert.Equal(4, a.Soldiers[Sword]);
        Assert.Equal(0, a.SoldiersAway);
        Assert.Empty(game.ArmiesOf(A));
    }

    [Fact]
    public void Archers_do_half_damage_to_walls()
    {
        var game = War();
        Assert.Equal(2 * Archer.Dps * 5 * 0.5 + 1 * Sword.Dps * 5,
            game.SiegeDamage(new Dictionary<UnitType, int> { [Archer] = 2, [Sword] = 1 }), 6);
    }

    [Fact]
    public void A_beaten_attack_does_no_damage_and_only_the_two_sides_get_the_report()
    {
        var game = War(players: 3);
        game.CastleOf(A)!.AddSoldiers(Archer, 2);
        game.CastleOf(B)!.AddSoldiers(Shield, 10);
        Ok(game.Execute(A, Attack(B, (Archer, 2))));
        Run(game, 30);

        var report = Assert.Single(game.BattlesOf(A));
        Assert.Same(report, Assert.Single(game.BattlesOf(B)));
        Assert.Empty(game.BattlesOf(C));
        Assert.Equal(BattleWinner.Defender, report.Winner);
        Assert.Equal(0, report.CastleDamage);
        Assert.Equal(500, game.CastleOf(B)!.WallHp);
        Assert.Equal(2, report.AttackerUnits.Single().Lost);
        Assert.Equal(10, report.DefenderUnits.Single().Count); // the attacker sees the defending army
        Assert.Empty(game.ArmiesOf(A));
        Assert.Equal(0, game.CastleOf(A)!.SoldiersAway);
        Assert.Contains(game.TakeNotifications(A), n => n.Kind == NotificationKind.BattleFought);
        Assert.Contains(game.TakeNotifications(B), n => n.Kind == NotificationKind.BattleFought);
        Assert.DoesNotContain(game.TakeNotifications(C), n => n.Kind == NotificationKind.BattleFought);
    }

    [Fact]
    public void Two_armies_at_the_same_castle_fight_one_after_the_other()
    {
        var game = War(players: 3, seed: 5);
        game.CastleOf(A)!.AddSoldiers(Spear, 2);
        game.CastleOf(C)!.AddSoldiers(Sword, 12);
        game.CastleOf(B)!.AddSoldiers(Shield, 4);
        Ok(game.Execute(A, Attack(B, (Spear, 2))));  // sent first: fights first
        Ok(game.Execute(C, Attack(B, (Sword, 12))));
        Run(game, 30);

        var battles = game.BattlesOf(B);
        Assert.Equal(2, battles.Count);
        Assert.Equal(A, battles[0].Attacker);
        Assert.Equal(C, battles[1].Attacker);
        int leftAfterFirst = battles[0].DefenderUnits.Sum(u => u.Count - u.Lost);
        Assert.Equal(leftAfterFirst, battles[1].DefenderUnits.Sum(u => u.Count));
        // A never sees C's battle and the other way round.
        Assert.Single(game.BattlesOf(A));
        Assert.Single(game.BattlesOf(C));
    }

    [Fact]
    public void Armies_attacking_each_other_do_not_meet_on_the_road()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 4);
        game.CastleOf(B)!.AddSoldiers(Sword, 4);
        Ok(game.Execute(A, Attack(B, (Sword, 4))));
        Ok(game.Execute(B, Attack(A, (Sword, 4))));
        Run(game, 30);

        Assert.Equal(2, game.BattlesOf(A).Count);
        Assert.All(game.BattlesOf(A), b => Assert.Empty(b.DefenderUnits)); // both castles were empty
        Assert.Equal(330, game.CastleOf(A)!.WallHp, 6);
        Assert.Equal(330, game.CastleOf(B)!.WallHp, 6);
    }

    // ---- elimination and the end ------------------------------------------------------------

    [Fact]
    public void A_fallen_castle_is_out_and_the_last_one_standing_wins()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 20); // 20 × 8.5 × 5 = 850 > 500
        Ok(game.Execute(A, Attack(B, (Sword, 20))));
        Run(game, 30);

        Assert.True(game.IsEliminated(B));
        Assert.Equal(MatchPhase.Ended, game.Phase);
        Assert.True(game.Result!.ByElimination);
        Assert.Equal([A], game.Result.Winners);
        Assert.Equal(new[] { (A, 1, false), (B, 2, true) }, game.Result.Ranking.Select(r => (r.Player, r.Place, r.Eliminated)));
        Assert.True(Assert.Single(game.BattlesOf(B)).DefenderEliminated);
        Assert.Contains(game.TakeNotifications(A), n => n.Kind == NotificationKind.Eliminated && n.OtherPlayer == B);
        Assert.NotNull(game.SummaryOf(B));
        Assert.True(game.SummaryOf(B)!.War.Eliminated);
    }

    [Fact]
    public void An_eliminated_players_marching_army_still_fights_then_disbands()
    {
        var game = War(players: 3);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        game.CastleOf(B)!.AddSoldiers(Sword, 4);
        Ok(game.Execute(A, Attack(B, (Sword, 20))));
        Run(game, 5);
        Ok(game.Execute(B, Attack(C, (Sword, 4)))); // B's castle is now empty
        Run(game, 25);

        Assert.True(game.IsEliminated(B));
        Assert.Equal(MatchPhase.War, game.Phase); // A and C are still standing
        Assert.False(game.Execute(B, new SetGrowth(true)).Ok); // spectators cannot act
        Assert.Contains(game.TakeNotifications(C), n => n.Kind == NotificationKind.Eliminated && n.OtherPlayer == B);

        Run(game, 5); // B's army reaches C anyway
        var report = Assert.Single(game.BattlesOf(C));
        Assert.Equal(B, report.Attacker);
        Assert.Equal(BattleWinner.Attacker, report.Winner);
        Assert.Empty(game.ArmiesOf(B)); // nowhere to go back to
        Assert.Equal(0, game.CastleOf(B)!.SoldiersAway);
    }

    [Fact]
    public void When_time_runs_out_the_largest_population_wins_and_ties_share()
    {
        var game = War(war: 20);
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Run(game, 20);
        Assert.Equal(MatchPhase.Ended, game.Phase);
        Assert.False(game.Result!.ByElimination);
        Assert.Equal([A], game.Result.Winners);

        var tie = War(war: 20);
        Run(tie, 20);
        Assert.Equal(new[] { A, B }, tie.Result!.Winners.Order());
        Assert.All(tie.Result.Ranking, r => Assert.Equal(1, r.Place));
    }

    [Fact]
    public void Defense_settings_shape_the_defending_army()
    {
        var game = War();
        Ok(game.Execute(B, new SetDefense(new Dictionary<string, Row> { ["kilicli"] = Row.Back }, "okcu")));
        var castle = game.CastleOf(B)!;
        Assert.Equal(Row.Back, castle.DefenseRows[Sword]);
        Assert.Equal(Archer, castle.DefensePriority);
        Assert.False(game.Execute(B, new SetDefense(null, "ejderha")).Ok);
    }
}
