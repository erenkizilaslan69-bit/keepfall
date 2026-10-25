using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>War phase: marching, the sentry warning, battles, siege, elimination and the winner.</summary>
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

    /// <summary>Whole one-second ticks needed to cover <paramref name="seconds"/>.</summary>
    private static int Ticks(double seconds) => (int)Math.Ceiling(seconds - 1e-9);

    /// <summary>Ticks until <paramref name="player"/> has <paramref name="count"/> battle reports (battles take their time).</summary>
    private static void RunUntilReports(GameState game, string player, int count = 1)
    {
        for (int t = 0; game.BattlesOf(player).Count < count; t++)
        {
            Assert.True(t < 400, $"{player} never got {count} battle report(s)");
            game.Tick(1);
        }
    }

    /// <summary>Ticks until an army sent now from <paramref name="from"/> reaches <paramref name="to"/>.</summary>
    private static int March(GameState game, string from, string to) => Ticks(game.MarchSeconds(from, to));

    /// <summary>A (o1) and B (o2) sit in opposite corners; C (o3) is a neighbour of both.</summary>
    private static readonly Corner[] Corners = [Corner.NorthWest, Corner.SouthEast, Corner.NorthEast, Corner.SouthWest];

    /// <summary>A match already in its war phase, growth off so populations stay put.</summary>
    private static GameState War(int players = 2, double prep = 10, double war = 600, int seed = 1)
    {
        var keys = Enumerable.Range(1, players).Select(i => $"o{i}").ToList();
        var game = new GameState(Rules, keys, prep, war, new Random(seed), keys.Select((k, i) => (k, i)).ToDictionary(x => x.k, x => Corners[x.i]));
        for (int i = 1; i <= players; i++) Ok(game.Execute($"o{i}", new SetGrowth(false)));
        Run(game, prep);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    private static SendArmy Attack(string target, params (UnitType Type, int Count)[] units) =>
        new(target, units.ToDictionary(u => u.Type.Id, u => u.Count));

    // ---- phases and famine -------------------------------------------------------------------

    [Fact]
    public void Short_mode_is_ten_minutes_of_preparation_then_five_of_war()
    {
        Assert.Equal(600, Rules.Match.ShortModePrepSeconds);
        Assert.Equal(300, Rules.Match.ShortModeWarSeconds);
        var game = new GameState(Rules, [A, B]);
        Run(game, 600);
        Assert.Equal(MatchPhase.War, game.Phase);
        Assert.Equal(300, game.RemainingSeconds);
        Run(game, 300);
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

    /// <summary>Ticks until B has been warned about an army; fails if it never happens.</summary>
    private static int RunUntilWarned(GameState game, string target)
    {
        for (int t = 1; t <= 200; t++)
        {
            game.Tick(1);
            if (game.IncomingWarningsOf(target).Count > 0) return t;
        }
        throw new Xunit.Sdk.XunitException("no warning");
    }

    // ---- the sentry warning ------------------------------------------------------------------

    [Fact]
    public void The_target_is_warned_when_the_army_comes_into_sight_with_only_the_sender()
    {
        var game = War(players: 3);
        game.CastleOf(A)!.AddSoldiers(Sword, 5);
        Ok(game.Execute(A, Attack(B, (Sword, 5))));
        var army = Assert.Single(game.ArmiesOf(A));
        var sight = game.CastleVisionOf(B);
        while (true)
        {
            game.Tick(1);
            if (sight.Contains(army.Position)) break;
            Assert.Empty(game.TakeNotifications(B));
            Assert.Empty(game.IncomingWarningsOf(B));
        }

        var warning = Assert.Single(game.TakeNotifications(B));
        Assert.Equal(NotificationKind.ArmyIncoming, warning.Kind);
        Assert.Equal(A, warning.OtherPlayer);
        double arrives = game.ElapsedSeconds + army.SecondsLeft;
        Assert.Equal(arrives, warning.ArrivesAt!.Value, 6);
        Assert.InRange(army.SecondsLeft, 15, 20); // well before it arrives
        Assert.Equal((A, arrives), Assert.Single(game.IncomingWarningsOf(B)));
        Run(game, 3);
        Assert.Empty(game.TakeNotifications(B)); // once per army
        Assert.Empty(game.TakeNotifications(A));
        Assert.Empty(game.TakeNotifications(C));
        Assert.Empty(game.IncomingWarningsOf(C));

        // A warning can only carry these fields: kind, who, when, arrival time (a battle id for reports, a short text for loot that came home).
        Assert.Equal(new[] { "ArrivesAt", "At", "BattleId", "Detail", "Kind", "OtherPlayer" },
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
        while (room.Game!.IncomingWarningsOf(Room.CastleKeyOf(blue.Seat)).Count == 0) room.Tick(1);

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
        RunUntilWarned(game, B);
        Assert.Empty(game.BattlesOf(B));
        Ok(game.Execute(B, new ArmWorkers("mizrakci", 6, Job.Idle))); // react to the warning
        RunUntilReports(game, B);

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
        Run(game, March(game, A, B));

        // Nobody defends, so there is no fight: the swordsmen hammer the gate for the siege seconds.
        var siege = Assert.Single(game.ActiveBattlesOf(A));
        Assert.Equal((BattleKind.Siege, 0.0, 5.0), (siege.Kind, siege.FightSeconds, siege.SiegeSeconds));
        Run(game, 4);
        Assert.Equal(500, game.CastleOf(B)!.WallHp); // damage lands when the siege is over
        Assert.Empty(game.BattlesOf(A));
        RunUntilReports(game, A);

        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal(BattleWinner.Attacker, report.Winner);
        Assert.Empty(report.DefenderUnits);
        Assert.Equal(4 * 8.5 * 5, report.CastleDamage, 6); // 4 swordsmen × 8.5 DPS × 5 s
        Assert.Equal(500 - 170, game.CastleOf(B)!.WallHp, 6);
        Assert.Equal(0, a.Soldiers[Sword]); // still walking home
        Run(game, Ticks(game.ArmiesOf(A).Single().SecondsLeft) - 1);
        Assert.Equal(0, a.Soldiers[Sword]);

        game.Tick(1);
        Assert.Equal(4, a.Soldiers[Sword]);
        Assert.Equal(0, a.SoldiersAway);
        Assert.Empty(game.ArmiesOf(A));
    }

    [Fact]
    public void A_battle_takes_as_long_as_the_fight_and_holds_everyone_in_it()
    {
        var game = War(players: 3, seed: 2);
        game.CastleOf(A)!.AddSoldiers(Sword, 8);
        game.CastleOf(B)!.AddSoldiers(Shield, 3);
        game.CastleOf(B)!.AddSoldiers(Archer, 2);
        Ok(game.Execute(A, Attack(B, (Sword, 8))));
        Run(game, March(game, A, B));

        var battle = Assert.Single(game.ActiveBattles);
        Assert.Equal(battle.Record.Ticks * battle.Record.TickSeconds / Rules.War.BattlePlayback, battle.FightSeconds, 9);
        Assert.True(battle.FightSeconds > 2, "a real fight takes a while");
        Assert.Equal(battle.Winner == BattleWinner.Attacker ? Rules.War.SiegeSeconds : 0, battle.SiegeSeconds);
        Assert.Equal(8 + 5, battle.Record.Soldiers.Count);
        Assert.Empty(game.IncomingWarningsOf(B)); // it is here: no more "coming" warning

        // Both sides are told once that it started; nobody else is.
        Assert.Same(battle, Assert.Single(game.TakeStartedBattles(A)));
        Assert.Same(battle, Assert.Single(game.TakeStartedBattles(B)));
        Assert.Empty(game.TakeStartedBattles(A));
        Assert.Empty(game.TakeStartedBattles(C));
        Assert.Empty(game.ActiveBattlesOf(C));

        // The defenders are down at the gate: still B's people, but out of reach.
        var castle = game.CastleOf(B)!;
        Assert.Equal(0, castle.SoldierCount);
        Assert.Equal(5, castle.SoldiersDefending);
        Assert.False(game.Execute(B, Attack(C, (Shield, 1))).Ok);
        Assert.False(game.Execute(B, new DisarmSoldiers("kalkanli", 1)).Ok);
        Assert.Equal(battle.Attacker, game.ArmiesOf(A).Single());
        var at = game.ArmiesOf(A).Single().Position;
        game.Tick(1);
        Assert.Equal(at, game.ArmiesOf(A).Single().Position); // the army stands still
        Assert.DoesNotContain(game.SeenBy(B), m => m.Kind == MoverKind.Army); // fighting armies are not seen walking

        Run(game, Ticks(battle.EndsAt - game.ElapsedSeconds) - 1);
        Assert.Empty(game.BattlesOf(A));
        game.Tick(1);
        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal(battle.Id, report.Id);
        Assert.Equal(0, castle.SoldiersDefending);
        Assert.Equal(report.DefenderUnits.Sum(u => u.Count - u.Lost), castle.SoldierCount);
    }

    [Fact]
    public void When_time_runs_out_a_battle_still_going_on_ends_with_its_outcome()
    {
        double march = WorldMap.Standard.RouteBetween(Corner.NorthWest, Corner.SouthEast).Length / Rules.Map.ArmySpeed;
        var game = War(war: Ticks(march) + 2);
        game.CastleOf(A)!.AddSoldiers(Sword, 4);
        Ok(game.Execute(A, Attack(B, (Sword, 4))));
        Run(game, Ticks(march) + 2); // the siege needs 5 s, the war ends after 2
        Assert.Equal(MatchPhase.Ended, game.Phase);
        Assert.Empty(game.ActiveBattles);
        Assert.Equal(500 - 170, game.CastleOf(B)!.WallHp, 6);
        Assert.Single(game.BattlesOf(A));
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
        RunUntilReports(game, A);

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
    public void Armies_at_the_same_castle_fight_one_after_the_other()
    {
        var game = War(players: 3, seed: 5);
        game.CastleOf(A)!.AddSoldiers(Spear, 2);
        game.CastleOf(A)!.AddSoldiers(Sword, 12);
        game.CastleOf(C)!.AddSoldiers(Shield, 4);
        Ok(game.Execute(A, Attack(C, (Spear, 2))));  // sent first: fights first
        game.Tick(1);
        Ok(game.Execute(A, Attack(C, (Sword, 12))));
        Run(game, March(game, A, C) + 1);
        var first = Assert.Single(game.ActiveBattles); // the second army waits at the gate
        Assert.Equal(new Dictionary<UnitType, int> { [Spear] = 2 }, first.AttackerUnits);
        RunUntilReports(game, C, 2);

        var battles = game.BattlesOf(C);
        Assert.Equal(2, battles.Count);
        Assert.Equal("mizrakci", battles[0].AttackerUnits.Single().UnitId);
        Assert.Equal("kilicli", battles[1].AttackerUnits.Single().UnitId);
        Assert.True(battles[1].At > battles[0].At);
        int leftAfterFirst = battles[0].DefenderUnits.Sum(u => u.Count - u.Lost);
        Assert.Equal(leftAfterFirst, battles[1].DefenderUnits.Sum(u => u.Count));
        Assert.Empty(game.BattlesOf(B)); // B never hears of it
    }

    // ---- on the road -------------------------------------------------------------------------

    /// <summary>Ticks until a battle is going on; returns it.</summary>
    private static ActiveBattle RunUntilBattle(GameState game, double dt = 1)
    {
        for (int t = 0; game.ActiveBattles.Count == 0; t++)
        {
            Assert.True(t < 400, "no battle");
            game.Tick(dt);
        }
        return game.ActiveBattles.Single();
    }

    [Fact]
    public void Armies_attacking_each_other_meet_on_the_road_and_fight_there()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 6);
        game.CastleOf(B)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, Attack(B, (Sword, 6))));
        Ok(game.Execute(B, Attack(A, (Sword, 3))));
        var battle = RunUntilBattle(game);

        Assert.Equal(BattleKind.Field, battle.Kind);
        var hub = game.Map.Nodes.Single(n => n.Id == "hub").Position;
        Assert.True(battle.Position.DistanceTo(hub) < 1, $"they meet in the middle of the forest, not at {battle.Position}");
        var (a, b) = (game.ArmiesOf(A).Single(), game.ArmiesOf(B).Single());
        Assert.True(a.Position.DistanceTo(b.Position) <= Rules.War.EncounterRadius + 1e-9);
        Assert.Same(battle, a.Battle);
        Assert.Same(battle, b.Battle);

        RunUntilReports(game, A);
        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal(BattleKind.Field, report.Kind);
        Assert.Equal(0, report.CastleDamage);
        Assert.Same(report, Assert.Single(game.BattlesOf(B)));
        Assert.Equal(BattleWinner.Attacker, report.Winner); // 6 swordsmen beat 3
        Assert.Empty(game.ArmiesOf(B)); // the loser is gone
        var winner = game.ArmiesOf(A).Single();
        Assert.Equal(ArmyState.Marching, winner.State); // and the winner goes on to B
        Assert.Equal(6 - report.AttackerUnits.Single().Lost, winner.Size);
        Assert.Equal(500, game.CastleOf(A)!.WallHp);
        RunUntilReports(game, A, 2);
        Assert.Equal(BattleKind.Siege, game.BattlesOf(A)[1].Kind);
    }

    [Fact]
    public void Armies_meet_even_at_twenty_times_speed()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 2);
        game.CastleOf(B)!.AddSoldiers(Sword, 2);
        Ok(game.Execute(A, Attack(B, (Sword, 2))));
        Ok(game.Execute(B, Attack(A, (Sword, 2))));
        var battle = RunUntilBattle(game, dt: 20); // 20 game seconds in one go: 30 tiles each
        Assert.Equal(BattleKind.Field, battle.Kind);
    }

    [Fact]
    public void Armies_on_different_roads_meet_at_a_junction()
    {
        // C (north-east) goes through the forest to D (south-west); A (north-west) goes down the west
        // road to D. Both reach the south-west junction at the same moment from different roads.
        var game = War(players: 4);
        const string D = "o4";
        game.CastleOf(A)!.AddSoldiers(Sword, 2);
        game.CastleOf(C)!.AddSoldiers(Sword, 2);
        var junction = game.Map.Nodes.Single(n => n.Id == "junction-SouthWest").Position;
        double toJunction(string from) => game.RouteBetween(from, D).Points.TakeWhile(p => p != junction)
            .Zip(game.RouteBetween(from, D).Points.Skip(1)).Sum(x => x.First.DistanceTo(x.Second)) / Rules.Map.ArmySpeed;
        double head = toJunction(C) - toJunction(A);
        Assert.True(head > 0);
        Ok(game.Execute(C, Attack(D, (Sword, 2))));
        game.Tick(head);
        Ok(game.Execute(A, Attack(D, (Sword, 2))));
        var battle = RunUntilBattle(game);
        // They meet as they close in on the junction from two roads, about a tile before reaching it.
        Assert.True(battle.Position.DistanceTo(junction) < 1.5, $"met at {battle.Position}, junction {junction}");
    }

    [Fact]
    public void Scouts_walk_past_armies()
    {
        var game = War();
        game.CastleOf(B)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(B, Attack(A, (Sword, 3))));
        Ok(game.Execute(A, new SendScout(B)));
        Run(game, 40);
        Assert.Empty(game.ActiveBattles);
        Assert.NotEmpty(game.MissionsOf(A));
    }

    [Fact]
    public void A_third_army_waits_outside_a_battle_on_the_road()
    {
        // A and B fight in the forest; C's army to B comes the same way and has to wait.
        var game = War(players: 4);
        game.CastleOf(A)!.AddSoldiers(Shield, 12);
        game.CastleOf(B)!.AddSoldiers(Shield, 12);
        Ok(game.Execute(A, Attack(B, (Shield, 12))));
        Ok(game.Execute(B, Attack(A, (Shield, 12))));
        var battle = RunUntilBattle(game);
        Assert.True(battle.FightSeconds > 10, "a long battle of shield bearers");

        game.CastleOf("o4")!.AddSoldiers(Sword, 2); // D, south-west: its road to C (north-east) crosses the forest
        Ok(game.Execute("o4", Attack(C, (Sword, 2))));
        var d = game.ArmiesOf("o4").Single();
        while (game.ActiveBattles.Contains(battle))
        {
            game.Tick(1);
            if (game.ActiveBattles.Contains(battle))
                Assert.True(d.Position.DistanceTo(battle.Position) >= Rules.War.EncounterRadius * 1.5 - 1e-6, $"{d.Position}");
        }
        Assert.True(d.Position.DistanceTo(battle.Position) < Rules.War.EncounterRadius * 1.5 + 0.2, "it waited right outside");
    }

    // ---- recall and intercept ----------------------------------------------------------------

    [Fact]
    public void A_recalled_army_turns_round_where_it_is()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, Attack(B, (Sword, 3))));
        Run(game, 10);
        var army = game.ArmiesOf(A).Single();
        var at = army.Position;
        Ok(game.Execute(A, new RecallArmy(army.Id)));
        Assert.Equal(ArmyState.Returning, army.State);
        Assert.True(at.DistanceTo(army.Position) < 1e-9);
        Assert.False(game.Execute(A, new RecallArmy(army.Id)).Ok); // already on its way home
        Assert.False(game.Execute(B, new RecallArmy(army.Id)).Ok); // not B's to call
        RunUntilHome(game, A);
        Assert.Empty(game.ArmiesOf(A));
        Assert.Equal(3, game.CastleOf(A)!.Soldiers[Sword]);
        Assert.Empty(game.BattlesOf(B));
    }

    [Fact]
    public void An_army_in_a_battle_cannot_be_recalled()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        game.CastleOf(B)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, Attack(B, (Sword, 3))));
        Ok(game.Execute(B, Attack(A, (Sword, 3))));
        RunUntilBattle(game);
        Assert.False(game.Execute(A, new RecallArmy(game.ArmiesOf(A).Single().Id)).Ok);
    }

    [Fact]
    public void An_interceptor_that_meets_nobody_turns_back_half_way_unseen()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 3 }, Mode: ArmyMode.Intercept)));
        var army = game.ArmiesOf(A).Single();
        double half = army.Out.Route.Length / 2;
        while (army.State == ArmyState.Marching) game.Tick(1);
        Assert.InRange(army.Out.Travelled, half, half + Rules.Map.ArmySpeed);
        Run(game, 60);
        Assert.Empty(game.ArmiesOf(A));
        Assert.Equal(3, game.CastleOf(A)!.Soldiers[Sword]);
        Assert.Empty(game.TakeNotifications(B)); // never came close enough to be seen by B's castle
        Assert.Empty(game.BattlesOf(B));
    }

    [Fact]
    public void An_interceptor_goes_home_after_its_battle_on_the_road()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 8);
        game.CastleOf(B)!.AddSoldiers(Archer, 2);
        Ok(game.Execute(B, Attack(A, (Archer, 2))));
        Run(game, 5);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 8 }, Mode: ArmyMode.Intercept)));
        RunUntilReports(game, A);
        Assert.Equal(BattleKind.Field, game.BattlesOf(A).Single().Kind);
        var army = game.ArmiesOf(A).Single();
        Assert.Equal(ArmyState.Returning, army.State);
        RunUntilHome(game, A);
        Assert.Single(game.BattlesOf(A)); // never laid siege to B
        Assert.Equal(500, game.CastleOf(B)!.WallHp);
    }

    private static void RunUntilHome(GameState game, string player)
    {
        for (int t = 0; game.ArmiesOf(player).Count > 0; t++)
        {
            Assert.True(t < 200, "never came home");
            game.Tick(1);
        }
    }

    // ---- elimination and the end ------------------------------------------------------------

    [Fact]
    public void A_fallen_castle_is_out_and_the_last_one_standing_wins()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 20); // 20 × 8.5 × 5 = 850 > 500
        Ok(game.Execute(A, Attack(B, (Sword, 20))));
        RunUntilReports(game, B);

        Assert.True(game.IsEliminated(B));
        Assert.Equal(MatchPhase.Ended, game.Phase);
        Assert.True(game.Result!.ByElimination);
        Assert.Equal([A], game.Result.Winners);
        Assert.Equal(new[] { (A, 1, false), (B, 2, true) }, game.Result.Ranking.Select(r => (r.Player, r.Place, r.Eliminated)));
        var fall = Assert.Single(game.BattlesOf(B));
        Assert.True(fall.DefenderEliminated);
        Assert.Equal(500, fall.CastleDamage); // 850 possible, but only 500 was left
        Assert.Equal(500, game.CastleOf(A)!.Stats.CastleDamageDealt);
        Assert.Equal(500, game.CastleOf(B)!.Stats.CastleDamageTaken);
        Assert.Contains(game.TakeNotifications(A), n => n.Kind == NotificationKind.Eliminated && n.OtherPlayer == B);
        Assert.NotNull(game.SummaryOf(B));
        Assert.True(game.SummaryOf(B)!.War.Eliminated);
    }

    [Fact]
    public void The_army_that_brings_a_castle_down_carries_half_its_stores_and_a_third_of_its_workers_home()
    {
        var game = War(players: 3);
        game.CastleOf(B)!.AddGold(100);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        int popA = game.CastleOf(A)!.Population;
        Ok(game.Execute(A, Attack(B, (Sword, 20))));
        RunUntilReports(game, B);

        Assert.True(game.IsEliminated(B));
        var army = game.ArmiesOf(A).Single();
        var fallen = game.CastleOf(B)!;
        Assert.Equal(50, army.LootGold);
        Assert.Equal(50, fallen.Gold); // taken from the fallen castle
        Assert.Equal((int)Math.Floor((fallen.WorkerCount + army.LootPeople) * Rules.War.FallWorkerShare), army.LootPeople);
        Assert.True(army.LootPeople > 0 && army.LootFood > 0 && army.LootWood > 0);
        int loot = army.LootPeople;
        RunUntilHome(game, A);
        Assert.Equal(50, game.CastleOf(A)!.Gold);
        Assert.Equal(popA + loot, game.CastleOf(A)!.Population); // the soldiers are home again, and so are the new people
        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal(new FallLoot(army.LootFood, army.LootWood, army.LootIron, 50, loot), report.Loot); // the report says what was taken
        var home = Assert.Single(game.TakeNotifications(A), n => n.Kind == NotificationKind.LootHome);
        Assert.Equal(report.Loot!.Describe(), home.Detail);
        Assert.StartsWith("+", home.Detail);
        Assert.Contains($"+50 altın", home.Detail);
    }

    [Fact]
    public void An_eliminated_players_marching_army_still_fights_then_disbands()
    {
        var game = War(players: 3);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        game.CastleOf(B)!.AddSoldiers(Sword, 4);
        Ok(game.Execute(A, Attack(B, (Sword, 20))));
        Run(game, 10);
        Ok(game.Execute(B, Attack(C, (Sword, 4)))); // B's castle is now empty
        while (!game.IsEliminated(B)) game.Tick(1);

        Assert.True(game.IsEliminated(B));
        Assert.Equal(MatchPhase.War, game.Phase); // A and C are still standing
        Assert.False(game.Execute(B, new SetGrowth(true)).Ok); // spectators cannot act
        Assert.Contains(game.TakeNotifications(C), n => n.Kind == NotificationKind.Eliminated && n.OtherPlayer == B);

        RunUntilReports(game, C); // B's army reaches C anyway
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
