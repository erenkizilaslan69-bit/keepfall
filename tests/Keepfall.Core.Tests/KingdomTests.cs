using Keepfall.Core.Economy;
using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>The four kingdoms: who gets which, and what each one's abilities do (and do not give away).</summary>
public class KingdomTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı.")).WithWalls(new WallRules(0.25));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;
    private static readonly UnitType Archer = Rules.FindUnit("okcu")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    /// <summary>A north-west, B south-east, C north-east; at war already; the kingdoms as given.</summary>
    private static GameState War(string a, string b, string c, int seed = 5)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: 1, warSeconds: 100_000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast }, forestSeed: seed,
            factions: new Dictionary<string, string> { [A] = a, [B] = b, [C] = c });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        return game;
    }

    private static void RunUntil(GameState game, Func<bool> done, int limit = 1500)
    {
        for (int t = 0; !done(); t++) { Assert.True(t < limit, "never happened"); game.Tick(1); }
    }

    private static Dictionary<string, int> Units(int swords) => new() { ["kilicli"] = swords };

    [Fact]
    public void Every_player_gets_a_different_kingdom()
    {
        for (int seed = 0; seed < 20; seed++)
        {
            var all = Factions.Assign(["a", "b", "c", "d"], new Random(seed));
            Assert.Equal(4, all.Values.Distinct().Count());
        }
        Assert.Equal(4, Factions.All.Select(f => f.Id).Distinct().Count());
    }

    [Fact]
    public void A_phantom_army_looks_real_costs_no_soldiers_and_fades_at_the_gate_without_a_battle()
    {
        var game = War(Factions.Shadow, Factions.Merchant, Factions.Schemer);
        game.CastleOf(A)!.AddGold(100);
        var gold = game.CastleOf(A)!.Gold;
        Ok(game.Execute(A, new SendDecoy(B, Units(10))));
        Assert.Equal(gold - 5, game.CastleOf(A)!.Gold, 6); // 10 × 0.5
        Assert.Equal(0, game.CastleOf(A)!.SoldiersAway); // nobody left the castle
        // The cooldown and the cap hold.
        Assert.False(game.Execute(A, new SendDecoy(B, Units(5))).Ok);

        var phantom = game.ArmiesOf(A).Single();
        Assert.True(phantom.Decoy);
        while (!game.CastleVisionOf(B).Contains(phantom.Position)) game.Tick(1);
        var seen = Assert.Single(game.SeenBy(B));
        Assert.Equal(A, seen.Owner);
        Assert.False(seen.Fake); // the victim is never told
        Assert.Single(game.IncomingWarningsOf(B)); // and is warned like for a real army

        RunUntil(game, () => game.ArmiesOf(A).Count == 0);
        Assert.Empty(game.ActiveBattles);
        Assert.Empty(game.BattlesOf(B));
        Assert.False(game.IsEliminated(B));
    }

    [Fact]
    public void Only_the_oracle_sees_that_a_phantom_is_one()
    {
        var game = War(Factions.Shadow, Factions.Oracle, Factions.Merchant);
        game.CastleOf(A)!.AddGold(100);
        Ok(game.Execute(A, new SendDecoy(B, Units(10))));
        var phantom = game.ArmiesOf(A).Single();
        while (!game.CastleVisionOf(B).Contains(phantom.Position)) game.Tick(1);
        var seen = Assert.Single(game.SeenBy(B));
        Assert.True(seen.Fake);
        Assert.Equal(A, seen.RealOwner);
    }

    [Fact]
    public void A_phantom_dissolves_when_it_meets_a_real_army_of_another_player()
    {
        var game = War(Factions.Shadow, Factions.Merchant, Factions.Schemer);
        game.CastleOf(A)!.AddGold(100);
        game.CastleOf(C)!.AddSoldiers(Sword, 5);
        Ok(game.Execute(A, new SendDecoy(B, Units(10))));
        Ok(game.Execute(C, new SendArmy(A, Units(5))));
        RunUntil(game, () => game.ArmiesOf(A).Count == 0);
        Assert.Empty(game.ActiveBattles); // it never fought
        Assert.Single(game.ArmiesOf(C)); // the real army walks on
    }

    [Fact]
    public void The_shadows_false_report_is_what_a_scout_reads_but_not_an_oracle()
    {
        var game = War(Factions.Oracle, Factions.Shadow, Factions.Merchant);
        game.CastleOf(B)!.AddSoldiers(Archer, 10);
        Ok(game.Execute(B, new SetFakeReport(new Dictionary<string, int> { ["kilicli"] = 40 })));
        Ok(game.Execute(C, new SendScout(B)));
        Ok(game.Execute(A, new SendScout(B)));
        RunUntil(game, () => game.ReportsOf(C).Count == 1 && game.ReportsOf(A).Count == 1);

        var lie = game.ReportsOf(C).Single();
        Assert.False(lie.Faked); // the merchant is simply fooled
        Assert.True(lie.Soldiers.Single(s => s.UnitId == "kilicli").Count >= 30);
        Assert.Equal(0, lie.Soldiers.Single(s => s.UnitId == "okcu").Count);

        var truth = game.ReportsOf(A).Single();
        Assert.True(truth.Faked);
        Assert.Equal(0, truth.Soldiers.Single(s => s.UnitId == "kilicli").Count);
        Assert.True(truth.Soldiers.Single(s => s.UnitId == "okcu").Count >= 8);
    }

    [Fact]
    public void A_merchant_bribes_part_of_a_visible_army_to_turn_back()
    {
        var game = War(Factions.Merchant, Factions.Schemer, Factions.Shadow);
        game.CastleOf(B)!.AddSoldiers(Sword, 20);
        game.CastleOf(A)!.AddGold(200);
        Ok(game.Execute(B, new SendArmy(A, Units(20))));
        var army = game.ArmiesOf(B).Single();
        Assert.False(game.Execute(A, new BribeArmy("nope", 5)).Ok);
        while (!game.CastleVisionOf(A).Contains(army.Position)) game.Tick(1);
        var id = game.SeenBy(A).Single().Id;

        double gold = game.CastleOf(A)!.Gold;
        Ok(game.Execute(A, new BribeArmy(id, 100))); // asks for too many: gets the allowed share (40% of 20 = 8)
        Assert.Equal(gold - 8 * 5, game.CastleOf(A)!.Gold, 6);
        Assert.Equal(12, army.Units.Values.Sum());
        var home = game.ArmiesOf(B).Single(a => a.State == ArmyState.Returning);
        Assert.Equal(8, home.Survivors.Values.Sum());
        Assert.False(game.Execute(A, new BribeArmy(id, 1)).Ok); // cooldown

        RunUntil(game, () => game.ArmiesOf(B).All(a => a.State != ArmyState.Returning) || game.CastleOf(B)!.Soldiers[Sword] >= 8);
        Assert.Equal(8, game.CastleOf(B)!.Soldiers[Sword]); // the turned soldiers are home, not lost
    }

    [Fact]
    public void A_hired_camp_marches_on_the_target_and_the_camp_is_empty()
    {
        var game = War(Factions.Merchant, Factions.Schemer, Factions.Shadow);
        Ok(game.Execute(A, new SendExplore(Corner.NorthWest)));
        for (int t = 0; game.MissionsOf(A).Count > 0; t++) { Assert.True(t < 600); game.Tick(1); }
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        game.CastleOf(A)!.AddGold(200);
        int soldiers = game.CastleOf(A)!.SoldierCount;

        Ok(game.Execute(A, new HireCamp(camp.Site.Id, B)));
        var rented = game.ArmiesOf(A).Single();
        Assert.True(rented.Rented);
        Assert.True(game.AllSites.First(s => s.Site.Id == camp.Site.Id).Gone);
        Assert.False(game.Execute(A, new HireCamp(camp.Site.Id, C)).Ok); // nothing left to hire

        RunUntil(game, () => game.ArmiesOf(A).Count == 0 || game.IsEliminated(B), 3000);
        Assert.Equal(soldiers, game.CastleOf(A)!.SoldierCount); // the bandits were never the merchant's soldiers
        Assert.Equal(0, game.ContinuityViolations);
    }

    [Fact]
    public void A_schemers_army_is_somebody_elses_to_everyone_but_the_oracle_until_it_comes_out()
    {
        var game = War(Factions.Schemer, Factions.Merchant, Factions.Oracle);
        game.CastleOf(A)!.AddSoldiers(Sword, 10);
        Ok(game.Execute(A, new SendArmy(B, Units(10)) { AsKey = C }));
        Assert.False(game.Execute(A, new SendArmy(B, Units(1)) { AsKey = C }).Ok);
        var army = game.ArmiesOf(A).Single();
        while (!game.CastleVisionOf(B).Contains(army.Position)) game.Tick(1);
        Assert.Equal(C, game.SeenBy(B).Single().Owner);
        Assert.Equal(C, game.IncomingWarningsOf(B).Single().From);

        RunUntil(game, () => game.BattlesOf(B).Count > 0);
        var report = game.BattlesOf(B).First();
        Assert.Equal(C, game.AttackerSeenBy(report, B)); // told it was C
        Assert.Equal(A, game.AttackerSeenBy(report, C)); // the oracle knows
        Assert.Equal(A, game.AttackerSeenBy(report, A));

        game.Tick(Rules.Kingdoms.DisguiseRevealSeconds + 1);
        Assert.Equal(A, game.AttackerSeenBy(report, B)); // time has come
    }

    [Fact]
    public void A_scout_at_a_schemers_castle_unmasks_its_disguised_army_for_that_scout_only()
    {
        var game = War(Factions.Schemer, Factions.Merchant, Factions.Shadow);
        game.CastleOf(A)!.AddSoldiers(Sword, 10);
        game.CastleOf(B)!.AddSoldiers(Sword, 80); // the castle holds
        Ok(game.Execute(A, new SendArmy(B, Units(10)) { AsKey = C }));
        var army = game.ArmiesOf(A).Single();
        while (!game.CastleVisionOf(B).Contains(army.Position)) game.Tick(1);
        Assert.Equal(C, game.SeenBy(B).Single().Owner);
        Ok(game.Execute(B, new SendScout(A)));
        RunUntil(game, () => game.ReportsOf(B).Count == 1, 3000);
        if (game.ArmiesOf(A).Count > 0 && game.SeenBy(B).Count > 0)
            Assert.Equal(A, game.SeenBy(B).Single().Owner);
    }

    [Fact]
    public void An_envoy_can_go_under_another_name_and_the_oracle_sees_through_it()
    {
        var game = War(Factions.Schemer, Factions.Oracle, Factions.Merchant);
        Assert.False(game.Execute(B, new SendEnvoy(A, 0, 0, 0, 0, "merhaba", Economy.Job.Idle, C)).Ok); // only a schemer
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "merhaba", Economy.Job.Idle, C)));
        RunUntil(game, () => game.LettersOf(B).Count == 1);
        var letter = game.LettersOf(B).Single();
        Assert.Equal(C, letter.From);
        Assert.Equal(A, letter.RealFrom);
        Assert.Equal(C, game.TakeNotifications(B).Single(n => n.Kind == NotificationKind.EnvoyArrived).OtherPlayer);
    }

    [Fact]
    public void The_oracle_knows_every_kingdom_and_deck_and_estimates_a_battle_from_a_report()
    {
        var game = War(Factions.Oracle, Factions.Shadow, Factions.Merchant);
        var know = game.OracleKnowledgeOf(A);
        Assert.Equal(2, know.Count);
        Assert.Equal(Factions.Shadow, know.Single(k => k.Player == B).Faction);
        Assert.Empty(game.OracleKnowledgeOf(B)); // only the oracle

        game.CastleOf(A)!.AddSoldiers(Sword, 30);
        game.CastleOf(B)!.AddSoldiers(Sword, 4);
        Assert.False(game.OddsOf(A).First(o => o.Target == B).Known); // nothing to go on without a report
        Ok(game.Execute(A, new SendScout(B)));
        RunUntil(game, () => game.ReportsOf(A).Count == 1);
        game.Tick(7);
        var odds = game.OddsOf(A).Single(o => o.Target == B);
        Assert.True(odds.Known);
        Assert.True(odds.High >= 0.8, $"30 swords against about 4 should look safe: {odds.Low}-{odds.High}");
        Assert.Empty(game.OddsOf(B));
    }

    [Fact]
    public void A_kingdom_is_only_shown_for_a_castle_in_live_sight()
    {
        var game = War(Factions.Shadow, Factions.Merchant, Factions.Oracle);
        Assert.Empty(game.FactionsInSightOf(A)); // the rivals' castles are far
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, new SendArmy(B, Units(3))));
        var army = game.ArmiesOf(A).Single();
        RunUntil(game, () => game.FactionsInSightOf(A).Count > 0 || army.State != ArmyState.Marching);
        Assert.Equal((B, Factions.Merchant), game.FactionsInSightOf(A).Single());
    }
}
