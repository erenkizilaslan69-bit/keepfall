using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Chests and villages: who can take them, what comes home, and that a place can only be emptied once.</summary>
public class ForestLootTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly Units.UnitType Sword = Rules.FindUnit("kilicli")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    /// <summary>A north-west, B south-east, C north-east. <paramref name="prep"/> long preparation (default: already at war).</summary>
    private static GameState Game(double prep = 1, int seed = 5)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: prep, warSeconds: 100_000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast }, forestSeed: seed);
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        return game;
    }

    private static void Explore(GameState game, string player, Corner quarter)
    {
        Ok(game.Execute(player, new SendExplore(quarter)));
        for (int t = 0; game.MissionsOf(player).Count > 0; t++) { Assert.True(t < 600); game.Tick(1); }
    }

    private static KnownSite Find(GameState game, string player, SiteKind kind) => game.KnownSitesOf(player).First(k => k.Site.Kind == kind);

    private static void RunUntil(GameState game, Func<bool> done, int limit = 800)
    {
        for (int t = 0; !done(); t++) { Assert.True(t < limit, "never happened"); game.Tick(1); }
    }

    [Fact]
    public void A_scout_brings_a_chests_gold_home_and_the_chest_is_gone()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var chest = Find(game, A, SiteKind.Chest);
        Assert.InRange(chest.Site.Gold, Rules.Forest.Chest.GoldMin, Rules.Forest.Chest.GoldMax);

        Ok(game.Execute(A, new SendChestScout(chest.Site.Id)));
        Assert.Equal(0, game.CastleOf(A)!.Gold);
        RunUntil(game, () => game.MissionsOf(A).Count == 0);

        Assert.Equal(chest.Site.Gold, game.CastleOf(A)!.Gold); // arrives with the scout, not before
        Assert.True(game.AllSites.First(s => s.Site.Id == chest.Site.Id).Gone);
        Assert.Equal(0, game.CastleOf(A)!.ScoutsAway);
        Assert.Equal(chest.Site.Gold, game.CastleOf(A)!.Stats.GoldGained);
        Assert.True(game.KnownSitesOf(A).First(k => k.Site.Id == chest.Site.Id).Gone, "A saw it empty when its scout stood there");
        Assert.Equal(0, game.CastleOf(B)!.Gold);
    }

    [Fact]
    public void The_gold_is_only_credited_when_the_scout_is_home()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var chest = Find(game, A, SiteKind.Chest);
        Ok(game.Execute(A, new SendChestScout(chest.Site.Id)));
        RunUntil(game, () => game.AllSites.First(s => s.Site.Id == chest.Site.Id).Gone);
        Assert.Equal(1, game.CastleOf(A)!.ScoutsAway); // on its way back
        Assert.Equal(0, game.CastleOf(A)!.Gold);
    }

    [Fact]
    public void Only_a_known_unspent_chest_can_be_sent_for()
    {
        var game = Game();
        Assert.False(game.Execute(A, new SendChestScout("0000000000000000")).Ok);
        Explore(game, A, Corner.NorthWest);
        var chest = Find(game, A, SiteKind.Chest);
        Assert.False(game.Execute(B, new SendChestScout(chest.Site.Id)).Ok, "B never found it");
        Assert.False(game.Execute(A, new SendChestScout(Find(game, A, SiteKind.Village).Site.Id)).Ok, "a village is not a chest");
        Ok(game.Execute(A, new SendChestScout(chest.Site.Id)));
        Assert.False(game.Execute(A, new SendChestScout(chest.Site.Id)).Ok, "one scout per chest");
    }

    [Fact]
    public void A_chest_emptied_by_somebody_else_is_found_empty()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        Explore(game, B, Corner.NorthWest);
        for (int t = 0; t < 300; t++) game.Tick(1); // B's trail through the forest has closed: B no longer looks at the chest
        Assert.Empty(game.TrailOf(B));
        var chest = Find(game, A, SiteKind.Chest);
        Ok(game.Execute(A, new SendChestScout(chest.Site.Id)));
        RunUntil(game, () => game.MissionsOf(A).Count == 0);
        Assert.False(game.KnownSitesOf(B).First(k => k.Site.Id == chest.Site.Id).Gone, "B does not know yet");

        Ok(game.Execute(B, new SendChestScout(chest.Site.Id)));
        RunUntil(game, () => game.MissionsOf(B).Count == 0);
        Assert.Equal(0, game.CastleOf(B)!.Gold);
        Assert.True(game.KnownSitesOf(B).First(k => k.Site.Id == chest.Site.Id).Gone, "B found out on the spot");
    }

    [Fact]
    public void A_village_is_plundered_without_a_fight_and_the_loot_comes_home_with_the_army()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var village = Find(game, A, SiteKind.Village);
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        int population = game.CastleOf(A)!.Population;

        Ok(game.Execute(A, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 3 })));
        RunUntil(game, () => game.AllSites.First(s => s.Site.Id == village.Site.Id).Gone);
        Assert.Empty(game.ActiveBattles); // no fight
        Assert.Equal(0, game.CastleOf(A)!.Gold); // still out
        RunUntil(game, () => game.ArmiesOf(A).Count == 0);

        var castle = game.CastleOf(A)!;
        Assert.Equal(village.Site.Gold, castle.Gold);
        Assert.Equal(population + village.Site.People, castle.Population);
        Assert.Equal(village.Site.People, castle.Workers[Job.Idle] - (Rules.Match.StartingPopulation));
        Assert.Equal(3, castle.Soldiers[Sword]); // everybody came home
        Assert.InRange(village.Site.People, Rules.Forest.Village.PeopleMin, Rules.Forest.Village.PeopleMax);
        Assert.InRange(village.Site.Gold, Rules.Forest.Village.GoldMin, Rules.Forest.Village.GoldMax);
    }

    [Fact]
    public void A_village_needs_three_soldiers_and_can_only_be_plundered_once()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var village = Find(game, A, SiteKind.Village);
        game.CastleOf(A)!.AddSoldiers(Sword, 5);
        Assert.False(game.Execute(A, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 2 })).Ok);
        Assert.Equal(5, game.CastleOf(A)!.Soldiers[Sword]); // nobody left home for a refused order
        Ok(game.Execute(A, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 3 })));

        // B knows it too, and sends its army a little later: it finds a ruin and goes home with nothing.
        Explore(game, B, Corner.NorthWest);
        game.CastleOf(B)!.AddSoldiers(Sword, 3);
        RunUntil(game, () => game.ArmiesOf(A).Count == 0);
        Assert.Equal(village.Site.Gold, game.CastleOf(A)!.Gold);
        Assert.False(game.Execute(B, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 3 })).Ok,
            "B saw the ruin with its own scout, so it knows");
    }

    [Fact]
    public void Raids_on_the_forest_go_out_in_preparation_but_castles_wait_for_the_war()
    {
        var game = Game(prep: 5000);
        Assert.Equal(MatchPhase.Preparation, game.Phase);
        Explore(game, A, Corner.NorthWest);
        var village = Find(game, A, SiteKind.Village);
        game.CastleOf(A)!.AddSoldiers(Sword, 4);
        Assert.False(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 3 })).Ok, "castles: only in the war");
        Ok(game.Execute(A, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 3 })));
        RunUntil(game, () => game.ArmiesOf(A).Count == 0);
        Assert.Equal(village.Site.Gold, game.CastleOf(A)!.Gold);
        Assert.Equal(MatchPhase.Preparation, game.Phase);
    }

    [Fact]
    public void In_preparation_armies_of_different_players_walk_through_each_other_in_the_war_they_fight()
    {
        foreach (var (prep, expectBattle) in new[] { (5000.0, false), (1.0, true) })
        {
            var game = Game(prep);
            Explore(game, A, Corner.NorthWest);
            Explore(game, C, Corner.NorthWest);
            var village = Find(game, A, SiteKind.Village);
            game.CastleOf(A)!.AddSoldiers(Sword, 3);
            game.CastleOf(C)!.AddSoldiers(Sword, 3);
            // The same place from two sides, timed so that both armies get there together: they meet at the end of its trail.
            double a = game.Map.RouteToSite(Corner.NorthWest, village.Site).Length, c = game.Map.RouteToSite(Corner.NorthEast, village.Site).Length;
            Assert.True(c > a);
            Ok(game.Execute(C, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 3 })));
            for (int t = 0; t < (int)Math.Round((c - a) / Rules.Map.ArmySpeed); t++) game.Tick(1);
            Ok(game.Execute(A, new SendArmyToSite(village.Site.Id, new Dictionary<string, int> { ["kilicli"] = 3 })));
            bool battle = false;
            for (int t = 0; t < 800 && (game.ArmiesOf(A).Count > 0 || game.ArmiesOf(C).Count > 0); t++)
            {
                game.Tick(1);
                battle |= game.ActiveBattles.Any(b => b.Kind == BattleKind.Field);
            }
            Assert.Equal(expectBattle, battle);
        }
    }
}
