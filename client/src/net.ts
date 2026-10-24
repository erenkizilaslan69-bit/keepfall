import * as signalR from '@microsoft/signalr';
import { loadIdentity, saveIdentity } from './identity';
import type { BuildingType, CastleView, CommandResult, Job, JoinView, RoomView, Row, SummaryView } from './types';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ConnectionEvents {
  room: (room: RoomView) => void;
  castle: (castle: CastleView) => void;
  matchEnded: (summary: SummaryView) => void;
  /** Something that happened to us, e.g. "Kırmızı'nın gözcüsü kaleni gözetledi." */
  notification: (text: string) => void;
  status: (status: ConnectionStatus) => void;
}

/** Thin wrapper over the hub: the client only sends commands, the server decides. */
export class GameConnection {
  private readonly hub: signalR.HubConnection;
  private code: string | null = null;
  private name = '';
  /** This tab's seat in the room (1–4), 0 before joining. */
  seat = 0;

  constructor(private readonly on: ConnectionEvents) {
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('/hub')
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.hub.on('RoomState', (room: RoomView) => this.on.room(room));
    this.hub.on('CastleState', (castle: CastleView) => this.on.castle(castle));
    this.hub.on('MatchEnded', (summary: SummaryView) => this.on.matchEnded(summary));
    this.hub.on('Notification', (text: string) => this.on.notification(text));
    this.hub.onreconnecting(() => this.on.status('reconnecting'));
    // A reconnect is a new connection on the server: rejoin the same seat with our token.
    this.hub.onreconnected(() => { if (this.code) void this.joinRoom(this.code, this.name); });
    this.hub.onclose(() => this.on.status('disconnected'));
  }

  async start(): Promise<void> {
    this.on.status('connecting');
    await this.hub.start();
    this.on.status('connected');
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
      this.code = result.code;
      this.name = name;
      this.seat = result.seat;
      saveIdentity(result.code!, result.token!);
      this.on.status('connected');
      if (result.room) this.on.room(result.room);
    }
    return result;
  }

  // Lobby
  setName = (name: string) => { this.name = name; return this.call('SetName', name); };
  setReady = (ready: boolean) => this.call('SetReady', ready);
  startMatch = () => this.call('StartMatch');
  backToLobby = () => this.call('BackToLobby');

  // Own castle
  moveWorkers = (from: Job, to: Job, count: number) => this.call('MoveWorkers', from, to, count);
  queueWeapon = (unitId: string, count: number) => this.call('QueueWeapon', unitId, count);
  cancelWeapon = (index: number) => this.call('CancelWeapon', index);
  armWorkers = (unitId: string, count: number, from: Job) => this.call('ArmWorkers', unitId, count, from);
  disarmSoldiers = (unitId: string, count: number) => this.call('DisarmSoldiers', unitId, count);
  upgradeBuilding = (building: BuildingType) => this.call('UpgradeBuilding', building);
  setGrowth = (enabled: boolean) => this.call('SetGrowth', enabled);
  sendScout = (targetSeat: number, from: Job) => this.call('SendScout', targetSeat, from);
  sendArmy = (targetSeat: number, units: Record<string, number>, rows: Record<string, Row>, archerPriority: string | null) =>
    this.call('SendArmy', targetSeat, units, rows, archerPriority);
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
