using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Cavalry: twice as fast, and an army of nothing but cavalry burns fields instead of taking a castle.</summary>
public class RaidTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Cavalry = Rules.FindUnit("suvari")!;
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState War(int players = 3)
    {
        var keys = Enumerable.Range(1, players).Select(i => $"o{i}").ToList();
        Corner[] corners = [Corner.NorthWest, Corner.SouthEast, Corner.NorthEast];
        var game = new GameState(Rules, keys, 10, 600, new Random(1), keys.Select((k, i) => (k, i)).ToDictionary(x => x.k, x => corners[i0(x.i)]));
        foreach (var k in keys) Ok(game.Execute(k, new SetGrowth(false)));
        for (int i = 0; i < 10; i++) game.Tick(1);
        return game;
        static int i0(int i) => i;
    }

    private static SendArmy Send(string to, params (UnitType Type, int Count)[] units) => new(to, units.ToDictionary(u => u.Type.Id, u => u.Count));

    [Fact]
    public void A_cavalry_army_walks_twice_as_fast_and_a_mixed_army_at_the_slowest_pace()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Cavalry, 3);
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, Send(B, (Cavalry, 3))));
        var fast = game.ArmiesOf(A).Single();
        Assert.Equal(Rules.Map.ArmySpeed * 2, fast.Out.Speed);
        Ok(game.Execute(A, Send(B, (Cavalry, 0 + 0), (Sword, 3))));
        var slow = game.ArmiesOf(A).Single(a => a.Id != fast.Id);
        Assert.Equal(Rules.Map.ArmySpeed, slow.Out.Speed);
    }

    [Fact]
    public void A_raid_that_wins_burns_the_fields_and_the_castle_stands()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Cavalry, 4);
        game.CastleOf(B)!.Execute(new MoveWorkers(Job.Idle, Job.Farmer, 4));
        double before = game.CastleOf(B)!.ProductionPerMinute(Resource.Food);
        Ok(game.Execute(A, Send(B, (Cavalry, 4))));
        for (int t = 0; t < 400 && game.BattlesOf(A).Count == 0; t++) game.Tick(1);

        var report = Assert.Single(game.BattlesOf(A));
        Assert.True(report.Raid);
        Assert.False(report.DefenderEliminated);
        Assert.False(game.IsEliminated(B));
        Assert.Equal(BattleWinner.Attacker, report.Winner);
        Assert.Equal(Rules.War.RaidBurnSeconds, game.CastleOf(B)!.ScorchLeft, 1);
        game.Tick(1);
        Assert.Equal(before * Rules.War.RaidBurnFactor, game.CastleOf(B)!.ProductionPerMinute(Resource.Food), 6);
        Assert.Contains(game.TakeNotifications(B), n => n.Kind == NotificationKind.FieldsBurned && n.OtherPlayer == A);
        // The riders go home, and the fields recover after the burn time.
        for (int t = 0; t < 80; t++) game.Tick(1);
        Assert.Equal(0, game.CastleOf(B)!.ScorchLeft);
        Assert.Equal(before, game.CastleOf(B)!.ProductionPerMinute(Resource.Food), 6);
        Assert.True(game.CastleOf(A)!.Soldiers[Cavalry] > 0, "the surviving riders are home");
    }

    [Fact]
    public void A_mixed_army_that_wins_still_takes_the_castle()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Cavalry, 3);
        game.CastleOf(A)!.AddSoldiers(Sword, 3);
        Ok(game.Execute(A, Send(B, (Cavalry, 3), (Sword, 3))));
        for (int t = 0; t < 500 && game.BattlesOf(A).Count == 0; t++) game.Tick(1);
        var report = Assert.Single(game.BattlesOf(A));
        Assert.False(report.Raid);
        Assert.True(report.DefenderEliminated);
    }

    [Fact]
    public void A_raid_that_loses_burns_nothing()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Cavalry, 2);
        game.CastleOf(B)!.AddSoldiers(Rules.FindUnit("mizrakci")!, 8);
        Ok(game.Execute(A, Send(B, (Cavalry, 2))));
        for (int t = 0; t < 400 && game.BattlesOf(A).Count == 0; t++) game.Tick(1);
        var report = Assert.Single(game.BattlesOf(A));
        Assert.Equal(BattleWinner.Defender, report.Winner);
        Assert.False(report.Raid);
        Assert.Equal(0, game.CastleOf(B)!.ScorchLeft);
    }

    [Fact]
    public void Even_an_empty_castle_is_fought_for_a_few_seconds_so_the_battle_is_seen()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Sword, 4);
        Ok(game.Execute(A, Send(B, (Sword, 4))));
        for (int t = 0; t < 600 && game.ActiveBattlesOf(A).Count == 0; t++) game.Tick(1);
        var battle = Assert.Single(game.ActiveBattlesOf(A));
        Assert.True(Rules.War.MinBattleSeconds >= 3);
        Assert.True(battle.FightSeconds >= Rules.War.MinBattleSeconds, $"{battle.FightSeconds} s");
    }

    [Fact]
    public void Fast_cavalry_never_jumps_either()
    {
        var game = War();
        game.CastleOf(A)!.AddSoldiers(Cavalry, 3);
        Ok(game.Execute(A, Send(B, (Cavalry, 3))));
        for (int t = 0; t < 40; t++) game.Tick(5);
        Assert.Equal(0, game.ContinuityViolations);
    }
}
