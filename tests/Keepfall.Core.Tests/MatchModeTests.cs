using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>The three match modes (quick / standard / long): lengths and economy speed from the config's table, only the host chooses, the guided match and challenges keep their own lengths.</summary>
public class MatchModeTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static (Room Room, RoomPlayer Host) Lobby()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { MinPlayers = 1 });
        var host = room.Join("Ada", null, false, DateTime.UtcNow).Player!;
        room.AddBot(host.Token, BotDifficulty.Easy);
        return (room, host);
    }

    [Theory]
    [InlineData(MatchMode.Quick, 300, 1.6, 600)]
    [InlineData(MatchMode.Standard, 600, 1.0, 600)]
    [InlineData(MatchMode.Long, 900, 1.0, 600)]
    public void Each_mode_has_the_table_lengths_and_economy_speed(MatchMode mode, double prep, double speed, double war)
    {
        var m = Rules.Match.ModeOf(mode);
        Assert.Equal(prep, m.PrepSeconds);
        Assert.Equal(speed, m.PrepSpeed);
        Assert.Equal(war, m.WarSeconds);
    }

    [Fact]
    public void Quick_is_what_the_game_always_had()
    {
        Assert.Equal(Rules.Match.ShortModePrepSeconds, Rules.Match.ModeOf(MatchMode.Quick).PrepSeconds);
        Assert.Equal(Rules.Match.PrepSpeed, Rules.Match.ModeOf(MatchMode.Quick).PrepSpeed);
        Assert.Equal(240, Rules.Match.GuidedShieldSeconds);
        Assert.Equal(480, Rules.Match.GuidedPrepSeconds);
    }

    [Theory]
    [InlineData("quick", 300, 1.6)]
    [InlineData("standard", 600, 1.0)]
    [InlineData("long", 900, 1.0)]
    public void The_host_picks_the_mode_and_the_match_follows_it(string mode, double prep, double speed)
    {
        var (room, host) = Lobby();
        Assert.True(room.SetMode(host.Token, mode).Ok);
        Assert.Equal(mode, ViewMapper.ToView(room).Mode);
        room.SetReady(host.Token, true);
        Assert.True(room.Start(host.Token).Ok);
        Assert.Equal(prep, room.Game!.PrepSeconds);
        Assert.Equal(speed, room.Game.PrepSpeed);
        Assert.Equal(600, room.Game.WarSeconds);
    }

    [Fact]
    public void Only_the_host_chooses_and_only_known_modes_are_accepted()
    {
        var (room, host) = Lobby();
        var guest = room.Join("Bob", null, false, DateTime.UtcNow).Player!;
        Assert.False(room.SetMode(guest.Token, "long").Ok);
        Assert.False(room.SetMode(host.Token, "marathon").Ok);
        Assert.False(room.SetMode(host.Token, "").Ok);
        Assert.False(room.SetMode(host.Token, "99").Ok);
        Assert.Equal("quick", ViewMapper.ToView(room).Mode);
    }

    [Fact]
    public void The_scouting_lock_follows_the_mode_in_clock_seconds()
    {
        foreach (var (mode, last) in new[] { (MatchMode.Quick, 37.5), (MatchMode.Standard, 60.0), (MatchMode.Long, 60.0) })
        {
            var game = new GameState(Rules, ["o1", "o2"], mode: mode);
            double prep = game.PrepSeconds;
            while (game.ElapsedSeconds < prep - last - 2) game.Tick(1);
            Assert.False(game.ScoutingLocked);
            while (game.ElapsedSeconds < prep - last + 1) game.Tick(1);
            Assert.True(game.ScoutingLocked);
        }
    }

    [Fact]
    public void The_guided_match_keeps_its_own_eight_minutes_whatever_the_mode()
    {
        var (room, host) = Lobby();
        room.SetMode(host.Token, "long");
        room.SetGuided(host.Token, true);
        room.SetReady(host.Token, true);
        Assert.True(room.Start(host.Token).Ok);
        Assert.Equal(480, room.Game!.PrepSeconds);
        Assert.Equal(1.0, room.Game.PrepSpeed);
    }

    [Fact]
    public void The_host_changes_a_bots_difficulty_in_place_and_nobody_else_or_nothing_else_can()
    {
        var (room, host) = Lobby();
        var bot = room.Players.Single(p => p.IsBot);
        Assert.True(room.SetBotLevel(host.Token, bot.Seat, BotDifficulty.Hard).Ok);
        Assert.Equal(BotDifficulty.Hard, room.Players.Single(p => p.IsBot).Bot);
        Assert.False(room.SetBotLevel(host.Token, bot.Seat, (BotDifficulty)99).Ok);
        Assert.False(room.SetBotLevel(host.Token, host.Seat, BotDifficulty.Easy).Ok); // a human seat is not a bot
        Assert.False(room.SetBotLevel(host.Token, 4, BotDifficulty.Easy).Ok);          // an empty seat neither
        var guest = room.Join("Bob", null, false, DateTime.UtcNow).Player!;
        Assert.False(room.SetBotLevel(guest.Token, bot.Seat, BotDifficulty.Easy).Ok);
        Assert.Equal(BotDifficulty.Hard, room.Players.Single(p => p.IsBot).Bot);
    }
}
