using Keepfall.Core;
using Keepfall.Core.Challenges;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Tests;

/// <summary>What happens to a player whose castle has fallen: a lost challenge ends at once, other matches go on for the rest, and leaving does not hand the seat to a bot.</summary>
public class FallFlowTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly DateTime T0 = new(2026, 11, 6, 12, 0, 0, DateTimeKind.Utc);

    private static ChallengeDef Def() => new()
    {
        Id = "t", Order = 1, Name = new() { Tr = "t", En = "t" }, Description = new() { Tr = "t", En = "t" }, Kingdom = Factions.Merchant, Seed = 5,
        PlayerDeck = ["okcu", "kilicli", "mizrakci", "kalkanli"], Bots = [new ChallengeBot { Difficulty = "easy" }, new ChallengeBot { Difficulty = "easy" }], WarSeconds = 600,
        Goals = [new ChallengeGoal { Id = "win", Type = GoalTypes.Win, Value = 1, Star = 1 }, new ChallengeGoal { Id = "few", Type = GoalTypes.MaxSoldiersLost, Value = 5, Star = 2 }, new ChallengeGoal { Id = "fast", Type = GoalTypes.WinWithin, Value = 500, Star = 3 }],
    };

    /// <summary>The bot's army walks over the human's castle; returns once the human has fallen.</summary>
    private static void CrushHuman(Room room, RoomPlayer human)
    {
        while (room.Game!.Phase == MatchPhase.Preparation) room.Tick(1);
        var bot = room.Players.First(p => p.IsBot);
        room.Game.CastleOf(bot.CastleKey)!.AddSoldiers(Rules.FindUnit("kilicli")!, 40);
        var sent = room.Game.Execute(bot.CastleKey, new SendArmy(human.CastleKey, new Dictionary<string, int> { ["kilicli"] = 40 })); Assert.True(sent.Ok, sent.Error);
        for (int t = 0; !room.Game.IsEliminated(human.CastleKey); t++) { Assert.True(t < 900); room.Tick(1); }
    }

    [Fact]
    public void A_challenge_ends_a_few_seconds_after_its_player_falls_and_is_lost()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1 });
        var human = room.Join("Ada", null, false, T0).Player!;
        var started = room.StartChallenge(human.Token, Def()); Assert.True(started.Ok, started.Error);
        CrushHuman(room, human);

        // Not on the very tick (the fall is seen first)...
        Assert.Equal(RoomPhase.War, room.Phase);
        for (int t = 0; t < 20 && room.Phase != RoomPhase.Ended; t++) room.Tick(1);
        // ...but within seconds, not after the war's ten minutes (the rest is played out inside that one call).
        Assert.Equal(RoomPhase.Ended, room.Phase);
        var outcome = ChallengeEvaluator.Evaluate(room, human)!;
        Assert.False(outcome.Won);
        Assert.Equal(0, outcome.Stars);
    }

    [Fact]
    public void An_ordinary_bot_match_is_not_cut_short_when_the_human_falls()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1, PrepSeconds = 10, WarSeconds = 600 });
        var human = room.Join("Ada", null, false, T0).Player!;
        room.AddBot(human.Token, BotDifficulty.Easy);
        room.AddBot(human.Token, BotDifficulty.Easy);
        room.SetReady(human.Token, true);
        Assert.True(room.Start(human.Token).Ok);
        CrushHuman(room, human);
        for (int t = 0; t < 30; t++) room.Tick(1);
        Assert.Equal(RoomPhase.War, room.Phase); // the player decides: watch, or end it
        Assert.True(room.IsEliminated(human));
    }

    [Fact]
    public void A_fallen_player_who_leaves_keeps_the_seat_and_the_match_goes_on_for_the_others()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 2, PrepSeconds = 10, WarSeconds = 600 });
        var a = room.Join("Ada", null, false, T0).Player!;
        var b = room.Join("Bora", null, false, T0).Player!;
        room.AddBot(a.Token, BotDifficulty.Easy);
        room.SetReady(a.Token, true);
        room.SetReady(b.Token, true);
        Assert.True(room.Start(a.Token).Ok);
        while (room.Game!.Phase == MatchPhase.Preparation) room.Tick(1);
        var bot = room.Players.First(p => p.IsBot);
        room.Game.CastleOf(bot.CastleKey)!.AddSoldiers(Rules.FindUnit("kilicli")!, 40);
        Assert.True(room.Game.Execute(bot.CastleKey, new SendArmy(b.CastleKey, new Dictionary<string, int> { ["kilicli"] = 40 })).Ok);
        for (int t = 0; !room.Game.IsEliminated(b.CastleKey); t++) { Assert.True(t < 900); room.Tick(1); }

        room.Leave(b.Token, T0);
        for (int t = 0; t < 20; t++) room.Tick(1);
        Assert.Equal(RoomPhase.War, room.Phase);
        var seat = room.Players.Single(p => p.Seat == b.Seat);
        Assert.False(seat.IsBot); // the seat is not given to a bot
        Assert.False(seat.Connected);
        Assert.True(room.IsEliminated(seat));
        Assert.False(room.AllHumansOut); // Ada is still in it
    }
}
