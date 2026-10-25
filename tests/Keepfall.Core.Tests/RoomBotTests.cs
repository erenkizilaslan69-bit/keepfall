using Keepfall.Core.Config;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Tests;

/// <summary>Bots in the lobby: seats, names, who may add them, and ending a match nobody human is playing.</summary>
public class RoomBotTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly DateTime T0 = new(2026, 10, 26, 12, 0, 0, DateTimeKind.Utc);

    private static (Room room, RoomPlayer host) NewRoom(RoomOptions? options = null)
    {
        var room = new Room("ABCD", Rules, options);
        return (room, room.Join("Ali", null, false, T0).Player!);
    }

    private static void Ok(CommandResult result) => Assert.True(result.Ok, result.Error);

    [Fact]
    public void The_host_seats_a_bot_in_the_first_empty_seat_with_its_colours_name()
    {
        var (room, host) = NewRoom();
        Ok(room.AddBot(host.Token, BotDifficulty.Easy));
        Ok(room.AddBot(host.Token, BotDifficulty.Medium));

        var bots = room.Players.Where(p => p.IsBot).ToList();
        Assert.Equal([2, 3], bots.Select(b => b.Seat));
        Assert.Equal(["Bot Kırmızı", "Bot Sarı"], bots.Select(b => b.Name));
        Assert.Equal([BotDifficulty.Easy, BotDifficulty.Medium], bots.Select(b => b.Bot!.Value));
        Assert.All(bots, b => { Assert.True(b.Ready); Assert.True(b.Connected); });
        Assert.Equal(host.Seat, room.HostSeat);
    }

    [Fact]
    public void Only_the_host_adds_or_removes_bots_and_only_in_the_lobby_and_while_there_is_room()
    {
        var (room, host) = NewRoom();
        var guest = room.Join("Bora", null, false, T0).Player!;
        Assert.False(room.AddBot(guest.Token, BotDifficulty.Easy).Ok);
        Ok(room.AddBot(host.Token, BotDifficulty.Easy));
        Assert.False(room.RemoveBot(guest.Token, 3).Ok);
        Assert.False(room.RemoveBot(host.Token, 1).Ok); // a human's seat
        Assert.False(room.RemoveBot(host.Token, 4).Ok); // empty
        Ok(room.AddBot(host.Token, BotDifficulty.Easy));
        Assert.False(room.AddBot(host.Token, BotDifficulty.Easy).Ok); // full

        Ok(room.RemoveBot(host.Token, 3));
        Assert.Equal(3, room.Players.Count);
        Ok(room.SetReady(host.Token, true));
        Ok(room.SetReady(guest.Token, true));
        Ok(room.Start(host.Token));
        Assert.False(room.AddBot(host.Token, BotDifficulty.Easy).Ok);
        Assert.False(room.RemoveBot(host.Token, 3).Ok);
    }

    [Fact]
    public void A_bot_counts_as_a_player_but_a_match_needs_a_human()
    {
        var (room, host) = NewRoom();
        Assert.False(room.CanStart);
        Ok(room.AddBot(host.Token, BotDifficulty.Medium));
        Assert.False(room.CanStart); // the human is not ready yet
        Ok(room.SetReady(host.Token, true));
        Assert.True(room.CanStart);
        Ok(room.Start(host.Token));
        Assert.Equal(RoomPhase.Preparation, room.Phase);
        Assert.NotNull(room.Game!.CastleOf("o1"));
        Assert.NotNull(room.Game.CastleOf("o2"));
    }

    [Fact]
    public void A_new_human_takes_a_seat_that_is_left_and_the_host_is_never_a_bot()
    {
        var (room, host) = NewRoom();
        Ok(room.AddBot(host.Token, BotDifficulty.Easy));
        var guest = room.Join("Bora", null, false, T0).Player!;
        Assert.Equal(3, guest.Seat);

        // The host drops for good: the room goes to the other human, not to the bot.
        room.Disconnect(host.Token, T0);
        room.Maintain(T0 + room.Options.HostGrace + TimeSpan.FromSeconds(1));
        Assert.Equal(guest.Seat, room.HostSeat);
        Assert.False(room.Host!.IsBot);
    }

    [Fact]
    public void A_room_with_only_bots_in_it_is_abandoned_and_bots_never_time_out_of_the_lobby()
    {
        var (room, host) = NewRoom();
        Ok(room.AddBot(host.Token, BotDifficulty.Easy));
        room.Disconnect(host.Token, T0);
        var later = T0 + room.Options.LobbyGrace + TimeSpan.FromMinutes(1);
        Assert.True(room.IsAbandoned(later, TimeSpan.FromMinutes(1)));
        room.Maintain(later);
        Assert.Contains(room.Players, p => p.IsBot); // the bot's seat stays
    }

    private static (Room room, RoomPlayer human) WarWithTwoBots()
    {
        var (room, host) = NewRoom(new RoomOptions { MinPlayers = 2, PrepSeconds = 10, WarSeconds = 300 });
        Ok(room.AddBot(host.Token, BotDifficulty.Medium));
        Ok(room.AddBot(host.Token, BotDifficulty.Medium));
        Ok(room.SetReady(host.Token, true));
        Ok(room.Start(host.Token));
        for (int i = 0; i < 10; i++) room.Tick(1);
        Assert.Equal(RoomPhase.War, room.Phase);
        return (room, host);
    }

    [Fact]
    public void When_the_last_human_falls_the_host_may_end_the_match_and_the_bots_play_it_out()
    {
        var (room, host) = WarWithTwoBots();
        Assert.False(room.AllHumansOut);
        Assert.False(room.FinishMatch(host.Token, 1, _ => { }).Ok);

        // Bot 2 crushes the human; bot 3 is still standing.
        var game = room.Game!;
        game.CastleOf("o2")!.AddSoldiers(Rules.FindUnit("kilicli")!, 30);
        Ok(game.Execute("o2", new SendArmy("o1", new Dictionary<string, int> { ["kilicli"] = 30 })));
        for (int t = 0; !game.IsEliminated("o1"); t++) { Assert.True(t < 600); room.Tick(1); }
        Assert.Equal(RoomPhase.War, room.Phase);
        Assert.True(room.AllHumansOut);

        int steps = 0;
        Ok(room.FinishMatch(host.Token, 1, _ => steps++));
        Assert.True(steps > 0);
        Assert.Equal(RoomPhase.Ended, room.Phase);
        Assert.NotNull(room.Game!.Result);
        Assert.False(room.AllHumansOut); // over
        Assert.False(room.FinishMatch(host.Token, 1, _ => { }).Ok);
    }

    [Fact]
    public void The_war_runs_at_least_a_while_longer_when_asked_so_the_host_can_choose()
    {
        var (room, _) = WarWithTwoBots();
        var game = room.Game!;
        for (int t = 0; t < 270; t++) room.Tick(1);
        Assert.InRange(game.RemainingSeconds, 29, 31);

        game.EnsureWarRemaining(120);
        Assert.Equal(120, game.RemainingSeconds, 3);
        game.EnsureWarRemaining(60); // never shortens
        Assert.Equal(120, game.RemainingSeconds, 3);
        for (int t = 0; t < 119; t++) room.Tick(1);
        Assert.Equal(RoomPhase.War, room.Phase);
        for (int t = 0; t < 3; t++) room.Tick(1);
        Assert.Equal(RoomPhase.Ended, room.Phase);
    }

    [Fact]
    public void Only_the_host_can_finish_and_a_room_without_bots_never_offers_it()
    {
        var (room, host) = NewRoom();
        var guest = room.Join("Bora", null, false, T0).Player!;
        Ok(room.SetReady(host.Token, true));
        Ok(room.SetReady(guest.Token, true));
        Ok(room.Start(host.Token));
        Assert.False(room.AllHumansOut);
        Assert.False(room.FinishMatch(host.Token, 1, _ => { }).Ok);

        var (room2, host2) = WarWithTwoBots();
        Assert.False(room2.FinishMatch("not-a-token", 1, _ => { }).Ok);
    }
}
