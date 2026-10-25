using Keepfall.Core.Config;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Bandit camps: a visible fight in either phase, a reward for clearing one, and what is left when the army loses.</summary>
public class ForestCampTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly Units.UnitType Sword = Rules.FindUnit("kilicli")!;
    private static readonly Units.UnitType Archer = Rules.FindUnit("okcu")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

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

    private static void RunUntil(GameState game, Func<bool> done, int limit = 1200)
    {
        for (int t = 0; !done(); t++) { Assert.True(t < limit, "never happened"); game.Tick(1); }
    }

    private static SendArmyToSite Raid(string site, int swords) => new(site, new Dictionary<string, int> { ["kilicli"] = swords });

    private static SiteState Truth(GameState game, string id) => game.AllSites.First(s => s.Site.Id == id);

    [Fact]
    public void An_army_that_wins_clears_the_camp_and_brings_its_gold_and_weapons_home()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        Ok(game.Execute(A, Raid(camp.Site.Id, 20)));

        RunUntil(game, () => game.ActiveBattles.Any(b => b.Kind == BattleKind.Camp));
        var battle = game.ActiveBattles.Single();
        Assert.True(battle.Involves(A));
        Assert.False(battle.Involves(B));
        Assert.Equal(camp.Site.Position, battle.Position);
        Assert.NotNull(battle.Record);
        Assert.Equal(Rules.Forest.Camp.Bandits.Values.Sum() + 20, battle.Record.Soldiers.Count);

        RunUntil(game, () => game.ArmiesOf(A).Count == 0);
        var castle = game.CastleOf(A)!;
        Assert.True(Truth(game, camp.Site.Id).Gone);
        Assert.Equal(0, Truth(game, camp.Site.Id).BanditCount);
        Assert.InRange(castle.Gold, Rules.Forest.Camp.GoldMin, Rules.Forest.Camp.GoldMax);
        Assert.Equal(camp.Site.Gold, castle.Gold);
        foreach (var (id, n) in Rules.Forest.Camp.Weapons) Assert.Equal(n, castle.Weapons[Rules.FindUnit(id)!]);
        Assert.InRange(castle.Soldiers[Sword], 1, 20); // survivors came home
        Assert.True(game.KnownSitesOf(A).First(k => k.Site.Id == camp.Site.Id).Gone, "A saw it cleared");
        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal((BattleKind.Camp, BattleWinner.Attacker, true), (report.Kind, report.Winner, report.Defender.StartsWith("site:")));
    }

    [Fact]
    public void An_army_that_loses_leaves_the_camp_with_its_survivors_and_gets_nothing()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        int bandits = Rules.Forest.Camp.Bandits.Values.Sum();
        game.CastleOf(A)!.AddSoldiers(Sword, 6);
        Ok(game.Execute(A, Raid(camp.Site.Id, 6)));
        RunUntil(game, () => game.ArmiesOf(A).Count == 0);

        var state = Truth(game, camp.Site.Id);
        Assert.False(state.Gone);
        Assert.InRange(state.BanditCount, 1, bandits); // whoever survived stays
        Assert.Equal(0, game.CastleOf(A)!.Gold);
        Assert.Equal(0, game.CastleOf(A)!.Soldiers[Sword]); // six against seven: none came back
        Assert.Equal(BattleWinner.Defender, game.BattlesOf(A).Single().Winner);

        // The survivors have not healed: the next army has an easier time (and finishes it).
        int left = state.BanditCount;
        game.CastleOf(A)!.AddSoldiers(Sword, 12);
        Ok(game.Execute(A, Raid(camp.Site.Id, 12)));
        RunUntil(game, () => game.ArmiesOf(A).Count == 0);
        Assert.True(Truth(game, camp.Site.Id).Gone);
        Assert.True(left < bandits);
        Assert.Equal(camp.Site.Gold, game.CastleOf(A)!.Gold);
    }

    [Fact]
    public void Camps_are_fought_in_preparation_too()
    {
        var game = Game(prep: 5000);
        Explore(game, A, Corner.NorthWest);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        Ok(game.Execute(A, Raid(camp.Site.Id, 20)));
        bool fought = false;
        RunUntil(game, () => { fought |= game.ActiveBattles.Any(b => b.Kind == BattleKind.Camp); return game.ArmiesOf(A).Count == 0; });
        Assert.True(fought);
        Assert.Equal(MatchPhase.Preparation, game.Phase);
        Assert.Equal(camp.Site.Gold, game.CastleOf(A)!.Gold);
    }

    [Fact]
    public void The_big_camp_has_the_strongest_bandits_and_the_richest_reward()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var big = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.BigCamp);
        Assert.True(Rules.Forest.BigCamp.Bandits.Values.Sum() > Rules.Forest.Camp.Bandits.Values.Sum());
        Assert.True(Rules.Forest.BigCamp.GoldMin > Rules.Forest.Camp.GoldMax);
        // What the scout made out is approximate, but it is a big band.
        Assert.InRange(big.BanditsSeen.Values.Sum(), 10, 24);

        game.CastleOf(A)!.AddSoldiers(Sword, 45);
        Ok(game.Execute(A, Raid(big.Site.Id, 45)));
        RunUntil(game, () => game.ArmiesOf(A).Count == 0, 2000);
        Assert.True(Truth(game, big.Site.Id).Gone);
        Assert.InRange(game.CastleOf(A)!.Gold, Rules.Forest.BigCamp.GoldMin, Rules.Forest.BigCamp.GoldMax);
        Assert.Equal(big.Site.Gold, game.CastleOf(A)!.Gold);
        Assert.Equal(Rules.Forest.BigCamp.Weapons.Values.Sum(), game.CastleOf(A)!.Weapons.Values.Sum());
    }

    [Fact]
    public void Two_armies_at_one_camp_fight_one_after_the_other_and_the_second_finds_it_cleared()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        Explore(game, C, Corner.NorthWest);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        game.CastleOf(C)!.AddSoldiers(Sword, 20);
        double a = game.Map.RouteToSite(Corner.NorthWest, camp.Site).Length, c = game.Map.RouteToSite(Corner.NorthEast, camp.Site).Length;
        Ok(game.Execute(C, Raid(camp.Site.Id, 20)));
        for (int t = 0; t < (int)Math.Round((c - a) / Rules.Map.ArmySpeed) + 1; t++) game.Tick(1); // A arrives just after C
        Ok(game.Execute(A, Raid(camp.Site.Id, 20)));
        int camps = 0;
        RunUntil(game, () =>
        {
            camps = Math.Max(camps, game.ActiveBattles.Count(b => b.Kind == BattleKind.Camp));
            return game.ArmiesOf(A).Count == 0 && game.ArmiesOf(C).Count == 0;
        });
        Assert.Equal(1, camps); // never two fights at the camp at once
        Assert.Equal(0, game.CastleOf(A)!.Gold + game.CastleOf(C)!.Gold - camp.Site.Gold); // the gold went to one of them only
        Assert.Single(new[] { game.CastleOf(A)!.Gold, game.CastleOf(C)!.Gold }, g => g > 0);
    }

    [Fact]
    public void Others_see_a_battle_in_the_forest_only_where_they_have_it_in_sight_and_only_as_a_marker()
    {
        var game = Game();
        Explore(game, A, Corner.NorthWest);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        game.CastleOf(A)!.AddSoldiers(Sword, 20);
        Ok(game.Execute(A, Raid(camp.Site.Id, 20)));
        RunUntil(game, () => game.ActiveBattles.Any(b => b.Kind == BattleKind.Camp));
        Assert.Empty(game.BattlesSeenBy(B));
        Assert.Empty(game.TakeStartedBattles(B));
        Assert.Single(game.TakeStartedBattles(A));
    }

    [Fact]
    public void A_camp_needs_a_known_place_and_a_known_uncleared_camp()
    {
        var game = Game();
        Assert.False(game.Execute(A, Raid("deadbeefdeadbeef", 3)).Ok);
        Explore(game, A, Corner.NorthWest);
        var camp = game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Camp);
        Assert.False(game.Execute(B, Raid(camp.Site.Id, 3)).Ok, "B has not found it");
        Assert.False(game.Execute(A, Raid(game.KnownSitesOf(A).First(k => k.Site.Kind == SiteKind.Chest).Site.Id, 3)).Ok, "chests are for scouts");
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Assert.False(game.Execute(A, Raid(camp.Site.Id, 4)).Ok, "only three at home");
        Ok(game.Execute(A, Raid(camp.Site.Id, 1))); // one soldier is allowed (and foolish)
    }
}
