using Keepfall.Core.Economy;
using Keepfall.Core.Match;
using Keepfall.Server.Contracts;
using Keepfall.Server.Games;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Keepfall.Server.Hubs;

/// <summary>
/// The client only sends commands; the server validates them against the game state.
/// Each player's connections sit in a group named after the player id, so state goes only to them.
/// </summary>
public sealed class GameHub(GameRegistry registry, IOptions<KeepfallOptions> options) : Hub
{
    private const string PlayerKey = "playerId";

    public async Task<CastleView> Join(string playerId)
    {
        if (string.IsNullOrWhiteSpace(playerId) || playerId.Length > 64)
            throw new HubException("Geçersiz oyuncu kimliği.");
        if (Context.Items.ContainsKey(PlayerKey))
            throw new HubException("Bu bağlantı zaten bir oyuna bağlı.");

        var session = registry.GetOrCreate(playerId);
        lock (session.Lock)
        {
            session.Connections++;
            session.LastSeenUtc = DateTime.UtcNow;
        }
        Context.Items[PlayerKey] = playerId;
        await Groups.AddToGroupAsync(Context.ConnectionId, playerId);
        return View(session);
    }

    public Task<CommandResultView> MoveWorkers(Job from, Job to, int count) => Run(new MoveWorkers(from, to, count));
    public Task<CommandResultView> QueueWeapon(string unitId, int count) => Run(new QueueWeapon(unitId, count));
    public Task<CommandResultView> CancelWeapon(int orderIndex) => Run(new CancelWeapon(orderIndex));
    public Task<CommandResultView> ArmWorkers(string unitId, int count, Job from) => Run(new ArmWorkers(unitId, count, from));
    public Task<CommandResultView> DisarmSoldiers(string unitId, int count) => Run(new DisarmSoldiers(unitId, count));
    public Task<CommandResultView> UpgradeBuilding(BuildingType building) => Run(new UpgradeBuilding(building));
    public Task<CommandResultView> SetGrowth(bool enabled) => Run(new SetGrowth(enabled));

    public async Task<CommandResultView> Restart()
    {
        var session = Session();
        lock (session.Lock)
        {
            session.State = registry.NewGame();
            session.SummarySent = false;
        }
        await PushState(session);
        return new CommandResultView(true, null);
    }

    public async Task<CommandResultView> SetSpeed(int speed)
    {
        if (!options.Value.AllowSpeedControl) return new CommandResultView(false, "Hız ayarı kapalı.");
        if (!GameSession.AllowedSpeeds.Contains(speed)) return new CommandResultView(false, "Geçersiz hız.");
        var session = Session();
        lock (session.Lock) session.Speed = speed;
        await PushState(session);
        return new CommandResultView(true, null);
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue(PlayerKey, out var id) && registry.Find((string)id!) is { } session)
        {
            lock (session.Lock)
            {
                session.Connections = Math.Max(0, session.Connections - 1);
                session.LastSeenUtc = DateTime.UtcNow;
            }
        }
        return base.OnDisconnectedAsync(exception);
    }

    private async Task<CommandResultView> Run(GameCommand command)
    {
        var session = Session();
        CommandResult result;
        lock (session.Lock) result = session.State.Execute(command);
        // Push right away so the UI does not wait for the next tick.
        if (result.Ok) await PushState(session);
        return new CommandResultView(result.Ok, result.Error);
    }

    private GameSession Session()
    {
        if (!Context.Items.TryGetValue(PlayerKey, out var id) || registry.Find((string)id!) is not { } session)
            throw new HubException("Önce Join çağrılmalı.");
        return session;
    }

    private CastleView View(GameSession session)
    {
        lock (session.Lock) return ViewMapper.ToView(session.State, session.Speed, options.Value.AllowSpeedControl);
    }

    private Task PushState(GameSession session) => Clients.Group(session.PlayerId).SendAsync("State", View(session));
}
