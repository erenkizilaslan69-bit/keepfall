import Phaser from 'phaser';
import type { MapLayoutView, Vec } from '../types';
import { distanceToSegment, seeded, toWorld } from './world';
import { DEPTH } from './Terrain';

// The still ornaments of the map from the generated sheet (public/art/props, cleaned by tools/art-ui.mjs): oaks, pines, dark pines, berry bushes, small
// rocks, mossy boulders, flower clumps and stumps, each with a soft translucent shadow instead of the sheet's purple one. They are scattered from the
// room's seed (everyone in the match sees the same ones) over the meadows between the castles, along the edges of the map and through the forest next to
// the pack's trees. Cost: all the pictures are packed into ONE atlas texture and the ornaments are Blitter bobs in square chunks (one draw call per
// square the camera sees), so they are painted once and never touch a sprite or a tween. They sit on the ground layer, under everything that stands
// or walks, and they keep off the roads, the castle regions, the map's edge and each other.

export const PROP_NAMES = ['oak', 'pine', 'darkpine', 'berry', 'rocks', 'mossrock', 'flowers', 'stump', 'sign'] as const;
/** The rarer, bigger details (a broken cart, a pond, a ruined tower ...): one or two in each quarter of the map, only on the meadows. */
export const DETAIL_NAMES = ['d-cart', 'd-pond', 'd-tower', 'd-stones', 'd-field', 'd-well', 'd-mushlog', 'd-campfire', 'd-bridge'] as const;
const ALL_NAMES: readonly string[] = [...PROP_NAMES, ...DETAIL_NAMES];
const SCALE = 2;
const srcKey = (name: string) => `prop:${name}`;
const ATLAS = 'kf-props';
const CHUNK = 640;

export function preloadPropsArt(scene: Phaser.Scene): void {
  for (const n of ALL_NAMES) scene.load.image(srcKey(n), `/art/props/${n}.png`);
}

