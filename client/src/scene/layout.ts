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
  /** Where the sign's middle stands (the column of houses it belongs to). */
  signX: number;
  /** Clickable rectangle (and where the progress bar goes). */
  area: { w: number; h: number };
  /** One spot per worker slot (max level capacity). */
  workSpots: Point[];
  /** Workers face this way while working (true = left). */
  faceLeft: (spot: Point) => boolean;
  parts: (level: number) => Part[];
}


// Every building stands at least a tile (64 px) from the wall on every side (the wall's inner face is at x 52..972, y 58..712; the side with the gate stands
// 40 px further in), and the four sites share the yard without overlapping: farm and woodcutter in a column each beside the castle (houses 0.8 size, one more
// per level), mine and forge in the strip below the castle's road (the road to the gate runs at y 480-530), clear of the soldiers' camp fire and the idle pen.
const HOUSE = 0.8;

export const SITES: Record<BuildingType, Site> = {
  // Sheep pasture: the pack has no crops, food is meat. One more farmhouse and more sheep per level; the pasture is the strip between the houses and the castle.
  farm: {
    center: { x: 240, y: 330 }, signX: 205,
    area: { w: 200, h: 380 },
    workSpots: [
      { x: 266, y: 250 }, { x: 292, y: 292 }, { x: 266, y: 336 }, { x: 294, y: 380 },
      { x: 266, y: 420 }, { x: 294, y: 452 }, { x: 292, y: 236 }, { x: 250, y: 462 },
      { x: 270, y: 280 }, { x: 292, y: 410 },
    ],
    faceLeft: () => true,
    parts: (level) => [
      { key: 'house1', x: 205, y: 212, scale: HOUSE },
      ...(level >= 2 ? [{ key: 'house2', x: 205, y: 300, scale: HOUSE }] : []),
      ...(level >= 3 ? [{ key: 'house3', x: 205, y: 388, scale: HOUSE }] : []),
      ...[{ x: 270, y: 256 }, { x: 294, y: 330 }, { x: 264, y: 386 }, { x: 296, y: 446 }, { x: 276, y: 296 }, { x: 292, y: 230 }, { x: 262, y: 440 }, { x: 298, y: 372 }]
        .slice(0, level * 2)
        .map((p, i) => ({ key: i % 2 ? 'sheep-idle' : 'sheep-grass', x: p.x, y: p.y, scale: 0.85, anim: true, flip: i % 3 === 0 })),
      ...(level >= 2 ? [{ key: 'bush1', x: 250, y: 214, scale: 0.7, anim: true }] : []),
      ...(level >= 3 ? [{ key: 'bush2', x: 244, y: 470, scale: 0.65, anim: true }] : []),
      // level 4: a second barn and a lookout tower over the pasture
      ...(level >= 4 ? [{ key: 'house1', x: 205, y: 470, scale: HOUSE }, { key: 'tower', x: 288, y: 210, scale: 0.55 }] : []),
    ],
  },
  // Forest with a woodcutter's hut; more trees, wood piles and a second hut as it grows. The trees stand in the strip between the huts and the castle.
  lumberCamp: {
    center: { x: 790, y: 330 }, signX: 819,
    area: { w: 200, h: 380 },
    workSpots: [
      { x: 768, y: 196 }, { x: 768, y: 236 }, { x: 768, y: 276 }, { x: 768, y: 316 },
      { x: 768, y: 356 }, { x: 768, y: 396 }, { x: 768, y: 436 }, { x: 768, y: 466 },
      { x: 750, y: 216 }, { x: 750, y: 300 },
    ],
    faceLeft: () => false,
    parts: (level) => {
      const trees = [
        { x: 742, y: 214 }, { x: 760, y: 252 }, { x: 740, y: 292 }, { x: 758, y: 332 }, { x: 740, y: 372 },
        { x: 758, y: 412 }, { x: 740, y: 450 }, { x: 760, y: 470 }, { x: 742, y: 192 }, { x: 760, y: 232 }, { x: 742, y: 314 },
      ].slice(0, 3 + level * 2);
      return [
        { key: 'house2', x: 819, y: 212, scale: HOUSE },
        ...trees.map((p, i) => ({ key: `tree${(i % 2) + 1}`, x: p.x, y: p.y, scale: 0.55, anim: true })),
        ...(level >= 2 ? [
          { key: 'wood-pile', x: 790, y: 252, scale: 0.8 },
          { key: 'wood-pile', x: 808, y: 262, scale: 0.8 },
          { key: 'stump1', x: 812, y: 280, scale: 0.5 },
        ] : []),
        ...(level >= 3 ? [{ key: 'house1', x: 819, y: 300, scale: HOUSE }, { key: 'stump2', x: 800, y: 340, scale: 0.5 }] : []),
        // level 4: a sawmill hut with stacked timber
        ...(level >= 4 ? [
          { key: 'house3', x: 819, y: 388, scale: HOUSE },
          { key: 'wood-pile', x: 796, y: 420, scale: 0.8 },
          { key: 'wood-pile', x: 816, y: 432, scale: 0.8 },
          { key: 'wood-pile', x: 796, y: 450, scale: 0.8 },
        ] : []),
      ];
    },
  },
  // Ore rocks (Gold Stone tinted grey); bigger rocks, a miners' hut and a tower as it grows.
  mine: {
    center: { x: 250, y: 600 }, signX: 250,
    area: { w: 250, h: 130 },
    workSpots: [
      { x: 246, y: 574 }, { x: 304, y: 580 }, { x: 350, y: 612 }, { x: 214, y: 628 },
      { x: 268, y: 664 }, { x: 330, y: 656 }, { x: 236, y: 600 }, { x: 288, y: 612 },
      { x: 200, y: 672 }, { x: 352, y: 576 },
    ],
    faceLeft: (p) => p.x > 260,
    parts: (level) => {
      const sizes = [[3, 4, 2], [4, 5, 3, 4], [6, 5, 6, 4, 5], [6, 6, 6, 5, 6]][level - 1];
      const spots = [{ x: 262, y: 598 }, { x: 310, y: 610 }, { x: 232, y: 630 }, { x: 282, y: 642 }, { x: 328, y: 638 }];
      return [
        // Gold Stone in greyscale reads as iron ore.
        ...sizes.map((size, i) => ({ key: `stone${size}`, x: spots[i].x, y: spots[i].y, scale: 0.8, grey: true })),
        ...(level >= 2 ? [{ key: 'house3', x: 205, y: 640, scale: HOUSE }] : []),
        ...(level >= 3 ? [{ key: 'tower', x: 320, y: 566, scale: 0.55 }] : []),
        // level 4: a second tower
        ...(level >= 4 ? [{ key: 'tower', x: 250, y: 566, scale: 0.55 }] : []),
      ];
    },
  },
  // Forge: a workshop, then the barracks (crossed swords), then barracks + archery range.
  forge: {
    center: { x: 806, y: 590 }, signX: 806,
    area: { w: 170, h: 150 },
    workSpots: [
      { x: 770, y: 668 }, { x: 842, y: 668 }, { x: 740, y: 640 }, { x: 874, y: 640 },
      { x: 806, y: 676 }, { x: 724, y: 668 }, { x: 788, y: 664 }, { x: 860, y: 664 },
      { x: 700, y: 690 }, { x: 880, y: 676 },
    ],
    faceLeft: (p) => p.x > 806,
    parts: (level) => [
      ...(level === 1 ? [{ key: 'house3', x: 806, y: 646, scale: HOUSE }] : []),
      ...(level >= 2 ? [{ key: 'barracks', x: 806, y: 648, scale: 0.7 }] : []),
      ...(level >= 3 ? [{ key: 'archery', x: 826, y: 556, scale: 0.6 }] : []),
      // level 4: the full complex, with a watchtower
      ...(level >= 4 ? [{ key: 'tower', x: 750, y: 556, scale: 0.55 }] : []),
    ],
  },
};

