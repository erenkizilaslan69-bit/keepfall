using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;
using Keepfall.Server.Contracts;
using Keepfall.Server.Games;
using Microsoft.AspNetCore.SignalR;

namespace Keepfall.Server.Hubs;

/// <summary>
/// Clients only send commands. A connection is bound to one seat of one room when it creates or
/// joins a room; from then on every command is checked by <see cref="Room"/> against that seat:
/// the player must still be in the room, the room must be in the right phase, and economy
/// commands only reach the caller's own castle (the client never names a castle).
///
/// Groups: "oda:{code}" gets the public room state; "oda:{code}:o{seat}" gets that seat's castle.
/// </summary>
public sealed class GameHub(RoomRegistry registry) : Hub
{
    private const string CodeKey = "code";
    private const string TokenKey = "token";

    public static string RoomGroup(string code) => $"oda:{code}";
    public static string PlayerGroup(string code, int seat) => $"oda:{code}:o{seat}";

    // ---- joining ---------------------------------------------------------------------------

    public async Task<JoinView> CreateRoom(string? name)
    {
        if (Context.Items.ContainsKey(CodeKey)) return JoinFail("Bu bağlantı zaten bir odada.");
        var session = registry.Create();
        JoinResult result;
        lock (session.Lock) result = session.Room.Join(name, null, false, DateTime.UtcNow);
        return await Attach(session, result);
    }

    /// <param name="token">The caller's token for this room, if it has one.</param>
    /// <param name="remembered">True when the token was remembered from an earlier tab rather than this one.</param>
    public async Task<JoinView> JoinRoom(string? code, string? name, string? token, bool remembered)
    {
        if (Context.Items.ContainsKey(CodeKey)) return JoinFail("Bu bağlantı zaten bir odada.");
        if (registry.Find(code) is not { } session) return JoinFail("Oda bulunamadı.");
        JoinResult result;
        lock (session.Lock) result = session.Room.Join(name, token, remembered, DateTime.UtcNow);
        return await Attach(session, result);
    }

