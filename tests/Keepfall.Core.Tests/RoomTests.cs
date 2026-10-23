using Keepfall.Core;
using Keepfall.Core.Config;
using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;

namespace Keepfall.Core.Tests;

/// <summary>Lobby rules, identity and the per-command checks the hub relies on.</summary>
public class RoomTests
{
    private static readonly GameRules Rules = BalanceConfigLoader.LoadFromFile(
        BalanceConfigLoader.FindDefaultPath(AppContext.BaseDirectory)
        ?? throw new InvalidOperationException("config/balance.json bulunamadı."));

    private static readonly DateTime T0 = new(2026, 10, 23, 12, 0, 0, DateTimeKind.Utc);

    private static Room NewRoom(RoomOptions? options = null) => new("ABCD", Rules, options);

    private static RoomPlayer Join(Room room, string name = "")
    {
        var r = room.Join(name, null, false, T0);
        Assert.True(r.Ok, r.Error);
        return r.Player!;
    }

    private static void Ok(CommandResult result) => Assert.True(result.Ok, result.Error);

    /// <summary>Two players in a started match.</summary>
    private static (Room room, RoomPlayer a, RoomPlayer b) StartedMatch()
    {
        var room = NewRoom();
        var a = Join(room, "Ali");
        var b = Join(room, "Bora");
        Ok(room.SetReady(a.Token, true));
        Ok(room.SetReady(b.Token, true));
        Ok(room.Start(a.Token));
        return (room, a, b);
    }

    // ---- tokens --------------------------------------------------------------------------------

    [Fact]
    public void Tokens_are_long_random_and_unique()
    {
        var tokens = Enumerable.Range(0, 1000).Select(_ => Tokens.NewPlayerToken()).ToList();
        Assert.Equal(1000, tokens.Distinct().Count());
        Assert.All(tokens, t => Assert.Equal(43, t.Length)); // 32 bytes, base64url without padding
        Assert.All(tokens, t => Assert.Matches("^[A-Za-z0-9_-]+$", t));
    }

    [Fact]
    public void Room_codes_use_the_unambiguous_alphabet()
    {
        for (int i = 0; i < 500; i++)
        {
            var code = Tokens.NewRoomCode();
            Assert.Equal(4, code.Length);
            Assert.DoesNotContain(code, c => "IO01".Contains(c));
            Assert.Equal(code, Tokens.NormalizeRoomCode(code.ToLowerInvariant()));
        }
        Assert.Null(Tokens.NormalizeRoomCode("AB1D"));
        Assert.Null(Tokens.NormalizeRoomCode("ABCDE"));
    }

    // ---- seats, colours, names, host ---------------------------------------------------------

    [Fact]
    public void Players_get_seats_and_colours_in_order_and_freed_ones_are_reused()
    {
        var room = NewRoom();
        var a = Join(room); var b = Join(room); var c = Join(room); var d = Join(room);
        Assert.Equal(new[] { PlayerColor.Blue, PlayerColor.Red, PlayerColor.Yellow, PlayerColor.Purple },
            new[] { a, b, c, d }.Select(p => p.Color));
        Assert.Equal("Oyuncu 2", b.Name);
        Assert.False(room.Join("Fazla", null, false, T0).Ok); // full

        room.Disconnect(b.Token, T0);
        Assert.True(room.Maintain(T0 + TimeSpan.FromMinutes(3)));
        var e = Join(room, "Ece");
        Assert.Equal(2, e.Seat);
        Assert.Equal(PlayerColor.Red, e.Color);
    }

    [Fact]
    public void Lobby_keeps_a_dropped_seat_during_the_grace_period()
    {
        var room = NewRoom();
        Join(room);
        var b = Join(room);
        room.Disconnect(b.Token, T0);
        Assert.False(room.Maintain(T0 + TimeSpan.FromMinutes(1)));
        Assert.Contains(b, room.Players);
    }

    [Fact]
    public void Names_are_trimmed_and_capped()
    {
        var room = NewRoom();
        var a = Join(room, "  Çok uzun bir oyuncu adı burada  ");
        Assert.Equal(16, a.Name.Length);
        Ok(room.SetName(a.Token, "   "));
        Assert.Equal("Oyuncu 1", a.Name);
    }

