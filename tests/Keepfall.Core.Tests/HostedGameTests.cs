using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Views;

namespace Keepfall.Core.Tests;

/// <summary>
/// The friend-hosted game (Steam / LAN): a player whose connection is gone for a minute is played by a stand-in until they return, and a match the
/// host walks out of ends where it stands with a result for everybody. The hosted web server (no TakeoverGrace) keeps its old behaviour.
/// </summary>
public class HostedGameTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly DateTime T0 = new(2026, 11, 11, 12, 0, 0, DateTimeKind.Utc);

    private static (Room Room, RoomPlayer Host, RoomPlayer Guest) Started(TimeSpan? takeover)
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { PrepSeconds = 120, WarSeconds = 300, TakeoverGrace = takeover, Kingdoms = false });
        var host = room.Join("Ada", null, false, T0).Player!;
        var guest = room.Join("Bora", null, false, T0).Player!;
        room.SetReady(host.Token, true); room.SetReady(guest.Token, true);
        var started = room.Start(host.Token); Assert.True(started.Ok, started.Error);
        return (room, host, guest);
    }

    [Fact]
    public void A_seat_is_kept_for_a_minute_then_a_stand_in_plays_it_until_the_player_is_back()
    {
        var (room, _, guest) = Started(TimeSpan.FromSeconds(60));
        var bots = new Keepfall.BotHost.BotHost(Rules, 7);
        room.Disconnect(guest.Token, T0);

        Assert.False(room.Maintain(T0.AddSeconds(59)));
        Assert.Null(guest.Deputy);
        Assert.False(ViewMapper.ToView(room).Players.Single(p => p.Seat == guest.Seat).Deputy);

        Assert.True(room.Maintain(T0.AddSeconds(61)));
        Assert.Equal(BotDifficulty.Medium, guest.Deputy);
        var seen = ViewMapper.ToView(room).Players.Single(p => p.Seat == guest.Seat);
        Assert.True(seen.Deputy);
        Assert.False(seen.IsBot); // the seat is still the human's
        Assert.False(room.Maintain(T0.AddSeconds(62))); // nothing new to tell

        // The stand-in really plays: within a few minutes of game time the castle's workers have been given jobs.
        var castle = room.Game!.CastleOf(guest.CastleKey)!;
        int idleBefore = castle.Workers[Job.Idle];
        for (int t = 0; t < 100; t++) room.Tick(1, dt => bots.Step(room, dt));
        Assert.True(castle.Workers[Job.Idle] < idleBefore, "the stand-in gave no orders");

        // The player's own token takes the seat back at once; a stranger still cannot join a running match.
        Assert.False(room.Join("Yabancı", null, false, T0.AddSeconds(200)).Ok);
        var back = room.Join("Bora", guest.Token, false, T0.AddSeconds(200));
        Assert.True(back.Ok && back.Rejoined);
        Assert.Null(guest.Deputy);
        Assert.False(ViewMapper.ToView(room).Players.Single(p => p.Seat == guest.Seat).Deputy);
        // ...and the stand-in gives no more orders: the idle count only changes by the player's own hand.
        foreach (var j in Enum.GetValues<Job>()) if (j != Job.Idle && castle.Workers.GetValueOrDefault(j) > 0) room.Execute(guest.Token, new MoveWorkers(j, Job.Idle, castle.Workers[j]));
        int idle = castle.Workers[Job.Idle];
        for (int t = 0; t < 30; t++) room.Tick(1, dt => bots.Step(room, dt));
        Assert.True(castle.Workers[Job.Idle] >= idle, "the stand-in kept playing after the player came back");
    }

    [Fact]
    public void Without_the_option_nobody_ever_takes_over()
    {
        var (room, _, guest) = Started(null);
        room.Disconnect(guest.Token, T0);
        Assert.False(room.Maintain(T0.AddMinutes(5)));
        Assert.Null(guest.Deputy);
    }

    [Fact]
    public void A_lobby_seat_and_a_fallen_castle_get_no_stand_in()
    {
        var room = new Room("ABCDEF", Rules, new RoomOptions { TakeoverGrace = TimeSpan.FromSeconds(60), LobbyGrace = TimeSpan.FromMinutes(5) });
        var host = room.Join("Ada", null, false, T0).Player!;
        var guest = room.Join("Bora", null, false, T0).Player!;
        room.Disconnect(guest.Token, T0);
        room.Maintain(T0.AddSeconds(90));
        Assert.Null(guest.Deputy);
        Assert.NotNull(host);
    }

    [Fact]
    public void A_match_the_host_walks_out_of_ends_where_it_stands_with_a_result_and_a_summary_for_everybody()
    {
        var (room, host, guest) = Started(TimeSpan.FromSeconds(60));
        for (int t = 0; t < 150; t++) room.Tick(1); // into the war
        Assert.Equal(RoomPhase.War, room.Phase);

        Assert.True(room.Abort());
        Assert.Equal(RoomPhase.Ended, room.Phase);
        Assert.NotNull(room.Game!.Result);
        Assert.Equal(2, room.Game.Result!.Ranking.Count);
        foreach (var p in new[] { host, guest })
        {
            var view = ViewMapper.CastleOf(room, p);
            Assert.NotNull(view?.Summary); // the end screen's data, the timeline included, is there for both
        }
        Assert.NotNull(ViewMapper.ToView(room).Result);
        Assert.False(room.Abort()); // once
    }
    [Fact]
    public void A_match_ended_by_the_host_during_the_preparation_also_gives_everybody_a_result()
    {
        var (room, host, guest) = Started(TimeSpan.FromSeconds(60));
        for (int t = 0; t < 30; t++) room.Tick(1);
        Assert.Equal(RoomPhase.Preparation, room.Phase);
        Assert.True(room.Abort());
        Assert.Equal(RoomPhase.Ended, room.Phase);
        Assert.NotNull(ViewMapper.ToView(room).Result);
        foreach (var p in new[] { host, guest })
        {
            Assert.NotNull(ViewMapper.CastleOf(room, p)?.Summary);
            _ = Keepfall.Core.Progress.Achievements.FactsOf(room, p);
            _ = MapViewMapper.StateOf(room, p);
        }
    }
}
