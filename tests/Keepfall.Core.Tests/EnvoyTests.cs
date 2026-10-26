using System.Reflection;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Core.World;

namespace Keepfall.Core.Tests;

/// <summary>Envoys: goods and a message to a rival's castle. They share the scout's right and speed, gather nothing and cannot be caught.</summary>
public class EnvoyTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);

    private static GameState NewGame(double prep = 300)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: prep, warSeconds: 1000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.CastleOf(A)!.AddGold(100);
        game.CastleOf(A)!.AddGoods(100, 100, 100);
        return game;
    }

    private static void UntilHome(GameState game, string player)
    {
        for (int t = 0; t < 600 && game.MissionsOf(player).Count > 0; t++) game.Tick(1);
        Assert.Empty(game.MissionsOf(player));
    }

    [Fact]
    public void The_goods_leave_the_senders_stores_at_once_and_reach_the_receiver_with_the_message()
    {
        var game = NewGame();
        var a = game.CastleOf(A)!; var b = game.CastleOf(B)!;
        double aFood = a.Food, aGold = a.Gold, bIron = b.Iron, bGold = b.Gold;
        Ok(game.Execute(A, new SendEnvoy(B, 5, 0, 3, 10, "Barış olsun.")));
        Assert.Equal(aFood - 5, a.Food, 6);
        Assert.Equal(aGold - 10, a.Gold, 6);
        Assert.Equal(1, a.ScoutsAway);
        Assert.Empty(game.LettersOf(B)); // not there yet

        while (!game.LettersOf(B).Any()) game.Tick(1);
        var letter = Assert.Single(game.LettersOf(B));
        Assert.Equal((A, 5, 0, 3, 10, "Barış olsun."), (letter.From, letter.Food, letter.Wood, letter.Iron, letter.Gold, letter.Message));
        Assert.True(b.Iron >= bIron + 3 - 1e-6 && b.Gold >= bGold + 10 - 1e-6); // (food is eaten as it goes)
        Assert.Empty(game.LettersOf(A)); // the sender gets nothing back, only a notice
        Assert.Empty(game.LettersOf(C));
        Assert.Contains(game.TakeNotifications(B), n => n.Kind == NotificationKind.EnvoyArrived && n.OtherPlayer == A);
        Assert.Contains(game.TakeNotifications(A), n => n.Kind == NotificationKind.EnvoyDelivered && n.OtherPlayer == B);
        Assert.Empty(game.TakeNotifications(C));

        UntilHome(game, A);
        Assert.Equal(0, a.ScoutsAway);
        Assert.Equal(aGold - 10, a.Gold, 6); // it does not bring anything back
    }

    [Fact]
    public void An_envoy_uses_the_scouts_right_and_speed_and_the_last_minute_ban_does_not_apply_to_it()
    {
        Assert.Equal(1, Rules.Scouting.MaxScouts);
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)));
        Assert.False(game.Execute(A, new SendScout(C)).Ok); // the right is taken
        Assert.False(game.Execute(A, new SendEnvoy(C, 0, 0, 0, 1)).Ok);
        var m = Assert.Single(game.MissionsOf(A));
        Assert.Equal(MissionKind.Envoy, m.Kind);
        Assert.Equal(Rules.Map.ScoutSpeed, m.Leg.Speed);
        UntilHome(game, A);

        Ok(game.Execute(A, new SendScout(C)));
        Assert.False(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)).Ok); // and the other way round
        UntilHome(game, A);

        var late = NewGame(prep: 100);
        for (int t = 0; t < 45; t++) late.Tick(1);
        Assert.True(late.ScoutingLocked);
        Assert.False(late.Execute(A, new SendScout(B)).Ok);
        Ok(late.Execute(A, new SendEnvoy(B, 1, 0, 0, 0, "Son dakika.")));
    }

    [Fact]
    public void An_envoy_gathers_nothing_no_trail_no_report_no_vision_and_nobody_is_told_of_a_scout()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "Selam")));
        int circles = game.VisionOf(A).Count;
        for (int t = 0; t < 30; t++) game.Tick(1);
        Assert.Equal(circles, game.VisionOf(A).Count);
        Assert.Equal(1, circles); // just the castle
        Assert.Empty(game.TrailOf(A));
        UntilHome(game, A);
        Assert.Empty(game.ReportsOf(A));
        Assert.DoesNotContain(game.TakeNotifications(B), n => n.Kind == NotificationKind.ScoutedBy);
    }

    [Fact]
    public void Others_who_can_see_an_envoy_see_only_a_walking_envoy_without_an_owner()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 4, 0, 0, 0, "gizli mesaj")));
        bool seenByTarget = false;
        for (int t = 0; t < 120 && game.MissionsOf(A).Count > 0; t++)
        {
            game.Tick(1);
            foreach (var s in game.SeenBy(B)) { Assert.Equal(MoverKind.Envoy, s.Kind); Assert.Equal("", s.Owner); Assert.Empty(s.Units); seenByTarget = true; }
            foreach (var s in game.SeenBy(C)) { Assert.Equal(MoverKind.Envoy, s.Kind); Assert.Equal("", s.Owner); }
            Assert.DoesNotContain(game.SeenBy(A), s => s.Kind == MoverKind.Envoy); // never its own
        }
        Assert.True(seenByTarget, "the receiver should see it walk up to the gate");
    }

    [Fact]
    public void An_envoy_is_never_caught_it_stays_out_of_every_road_fight()
    {
        var game = NewGame(prep: 2);
        game.CastleOf(B)!.AddSoldiers(Rules.FindUnit("kilicli")!, 3);
        game.CastleOf(C)!.AddSoldiers(Rules.FindUnit("kilicli")!, 3);
        Ok(game.Execute(A, new SendEnvoy(B, 2, 0, 0, 0, "geçiyorum")));
        game.Tick(1); game.Tick(1);
        Ok(game.Execute(C, new SendArmy(B, new Dictionary<string, int> { ["kilicli"] = 3 }))); // armies out on the same roads
        for (int t = 0; t < 600 && !game.LettersOf(B).Any(); t++) game.Tick(1);
        Assert.Single(game.LettersOf(B));
        Assert.DoesNotContain(game.ActiveBattles, b => b.Involves(A));
    }

    [Fact]
    public void Checks_on_the_target_the_load_and_the_message()
    {
        var game = NewGame();
        Assert.False(game.Execute(A, new SendEnvoy(A, 1, 0, 0, 0)).Ok); // yourself
        Assert.False(game.Execute(A, new SendEnvoy("o9", 1, 0, 0, 0)).Ok); // nobody
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0)).Ok); // nothing to carry
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "   ")).Ok);
        Assert.False(game.Execute(A, new SendEnvoy(B, -1, 5, 0, 0)).Ok);
        int max = Rules.Envoy.MaxCargo;
        Assert.Equal(40, max);
        Assert.False(game.Execute(A, new SendEnvoy(B, 10, 10, 10, 11)).Ok); // 41
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 1000)).Ok); // not in the stores
        Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, new string('x', Rules.Envoy.MaxMessageLength + 1))).Ok);
        foreach (var bad in new[] { "iki\nsatır", "sekme\there", "gizli​karakter", "bidi‮metin", "nul\0" })
            Assert.False(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, bad)).Ok, bad);
        Assert.Equal(0, game.CastleOf(A)!.ScoutsAway); // none of that sent anybody
        Ok(game.Execute(A, new SendEnvoy(B, 10, 10, 10, 10, new string('x', Rules.Envoy.MaxMessageLength))));
    }

    [Fact]
    public void The_message_is_kept_as_it_was_sent_markup_and_all_and_trimmed()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "  <img src=x onerror=alert(1)> & \"tırnak\"  ")));
        while (!game.LettersOf(B).Any()) game.Tick(1);
        Assert.Equal("<img src=x onerror=alert(1)> & \"tırnak\"", game.LettersOf(B)[0].Message); // the client shows it as text only
    }

    [Fact]
    public void Nothing_can_be_sent_to_a_fallen_player_and_goods_for_one_who_falls_on_the_way_go_home_again()
    {
        var game = NewGame();
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 20, "geç kalma")));
        double gold = game.CastleOf(A)!.Gold;
        typeof(GameState).GetMethod("Eliminate", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(game, [B]);
        UntilHome(game, A);
        Assert.Empty(game.LettersOf(B));
        Assert.Equal(gold + 20, game.CastleOf(A)!.Gold, 6);
        Assert.False(game.Execute(A, new SendEnvoy(B, 1, 0, 0, 0)).Ok);
        Assert.False(game.Execute(B, new SendEnvoy(A, 1, 0, 0, 0)).Ok); // and the fallen send nothing
    }
}