    [Fact]
    public void Host_passes_on_only_after_the_host_has_been_gone_a_while()
    {
        var room = NewRoom();
        var a = Join(room); var b = Join(room);
        Assert.Equal(a.Seat, room.HostSeat);

        // A refresh: gone for a moment, back with the same token, still host.
        room.Disconnect(a.Token, T0);
        room.Maintain(T0 + TimeSpan.FromSeconds(5));
        Assert.Equal(a.Seat, room.HostSeat);
        room.Join(null, a.Token, false, T0 + TimeSpan.FromSeconds(6));
        Assert.Equal(a.Seat, room.HostSeat);

        // Really gone: after the grace period the next connected player becomes host.
        room.Disconnect(a.Token, T0);
        Assert.True(room.Maintain(T0 + TimeSpan.FromSeconds(31)));
        Assert.Equal(b.Seat, room.HostSeat);
    }

    // ---- starting ----------------------------------------------------------------------------

    [Fact]
    public void Only_the_host_starts_and_only_when_everyone_is_ready()
    {
        var room = NewRoom();
        var a = Join(room); var b = Join(room);
        Ok(room.SetReady(a.Token, true));
        Assert.False(room.Start(a.Token).Ok); // b not ready
        Ok(room.SetReady(b.Token, true));
        Assert.False(room.Start(b.Token).Ok); // not the host
        Assert.True(room.CanStart);
        Ok(room.Start(a.Token));
        Assert.Equal(RoomPhase.Preparation, room.Phase);
        Assert.NotNull(room.CastleOf(a));
        Assert.NotNull(room.CastleOf(b));
    }

    [Fact]
    public void A_single_player_cannot_start_unless_allowed()
    {
        var room = NewRoom();
        var a = Join(room);
        Ok(room.SetReady(a.Token, true));
        Assert.False(room.Start(a.Token).Ok);

        var solo = NewRoom(new RoomOptions { MinPlayers = 1 });
        var s = Join(solo);
        Ok(solo.SetReady(s.Token, true));
        Ok(solo.Start(s.Token));
    }

    [Fact]
    public void Nobody_new_joins_after_the_match_started()
    {
        var (room, _, _) = StartedMatch();
        var r = room.Join("Geç", null, false, T0);
        Assert.False(r.Ok);
        Assert.Equal(2, room.Players.Count);
    }

    // ---- reconnecting ------------------------------------------------------------------------

    [Fact]
    public void A_dropped_player_rejoins_their_own_castle_with_their_token()
    {
        var (room, a, _) = StartedMatch();
        Ok(room.Execute(a.Token, new MoveWorkers(Job.Idle, Job.Farmer, 3)));
        room.Disconnect(a.Token, T0);
        Assert.False(a.Connected);

        var r = room.Join(null, a.Token, remembered: true, T0);
        Assert.True(r.Ok);
        Assert.True(r.Rejoined);
        Assert.Same(a, r.Player);
        Assert.Equal(3, room.CastleOf(a)!.Workers[Job.Farmer]);
    }

    [Fact]
    public void A_remembered_token_does_not_take_over_a_connected_seat()
    {
        var room = NewRoom();
        var a = Join(room);
        // Another tab offers a's remembered token while a is still connected: it becomes a new player.
        var r = room.Join("İkinci sekme", a.Token, remembered: true, T0);
        Assert.True(r.Ok);
        Assert.False(r.Rejoined);
        Assert.NotEqual(a.Seat, r.Player!.Seat);
        Assert.Equal(1, a.Connections);

        // The same tab refreshing (not "remembered") always gets its seat back.
        var again = room.Join(null, a.Token, remembered: false, T0);
        Assert.Same(a, again.Player);
    }

    [Fact]
    public void An_unknown_token_is_not_a_player()
    {
        var (room, _, _) = StartedMatch();
        Assert.Null(room.Find(Tokens.NewPlayerToken()));
        Assert.False(room.Execute(Tokens.NewPlayerToken(), new SetGrowth(false)).Ok);
        Assert.False(room.Join(null, Tokens.NewPlayerToken(), false, T0).Ok); // and cannot sneak in after the start
    }

    // ---- per-command checks (what the hub relies on) -----------------------------------------

    [Fact]
    public void Economy_commands_are_rejected_in_the_lobby()
    {
        var room = NewRoom();
        var a = Join(room);
        var r = room.Execute(a.Token, new MoveWorkers(Job.Idle, Job.Farmer, 1));
        Assert.False(r.Ok);
        Assert.Contains("hazırlık", r.Error);
    }

