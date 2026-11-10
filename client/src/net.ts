import { effectivePicks } from './progress/catalog';
import { progressStore } from './progress/store';
import * as signalR from '@microsoft/signalr';
import { loadIdentity, markActiveRoom, saveIdentity } from './identity';
import { trace } from './debug-trace';
import type { ProgressResult, ChallengeList, ChallengeResult, ArmyMode, BattleStartedView, BotLevel, BuildingType, CastleView, CommandResult, Job, JoinView, MapLayoutView, MapStateView, RoomView, Row, SpectatorStateView, SpectatorWaitView, SummaryView } from './types';
import { serverUrl } from './env';

/** The version of the conversation with the server; Hello on the hub answers with the server's (GameHub.Protocol). */
export const PROTOCOL = 1;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'roomLost';

export interface ConnectionEvents {
  room: (room: RoomView) => void;
  castle: (castle: CastleView) => void;
  /** The shared map, once per match (and again after a reconnect). */
  mapLayout: (layout: MapLayoutView) => void;
  /** What we see on the map, every tick. */
  mapState: (state: MapStateView) => void;
  /** A battle we fight in has started (or is going on, after a reconnect): the whole record to replay. */
  battleStarted: (battle: BattleStartedView) => void;
  /** Only once our castle has fallen: the whole map, a fixed delay behind the game. */
  spectatorState: (state: SpectatorStateView) => void;
  /** Our castle has fallen and the view has not started yet. */
  spectatorWait: (wait: SpectatorWaitView) => void;
  matchEnded: (summary: SummaryView) => void;
  /** Only in a challenge: the goals and the stars, to the one player. */
  challengeResult: (result: ChallengeResult) => void;
  /** At the end of every match: the achievements it earned, to the one player. */
  progressResult: (result: ProgressResult) => void;
  /** Something that happened to us, e.g. "Kırmızı'nın gözcüsü kaleni gözetledi." */
  notification: (text: string) => void;
  /** The friend-hosted game: the host has quit, the match ends here (the end screen follows). */
  hostLeft?: (text: string) => void;
  /** The room's host has put us out of the lobby. */
  kicked?: (text: string) => void;
  status: (status: ConnectionStatus) => void;
}

/** Thin wrapper over the hub: the client only sends commands, the server decides. */
export class GameConnection {
  private hub!: signalR.HubConnection;
  /** Another game server than the page's own: a friend's (the desktop build's guest door). Empty: our own. */
  private base = '';
  /** The room we are in (its code is public: the room's link has it). */
  roomCode: string | null = null;
  private name = '';
  /** This tab's seat in the room (1–4), 0 before joining. */
  seat = 0;

  constructor(private readonly on: ConnectionEvents) {
    this.build();
    // While we are in a room its record is kept fresh: a page that is reloaded within a minute finds its way back (see identity.ts).
    setInterval(() => { if (this.roomCode && this.hub.state === signalR.HubConnectionState.Connected) markActiveRoom(this.roomCode); }, 5000);
  }

  /**
   * Points the connection at another game server (a friend's game, through the desktop shell's door) or back at our own (''): the old line is closed
   * without a word to the page, the new one is not started yet (call start()).
   */
  async switchServer(base: string): Promise<void> {
    const old = this.hub;
    this.roomCode = null;
    this.seat = 0;
    this.base = base.replace(/\/+$/, '');
    this.build();
    try { await old.stop(); } catch { /* it was down */ }
  }

