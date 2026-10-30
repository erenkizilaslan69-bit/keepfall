using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>The gate guards: free swordsmen at every castle's gate that fight only there, are no population and come back after a while.</summary>
public class GuardTests
{
    private static readonly GameRules Shipped = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));
    private static readonly GameRules Rules = Shipped.WithWalls(new WallRules(Shipped.Walls.ArcherDefenseBonus, 4, 60));
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;
    private const string A = "o1", B = "o2";

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState War()
    {
        var corners = new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast };
        var game = new GameState(Rules, [A, B], 10, 900, new Random(1), corners);
        Ok(game.Execute(A, new SetGrowth(false)));
        Ok(game.Execute(B, new SetGrowth(false)));
        for (int i = 0; i < 10; i++) game.Tick(1);
        Assert.Equal(MatchPhase.War, game.Phase);
        return game;
    }

    private static void RunUntilReport(GameState game, string player)
    {
        for (int t = 0; game.BattlesOf(player).Count < 1; t++) { Assert.True(t < 600, "no report"); game.Tick(1); }
    }

    [Fact]
    public void The_shipped_config_gives_four_guards_that_come_back_every_minute()
    {
        Assert.Equal(4, Shipped.Walls.Guards);
        Assert.Equal(60, Shipped.Walls.GuardRespawnSeconds);
    }

    [Fact]
    public void Guards_are_no_population_and_eat_nothing()
    {
        var game = War();
        var castle = game.CastleOf(B)!;
        Assert.Equal(4, castle.Guards);
        Assert.Equal(0, castle.SoldierCount);
        Assert.Equal(castle.WorkerCount, castle.Population);
    }

    [Fact]
    public void A_castle_with_no_army_is_not_empty_a_small_raid_cannot_take_it()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 2);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { [Sword.Id] = 2 })));
        RunUntilReport(game, A);
        var report = game.BattlesOf(A)[0];
        Assert.False(report.DefenderEliminated);
        Assert.Equal(BattleWinner.Defender, report.Winner);
        Assert.Equal(4, report.DefenderUnits.Sum(l => l.Count)); // the guards fought as swordsmen
        Assert.False(game.IsEliminated(B));
        Assert.Equal(0, game.CastleOf(B)!.SoldierCount); // and they are not soldiers
    }

    [Fact]
    public void Fallen_guards_are_replaced_one_at_a_time_after_a_minute_each()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { [Sword.Id] = 3 })));
        RunUntilReport(game, A);
        var castle = game.CastleOf(B)!;
        int standing = castle.Guards;
        Assert.InRange(standing, 0, 4);
        if (standing == 4) return; // nobody fell: nothing to wait for
        game.Tick(59);
        Assert.Equal(standing, castle.Guards);
        game.Tick(2);
        Assert.Equal(standing + 1, castle.Guards);
        for (int i = 0; i < 4 * 60 + 5; i++) game.Tick(1);
        Assert.Equal(4, castle.Guards);
    }

    [Fact]
    public void A_big_army_still_takes_the_castle_and_the_guards_are_not_prisoners()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 30);
        Ok(game.Execute(A, new SendArmy(B, new Dictionary<string, int> { [Sword.Id] = 30 })));
        RunUntilReport(game, A);
        var report = game.BattlesOf(A)[0];
        Assert.True(report.DefenderEliminated);
        Assert.Equal(0, report.Loot?.Prisoners ?? 0); // the guards are no army: nobody is taken
    }
}
