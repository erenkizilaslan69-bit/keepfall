// Mirrors Keepfall.Server/Contracts/Views.cs (camelCase JSON, enums as camelCase strings).

export type Job = 'idle' | 'farmer' | 'lumberjack' | 'miner' | 'blacksmith';
export type BuildingType = 'farm' | 'lumberCamp' | 'mine' | 'forge';
export type MatchPhase = 'preparation' | 'war' | 'ended';

export interface Resources { food: number; wood: number; iron: number }
export interface Rates { foodIn: number; foodOut: number; wood: number; iron: number; forgeSpeed: number }
export interface JobView { job: Job; name: string; count: number; capacity: number | null }
export type Resource = 'food' | 'wood' | 'iron';
export interface CostView { wood: number; iron: number; seconds: number; multiplier: number }

export interface BuildingView {
  type: BuildingType;
  name: string;
  worker: Job;
  /** What the workers gather; null for the forge. */
  product: Resource | null;
  level: number;
  maxLevel: number;
  capacity: number;
  multiplier: number;
  upgradeRemaining: number | null;
  upgradeTotal: number;
  nextUpgrade: CostView | null;
  /** Extra per minute (forge: extra forge speed) the next level gives with today's workers. */
  upgradeGain: number | null;
}

export interface UnitView { id: string; name: string; wood: number; iron: number; buildSeconds: number; weapons: number; soldiers: number }
export interface OrderView { unitId: string; name: string; remaining: number; progress: number; buildSeconds: number }
export interface EconomySample { seconds: number; population: number; soldiers: number; food: number; wood: number; iron: number }

export interface SummaryView {
  durationSeconds: number;
  startPopulation: number;
  finalPopulation: number;
  peakPopulation: number;
  peopleBorn: number;
  workers: JobView[];
  units: UnitView[];
  weaponsMade: number;
  produced: Resources;
  final: Resources;
  starvingSeconds: number;
  idleWorkerSeconds: number;
  buildings: BuildingView[];
  samples: EconomySample[];
  war: WarStats;
}

export type PlayerColor = 'blue' | 'red' | 'yellow' | 'purple';
export type RoomPhase = 'lobby' | 'preparation' | 'war' | 'ended';

/** Public facts about a player; the server never sends anyone else's token or castle. */
export interface PlayerView { seat: number; name: string; color: PlayerColor; ready: boolean; connected: boolean; isHost: boolean; eliminated: boolean }

export interface RoomView {
  code: string;
  phase: RoomPhase;
  players: PlayerView[];
  minPlayers: number;
  maxPlayers: number;
  canStart: boolean;
  remainingSeconds: number | null;
  /** Only once the match is over; then everyone sees everyone's summary. */
  result: ResultView | null;
}

export interface RankView { seat: number; name: string; color: PlayerColor; place: number; population: number; eliminated: boolean }
export interface ResultView {
  winners: number[];
  byElimination: boolean;
  ranking: RankView[];
  summaries: { seat: number; name: string; color: PlayerColor; summary: SummaryView }[];
}

// War: our own armies, warnings about armies coming at us (who and when only), our battles.
export type Row = 'front' | 'back';
export interface ArmyView {
  id: number;
  targetSeat: number;
  targetName: string;
  targetColor: PlayerColor;
  state: 'marching' | 'returning';
  units: { unitId: string; name: string; count: number }[];
  distance: number;
  remainingSeconds: number;
}
export interface IncomingView { fromSeat: number; fromName: string; fromColor: PlayerColor; arrivesInSeconds: number }
export interface BattleLineView { unitId: string; name: string; count: number; lost: number }
export interface BattleReportView {
  id: number;
  at: number;
  attacking: boolean;
  opponentSeat: number;
  opponentName: string;
  opponentColor: PlayerColor;
  attackerUnits: BattleLineView[];
  defenderUnits: BattleLineView[];
  winner: 'attacker' | 'defender' | 'draw';
  youWon: boolean;
  castleDamage: number;
  castleHpAfter: number;
  castleHpMax: number;
  defenderEliminated: boolean;
}
export interface WarView {
  wallHp: number;
  maxWallHp: number;
  famine: boolean;
  famineStartsIn: number;
  soldiersAway: number;
  armies: ArmyView[];
  incoming: IncomingView[];
  battles: BattleReportView[];
  defense: { rows: Record<string, Row>; archerPriority: string | null };
}
export interface WarStats {
  attacksLaunched: number;
  soldiersLost: number;
  enemiesKilled: number;
  castleDamageDealt: number;
  castleDamageTaken: number;
  wallHp: number;
  maxWallHp: number;
  eliminated: boolean;
}

