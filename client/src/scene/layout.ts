import type { BuildingType, Job } from '../types';

// World layout in pixels. The island is 16×12 tiles of 64 px; the castle sits in the middle and each
// building has its own corner, so walking paths never cross the castle.

import { MAP_SCALE } from './mapscale';

/** Pixels of art in one tile (the pack's tiles); the map's own tile is TILE px, MAP_SCALE times as many (see mapscale.ts). */
export const TILE_ART = 64;
export const TILE = TILE_ART * MAP_SCALE;
export const WORLD_WIDTH = 16 * TILE;
export const WORLD_HEIGHT = 12 * TILE;
/** Region-local pixel positions below are designed for scale 1; this is how they are turned into the map's pixels. */
const S = MAP_SCALE;

export const CASTLE = { x: 512 * S, y: 430 * S, scale: 1.25 };
/** The wooden courtyard on top of the castle sprite, in world pixels: soldiers stand here. */
export const COURTYARD = { left: 356 * S, right: 668 * S, top: 216 * S, bottom: 268 * S };
/** The camp fire in front of the castle, below the gate: the soldiers wait around it, a group for each type. */
export const CAMP = { x: 640 * S, y: 656 * S, rx: 98 * S, ry: 36 * S };
/** Idle people wait in their own pen (a patch of dirt with a low fence), off the road and the paving; carriers drop their load at the gate. */
export const GATE = { x: 512 * S, y: 452 * S };
export const IDLE_AREA = { left: 360 * S, right: 484 * S, top: 604 * S, bottom: 676 * S };

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

