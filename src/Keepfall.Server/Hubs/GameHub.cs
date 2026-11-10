using Keepfall.Core.Economy;
using Keepfall.Core.Lobby;
using Keepfall.Core.Match;
using Keepfall.Core.Units;
using Keepfall.Core.World;
using Keepfall.Views;
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
public sealed class GameHub(RoomRegistry registry, Keepfall.Core.GameRules rules, Keepfall.Core.Challenges.ChallengeCatalog challenges, Director director,
    Microsoft.Extensions.Options.IOptions<KeepfallOptions> options, GuestGate guests, ILogger<GameHub> logger) : Hub
{
    /// <summary>The words a player who was put out of the lobby gets (the page shows and translates them).</summary>
    public const string KickedNote = "Ev sahibi seni odadan çıkardı.";

    public override async Task OnConnectedAsync()
    {
        // The friend-hosted game: guests' lines are counted and one that takes no seat in time is closed (see GuestGate).
        if (IsGuest && !guests.Opened(Context)) { Context.Abort(); return; }
        await base.OnConnectedAsync();
    }

    /// <summary>The friend-hosted game: this server runs on the host's own computer (see <see cref="KeepfallOptions.GuestPort"/>).</summary>
    private bool Hosted => options.Value.GuestPort > 0;
    /// <summary>The caller came in through the guests' door (a friend over LAN or Steam), not from the host's own window.</summary>
    private bool IsGuest => IsGuestConnection(Context.GetHttpContext(), options.Value);
    public static bool IsGuestConnection(HttpContext? http, KeepfallOptions o) =>
        o.GuestPort > 0 && (http is null || http.Connection.LocalPort == o.GuestPort || http.Connection.RemoteIpAddress is not { } ip || !System.Net.IPAddress.IsLoopback(ip));

    private const string CodeKey = "code";
    private const string TokenKey = "token";

    public static string RoomGroup(string code) => $"oda:{code}";
    public static string PlayerGroup(string code, int seat) => $"oda:{code}:o{seat}";

    /// <summary>A round trip for the client's "FPS göster" counter; touches nothing.</summary>
    public Task<int> Ping() => Task.FromResult(0);

    /// <summary>The version of the conversation between page and server. The page asks once when it connects: a page that is older (or newer) than the server is told to reload.</summary>
    public const int Protocol = 1;
    public Task<int> Hello(int clientProtocol) => Task.FromResult(Protocol);

    /// <summary>Room-code guessing: this many wrong codes in a minute from one connection and the connection has to wait.</summary>
    private const int MaxWrongCodes = 6;
    private static readonly TimeSpan WrongCodeWindow = TimeSpan.FromMinutes(1);

    // ---- joining ---------------------------------------------------------------------------

    public async Task<JoinView> CreateRoom(string? name)
    {
        if (Context.Items.ContainsKey(CodeKey)) return JoinFail("Bu bağlantı zaten bir odada.");
        if (IsGuest) return JoinFail("Bu oyunda odayı yalnız ev sahibi kurabilir.");
        var session = registry.Create();
        if (session is null) return JoinFail("Sunucu dolu, birazdan tekrar dene.");
        JoinResult result;
        lock (session.Lock) result = session.Room.Join(name, null, false, DateTime.UtcNow);
        return await Attach(session, result);
    }

    /// <param name="token">The caller's token for this room, if it has one.</param>
    /// <param name="remembered">True when the token was remembered from an earlier tab rather than this one.</param>
    public async Task<JoinView> JoinRoom(string? code, string? name, string? token, bool remembered)
    {
        if (Context.Items.ContainsKey(CodeKey)) return JoinFail("Bu bağlantı zaten bir odada.");
        if (IsGuest)
        {
            if (!guests.MayGuess(Context.ConnectionId)) return JoinFail("Çok fazla deneme. Bir dakika bekle.");
            if (registry.Find(code) is { } wanted)
            {
                if (guests.IsBanned(Context.ConnectionId, wanted.Room.Code)) return JoinFail(KickedNote);
                if (!guests.RoomHasSpace(wanted.Room.Code)) return JoinFail("Oda dolu.");
            }
            else guests.Missed(Context.ConnectionId);
        }
        var misses = Context.Items.TryGetValue("misses", out var m) && m is List<DateTime> list ? list : new List<DateTime>();
        misses.RemoveAll(t => DateTime.UtcNow - t > WrongCodeWindow);
        if (misses.Count >= MaxWrongCodes) return JoinFail("Çok fazla deneme. Bir dakika bekle.");
        if (registry.Find(code) is not { } session)
        {
            misses.Add(DateTime.UtcNow);
            Context.Items["misses"] = misses;
            return JoinFail("Oda bulunamadı.");
        }
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
        if (IsGuest) guests.Bound(Context.ConnectionId, code, player.Token);
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
        guests.Closed(Context.ConnectionId);
        if (Context.Items.TryGetValue(DirectorItem, out var watched) && watched is string watchedCode) director.Unwatch(watchedCode);
        if (Bound() is { } bound)
        {
            // (what happened to the line is the only way to tell a phone's network blip from a server problem afterwards)
            logger.LogInformation("Connection dropped: room {Room}, {Reason}", bound.Session.Room.Code, exception is null ? "clean close" : exception.GetType().Name + ": " + exception.Message);
            lock (bound.Session.Lock) bound.Session.Room.Disconnect(bound.Token, DateTime.UtcNow);
            await PushRoom(bound.Session);
        }
        await base.OnDisconnectedAsync(exception);
    }

    // ---- director (cameraman) ----------------------------------------------------------------

    private const string DirectorItem = "director";

    /// <summary>Rooms the director can watch (null: the director is off or the key is wrong). See <see cref="Director"/>.</summary>
    public async Task<List<DirectorRoomView>?> DirectorRooms(string? key)
    {
        if (Hosted || !director.Accepts(key)) { await Task.Delay(1000); return null; } // (a wrong key costs a second: no guessing)
        var list = new List<DirectorRoomView>();
        foreach (var s in registry.Sessions)
            lock (s.Lock)
                list.Add(new DirectorRoomView(s.Room.Code, s.Room.Phase.ToString(), s.Room.Players.Count(p => !p.IsBot), s.Room.Players.Count(p => p.IsBot),
                    s.Room.Game?.ElapsedSeconds ?? 0));
        return list;
    }

    /// <summary>
    /// Watch a room as the director: not a player (no seat taken, not in the room's list, no commands), the whole map live. Answers like a join, with the
    /// seat of the castle the page is built around; the layout, that castle and the pictures follow (the tick loop sends them while the match runs).
    /// </summary>
    public async Task<JoinView> DirectorWatch(string? key, string? code)
    {
        if (Hosted || !director.Accepts(key)) { await Task.Delay(1000); return JoinFail("Kapalı."); }
        if (Context.Items.ContainsKey(CodeKey) || Context.Items.ContainsKey(DirectorItem)) return JoinFail("Bu bağlantı zaten bir odada.");
        if (registry.Find(code) is not { } session) return JoinFail("Oda bulunamadı.");
        RoomView room;
        MapLayoutView? layout;
        CastleView? castle = null;
        int seat = 0;
        lock (session.Lock)
        {
            room = ViewMapper.ToView(session.Room);
            layout = MapViewMapper.LayoutOf(session.Room);
            if (Director.Anchor(session.Room) is { } anchor) { seat = anchor.Seat; castle = ViewMapper.CastleOf(session.Room, anchor); }
        }
        var roomCode = session.Room.Code;
        Context.Items[DirectorItem] = roomCode;
        director.Watch(roomCode);
        await Groups.AddToGroupAsync(Context.ConnectionId, RoomGroup(roomCode));
        await Groups.AddToGroupAsync(Context.ConnectionId, Director.Group(roomCode));
        logger.LogInformation("Director watching room {Room}", roomCode);
        if (layout is not null) await Clients.Caller.SendAsync("MapLayout", layout);
        if (castle is not null) await Clients.Caller.SendAsync("CastleState", castle);
        return new JoinView(true, null, roomCode, null, seat, room);
    }

    // ---- lobby -----------------------------------------------------------------------------

    /// <summary>The caller goes back to the main menu: this connection is unbound from the room (a started match keeps the castle, the token still returns to it).</summary>
    public async Task<CommandResultView> LeaveRoom()
    {
        if (Bound() is not { } bound) return NotJoined;
        var code = bound.Session.Room.Code;
        int seat;
        bool hostQuit = false;
        lock (bound.Session.Lock)
        {
            seat = bound.Session.Room.Find(bound.Token)?.Seat ?? 0;
            // The friend-hosted game: the host walks out of a running match that friends are still in. Their game lives on this computer, so it ends here
            // for everybody, with the end screen and the summary (rather than leaving them in a match whose machine may be switched off any moment).
            hostQuit = Hosted && !IsGuest && HostedMatch.HasGuests(bound.Session.Room, seat);
            if (!hostQuit) bound.Session.Room.Leave(bound.Token, DateTime.UtcNow);
        }
        if (hostQuit)
        {
            await HostedMatch.End(Clients, bound.Session);
            lock (bound.Session.Lock) bound.Session.Room.Leave(bound.Token, DateTime.UtcNow);
        }
        Context.Items.Remove(CodeKey);
        Context.Items.Remove(TokenKey);
        guests.Unbound(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, RoomGroup(code));
        if (seat > 0) await Groups.RemoveFromGroupAsync(Context.ConnectionId, PlayerGroup(code, seat));
        // Everybody has left a lobby or a finished match: the room is closed at once, so it does not hold one of the server's slots for the abandon time
        // (a room in a running match stays until it is abandoned, see TickLoop).
        bool empty;
        lock (bound.Session.Lock) empty = bound.Session.Room.Phase is RoomPhase.Lobby or RoomPhase.Ended && bound.Session.Room.Players.All(p => p.IsBot || !p.Connected);
        if (empty) { registry.Remove(code); guests.RoomClosed(code); return new CommandResultView(true, null); }
        await PushRoom(bound.Session);
        return new CommandResultView(true, null);
    }

    public Task<CommandResultView> SetName(string? name) => RoomCommand((room, token) => room.SetName(token, name));
    /// <summary>Cosmetic picks: an avatar frame and banner designs ("tuccar:b"). Only known ids are accepted; no balance number reads them.</summary>
    public Task<CommandResultView> SetCosmetics(string? frame, string[]? banners) => RoomCommand((room, token) => room.SetCosmetics(token, frame, banners));
    public Task<CommandResultView> SetReady(bool ready) => RoomCommand((room, token) => room.SetReady(token, ready));
    public Task<CommandResultView> SetGuided(bool on) => RoomCommand((room, token) => room.SetGuided(token, on));
    public Task<CommandResultView> SetStarter(bool on) => RoomCommand((room, token) => room.SetStarter(token, on));
    public Task<CommandResultView> SetDeck(string[]? units) => RoomCommand((room, token) => room.SetDeck(token, units));
    /// <summary>The challenges and today's daily one: the same for everybody, nothing of any match.</summary>
    public ChallengeListView GetChallenges() => ChallengeMapper.ListOf(challenges, Keepfall.Core.Challenges.ChallengeCatalog.Daily(DateTime.UtcNow, rules));

    /// <summary>
    /// The room's only human starts a challenge ("daily" = today's): the computer players, seed, kingdoms and times come from the definition
    /// on the server; the client names nothing but the challenge.
    /// </summary>
    public Task<CommandResultView> StartChallenge(string? id) => StartChallengeCore(id, false);
    /// <summary>The same, with the full rules even for a starter card (the player turned "play with full rules" on).</summary>
    public Task<CommandResultView> StartChallengeFullRules(string? id) => StartChallengeCore(id, true);

    private async Task<CommandResultView> StartChallengeCore(string? id, bool fullRules)
    {
        if (Bound() is not { } bound) return NotJoined;
        var def = id == "daily" ? Keepfall.Core.Challenges.ChallengeCatalog.Daily(DateTime.UtcNow, rules) : challenges.Find(id);
        if (def is null) return new CommandResultView(false, "Böyle bir meydan okuma yok.");
        CommandResult result;
        lock (bound.Session.Lock)
        {
            result = bound.Session.Room.StartChallenge(bound.Token, def, fullRules);
            if (result.Ok) bound.Session.SeedBots(def.Seed);
        }
        if (result.Ok)
        {
            await PushRoom(bound.Session);
            await PushLayout(bound.Session);
            await PushCastles(Clients, bound.Session);
        }
        return new CommandResultView(result.Ok, result.Error);
    }

    public Task<CommandResultView> StartMatch() => RoomCommand((room, token) => room.Start(token), pushCastles: true, pushLayout: true);
    public Task<CommandResultView> BackToLobby() => RoomCommand((room, token) => room.BackToLobby(token));
    public Task<CommandResultView> AddBot(BotDifficulty difficulty) => RoomCommand((room, token) => room.AddBot(token, difficulty));
    public Task<CommandResultView> RemoveBot(int seat) => RoomCommand((room, token) => room.RemoveBot(token, seat));

    /// <summary>
    /// The host puts a player out of the lobby. The player is told, their connections are closed, and (in the friend-hosted game) their address or
    /// Steam id cannot join this room again.
    /// </summary>
    public async Task<CommandResultView> KickPlayer(int seat)
    {
        if (Bound() is not { } bound) return NotJoined;
        if (IsGuest) return new CommandResultView(false, "Oyuncuyu sadece odayı kuran çıkarabilir.");
        var code = bound.Session.Room.Code;
        CommandResult result;
        string? kicked;
        lock (bound.Session.Lock) result = bound.Session.Room.Kick(bound.Token, seat, out kicked);
        if (!result.Ok || kicked is null) return new CommandResultView(result.Ok, result.Error);
        await Clients.Group(PlayerGroup(code, seat)).SendAsync("Kicked", KickedNote);
        foreach (var line in guests.Kick(code, kicked))
        {
            await Groups.RemoveFromGroupAsync(line.ConnectionId, RoomGroup(code));
            await Groups.RemoveFromGroupAsync(line.ConnectionId, PlayerGroup(code, seat));
            _ = Task.Delay(500).ContinueWith(_ => line.Abort(), TaskScheduler.Default); // (after the goodbye has gone out)
        }
        await PushRoom(bound.Session);
        return new CommandResultView(true, null);
    }

    /// <summary>
    /// The host ends a match that only bots are still playing: the rest is simulated on the server at once
    /// and everyone gets the end screen.
    /// </summary>
    public async Task<CommandResultView> FinishMatch()
    {
        if (Bound() is not { } bound) return NotJoined;
        CommandResult result;
        lock (bound.Session.Lock)
            result = bound.Session.Room.FinishMatch(bound.Token, rules.Match.ServerTickSeconds, dt => bound.Session.Bots.Step(bound.Session.Room, dt));
        if (result.Ok) await MatchPush.End(Clients, bound.Session);
        return new CommandResultView(result.Ok, result.Error);
    }

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
    /// <summary>Send a scout to a chest this player has found.</summary>
    public Task<CommandResultView> SendChestScout(string siteId, Job from) => Economy(new SendChestScout(siteId, from));

    /// <summary>Send an army to a place in the forest this player has found (plunder a village, clear a camp).</summary>
    public Task<CommandResultView> SendArmyToSite(string siteId, Dictionary<string, int> units, Dictionary<string, Row>? rows, string? archerPriority) =>
        Economy(new SendArmyToSite(siteId, units ?? [], rows, archerPriority));

    /// <summary>Hire soldiers for gold (they stand at home at once and cannot become workers).</summary>
    public Task<CommandResultView> HireMercenary(string unitId, int count) => Economy(new HireMercenary(unitId, count));
    /// <summary>The target is named by public seat; the castle itself is never addressed by the client.</summary>
    public Task<CommandResultView> SendScout(int targetSeat, Job from) => Economy(new SendScout(Room.CastleKeyOf(targetSeat), from));

    /// <summary>An envoy to another player with goods and/or a message; the server checks the load and the text.</summary>
    public Task<CommandResultView> SendEnvoy(int targetSeat, int food, int wood, int iron, int gold, string? message, Job from) =>
        Economy(new SendEnvoy(Room.CastleKeyOf(targetSeat), food, wood, iron, gold, message, from));

    /// <param name="units">Unit id → how many soldiers to send.</param>
    /// <param name="rows">Optional row per unit id ("front" / "back").</param>
    /// <param name="archerPriority">Optional unit id the archers aim at first.</param>
    /// <param name="mode">Attack the castle, or cut off the road (home after the first battle on it, or from half way).</param>
    public Task<CommandResultView> SendArmy(int targetSeat, Dictionary<string, int> units, Dictionary<string, Row>? rows, string? archerPriority,
        ArmyMode mode = ArmyMode.Attack) =>
        Economy(new SendArmy(Room.CastleKeyOf(targetSeat), units ?? [], rows, archerPriority, mode));

    // ---- kingdoms (the server checks that the caller's kingdom may do it) ---------------------------

    /// <summary>Shadow: a phantom army towards a rival.</summary>
    public Task<CommandResultView> SendDecoy(int targetSeat, Dictionary<string, int> units) =>
        Economy(new SendDecoy(Room.CastleKeyOf(targetSeat), units ?? []));

    /// <summary>Shadow: the false army table a rival's scout will read.</summary>
    public Task<CommandResultView> SetFakeReport(Dictionary<string, int> units) => Economy(new SetFakeReport(units ?? []));

    /// <summary>Merchant: bribe some soldiers of an approaching army we see (its id is from the map).</summary>
    public Task<CommandResultView> BribeArmy(string armyId, int count) => Economy(new BribeArmy(armyId ?? "", count));

    /// <summary>Merchant: hire a bandit camp we have found to march on a rival.</summary>
    public Task<CommandResultView> HireCamp(string siteId, int targetSeat) => Economy(new HireCamp(siteId ?? "", Room.CastleKeyOf(targetSeat)));

    /// <summary>Schemer: an envoy under another player's name.</summary>
    public Task<CommandResultView> SendEnvoyAs(int targetSeat, int asSeat, int food, int wood, int iron, int gold, string? message, Job from) =>
        Economy(new SendEnvoy(Room.CastleKeyOf(targetSeat), food, wood, iron, gold, message, from, Room.CastleKeyOf(asSeat)));

    /// <summary>Schemer: an army in another player's colour.</summary>
    public Task<CommandResultView> SendArmyAs(int targetSeat, int asSeat, Dictionary<string, int> units, Dictionary<string, Row>? rows, string? archerPriority,
        ArmyMode mode = ArmyMode.Attack) =>
        Economy(new SendArmy(Room.CastleKeyOf(targetSeat), units ?? [], rows, archerPriority, mode, Room.CastleKeyOf(asSeat)));

    /// <summary>Call one of our own armies home (the id is from our own castle view).</summary>
    public Task<CommandResultView> RecallArmy(int armyId) => Economy(new RecallArmy(armyId));

    /// <summary>
    /// A new order for one of our armies on the road: attack another castle (by public seat; war only) or go to a place in the
    /// forest we have found. Exactly one of the two. It walks there from where it stands.
    /// </summary>
    public Task<CommandResultView> RedirectArmy(int armyId, int? targetSeat, string? siteId) =>
        Economy(new RedirectArmy(armyId, targetSeat is { } seat ? Room.CastleKeyOf(seat) : null, siteId));

    /// <summary>At a gate with two besiegers: whom our side hits first (a seat), or 0 for the default.</summary>
    public Task<CommandResultView> SetSiegeFocus(int seat) =>
        Economy(new SetSiegeFocus(seat > 0 ? Room.CastleKeyOf(seat) : null));

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
                .Where(p => !p.IsBot) // bots have no connection to push to
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
