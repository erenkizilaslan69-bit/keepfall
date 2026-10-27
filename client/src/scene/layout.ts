import type { BuildingType, Job } from '../types';

// World layout in pixels. The island is 16×12 tiles of 64 px; the castle sits in the middle and each
// building has its own corner, so walking paths never cross the castle.

export const TILE = 64;
export const WORLD_WIDTH = 16 * TILE;
export const WORLD_HEIGHT = 12 * TILE;

export const CASTLE = { x: 512, y: 430, scale: 1.25 };
/** The wooden courtyard on top of the castle sprite, in world pixels: soldiers stand here. */
export const COURTYARD = { left: 356, right: 668, top: 216, bottom: 268 };
/** The camp fire in front of the castle, below the gate: the soldiers wait around it, a group for each type. */
export const CAMP = { x: 640, y: 656, rx: 98, ry: 36 };
/** Idle people wait in their own pen (a patch of dirt with a low fence), off the road and the paving; carriers drop their load at the gate. */
export const GATE = { x: 512, y: 452 };
export const IDLE_AREA = { left: 360, right: 484, top: 604, bottom: 676 };

export interface Point { x: number; y: number }

/** A sprite that is part of a building at some level. Depth follows y. */
export interface Part { key: string; x: number; y: number; scale?: number; anim?: boolean; grey?: boolean; flip?: boolean }

export interface Site {
  /** Centre of the clickable area and the label. */
  center: Point;
  /** Clickable rectangle (and where the progress bar goes). */
  area: { w: number; h: number };
  /** One spot per worker slot (max level capacity). */
  workSpots: Point[];
  /** Workers face this way while working (true = left). */
  faceLeft: (spot: Point) => boolean;
  parts: (level: number) => Part[];
}