  private build(): void {
    const hub = this.hub = new signalR.HubConnectionBuilder()
      .withUrl(this.base ? this.base + '/hub' : serverUrl('/hub'), { withCredentials: false }) // no cookies: the hub answers any origin (itch.io page → hosted server)
      // The library gives up after ~40 s; a match lasts longer than a bad minute of wifi, so keep trying every 5 s for ten minutes.
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => ctx.elapsedMilliseconds >= 600_000 ? null : ([0, 2000][ctx.previousRetryCount] ?? 5000) })
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    // (the server's own timeouts are 10 s keep-alive / 60 s: see Program.cs)
    this.hub.serverTimeoutInMilliseconds = 60_000;
    this.hub.keepAliveIntervalInMilliseconds = 10_000;
    this.hub.on('RoomState', (room: RoomView) => this.on.room(room));
    this.hub.on('CastleState', (castle: CastleView) => this.on.castle(castle));
    this.hub.on('MapLayout', (layout: MapLayoutView) => this.on.mapLayout(layout));
    this.hub.on('MapState', (state: MapStateView) => this.on.mapState(state));
    this.hub.on('BattleStarted', (battle: BattleStartedView) => this.on.battleStarted(battle));
    this.hub.on('SpectatorState', (state: SpectatorStateView) => this.on.spectatorState(state));
    this.hub.on('SpectatorWait', (wait: SpectatorWaitView) => this.on.spectatorWait(wait));
    this.hub.on('MatchEnded', (summary: SummaryView) => this.on.matchEnded(summary));
    this.hub.on('ChallengeResult', (result: ChallengeResult) => this.on.challengeResult(result));
    this.hub.on('ProgressResult', (result: ProgressResult) => this.on.progressResult(result));
    this.hub.on('Notification', (text: string) => this.on.notification(text));
    this.hub.on('HostLeft', (text: string) => this.on.hostLeft?.(text));
    this.hub.on('Kicked', (text: string) => { if (hub === this.hub) this.on.kicked?.(text); });
    this.hub.onreconnecting(() => { if (hub === this.hub) this.on.status('reconnecting'); });
    // A reconnect is a new connection on the server: rejoin the same seat with our token.
    // If the room is gone (the server restarted) or the seat cannot be taken back, say so instead of leaving a frozen screen.
    this.hub.onreconnected(async () => {
      if (hub !== this.hub || !this.roomCode) return;
      if (this.directorKey) { const again = await this.directorWatch(this.directorKey, this.roomCode).catch(() => null); if (!again?.ok) this.on.status('roomLost'); return; }
      const result = await this.joinRoom(this.roomCode, this.name).catch(() => null);
      if (!result?.ok) this.on.status('roomLost');
    });
    this.hub.onclose(() => { if (hub === this.hub) this.on.status('disconnected'); }); // (a line we swapped out ourselves says nothing)
  }

  /**
   * The page is visible again (a phone woke up, the network came back): make sure the line is alive. A line that does not answer within 4 s is
   * dropped and made again, and the seat is taken back with the room's token; a line the library has given up on is started afresh.
   */
  async recheck(): Promise<void> {
    if (this.retired) return;
    const state = this.hub.state;
    if (state === signalR.HubConnectionState.Connecting || state === signalR.HubConnectionState.Reconnecting) return;
    if (state === signalR.HubConnectionState.Connected) {
      const alive = await Promise.race([this.hub.invoke('Ping').then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 4000))]);
      if (alive) return;
      this.on.status('reconnecting');
      try { await this.hub.stop(); } catch { /* already down */ }
    }
    this.on.status('reconnecting');
    try { await this.hub.start(); } catch { this.on.status('disconnected'); return; }
    this.on.status('connected');
    if (!this.roomCode) return;
    const result = await this.joinRoom(this.roomCode, this.name).catch(() => null);
    if (!result?.ok) this.on.status('roomLost');
  }

  async start(): Promise<void> {
    this.on.status('connecting');
    await this.hub.start();
    this.on.status('connected');
  }

  /** The conversation version of the server (null: an older server that does not know the question). */
  async serverProtocol(): Promise<number | null> {
    try { return await this.hub.invoke<number>('Hello', PROTOCOL); } catch { return null; }
  }

  /** Another tab of this browser has taken the seat: this one lets go of the line for good. */
  async retire(): Promise<void> {
    this.retired = true;
    await this.abort();
  }
  retired = false;

  /** The line's state as a word (Connected, Reconnecting, ...). */
  get state(): string { return this.hub.state; }

  /** Gives up an attempt to connect that is still pending (the next `start()` begins afresh). */
  async abort(): Promise<void> {
    try { await this.hub.stop(); } catch { /* nothing to stop */ }
  }

  /** The director (cameraman) key, when this page is one (see director.ts): a reconnect watches again instead of joining. */
  private directorKey: string | null = null;

  /** Director only: the rooms on the server (null: the server has no director or the key is wrong). */
  directorRooms(key: string): Promise<{ code: string; phase: string; humans: number; bots: number; elapsedSeconds: number }[] | null> {
    return this.hub.invoke('DirectorRooms', key);
  }

  /** Director only: watch a room (no seat is taken; `seat` is the castle the page is built around). */
  async directorWatch(key: string, code: string): Promise<JoinView> {
    const result = await this.hub.invoke<JoinView>('DirectorWatch', key, code);
    if (result.ok) {
      this.directorKey = key;
      this.roomCode = result.code;
      this.seat = result.seat;
      this.on.status('connected');
      if (result.room) this.on.room(result.room);
    }
    return result;
  }

  async createRoom(name: string): Promise<JoinView> {
    const result = await this.hub.invoke<JoinView>('CreateRoom', name);
    return this.joined(result, name);
  }

  async joinRoom(code: string, name: string): Promise<JoinView> {
    const id = loadIdentity(code.toUpperCase());
    const result = await this.hub.invoke<JoinView>('JoinRoom', code, name, id.token, id.remembered);
    return this.joined(result, name);
  }

  private joined(result: JoinView, name: string): JoinView {
    if (result.ok) {
      this.roomCode = result.code;
      this.name = name;
      this.seat = result.seat;
      saveIdentity(result.code!, result.token!);
      markActiveRoom(result.code);
      this.on.status('connected');
      if (result.room) this.on.room(result.room);
      void this.setCosmetics();
    }
    return result;
  }

  /** Milliseconds for one trip to the server and back (null if the server is too old to know `Ping`, or the line is down). */
  ping = async (): Promise<number | null> => {
    if (this.hub.state !== signalR.HubConnectionState.Connected) return null;
    const t0 = performance.now();
    try { await this.hub.invoke('Ping'); } catch { return null; }
    return performance.now() - t0;
  };

  // Lobby
  setName = (name: string) => { this.name = name; return this.call('SetName', name); };
  setReady = (ready: boolean) => this.call('SetReady', ready);
  /** The guided first match: computer players leave this (single human) player alone for the first minutes of the war. */
  setGuided = (on: boolean) => this.call('SetGuided', on);
  /** Starter rules for this (single human) room: no kingdom abilities, fixed rows, the classic deck unless one was picked. */
  setStarter = (on: boolean) => this.call('SetStarter', on);
  /** Our avatar frame and banner designs (only what we have earned; the server accepts known ids only). A server that does not know them just says no. */
  setCosmetics = () => { const p = effectivePicks(progressStore().load()); return this.call('SetCosmetics', p.frame, p.banners); };
  setDeck = (units: string[]) => this.call('SetDeck', units);
  startMatch = () => this.call('StartMatch');
  /** The challenges and today's daily one (the same for everybody; nothing of any match). */
  getChallenges = () => this.hub.invoke<ChallengeList>('GetChallenges');
  /** The only human of the room starts a challenge ("daily" = today's): the server sets up the bots, seed and kingdoms. */
  startChallenge = (id: string, fullRules = false) => this.call(fullRules ? 'StartChallengeFullRules' : 'StartChallenge', id);
  addBot = (level: BotLevel) => this.call('AddBot', level);
  removeBot = (seat: number) => this.call('RemoveBot', seat);
  /** The host puts a player out of the lobby. */
  kickPlayer = (seat: number) => this.call('KickPlayer', seat);
  finishMatch = () => this.call('FinishMatch');
  backToLobby = () => this.call('BackToLobby');
  /** Back to the main menu: the server unbinds this connection (a lobby seat is freed, a castle in a running match stays). */
  leaveRoom = async () => {
    const r = await this.call('LeaveRoom');
    markActiveRoom(null);
    this.roomCode = null;
    this.seat = 0;
    return r;
  };

  // Own castle
  moveWorkers = (from: Job, to: Job, count: number) => this.call('MoveWorkers', from, to, count);
  queueWeapon = (unitId: string, count: number) => this.call('QueueWeapon', unitId, count);
  cancelWeapon = (index: number) => this.call('CancelWeapon', index);
  armWorkers = (unitId: string, count: number, from: Job) => this.call('ArmWorkers', unitId, count, from);
  disarmSoldiers = (unitId: string, count: number) => this.call('DisarmSoldiers', unitId, count);
  upgradeBuilding = (building: BuildingType) => this.call('UpgradeBuilding', building);
  sendEnvoy = (targetSeat: number, food: number, wood: number, iron: number, gold: number, message: string, from: Job) =>
    this.call('SendEnvoy', targetSeat, food, wood, iron, gold, message || null, from);
  // Kingdoms
  sendDecoy = (targetSeat: number, units: Record<string, number>) => this.call('SendDecoy', targetSeat, units);
  setFakeReport = (units: Record<string, number>) => this.call('SetFakeReport', units);
  bribeArmy = (armyId: string, count: number) => this.call('BribeArmy', armyId, count);
  hireCamp = (siteId: string, targetSeat: number) => this.call('HireCamp', siteId, targetSeat);
  sendEnvoyAs = (targetSeat: number, asSeat: number, food: number, wood: number, iron: number, gold: number, message: string, from: Job) =>
    this.call('SendEnvoyAs', targetSeat, asSeat, food, wood, iron, gold, message || null, from);
  sendArmyAs = (targetSeat: number, asSeat: number, units: Record<string, number>, rows: Record<string, Row> | null, archerPriority: string | null) =>
    this.call('SendArmyAs', targetSeat, asSeat, units, rows, archerPriority, 'attack');
  sendExplore = (quarter: string, from: Job) => this.call('SendExplore', quarter, from);
  sendChestScout = (siteId: string, from: Job) => this.call('SendChestScout', siteId, from);
  sendArmyToSite = (siteId: string, units: Record<string, number>, rows: Record<string, Row> | null, archerPriority: string | null) =>
    this.call('SendArmyToSite', siteId, units, rows, archerPriority);
  hireMercenary = (unitId: string, count: number) => this.call('HireMercenary', unitId, count);
  setGrowth = (enabled: boolean) => this.call('SetGrowth', enabled);
  sendScout = (targetSeat: number, from: Job) => this.call('SendScout', targetSeat, from);
  sendArmy = (targetSeat: number, units: Record<string, number>, rows: Record<string, Row>, archerPriority: string | null,
    mode: ArmyMode = 'attack') => this.call('SendArmy', targetSeat, units, rows, archerPriority, mode);
  recallArmy = (armyId: number) => { trace('recall', `own:${armyId}`); return this.call('RecallArmy', armyId); };
  /** A new order for an army on the road: another castle (`targetSeat`) or a place in the forest (`siteId`). */
  redirectArmy = (armyId: number, targetSeat: number | null, siteId: string | null) => { trace('redirect', `own:${armyId}`, `to ${targetSeat ?? siteId}`); return this.call('RedirectArmy', armyId, targetSeat, siteId); };
  /** At a gate with two besiegers: whom our side hits first (a seat), 0 = the default. */
  setSiegeFocus = (seat: number) => this.call('SetSiegeFocus', seat);
  setDefense = (rows: Record<string, Row>, archerPriority: string | null) => this.call('SetDefense', rows, archerPriority);
  setSpeed = (speed: number) => this.call('SetSpeed', speed);

  private async call(method: string, ...args: unknown[]): Promise<CommandResult> {
    try {
      return await this.hub.invoke<CommandResult>(method, ...args);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
