import type { Vec } from '../types';
import { TILE, type Point } from './layout';

// The scene's coordinates: our own region's top-left corner is (0, 0), so everything in layout.ts
// (castle, buildings, workers) keeps its local pixel position. The rest of the map is around it,
// at negative coordinates where it lies to the left of or above our corner.

let origin: Vec = { x: 0, y: 0 };

/** Our region's origin on the map, in tiles. Set once when the scene starts. */
export function setWorldOrigin(regionOrigin: Vec): void {
  origin = { x: regionOrigin.x, y: regionOrigin.y };
}

/** Map tiles → scene pixels. */
export function toWorld(v: Vec): Point {
  return { x: (v.x - origin.x) * TILE, y: (v.y - origin.y) * TILE };
}

/** Small deterministic random numbers, so every client draws the same forest. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from p to the segment a–b. */
export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
