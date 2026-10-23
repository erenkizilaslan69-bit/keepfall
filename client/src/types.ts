// Mirrors Keepfall.Server/Contracts/Views.cs (camelCase JSON, enums as camelCase strings).

export type Job = 'idle' | 'farmer' | 'lumberjack' | 'miner' | 'blacksmith';
export type BuildingType = 'farm' | 'lumberCamp' | 'mine' | 'forge';
export type MatchPhase = 'preparation' | 'ended';

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
}

export interface CastleView {
  phase: MatchPhase;
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
  summary: SummaryView | null;
}

export interface CommandResult { ok: boolean; error: string | null }