    private async Task<JoinView> Attach(RoomSession session, JoinResult result)
    {
        if (!result.Ok) return JoinFail(result.Error!);
        var player = result.Player!;
        var code = session.Room.Code;
        Context.Items[CodeKey] = code;
        Context.Items[TokenKey] = player.Token;
        await Groups.AddToGroupAsync(Context.ConnectionId, RoomGroup(code));
        await Groups.AddToGroupAsync(Context.ConnectionId, PlayerGroup(code, player.Seat));

        RoomView room;
        CastleView? castle;
        MapLayoutView? layout;
        MapStateView? map;
        List<BattleStartedView> battles;
        SpectatorStateView? spectator;
        lock (session.Lock)
        {
            spectator = session.Spectators.LatestFor(session.Room, player); // only a fallen player has one
            room = ViewMapper.ToView(session.Room);
            castle = ViewMapper.CastleOf(session.Room, player);
            layout = MapViewMapper.LayoutOf(session.Room);
            map = MapViewMapper.StateOf(session.Room, player);
            battles = MapViewMapper.ActiveBattlesOf(session.Room, player); // a reconnect picks the battle up where it is
        }
        await Clients.OthersInGroup(RoomGroup(code)).SendAsync("RoomState", room);
        if (layout is not null) await Clients.Caller.SendAsync("MapLayout", layout);
        if (castle is not null) await Clients.Caller.SendAsync("CastleState", castle);
        if (map is not null) await Clients.Caller.SendAsync("MapState", map);
        foreach (var b in battles) await Clients.Caller.SendAsync("BattleStarted", b);
        if (spectator is not null) await Clients.Caller.SendAsync("SpectatorState", spectator);
        return new JoinView(true, null, code, player.Token, player.Seat, room);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Bound() is { } bound)
        {
            lock (bound.Session.Lock) bound.Session.Room.Disconnect(bound.Token, DateTime.UtcNow);
            await PushRoom(bound.Session);
        }
        await base.OnDisconnectedAsync(exception);
    }

    // ---- lobby -----------------------------------------------------------------------------

    public Task<CommandResultView> SetName(string? name) => RoomCommand((room, token) => room.SetName(token, name));
    public Task<CommandResultView> SetReady(bool ready) => RoomCommand((room, token) => room.SetReady(token, ready));
    public Task<CommandResultView> StartMatch() => RoomCommand((room, token) => room.Start(token), pushCastles: true, pushLayout: true);
    public Task<CommandResultView> BackToLobby() => RoomCommand((room, token) => room.BackToLobby(token));
    public Task<CommandResultView> SetSpeed(int speed) => RoomCommand((room, token) => room.SetSpeed(token, speed), pushCastles: true);

    // ---- economy (own castle only) ---------------------------------------------------------

    public Task<CommandResultView> MoveWorkers(Job from, Job to, int count) => Economy(new MoveWorkers(from, to, count));
    public Task<CommandResultView> QueueWeapon(string unitId, int count) => Economy(new QueueWeapon(unitId, count));
    public Task<CommandResultView> CancelWeapon(int orderIndex) => Economy(new CancelWeapon(orderIndex));
    public Task<CommandResultView> ArmWorkers(string unitId, int count, Job from) => Economy(new ArmWorkers(unitId, count, from));
    public Task<CommandResultView> DisarmSoldiers(string unitId, int count) => Economy(new DisarmSoldiers(unitId, count));
    public Task<CommandResultView> UpgradeBuilding(BuildingType building) => Economy(new UpgradeBuilding(building));
    public Task<CommandResultView> SetGrowth(bool enabled) => Economy(new SetGrowth(enabled));
    /// <summary>Send a scout to tour one quarter of the forest (named by its corner); it finds that quarter's places.</summary>
    public Task<CommandResultView> SendExplore(Corner quarter, Job from) => Economy(new SendExplore(quarter, from));
    /// <summary>Hire soldiers for gold (they stand at home at once and cannot become workers).</summary>
    public Task<CommandResultView> HireMercenary(string unitId, int count) => Economy(new HireMercenary(unitId, count));
    /// <summary>The target is named by public seat; the castle itself is never addressed by the client.</summary>
    public Task<CommandResultView> SendScout(int targetSeat, Job from) => Economy(new SendScout(Room.CastleKeyOf(targetSeat), from));

    /// <param name="units">Unit id → how many soldiers to send.</param>
    /// <param name="rows">Optional row per unit id ("front" / "back").</param>
    /// <param name="archerPriority">Optional unit id the archers aim at first.</param>
    /// <param name="mode">Attack the castle, or cut off the road (home after the first battle on it, or from half way).</param>
    public Task<CommandResultView> SendArmy(int targetSeat, Dictionary<string, int> units, Dictionary<string, Row>? rows, string? archerPriority,
        ArmyMode mode = ArmyMode.Attack) =>
        Economy(new SendArmy(Room.CastleKeyOf(targetSeat), units ?? [], rows, archerPriority, mode));

    /// <summary>Call one of our own armies home (the id is from our own castle view).</summary>
    public Task<CommandResultView> RecallArmy(int armyId) => Economy(new RecallArmy(armyId));

    public Task<CommandResultView> SetDefense(Dictionary<string, Row>? rows, string? archerPriority) =>
        Economy(new SetDefense(rows, archerPriority));

    private async Task<CommandResultView> Economy(GameCommand command)
    {
        if (Bound() is not { } bound) return NotJoined;
        CommandResult result;
        CastleView? castle = null;
        MapStateView? map = null;
        int seat = 0;
        lock (bound.Session.Lock)
        {
            var room = bound.Session.Room;
            result = room.Execute(bound.Token, command);
            if (result.Ok && room.Find(bound.Token) is { } player)
            {
                castle = ViewMapper.CastleOf(room, player);
                map = MapViewMapper.StateOf(room, player);
                seat = player.Seat;
            }
        }
        // Push right away so the UI does not wait for the next tick; only to the owner's group.
        var group = Clients.Group(PlayerGroup(bound.Session.Room.Code, seat));
        if (castle is not null) await group.SendAsync("CastleState", castle);
        if (map is not null) await group.SendAsync("MapState", map);
        return new CommandResultView(result.Ok, result.Error);
    }

    private async Task<CommandResultView> RoomCommand(Func<Room, string, CommandResult> action, bool pushCastles = false,
        bool pushLayout = false)
    {
        if (Bound() is not { } bound) return NotJoined;
        CommandResult result;
        lock (bound.Session.Lock) result = action(bound.Session.Room, bound.Token);
        if (result.Ok)
        {
            await PushRoom(bound.Session);
            if (pushLayout) await PushLayout(bound.Session);
            if (pushCastles) await PushCastles(Clients, bound.Session);
        }
        return new CommandResultView(result.Ok, result.Error);
    }

    // ---- pushing ---------------------------------------------------------------------------

    private Task PushRoom(RoomSession session)
    {
        RoomView view;
        lock (session.Lock) view = ViewMapper.ToView(session.Room);
        return Clients.Group(RoomGroup(session.Room.Code)).SendAsync("RoomState", view);
    }

    /// <summary>The map's terrain, roads and corners: public, the same for the whole room.</summary>
    private Task PushLayout(RoomSession session)
    {
        MapLayoutView? layout;
        lock (session.Lock) layout = MapViewMapper.LayoutOf(session.Room);
        return layout is null ? Task.CompletedTask : Clients.Group(RoomGroup(session.Room.Code)).SendAsync("MapLayout", layout);
    }

    /// <summary>
    /// Each player's own castle, what they see on the map and the battles they just started fighting,
    /// to that player's group only.
    /// </summary>
    public static async Task PushCastles(IHubClients<IClientProxy> clients, RoomSession session)
    {
        List<(int Seat, CastleView View, MapStateView? Map, List<BattleStartedView> Battles)> views;
        lock (session.Lock)
            views = session.Room.Players
                .Select(p => (p.Seat, View: ViewMapper.CastleOf(session.Room, p), Map: MapViewMapper.StateOf(session.Room, p),
                    Battles: MapViewMapper.StartedBattlesOf(session.Room, p)))
                .Where(x => x.View is not null)
                .Select(x => (x.Seat, x.View!, x.Map, x.Battles))
                .ToList();
        foreach (var (seat, view, map, battles) in views)
        {
            var group = clients.Group(PlayerGroup(session.Room.Code, seat));
            foreach (var b in battles) await group.SendAsync("BattleStarted", b);
            await group.SendAsync("CastleState", view);
            if (map is not null) await group.SendAsync("MapState", map);
        }
    }

    // ---- helpers ---------------------------------------------------------------------------

    private static readonly CommandResultView NotJoined = new(false, "Önce bir odaya katılmalısın.");

    private static JoinView JoinFail(string error) => new(false, error, null, null, 0, null);

    private (RoomSession Session, string Token)? Bound() =>
        Context.Items.TryGetValue(CodeKey, out var code) && Context.Items.TryGetValue(TokenKey, out var token)
        && registry.Find((string)code!) is { } session
            ? (session, (string)token!)
            : null;
}
