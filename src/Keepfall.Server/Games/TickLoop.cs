using Keepfall.Core.Match;
using Keepfall.Server.Contracts;
using Keepfall.Server.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Keepfall.Server.Games;

/// <summary>
/// Ticks every game once per server tick (match.serverTickSeconds) and sends each player their state.
/// At speed ×N a game is ticked N times per real tick. Abandoned games are dropped here too.
/// </summary>
public sealed class TickLoop(
    GameRegistry registry,
    IHubContext<GameHub> hub,
    IOptions<KeepfallOptions> options,
    ILogger<TickLoop> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        double tickSeconds = registry.Rules.Match.ServerTickSeconds;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(tickSeconds));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var session in registry.Sessions)
            {
                try
                {
                    await TickSession(session, tickSeconds);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Tick failed for {PlayerId}", session.PlayerId);
                }
            }
        }
    }

    private async Task TickSession(GameSession session, double tickSeconds)
    {
        CastleView view;
        SummaryView? justEnded = null;
        lock (session.Lock)
        {
            if (session.Connections == 0 &&
                DateTime.UtcNow - session.LastSeenUtc > TimeSpan.FromMinutes(options.Value.AbandonedGameMinutes))
            {
                registry.Remove(session.PlayerId);
                return;
            }
            if (session.State.Phase != MatchPhase.Preparation) return;

            for (int i = 0; i < session.Speed; i++) session.State.Tick(tickSeconds);
            view = ViewMapper.ToView(session.State, session.Speed, options.Value.AllowSpeedControl);
            if (view.Summary is not null && !session.SummarySent)
            {
                session.SummarySent = true;
                justEnded = view.Summary;
            }
        }

        if (session.Connections == 0) return;
        await hub.Clients.Group(session.PlayerId).SendAsync("State", view);
        if (justEnded is not null) await hub.Clients.Group(session.PlayerId).SendAsync("PhaseEnded", justEnded);
    }
}