export const SITES: Record<BuildingType, Site> = {
  // Sheep pasture: the pack has no crops, food is meat. One more farmhouse and more sheep per level.
  farm: {
    center: { x: 190, y: 250 },
    area: { w: 270, h: 300 },
    workSpots: [
      { x: 168, y: 268 }, { x: 232, y: 298 }, { x: 282, y: 258 }, { x: 206, y: 338 },
      { x: 146, y: 314 }, { x: 286, y: 322 }, { x: 250, y: 226 }, { x: 186, y: 226 },
      { x: 120, y: 268 }, { x: 306, y: 290 },
    ],
    faceLeft: (p) => p.x > 220,
    parts: (level) => [
      { key: 'house1', x: 100, y: 205, scale: 1 },
      ...(level >= 2 ? [{ key: 'house2', x: 225, y: 175, scale: 1 }] : []),
      ...(level >= 3 ? [{ key: 'house3', x: 92, y: 360, scale: 1 }] : []),
      ...[{ x: 196, y: 254 }, { x: 262, y: 284 }, { x: 226, y: 322 }, { x: 290, y: 236 }, { x: 262, y: 356 }, { x: 170, y: 296 }, { x: 140, y: 340 }, { x: 310, y: 300 }]
        .slice(0, level * 2)
        .map((p, i) => ({ key: i % 2 ? 'sheep-idle' : 'sheep-grass', x: p.x, y: p.y, scale: 0.85, anim: true, flip: i % 3 === 0 })),
      ...(level >= 2 ? [{ key: 'bush1', x: 300, y: 130, scale: 0.8, anim: true }] : []),
      ...(level >= 3 ? [{ key: 'bush2', x: 160, y: 390, scale: 0.75, anim: true }] : []),
      // level 4: a second barn and a lookout tower over the pasture
      ...(level >= 4 ? [{ key: 'house1', x: 230, y: 400, scale: 1 }, { key: 'tower', x: 330, y: 160, scale: 0.7 }] : []),
    ],
  },
  // Forest with a woodcutter's hut; more trees, wood piles and a second hut as it grows.
  lumberCamp: {
    center: { x: 840, y: 240 },
    area: { w: 280, h: 300 },
    workSpots: [
      // Just left of and in front of a trunk, so the pawn draws over its tree.
      { x: 840, y: 188 }, { x: 900, y: 238 }, { x: 830, y: 288 }, { x: 896, y: 332 },
      { x: 904, y: 144 }, { x: 865, y: 381 }, { x: 922, y: 384 }, { x: 820, y: 128 },
      { x: 950, y: 270 }, { x: 960, y: 205 },
    ],
    faceLeft: () => false,
    parts: (level) => {
      const trees = [
        { x: 880, y: 172 }, { x: 940, y: 222 }, { x: 870, y: 272 }, { x: 936, y: 316 }, { x: 944, y: 128 },
        { x: 905, y: 365 }, { x: 960, y: 365 }, { x: 860, y: 112 }, { x: 960, y: 170 }, { x: 990, y: 260 }, { x: 985, y: 330 },
      ].slice(0, 3 + level * 2);
      return [
        { key: 'house2', x: 762, y: 214, scale: 1 },
        ...trees.map((p, i) => ({ key: `tree${(i % 2) + 1}`, x: p.x, y: p.y, scale: 0.8, anim: true })),
        ...(level >= 2 ? [
          { key: 'wood-pile', x: 790, y: 252, scale: 1 },
          { key: 'wood-pile', x: 812, y: 262, scale: 1 },
          { key: 'stump1', x: 828, y: 230, scale: 0.6 },
        ] : []),
        ...(level >= 3 ? [{ key: 'house1', x: 772, y: 380, scale: 1 }, { key: 'stump2', x: 820, y: 330, scale: 0.6 }] : []),
        // level 4: a sawmill hut with stacked timber
        ...(level >= 4 ? [
          { key: 'house3', x: 748, y: 318, scale: 1 },
          { key: 'wood-pile', x: 790, y: 300, scale: 1 },
          { key: 'wood-pile', x: 812, y: 312, scale: 1 },
          { key: 'wood-pile', x: 770, y: 266, scale: 1 },
        ] : []),
      ];
    },
  },
  // Ore rocks (Gold Stone tinted grey); bigger rocks, a miners' hut and a tower as it grows.
  mine: {
    center: { x: 200, y: 590 },
    area: { w: 270, h: 250 },
    workSpots: [
      { x: 156, y: 576 }, { x: 226, y: 604 }, { x: 296, y: 612 }, { x: 196, y: 664 },
      { x: 266, y: 672 }, { x: 150, y: 640 }, { x: 320, y: 588 }, { x: 240, y: 548 },
      { x: 120, y: 600 }, { x: 330, y: 650 },
    ],
    faceLeft: (p) => p.x > 190,
    parts: (level) => {
      const sizes = [[3, 4, 2], [4, 5, 3, 4], [6, 5, 6, 4, 5], [6, 6, 6, 5, 6]][level - 1];
      const spots = [{ x: 192, y: 562 }, { x: 262, y: 590 }, { x: 158, y: 620 }, { x: 236, y: 650 }, { x: 306, y: 640 }];
      return [
        // Gold Stone in greyscale reads as iron ore.
        ...sizes.map((size, i) => ({ key: `stone${size}`, x: spots[i].x, y: spots[i].y, scale: 1, grey: true })),
        { key: 'rock1', x: 320, y: 694, scale: 0.8 },
        ...(level >= 2 ? [{ key: 'house3', x: 84, y: 696, scale: 1 }] : []),
        ...(level >= 3 ? [{ key: 'tower', x: 300, y: 530, scale: 0.75 }] : []),
        // level 4: a second tower and a foreman's house
        ...(level >= 4 ? [{ key: 'tower', x: 110, y: 540, scale: 0.75 }, { key: 'house1', x: 170, y: 712, scale: 1 }] : []),
      ];
    },
  },
  // Forge: a workshop, then the barracks (crossed swords), then barracks + archery range.
  forge: {
    center: { x: 830, y: 590 },
    area: { w: 270, h: 250 },
    workSpots: [
      { x: 784, y: 628 }, { x: 870, y: 628 }, { x: 742, y: 600 }, { x: 912, y: 600 },
      { x: 808, y: 664 }, { x: 860, y: 668 }, { x: 760, y: 650 }, { x: 920, y: 650 },
      { x: 700, y: 620 }, { x: 950, y: 630 },
    ],
    faceLeft: (p) => p.x > 830,
    parts: (level) => [
      ...(level === 1 ? [{ key: 'house3', x: 830, y: 590, scale: 1 }] : []),
      ...(level >= 2 ? [{ key: 'barracks', x: 830, y: 594, scale: 1 }] : []),
      ...(level >= 3 ? [{ key: 'archery', x: 716, y: 700, scale: 0.85 }] : []),
      // level 4: the full complex, with a watchtower and a second hall
      ...(level >= 4 ? [{ key: 'tower', x: 960, y: 560, scale: 0.8 }, { key: 'house1', x: 700, y: 560, scale: 1 }] : []),
      { key: 'rock2', x: 930, y: 690, scale: 0.8 },
    ],
  },
};

/** Per job: which building, which pawn sheets, and what (if anything) is carried home. */
export interface JobLook { building?: BuildingType; idle: string; run: string; work?: string; carry?: string }

export const JOB_LOOK: Record<Job, JobLook> = {
  idle: { idle: 'pawn-idle', run: 'pawn-run' },
  farmer: { building: 'farm', idle: 'pawn-idle-knife', run: 'pawn-run-knife', work: 'pawn-work-knife', carry: 'pawn-run-meat' },
  lumberjack: { building: 'lumberCamp', idle: 'pawn-idle-axe', run: 'pawn-run-axe', work: 'pawn-work-axe', carry: 'pawn-run-wood' },
  miner: { building: 'mine', idle: 'pawn-idle-pickaxe', run: 'pawn-run-pickaxe', work: 'pawn-work-pickaxe', carry: 'pawn-run-gold' },
  blacksmith: { building: 'forge', idle: 'pawn-idle-hammer', run: 'pawn-run-hammer', work: 'pawn-work-hammer' },
};
