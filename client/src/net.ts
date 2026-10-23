import * as signalR from '@microsoft/signalr';
import type { BuildingType, CastleView, CommandResult, Job } from './types';

const PLAYER_KEY = 'keepfall.playerId';

/** A stable id per browser so a page refresh rejoins the same game. Falls back to a fresh id if storage is blocked. */
function playerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Thin wrapper over the hub: the client only sends commands, the server decides. */
export class GameConnection {
  private readonly hub: signalR.HubConnection;
  private readonly id = playerId();

  constructor(
    private readonly onState: (state: CastleView) => void,
    private readonly onStatus: (status: ConnectionStatus) => void,
  ) {
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl('/hub')
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.hub.on('State', (state: CastleView) => this.onState(state));
    this.hub.onreconnecting(() => this.onStatus('reconnecting'));
    // A reconnect is a new connection on the server, so it has to join again.
    this.hub.onreconnected(() => void this.join());
    this.hub.onclose(() => this.onStatus('disconnected'));
  }

  async start(): Promise<void> {
    this.onStatus('connecting');
    await this.hub.start();
    await this.join();
  }

  private async join(): Promise<void> {
    const state = await this.hub.invoke<CastleView>('Join', this.id);
    this.onStatus('connected');
    this.onState(state);
  }

  moveWorkers = (from: Job, to: Job, count: number) => this.call('MoveWorkers', from, to, count);
  queueWeapon = (unitId: string, count: number) => this.call('QueueWeapon', unitId, count);
  cancelWeapon = (index: number) => this.call('CancelWeapon', index);
  armWorkers = (unitId: string, count: number, from: Job) => this.call('ArmWorkers', unitId, count, from);
  disarmSoldiers = (unitId: string, count: number) => this.call('DisarmSoldiers', unitId, count);
  upgradeBuilding = (building: BuildingType) => this.call('UpgradeBuilding', building);
  setGrowth = (enabled: boolean) => this.call('SetGrowth', enabled);
  setSpeed = (speed: number) => this.call('SetSpeed', speed);
  restart = () => this.call('Restart');

  private async call(method: string, ...args: unknown[]): Promise<CommandResult> {
    try {
      return await this.hub.invoke<CommandResult>(method, ...args);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
