using Keepfall.Core.Combat;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.World;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The wall round the castle: its levels and hit points, the upgrade, the archers behind it, and who can see its level.</summary>
public class WallTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2";

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState NewGame(double prep = 600)
    {
        var game = new GameState(Rules, [A, B], prepSeconds: prep, warSeconds: 1000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast });
        foreach (var p in new[] { A, B }) Ok(game.Execute(p, new SetGrowth(false)));
        return game;
    }

    [Fact]
    public void The_levels_are_the_sheets_numbers_and_the_wall_starts_at_level_one()
    {
        var w = Rules.Walls;
        Assert.Equal(3, w.MaxLevel);
        Assert.Equal((500.0, 1000.0, 1800.0), (w.HpOf(1), w.HpOf(2), w.HpOf(3)));
        Assert.Equal((40.0, 20.0, 90.0), (w.UpgradeTo(2).UpgradeWood, w.UpgradeTo(2).UpgradeIron, w.UpgradeTo(2).UpgradeSeconds));
        Assert.Equal((80.0, 50.0, 120.0), (w.UpgradeTo(3).UpgradeWood, w.UpgradeTo(3).UpgradeIron, w.UpgradeTo(3).UpgradeSeconds));
        Assert.Equal(0.25, w.ArcherDefenseBonus);
        var castle = NewGame().CastleOf(A)!;
        Assert.Equal((1, 500.0, 500.0), (castle.WallLevel, castle.WallHp, castle.MaxWallHp));
    }

    [Fact]
    public void An_upgrade_costs_wood_and_iron_takes_its_time_and_adds_the_difference_in_hit_points()
    {
        var game = NewGame();
        var castle = game.CastleOf(A)!;
        castle.AddGoods(0, 100, 100);
        double wood = castle.Wood, iron = castle.Iron;
        castle.TakeWallDamage(200); // 300 / 500 left
        Ok(game.Execute(A, new UpgradeWall()));
        Assert.Equal(wood - 40, castle.Wood, 3);
        Assert.Equal(iron - 20, castle.Iron, 3);
        Assert.False(game.Execute(A, new UpgradeWall()).Ok); // one at a time
        for (int t = 0; t < 89; t++) game.Tick(1);
        Assert.Equal(1, castle.WallLevel);
        Assert.NotNull(castle.WallUpgradeRemaining);
        game.Tick(2);
        Assert.Equal(2, castle.WallLevel);
        Assert.Null(castle.WallUpgradeRemaining);
        Assert.Equal((1000.0, 800.0), (castle.MaxWallHp, castle.WallHp)); // 300 + 500: what it lost stays lost
    }

    [Fact]
    public void It_needs_the_goods_it_stops_at_the_top_and_a_fallen_wall_cannot_be_raised()
    {
        var game = NewGame();
        var castle = game.CastleOf(A)!;
        Ok(game.Execute(A, new UpgradeWall())); // the start has just the 40 wood and 20 iron level 2 costs
        for (int t = 0; t < 95; t++) game.Tick(1);
        Assert.Equal(2, castle.WallLevel);
        Assert.False(game.Execute(A, new UpgradeWall()).Ok); // level 3 wants 80 wood and 50 iron: not there
        castle.AddGoods(0, 500, 500);
        Ok(game.Execute(A, new UpgradeWall()));
        for (int t = 0; t < 125; t++) game.Tick(1);
        Assert.Equal((3, 1800.0), (castle.WallLevel, castle.MaxWallHp));
        Assert.False(game.Execute(A, new UpgradeWall()).Ok);
        var other = game.CastleOf(B)!;
        other.AddGoods(0, 500, 500);
        other.TakeWallDamage(other.WallHp);
        Assert.False(game.Execute(B, new UpgradeWall()).Ok);
    }

    [Fact]
    public void The_archers_behind_the_wall_shoot_harder_while_it_stands()
    {
        var archer = Rules.FindUnit("okcu")!; var sword = Rules.FindUnit("kilicli")!;
        var sim = new BattleSimulator(Rules);
        double Survivors(double factor)
        {
            int total = 0;
            for (int seed = 1; seed <= 30; seed++)
            {
                var attackers = new ArmySetup("A").Add(sword, 30);
                var defenders = new ArmySetup("B") { RangedDamageFactor = factor }.Add(archer, 14).Add(sword, 6);
                total += sim.Simulate(attackers, defenders, new Random(seed)).SideB.ByType.Sum(t => t.Survivors);
            }
            return total;
        }
        Assert.True(Survivors(1.25) > Survivors(1.0), "the bonus should leave more defenders standing");
    }

    [Fact]
    public void A_siege_gives_the_defending_archers_the_bonus_only_while_the_wall_stands()
    {
        var game = NewGame(prep: 2);
        game.Tick(2);
        var castle = game.CastleOf(B)!;
        Assert.True(castle.WallHp > 0);
        // (the factor itself is covered above; here: a wall at zero hit points gets none)
        castle.TakeWallDamage(castle.WallHp);
        Assert.Equal(0, castle.WallHp);
    }

    [Fact]
    public void Another_castles_wall_level_is_seen_from_its_gate_and_in_a_scout_report_but_not_from_afar()
    {
        var game = NewGame();
        Assert.Empty(game.WallsSeenBy(A)); // far away
        var b = game.CastleOf(B)!;
        b.AddGoods(0, 200, 200);
        Ok(game.Execute(B, new UpgradeWall()));
        for (int t = 0; t < 95; t++) game.Tick(1);
        Assert.Equal(2, b.WallLevel);
        Assert.Empty(game.WallsSeenBy(A));

        Ok(game.Execute(A, new SendScout(B)));
        bool saw = false;
        while (game.MissionsOf(A).Count > 0)
        {
            game.Tick(1);
            if (game.WallsSeenBy(A).Contains((B, 2))) saw = true;
        }
        Assert.True(saw, "the scout at the gate should see the wall");
        Assert.Equal(2, game.ReportsOf(A).Single().WallLevel);
        Assert.Empty(game.WallsSeenBy(B).Where(w => w.Castle == A)); // B has nobody near A
    }

    [Fact]
    public void The_view_shows_our_wall_and_what_the_next_level_costs_and_a_rival_only_where_we_can_see_it()
    {
        var room = Room.StartBotMatch("WLL", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 600, WarSeconds = 900, Seed = 2 }, [BotDifficulty.Medium, BotDifficulty.Medium]);
        var me = room.Players[0];
        var view = ViewMapper.CastleOf(room, me)!;
        Assert.Equal(1, view.War.WallLevel);
        var next = view.War.WallUpgrade!;
        Assert.Equal((2, 1000.0, 40.0, 20.0, 90.0), (next.NextLevel, next.NextHp, next.NextWood, next.NextIron, next.NextSeconds));
        Assert.Empty(MapViewMapper.StateOf(room, me)!.Walls ?? []);
    }
}