    [Fact]
    public void Lobby_commands_are_rejected_during_the_match()
    {
        var (room, a, b) = StartedMatch();
        Assert.False(room.SetReady(b.Token, false).Ok);
        Assert.False(room.SetName(a.Token, "Yeni ad").Ok);
        Assert.False(room.Start(a.Token).Ok);
        Assert.Equal("Ali", a.Name);
    }

    [Fact]
    public void Back_to_lobby_only_after_the_match_and_only_by_the_host()
    {
        var (room, a, b) = StartedMatch();
        Assert.False(room.BackToLobby(a.Token).Ok); // still preparing
        while (!room.Tick(1)) { }
        Assert.Equal(RoomPhase.Ended, room.Phase);
        Assert.False(room.Execute(a.Token, new SetGrowth(false)).Ok);
        Assert.False(room.BackToLobby(b.Token).Ok);
        Ok(room.BackToLobby(a.Token));
        Assert.Equal(RoomPhase.Lobby, room.Phase);
        Assert.All(room.Players, p => Assert.False(p.Ready));
        Assert.Null(room.Game);
    }

    [Fact]
    public void Commands_from_outside_the_room_are_rejected()
    {
        var (room, _, _) = StartedMatch();
        var other = NewRoom();
        var stranger = Join(other);
        Assert.False(room.Execute(stranger.Token, new MoveWorkers(Job.Idle, Job.Farmer, 1)).Ok);
        Assert.False(room.SetReady(stranger.Token, true).Ok);
        Assert.False(room.BackToLobby(stranger.Token).Ok);
    }

    [Fact]
    public void A_command_only_changes_the_senders_castle()
    {
        var (room, a, b) = StartedMatch();
        Ok(room.Execute(a.Token, new MoveWorkers(Job.Idle, Job.Farmer, 4)));
        Ok(room.Execute(a.Token, new QueueWeapon("okcu", 2)));

        var castleA = room.CastleOf(a)!;
        var castleB = room.CastleOf(b)!;
        Assert.NotSame(castleA, castleB);
        Assert.Equal(4, castleA.Workers[Job.Farmer]);
        Assert.Single(castleA.Queue);
        Assert.Equal(0, castleB.Workers[Job.Farmer]);
        Assert.Empty(castleB.Queue);
        Assert.Equal(40, castleB.Wood);
    }

    [Fact]
    public void Everyone_shares_one_preparation_clock()
    {
        var (room, a, b) = StartedMatch();
        for (int i = 0; i < 10; i++) room.Tick(1);
        Assert.Equal(10, room.Game!.ElapsedSeconds);
        Assert.Equal(room.Game.PrepSeconds - 10, room.Game.RemainingSeconds);
        Assert.NotNull(room.CastleOf(a));
        Assert.NotNull(room.CastleOf(b));
    }

    [Fact]
    public void Each_player_gets_their_own_summary()
    {
        var (room, a, b) = StartedMatch();
        Ok(room.Execute(a.Token, new MoveWorkers(Job.Idle, Job.Lumberjack, 4)));
        while (!room.Tick(1)) { }
        var sa = room.Game!.SummaryOf(a.CastleKey)!;
        var sb = room.Game.SummaryOf(b.CastleKey)!;
        Assert.True(sa.ProducedWood > 0);
        Assert.Equal(0, sb.ProducedWood);
    }

    [Fact]
    public void Speed_is_host_only_dev_only_and_in_preparation()
    {
        var (room, a, b) = StartedMatch();
        Assert.False(room.SetSpeed(a.Token, 20).Ok); // not allowed in this room

        var dev = NewRoom(new RoomOptions { AllowSpeedControl = true });
        var h = Join(dev); var g = Join(dev);
        Assert.False(dev.SetSpeed(h.Token, 20).Ok); // lobby
        Ok(dev.SetReady(h.Token, true)); Ok(dev.SetReady(g.Token, true)); Ok(dev.Start(h.Token));
        Assert.False(dev.SetSpeed(g.Token, 20).Ok); // not the host
        Assert.False(dev.SetSpeed(h.Token, 7).Ok);
        Ok(dev.SetSpeed(h.Token, 20));
        dev.Tick(1);
        Assert.Equal(20, dev.Game!.ElapsedSeconds);
    }
}
