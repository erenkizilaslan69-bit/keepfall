using Keepfall.Core.Lobby;
using Keepfall.Server.Contracts;
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
        lock (session.Lock)
        {
            var room = session.Room;
            if (room.IsAbandoned(now, TimeSpan.FromMinutes(options.Value.AbandonedRoomMinutes)))
            {
                registry.Remove(room.Code);
                return;
            }
            roomChanged = room.ExpireLobbySeats(now);
            preparing = room.Phase == RoomPhase.Preparation;
            if (preparing) ended = room.Tick(tickSeconds);
        }

        if (preparing) await GameHub.PushCastles(hub.Clients, session);
        // During preparation the room view carries the shared clock, so it goes out every tick.
        if (roomChanged || preparing)
        {
            RoomView view;
            lock (session.Lock) view = ViewMapper.ToView(session.Room);
            await hub.Clients.Group(GameHub.RoomGroup(session.Room.Code)).SendAsync("RoomState", view);
        }
        if (ended) await SendSummaries(session);
    }

    /// <summary>Each player gets only their own summary.</summary>
    private async Task SendSummaries(RoomSession session)
    {
        List<(int Seat, SummaryView Summary)> summaries;
        lock (session.Lock)
            summaries = session.Room.Players
                .Select(p => (p.Seat, ViewMapper.CastleOf(session.Room, p)?.Summary))
                .Where(x => x.Summary is not null)
                .Select(x => (x.Seat, x.Summary!))
                .ToList();
        foreach (var (seat, summary) in summaries)
            await hub.Clients.Group(GameHub.PlayerGroup(session.Room.Code, seat)).SendAsync("MatchEnded", summary);
    }
}