export interface JoinView { ok: boolean; error: string | null; code: string | null; token: string | null; seat: number; room: RoomView | null }

// Scouting: a report is all we ever learn about another castle.
/** scoutSeconds / marchSeconds: one way along the roads to that castle. */
export interface ScoutTargetView { seat: number; name: string; color: PlayerColor; busy: boolean; scoutSeconds: number; marchSeconds: number }
export interface ScoutMissionView { targetSeat: number; progress: number; arrived: boolean; remainingSeconds: number }
export interface ScoutReportView {
  targetSeat: number;
  targetName: string;
  targetColor: PlayerColor;
  observedAt: number;
  deliveredAt: number;
  soldiers: { unitId: string; name: string; count: number }[];
  buildings: { type: BuildingType; name: string; level: number }[];
}
export interface ScoutingView {
  scoutsAway: number;
  targets: ScoutTargetView[];
  missions: ScoutMissionView[];
  reports: ScoutReportView[];
}

export interface CastleView {
  phase: MatchPhase;
  color: PlayerColor;
  elapsedSeconds: number;
  remainingSeconds: number;
  prepSeconds: number;
  speed: number;
  speedControl: boolean;
  resources: Resources;
  rates: Rates;
  population: number;
  soldiers: number;
  nextPersonCost: number;
  /** Food automatic growth keeps untouched (a minute of consumption by default). */
  foodReserve: number;
  growthEnabled: boolean;
  starving: boolean;
  jobs: JobView[];
  buildings: BuildingView[];
  units: UnitView[];
  queue: OrderView[];
  scouting: ScoutingView;
  war: WarView;
  /** Our castle has fallen: we only watch. */
  eliminated: boolean;
  summary: SummaryView | null;
}

export interface CommandResult { ok: boolean; error: string | null }

// The shared map (Contracts/MapViews.cs). Coordinates are in tiles; the scene draws a tile as 64 px.
export interface Vec { x: number; y: number }
export type Corner = 'northWest' | 'northEast' | 'southWest' | 'southEast';
export interface RegionView { corner: Corner; origin: Vec; width: number; height: number; gate: Vec; seat: number | null; color: PlayerColor | null; name: string | null }
export interface RoadView { id: number; points: Vec[] }
export interface FeatureView { id: string; kind: 'forest'; center: Vec; radius: number }
/** Public and the same for everyone: terrain, roads and whose castle is in which corner. */
export interface MapLayoutView { size: number; regions: RegionView[]; roads: RoadView[]; features: FeatureView[] }

export type MoverKind = 'army' | 'scout';
export interface MoverUnit { unitId: string; name: string; count: number }
export interface VisionView { center: Vec; radius: number }
/** One of our own armies or scouts, with its road. */
export interface OwnMoverView {
  id: string; kind: MoverKind; targetSeat: number; returning: boolean;
  position: Vec; velocity: Vec; units: MoverUnit[]; route: Vec[]; travelled: number; speed: number; visionRadius: number;
  /** In a battle: it stands still and nobody else sees it walking. */
  fighting: boolean;
}
/** Someone else's army or scout inside our vision: never its target, road or arrival time. */
export interface SeenMoverView { id: string; kind: MoverKind; ownerSeat: number; ownerColor: PlayerColor; position: Vec; velocity: Vec; units: MoverUnit[] }
/** What we see right now (fog of war applied by the server). */
export interface MapStateView { elapsedSeconds: number; vision: VisionView[]; own: OwnMoverView[]; seen: SeenMoverView[] }