/** The atlas: every ornament drawn at SCALE with its shadow beneath; frame names are the ornament names. */
function makeAtlas(scene: Phaser.Scene): Map<string, { w: number; h: number }> {
  const frames = new Map<string, { w: number; h: number }>();
  if (scene.textures.exists(ATLAS)) {
    for (const n of ALL_NAMES) { const f = scene.textures.get(ATLAS).get(n); if (f && f.name === n) frames.set(n, { w: f.width, h: f.height }); }
    return frames;
  }
  const items: { name: string; img: HTMLImageElement; w: number; h: number }[] = [];
  for (const name of ALL_NAMES) {
    if (name === 'sign' || !scene.textures.exists(srcKey(name))) continue;
    const img = scene.textures.get(srcKey(name)).getSourceImage() as HTMLImageElement;
    items.push({ name, img, w: img.width * SCALE + 16, h: img.height * SCALE + 14 });
  }
  const W = 512;
  let x = 0, y = 0, rowH = 0;
  const placed: { name: string; x: number; y: number; w: number; h: number; img: HTMLImageElement }[] = [];
  for (const it of items) {
    if (x + it.w > W) { x = 0; y += rowH; rowH = 0; }
    placed.push({ ...it, x, y });
    x += it.w; rowH = Math.max(rowH, it.h);
  }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = y + rowH;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (const p of placed) {
    // the soft shadow: a flat dark ellipse under the foot, translucent
    g.fillStyle = 'rgba(22, 14, 34, 0.30)';
    g.beginPath(); g.ellipse(p.x + p.w / 2, p.y + p.h - 11, Math.min(p.img.width * SCALE * 0.46, 44), 7, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(p.img, p.x + 8, p.y + 2, p.img.width * SCALE, p.img.height * SCALE);
  }
  const tex = scene.textures.addCanvas(ATLAS, canvas)!;
  for (const p of placed) { tex.add(p.name, 0, p.x, p.y, p.w, p.h); frames.set(p.name, { w: p.w, h: p.h }); }
  return frames;
}

export class MapProps {
  private readonly chunks = new Map<string, { blitter: Phaser.GameObjects.Blitter; x: number; y: number }>();
  /** How many ornaments were placed (for the debug layer and tests). */
  count = 0;
  /** How many of them are the big details (a cart, a pond ...). */
  details = 0;
  /** Where they stand (for the debug layer and the screenshot tools). */
  readonly detailSpots: { name: string; x: number; y: number }[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly layout: MapLayoutView, seed: number) {
    const frames = makeAtlas(scene);
    if (frames.size === 0) return;
    this.scatter(frames, seed);
  }

  private bob(frames: Map<string, { w: number; h: number }>, name: string, x: number, y: number, flip: boolean): void {
    const f = frames.get(name);
    if (!f) return;
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = { blitter: this.scene.add.blitter(0, 0, ATLAS).setDepth(DEPTH.flora + 400), x: cx * CHUNK, y: cy * CHUNK };
      this.chunks.set(key, c);
    }
    const bob = c.blitter.create(x - f.w / 2, y - f.h + 9, name);
    bob.flipX = flip;
    this.count++;
  }

  /** Hides the squares the camera does not see (called every frame by the scene). */
  cull(view: Phaser.Geom.Rectangle): void {
    const m = 120;
    for (const c of this.chunks.values()) {
      const visible = c.x + CHUNK + m > view.x && c.x - m < view.right && c.y + CHUNK + m > view.y && c.y - m < view.bottom;
      if (c.blitter.visible !== visible) c.blitter.setVisible(visible);
    }
  }

  private scatter(frames: Map<string, { w: number; h: number }>, seed: number): void {
    const L = this.layout;
    const rnd = seeded(seed ^ 0x9e37);
    const a = toWorld({ x: 0, y: 0 }), b = toWorld({ x: L.size, y: L.size });
    const toTiles = (x: number, y: number): Vec => ({ x: (x - a.x) / 64, y: (y - a.y) / 64 });
    const awayFromRoads = (x: number, y: number, margin: number) => {
      const t = toTiles(x, y);
      return L.roads.every((r) => r.points.slice(1).every((q, j) => distanceToSegment(t, r.points[j], q) > margin / 64));
    };
    const inRegion = (x: number, y: number, pad: number) => {
      const t = toTiles(x, y);
      return L.regions.some((r) => t.x > r.origin.x - pad && t.x < r.origin.x + r.width + pad && t.y > r.origin.y - pad && t.y < r.origin.y + r.height + pad);
    };
    const forests = L.features.filter((f) => f.kind === 'forest');
    const inForest = (x: number, y: number) => {
      const t = toTiles(x, y);
      return forests.some((f) => Math.hypot(t.x - f.center.x, t.y - f.center.y) < f.radius * 0.96);
    };
    const placed: { x: number; y: number; r: number }[] = [];
    const radiusOf: Record<string, number> = {
      oak: 46, pine: 36, darkpine: 40, berry: 34, rocks: 34, mossrock: 40, flowers: 34, stump: 28,
      'd-cart': 62, 'd-pond': 70, 'd-tower': 66, 'd-stones': 70, 'd-field': 66, 'd-well': 44, 'd-mushlog': 62, 'd-campfire': 62, 'd-bridge': 66,
    };
    const tryPlace = (name: string, x: number, y: number, roadMargin: number): boolean => {
      const r = radiusOf[name] ?? 34;
      if (x < a.x + 150 || x > b.x - 150 || y < a.y + 150 || y > b.y - 150) return false;
      if (inRegion(x, y, 1.2) || !awayFromRoads(x, y, roadMargin)) return false;
      if (placed.some((q) => Math.hypot(q.x - x, q.y - y) < q.r + r)) return false;
      placed.push({ x, y, r });
      this.bob(frames, name, x, y, rnd() < 0.5);
      return true;
    };
    const pick = (table: [string, number][]) => {
      let t = rnd() * table.reduce((s, e) => s + e[1], 0);
      for (const [n, w] of table) { t -= w; if (t <= 0) return n; }
      return table[0][0];
    };
    const meadow: [string, number][] = [['flowers', 30], ['rocks', 14], ['mossrock', 6], ['berry', 12], ['stump', 7], ['oak', 14], ['pine', 8], ['darkpine', 9]];
    const wood: [string, number][] = [['darkpine', 30], ['pine', 20], ['berry', 20], ['mossrock', 10], ['rocks', 8], ['stump', 12]];
    const tall = new Set(['oak', 'pine', 'darkpine']);
    const w = b.x - a.x, h = b.y - a.y;
    // the details first, so the small ornaments make room for them: one or two in each quarter, each kind used once; away from the roads, the castle
    // regions, the forests (their places and trails are in there) and the edge of the map
    const kinds = [...DETAIL_NAMES];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    let next = 0;
    for (let quarter = 0; quarter < 4; quarter++) {
      const x0 = a.x + (quarter % 2) * (w / 2), y0 = a.y + Math.floor(quarter / 2) * (h / 2), want = 1 + (rnd() < 0.5 ? 1 : 0);
      for (let got = 0, tries = 0; got < want && tries < 400; tries++) {
        const x = x0 + (0.1 + rnd() * 0.8) * (w / 2), y = y0 + (0.1 + rnd() * 0.8) * (h / 2), name = kinds[next % kinds.length];
        if (inForest(x, y) || !awayFromRoads(x, y, 210) || !tryPlace(name, x, y, 210)) continue;
        next++; got++; this.details++; this.detailSpots.push({ name, x, y });
      }
    }
    // the meadows between the castles
    for (let i = 0, n = 0; i < 2600 && n < 230; i++) {
      const x = a.x + rnd() * w, y = a.y + rnd() * h, name = pick(meadow);
      if (inForest(x, y)) continue;
      if (tryPlace(name, x, y, tall.has(name) ? 150 : 90)) n++;
    }
    // the edges of the map: rows of trees and bushes along the coast
    for (let i = 0, n = 0; i < 2000 && n < 110; i++) {
      const side = Math.floor(rnd() * 4), t = rnd(), depth = 150 + rnd() * 150;
      const x = side === 0 ? a.x + depth : side === 1 ? b.x - depth : a.x + t * w;
      const y = side === 2 ? a.y + depth : side === 3 ? b.y - depth : a.y + t * h;
      if (inForest(x, y)) continue;
      if (tryPlace(pick([['pine', 25], ['darkpine', 25], ['oak', 25], ['berry', 15], ['mossrock', 10]]), x, y, 120)) n++;
    }
    // through the forest, between the pack's trees
    for (const f of forests) {
      const c = toWorld(f.center), r = f.radius * 64;
      for (let i = 0, n = 0; i < 1500 && n < 90; i++) {
        const ang = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.95;
        if (tryPlace(pick(wood), c.x + Math.cos(ang) * d, c.y + Math.sin(ang) * d * 0.9, 100)) n++;
      }
    }
  }

  destroy(): void {
    for (const c of this.chunks.values()) c.blitter.destroy();
    this.chunks.clear();
  }
}
