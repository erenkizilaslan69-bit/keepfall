using Keepfall.Core.Lobby;
using Keepfall.Views;
using Keepfall.Server.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Keepfall.Server.Games;

/// <summary>
/// Once per server tick (match.serverTickSeconds): advances every room's shared clock, sends each
/// player their own castle, frees expired lobby seats and drops abandoned rooms.
/// </summary>
public sealed class TickLoop(
    RoomRegistry registry,
    IHubContext<GameHub> hub,
    IOptions<KeepfallOptions> options,
    Keepfall.Core.GameRules rules,
    ILogger<TickLoop> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        double tickSeconds = rules.Match.ServerTickSeconds;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(tickSeconds));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var session in registry.Sessions)
            {
                try
                {
                    await TickRoom(session, tickSeconds);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Tick failed for room {Code}", session.Room.Code);
                }
            }
        }
    }

    private async Task TickRoom(RoomSession session, double tickSeconds)
    {
        var now = DateTime.UtcNow;
        bool roomChanged, ended = false, preparing;
        string? endNote = null;
        List<(int Seat, List<SpectatorStateView> Frames, SpectatorWaitView? Wait)> spectating = [];
        lock (session.Lock)
        {
            var room = session.Room;
            if (room.IsAbandoned(now, TimeSpan.FromMinutes(options.Value.AbandonedRoomMinutes)))
            {
                registry.Remove(room.Code);
                return;
            }
            roomChanged = room.Maintain(now);
            preparing = room.Phase is RoomPhase.Preparation or RoomPhase.War;
            if (preparing)
            {
                ended = room.Tick(tickSeconds, dt => session.Bots.Step(room, dt));
                if (ended) endNote = DescribeEnd(room);
                if (!ended)
                {
                    // Fallen players watch the whole map (live, or as late as match.spectatorDelaySeconds says); nobody else ever gets this.
                    session.Spectators.Capture(room, rules.Match.SpectatorDelaySeconds, rules.Match.SpectatorWaitSeconds);
                    spectating = session.Spectators.TakeDue(room, rules.Match.SpectatorDelaySeconds, rules.Match.SpectatorWaitSeconds);
                }
            }
        }
        if (endNote is not null) logger.LogInformation("Maç bitti, oda {Code}: {Note}", session.Room.Code, endNote);
        foreach (var (seat, frames, wait) in spectating)
        {
            var group = hub.Clients.Group(GameHub.PlayerGroup(session.Room.Code, seat));
            foreach (var frame in frames) await group.SendAsync("SpectatorState", frame);
            if (wait is not null) await group.SendAsync("SpectatorWait", wait);
        }

        if (preparing)
        {
            await GameHub.PushCastles(hub.Clients, session);
            await MatchPush.Notifications(hub.Clients, session);
        }
        // During preparation the room view carries the shared clock, so it goes out every tick.
        if (roomChanged || preparing)
        {
            RoomView view;
            lock (session.Lock) view = ViewMapper.ToView(session.Room);
            await hub.Clients.Group(GameHub.RoomGroup(session.Room.Code)).SendAsync("RoomState", view);
        }
        if (ended)
        {
            // Final castle states (with summaries) and the room view with the result.
            await MatchPush.End(hub.Clients, session);
        }
    }

    /// <summary>One line on how a match ended (time left, who was still standing), so "it ended too early" can be checked in the log afterwards.</summary>
    private static string DescribeEnd(Room room)
    {
        var game = room.Game!;
        var who = string.Join(", ", room.Players.Select(p => $"{p.Name}{(p.IsBot ? " (bot)" : "")}: {(room.IsEliminated(p) ? "elendi" : "ayakta")}"));
        return $"{game.ElapsedSeconds:0} sn geçti, {game.RemainingSeconds:0} sn kalmıştı; {who}";
    }
}
