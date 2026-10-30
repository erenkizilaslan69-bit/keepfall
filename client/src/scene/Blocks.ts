import type { Point } from './layout';

// The ground a building stands on is not walkable: nobody (a worker, a sheep put down by the layout) may stand in it or cross it. The rectangles are
// the buildings' feet, in a castle's own coordinates (before its corner's offset). Cosmetic only: the server knows nothing of them.

export interface Foot { l: number; t: number; r: number; b: number }

const inside = (p: Point, r: Foot) => p.x > r.l && p.x < r.r && p.y > r.t && p.y < r.b;
const grow = (r: Foot, m: number): Foot => ({ l: r.l - m, t: r.t - m, r: r.r + m, b: r.b + m });

/** Does the segment a→b cross the rectangle (Liang–Barsky)? */
function crosses(a: Point, b: Point, r: Foot): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.l], [dx, r.r - a.x], [-dy, a.y - r.t], [dy, r.b - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}

/** A point inside a footprint is moved to the nearest way out (the front, below it, is preferred a little: the people stand in front of a house). */
export function resolveOut(p: Point, rects: Foot[], margin = 10): Point {
  let q = p;
  for (const rect of rects) {
    const r = grow(rect, margin);
    if (!inside(q, r)) continue;
    const options: [number, Point][] = [
      [q.x - r.l, { x: r.l, y: q.y }], [r.r - q.x, { x: r.r, y: q.y }], [q.y - r.t, { x: q.x, y: r.t }], [(r.b - q.y) * 0.7, { x: q.x, y: r.b }],
    ];
    options.sort((a, b) => a[0] - b[0]);
    q = options[0][1];
  }
  return q;
}

/** The corners to go through so that a walk from a to b does not cross a footprint (empty if the straight line is free). */
export function routeAround(a: Point, b: Point, rects: Foot[], margin = 12): Point[] {
  const grown = rects.map((r) => grow(r, margin));
  const hit = grown.find((r) => crosses(a, b, r));
  if (!hit) return [];
  const corners: Point[] = [{ x: hit.l, y: hit.t }, { x: hit.r, y: hit.t }, { x: hit.r, y: hit.b }, { x: hit.l, y: hit.b }];
  const free = (p: Point, q: Point) => !grown.some((r) => crosses(p, q, r));
  const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  let best: Point[] | null = null, bestLen = Infinity;
  for (const c of corners) if (free(a, c) && free(c, b) && dist(a, c) + dist(c, b) < bestLen) { best = [c]; bestLen = dist(a, c) + dist(c, b); }
  for (let i = 0; i < 4; i++) {
    const c = corners[i], d = corners[(i + 1) % 4];
    for (const [p, q] of [[c, d], [d, c]] as const) {
      const len = dist(a, p) + dist(p, q) + dist(q, b);
      if (free(a, p) && free(q, b) && len < bestLen) { best = [p, q]; bestLen = len; }
    }
  }
  return best ?? [];
}

/** A whole path (waypoints in order, starting from `from`) detoured around the footprints. */
export function pathAround(from: Point, path: Point[], rects: Foot[]): Point[] {
  if (rects.length === 0) return path;
  const out: Point[] = [];
  let prev = from;
  for (const p of path) {
    out.push(...routeAround(prev, p, rects), p);
    prev = p;
  }
  return out;
}