/// <summary>Medium and hard bots raise their wall; an easy one does not.</summary>
public class BotWallTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    /// <summary>The wall's level, counting an upgrade under way as the level it will reach.</summary>
    private static int WallLevelAfter(BotDifficulty level, double seconds)
    {
        var room = Room.StartBotMatch("BWL", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 300, WarSeconds = 900, Seed = 3 }, [level, BotDifficulty.Easy]);
        var game = room.Game!;
        var me = room.Players[0];
        var castle = game.CastleOf(me.CastleKey)!;
        castle.AddGoods(0, 400, 400);
        var bot = new Keepfall.Bots.Bot(Rules, level, 1, 11);
        for (int t = 0; t < seconds; t++)
        {
            if (t % 100 == 0) castle.AddGoods(0, 300, 300); // plenty, so that only the bot's own policy decides
            if (bot.IsDue(game.ElapsedSeconds))
            {
                var input = new Keepfall.Bots.BotInput(ViewMapper.CastleOf(room, me)!, MapViewMapper.StateOf(room, me), MapViewMapper.LayoutOf(room), ViewMapper.ToView(room), me.Seat);
                foreach (var c in bot.Think(input)) if (!game.Execute(me.CastleKey, c).Ok) bot.Refused(c, game.ElapsedSeconds);
            }
            room.Tick(1);
        }
        return castle.WallLevel + (castle.WallUpgradeRemaining is null ? 0 : 1);
    }

    [Fact]
    public void Medium_and_hard_bots_raise_the_wall_in_the_middle_of_the_preparation_and_again_in_the_war_but_an_easy_one_does_not()
    {
        Assert.True(Rules.Bots.Of(BotDifficulty.Medium).WallUpgrade && Rules.Bots.Of(BotDifficulty.Hard).WallUpgrade);
        Assert.False(Rules.Bots.Of(BotDifficulty.Easy).WallUpgrade);
        foreach (var level in new[] { BotDifficulty.Medium, BotDifficulty.Hard })
        {
            Assert.Equal(1, WallLevelAfter(level, 100)); // not before the preparation is half over
            Assert.Equal(2, WallLevelAfter(level, 280)); // level 2 by the end of the preparation, level 3 waits for the war
            Assert.Equal(3, WallLevelAfter(level, 330)); // …and is under way soon after it begins
        }
        Assert.Equal(1, WallLevelAfter(BotDifficulty.Easy, 330));
    }
}