/** Where a building's sign goes: just in front of (below) its lowest house at this level, so it never covers the building. */
export function signSpot(type: BuildingType, level: number): Point {
  const all = SITES[type].parts(Math.max(1, level));
  const houses = all.filter((p) => /^(house|tower|barracks|archery)/.test(p.key));
  const base = Math.max(...(houses.length ? houses : all).map((p) => p.y));
  return { x: SITES[type].signX, y: base + 8 };
}

/** Per job: which building, which pawn sheets, and what (if anything) is carried home. */
export interface JobLook { building?: BuildingType; idle: string; run: string; work?: string; carry?: string }

export const JOB_LOOK: Record<Job, JobLook> = {
  idle: { idle: 'pawn-idle', run: 'pawn-run' },
  farmer: { building: 'farm', idle: 'pawn-idle-knife', run: 'pawn-run-knife', work: 'pawn-work-knife', carry: 'pawn-run-meat' },
  lumberjack: { building: 'lumberCamp', idle: 'pawn-idle-axe', run: 'pawn-run-axe', work: 'pawn-work-axe', carry: 'pawn-run-wood' },
  miner: { building: 'mine', idle: 'pawn-idle-pickaxe', run: 'pawn-run-pickaxe', work: 'pawn-work-pickaxe', carry: 'pawn-run-ore' },
  blacksmith: { building: 'forge', idle: 'pawn-idle-hammer', run: 'pawn-run-hammer', work: 'pawn-work-hammer' },
};