const NEW_SITES: Record<BuildingType, Site> = {
  // Sheep pasture: the pack has no crops, food is meat. One more farmhouse and more sheep per level; the pasture is the strip between the houses and the castle.
  farm: {
    center: { x: 198, y: 310 }, signX: 205,
    area: { w: 285, h: 420 },
    workSpots: [
      { x: 266, y: 250 }, { x: 292, y: 292 }, { x: 266, y: 336 }, { x: 294, y: 380 },
      { x: 266, y: 420 }, { x: 294, y: 452 }, { x: 292, y: 236 }, { x: 250, y: 462 },
      { x: 270, y: 280 }, { x: 292, y: 410 },
    ],
    faceLeft: () => true,
    parts: (level) => [
      { key: 'house1', x: 205, y: 222, scale: HOUSE },
      ...(level >= 2 ? [{ key: 'house2', x: 205, y: 332, scale: HOUSE }] : []),
      ...(level >= 3 ? [{ key: 'house3', x: 205, y: 442, scale: HOUSE }] : []),
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
    center: { x: 835, y: 305 }, signX: 819,
    area: { w: 290, h: 430 },
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
        { key: 'house2', x: 819, y: 222, scale: HOUSE },
        ...trees.map((p, i) => ({ key: `tree${(i % 2) + 1}`, x: p.x, y: p.y, scale: 0.55, anim: true })),
        ...(level >= 2 ? [
          { key: 'wood-pile', x: 790, y: 252, scale: 0.8 },
          { key: 'wood-pile', x: 808, y: 262, scale: 0.8 },
          { key: 'stump1', x: 812, y: 280, scale: 0.5 },
        ] : []),
        ...(level >= 3 ? [{ key: 'house1', x: 819, y: 336, scale: HOUSE }, { key: 'stump2', x: 800, y: 340, scale: 0.5 }] : []),
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
    center: { x: 220, y: 590 }, signX: 250,
    area: { w: 310, h: 250 },
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
    center: { x: 830, y: 590 }, signX: 806,
    area: { w: 270, h: 250 },
    workSpots: [
      { x: 770, y: 668 }, { x: 842, y: 668 }, { x: 740, y: 640 }, { x: 874, y: 640 },
      { x: 806, y: 676 }, { x: 724, y: 668 }, { x: 788, y: 664 }, { x: 860, y: 664 },
      { x: 700, y: 690 }, { x: 880, y: 676 },
    ],
    faceLeft: (p) => p.x > 806,
    parts: (level) => [
      ...(level === 1 ? [{ key: 'house3', x: 806, y: 646, scale: HOUSE }] : []),
      ...(level >= 2 ? [{ key: 'barracks', x: 806, y: 648, scale: 0.7 }] : []),
      ...(level >= 3 ? [{ key: 'archery', x: 826, y: 534, scale: 0.6 }] : []),
      // level 4: the full complex, with a watchtower
      ...(level >= 4 ? [{ key: 'tower', x: 750, y: 556, scale: 0.55 }] : []),
    ],
  },
};

const LEGACY_SITES: Record<BuildingType, Site> = {
  // Sheep pasture: the pack has no crops, food is meat. One more farmhouse and more sheep per level.
  farm: {
    center: { x: 190, y: 250 }, signX: 190,
    area: { w: 270, h: 300 },
    workSpots: [
      { x: 168, y: 268 }, { x: 232, y: 298 }, { x: 282, y: 258 }, { x: 206, y: 338 },
      { x: 146, y: 314 }, { x: 286, y: 322 }, { x: 250, y: 226 }, { x: 186, y: 226 },
      { x: 150, y: 268 }, { x: 306, y: 290 },
    ],
    faceLeft: (p) => p.x > 220,
    parts: (level) => [
      { key: 'house1', x: 165, y: 225, scale: 1 },
      ...(level >= 2 ? [{ key: 'house2', x: 300, y: 232, scale: 1 }] : []),
      ...(level >= 3 ? [{ key: 'house3', x: 172, y: 364, scale: 1 }] : []),
      ...[{ x: 196, y: 254 }, { x: 262, y: 284 }, { x: 226, y: 322 }, { x: 290, y: 236 }, { x: 262, y: 356 }, { x: 170, y: 296 }, { x: 140, y: 340 }, { x: 310, y: 300 }]
        .slice(0, level * 2)
        .map((p, i) => ({ key: i % 2 ? 'sheep-idle' : 'sheep-grass', x: p.x, y: p.y, scale: 0.85, anim: true, flip: i % 3 === 0 })),
      ...(level >= 2 ? [{ key: 'bush1', x: 300, y: 130, scale: 0.8, anim: true }] : []),
      ...(level >= 3 ? [{ key: 'bush2', x: 160, y: 390, scale: 0.75, anim: true }] : []),
      // level 4: a second barn and a lookout tower over the pasture
      ...(level >= 4 ? [{ key: 'house1', x: 230, y: 400, scale: 1 }, { key: 'tower', x: 372, y: 256, scale: 0.7 }] : []),
    ],
  },
  // Forest with a woodcutter's hut; more trees, wood piles and a second hut as it grows.
  lumberCamp: {
    center: { x: 840, y: 240 }, signX: 840,
    area: { w: 280, h: 300 },
    workSpots: [
      // Just left of and in front of a trunk, so the pawn draws over its tree.
      { x: 840, y: 188 }, { x: 900, y: 238 }, { x: 830, y: 288 }, { x: 896, y: 332 },
      { x: 864, y: 144 }, { x: 865, y: 381 }, { x: 884, y: 384 }, { x: 820, y: 128 },
      { x: 910, y: 270 }, { x: 920, y: 205 },
    ],
    faceLeft: () => false,
    parts: (level) => {
      const trees = [
        { x: 860, y: 176 }, { x: 888, y: 226 }, { x: 850, y: 276 }, { x: 886, y: 320 }, { x: 890, y: 132 },
        { x: 880, y: 368 }, { x: 890, y: 330 }, { x: 830, y: 120 }, { x: 890, y: 180 }, { x: 896, y: 262 }, { x: 880, y: 372 },
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
    center: { x: 200, y: 590 }, signX: 200,
    area: { w: 270, h: 250 },
    workSpots: [
      { x: 156, y: 576 }, { x: 226, y: 604 }, { x: 296, y: 612 }, { x: 196, y: 664 },
      { x: 266, y: 672 }, { x: 150, y: 640 }, { x: 320, y: 588 }, { x: 240, y: 548 },
      { x: 150, y: 600 }, { x: 330, y: 650 },
    ],
    faceLeft: (p) => p.x > 190,
    parts: (level) => {
      const sizes = [[3, 4, 2], [4, 5, 3, 4], [6, 5, 6, 4, 5], [6, 6, 6, 5, 6]][level - 1];
      const spots = [{ x: 192, y: 562 }, { x: 262, y: 590 }, { x: 158, y: 620 }, { x: 236, y: 650 }, { x: 306, y: 640 }];
      return [
        // Gold Stone in greyscale reads as iron ore.
        ...sizes.map((size, i) => ({ key: `stone${size}`, x: spots[i].x, y: spots[i].y, scale: 1, grey: true })),
        { key: 'rock1', x: 320, y: 694, scale: 0.8 },
        ...(level >= 2 ? [{ key: 'house3', x: 172, y: 694, scale: 1 }] : []),
        ...(level >= 3 ? [{ key: 'tower', x: 300, y: 530, scale: 0.75 }] : []),
        // level 4: a second tower and a foreman's house
        ...(level >= 4 ? [{ key: 'tower', x: 150, y: 548, scale: 0.75 }, { key: 'house1', x: 190, y: 706, scale: 1 }] : []),
      ];
    },
  },
  // Forge: a workshop, then the barracks (crossed swords), then barracks + archery range.
  forge: {
    center: { x: 830, y: 590 }, signX: 830,
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
      ...(level >= 4 ? [{ key: 'tower', x: 884, y: 560, scale: 0.8 }, { key: 'house1', x: 700, y: 560, scale: 1 }] : []),
      { key: 'rock2', x: 890, y: 690, scale: 0.8 },
    ],
  },
};

/**
 * Level 4 keeps the layout it always had (the full, crowded yard); levels 1-3 use the roomier one. Where an old position would sink into the wall
 * (a base below y 648, a hut left or right of the safe band) only that piece is moved, as little as it takes.
 */
const MAX_BASE = 648, MIN_X = 175, MAX_X = 850;
const BUILDING = /^(house|tower|barracks|archery)/;
function fitLegacy(parts: Part[]): Part[] {
  return parts.map((p) => ({ ...p, y: Math.min(p.y, MAX_BASE), x: BUILDING.test(p.key) ? Math.min(MAX_X, Math.max(MIN_X, p.x)) : p.x }));
}

const TYPES: BuildingType[] = ['farm', 'lumberCamp', 'mine', 'forge'];
const at = (q: Point): Point => ({ x: q.x * S, y: q.y * S });
const scaleParts = (parts: Part[]): Part[] => (S === 1 ? parts : parts.map((p) => ({ ...p, x: p.x * S, y: p.y * S }))); // places move apart, the sprites keep their size
export const SITES = Object.fromEntries(TYPES.map((t) => [t, {
  ...NEW_SITES[t],
  center: at(NEW_SITES[t].center),
  signX: NEW_SITES[t].signX * S,
  area: { w: NEW_SITES[t].area.w * S, h: NEW_SITES[t].area.h * S },
  workSpots: NEW_SITES[t].workSpots.map(at),
  parts: (level: number) => scaleParts(level >= 4 ? fitLegacy(LEGACY_SITES[t].parts(4)) : NEW_SITES[t].parts(level)),
}])) as Record<BuildingType, Site>;

/** Where the workers of a building stand at its level (level 4: where they always stood, kept off the wall strip). */
export function workSpotsOf(type: BuildingType, level: number): Point[] {
  return level >= 4 ? LEGACY_SITES[type].workSpots.map((q) => at({ x: q.x, y: Math.min(q.y, 676) })) : SITES[type].workSpots;
}

/** Where a building's sign goes: just in front of (below) its lowest house at this level, so it never covers the building. */
export function signSpot(type: BuildingType, level: number): Point {
  const all = SITES[type].parts(Math.max(1, level));
  const houses = all.filter((p) => /^(house|tower|barracks|archery)/.test(p.key));
  const base = Math.max(...(houses.length ? houses : all).map((p) => p.y));
  return { x: level >= 4 ? LEGACY_SITES[type].signX * S : SITES[type].signX, y: base + 8 };
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
