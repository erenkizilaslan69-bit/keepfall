using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The "who fooled whom" log: it records plain facts of the kingdoms' tricks, and leaves the server only inside the final result.</summary>
public class DeceptionLogTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private const string A = "o1", B = "o2", C = "o3";
    private static readonly UnitType Sword = Rules.FindUnit("kilicli")!;

    private static void Ok(CommandResult r) => Assert.True(r.Ok, r.Error);
    private static Dictionary<string, int> Units(int n) => new() { ["kilicli"] = n };

    private static GameState War(string a, string b, string c)
    {
        var game = new GameState(Rules, [A, B, C], prepSeconds: 1, warSeconds: 100_000, rng: new Random(1),
            corners: new Dictionary<string, Corner> { [A] = Corner.NorthWest, [B] = Corner.SouthEast, [C] = Corner.NorthEast }, forestSeed: 5,
            factions: new Dictionary<string, string> { [A] = a, [B] = b, [C] = c });
        foreach (var p in new[] { A, B, C }) Ok(game.Execute(p, new SetGrowth(false)));
        game.Tick(1);
        return game;
    }

    private static void RunUntil(GameState game, Func<bool> done, int limit = 3000)
    {
        for (int t = 0; !done(); t++) { Assert.True(t < limit, "never happened"); game.Tick(1); }
    }

    [Fact]
    public void A_fresh_match_has_an_empty_log()
    {
        Assert.Empty(War(Factions.Shadow, Factions.Merchant, Factions.Schemer).DeceptionLog);
    }

    [Fact]
    public void The_shadows_false_report_and_phantom_are_logged_with_what_happened_to_them()
    {
        var game = War(Factions.Shadow, Factions.Merchant, Factions.Oracle);
        game.CastleOf(A)!.AddGold(100);
        Ok(game.Execute(A, new SetFakeReport(Units(40))));
        Ok(game.Execute(B, new SendScout(A)));
        Ok(game.Execute(C, new SendScout(A)));
        Ok(game.Execute(A, new SendDecoy(C, Units(10))));
        RunUntil(game, () => game.ArmiesOf(A).Count == 0 && game.ReportsOf(B).Count == 1 && game.ReportsOf(C).Count == 1);

        var log = game.DeceptionLog;
        Assert.Contains(log, e => e is { Kind: DeceptionKind.FakeReportSet, Actor: A, Count: 40 });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.FakeReportRead, Actor: A, Target: B });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.FakeReportSeenThrough, Actor: A, Target: C });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.DecoySent, Actor: A, Target: C, Count: 10 });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.DecoySighted, Actor: A, Target: C });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.OracleSawIncoming, Actor: A, Target: C, Detail: "decoy" });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.DecoyFaded, Actor: A, Target: C });
        // Entries come in time order.
        Assert.Equal(log.OrderBy(e => e.At).Select(e => e.Kind), log.Select(e => e.Kind));
    }

    [Fact]
    public void A_bribe_is_logged_with_the_victim_and_the_number_turned()
    {
        var game = War(Factions.Merchant, Factions.Schemer, Factions.Shadow);
        game.CastleOf(B)!.AddSoldiers(Sword, 20);
        game.CastleOf(A)!.AddGold(200);
        Ok(game.Execute(B, new SendArmy(A, Units(20))));
        var army = game.ArmiesOf(B).Single();
        while (!game.CastleVisionOf(A).Contains(army.Position)) game.Tick(1);
        Ok(game.Execute(A, new BribeArmy(game.SeenBy(A).Single().Id, 100)));
        Assert.Contains(game.DeceptionLog, e => e is { Kind: DeceptionKind.Bribed, Actor: A, Target: B, Count: 8 });
    }

    [Fact]
    public void A_schemers_disguised_army_and_envoy_are_logged_and_so_is_the_unmasking()
    {
        var game = War(Factions.Schemer, Factions.Merchant, Factions.Oracle);
        game.CastleOf(A)!.AddSoldiers(Sword, 10);
        Ok(game.Execute(A, new SendEnvoy(B, 0, 0, 0, 0, "merhaba", Job.Idle, C)));
        RunUntil(game, () => game.LettersOf(B).Count == 1);
        Ok(game.Execute(A, new SendArmy(B, Units(10)) { AsKey = C }));
        RunUntil(game, () => game.BattlesOf(B).Count > 0);
        game.Tick(Rules.Kingdoms.DisguiseRevealSeconds + 1);

        var log = game.DeceptionLog;
        Assert.Contains(log, e => e is { Kind: DeceptionKind.EnvoyAsSent, Actor: A, Target: B, As: C });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.EnvoyAsDelivered, Actor: A, Target: B, As: C });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.ArmyAsSent, Actor: A, Target: B, As: C, Count: 10 });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.DisguisedFought, Actor: A, Target: B, As: C });
        Assert.Contains(log, e => e is { Kind: DeceptionKind.Unmasked, Actor: A, Target: B, As: C, Detail: "time" });
    }

    [Fact]
    public void A_failed_trick_leaves_no_trace_in_the_log()
    {
        var game = War(Factions.Merchant, Factions.Schemer, Factions.Shadow);
        Assert.False(game.Execute(A, new SendDecoy(B, Units(5))).Ok); // not a shadow
        Assert.False(game.Execute(A, new BribeArmy("nope", 3)).Ok);
        Assert.False(game.Execute(B, new SendEnvoy(A, 0, 0, 0, 0, "x", Job.Idle, A)).Ok);
        Assert.Empty(game.DeceptionLog);
    }

    [Fact]
    public void The_log_stays_out_of_the_room_view_until_the_match_is_over_and_then_goes_with_the_result()
    {
        Room? found = null;
        RoomPlayer? shadow = null;
        for (int i = 0; i < 30 && shadow is null; i++)
        {
            var room = new Room("ABCDE" + i, Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 10, WarSeconds = 600 });
            var human = room.Join("Ada", null, false, DateTime.UtcNow).Player!;
            room.AddBot(human.Token, BotDifficulty.Easy);
            room.AddBot(human.Token, BotDifficulty.Easy);
            room.SetReady(human.Token, true);
            Assert.True(room.Start(human.Token).Ok);
            shadow = room.Players.FirstOrDefault(p => room.Game!.FactionOf(p.CastleKey) == Factions.Shadow);
            found = room;
        }
        Assert.NotNull(shadow);
        var r = found!;
        while (r.Game!.Phase == MatchPhase.Preparation) r.Tick(1);
        var target = r.Players.First(p => p != shadow);
        r.Game.CastleOf(shadow!.CastleKey)!.AddGold(200);
        Ok(r.Game.Execute(shadow.CastleKey, new SetFakeReport(Units(30))));
        Ok(r.Game.Execute(shadow.CastleKey, new SendDecoy(target.CastleKey, Units(5))));
        Assert.NotEmpty(r.Game.DeceptionLog);

        // Mid-match: nothing in any player's room view.
        var mid = ViewMapper.ToView(r);
        Assert.Null(mid.Result);

        // Finish the match.
        for (int t = 0; r.Phase != RoomPhase.Ended; t++) { Assert.True(t < 3000); r.Tick(1); }
        var result = ViewMapper.ToView(r).Result!;
        Assert.NotNull(result.Deceptions);
        Assert.Contains(result.Deceptions!, e => e.Kind == "FakeReportSet" && e.ActorSeat == shadow.Seat && e.Count == 30);
        Assert.Contains(result.Deceptions!, e => e.Kind == "DecoySent" && e.ActorSeat == shadow.Seat && e.TargetSeat == target.Seat);
    }
}
