import Phaser from 'phaser';
import type { MapLayoutView, Vec } from '../types';
import { distanceToSegment, seeded, toWorld } from './world';
import { DEPTH } from './Terrain';
import { lowGraphics } from '../prefs';

// The still ornaments of the map from the pack's own pieces (Tiny Swords bushes, rocks and stumps, loaded for the scene): scattered from the room's seed
// (everyone in the match sees the same ones) over the meadows between the castles, along the edges of the map and through the forest next to the pack's
// trees. Each gets a soft translucent shadow. Cost: all the pictures are packed into ONE atlas texture and the ornaments are Blitter bobs in square
// chunks (one draw call per square the camera sees), so they are painted once and never touch a sprite or a tween. They sit on the ground layer,
// under everything that stands or walks, and they keep off the roads, the castle regions, the map's edge and each other.

/** The ornaments: name, the loaded texture it is cut from (and the frame size when that is a sheet) and the scale it is drawn at. */
const SOURCES: Record<string, { key: string; frame?: number; scale: number }> = {
  rock1: { key: 'rock1', scale: 0.8 }, rock2: { key: 'rock2', scale: 0.8 }, rock3: { key: 'rock3', scale: 0.8 }, rock4: { key: 'rock4', scale: 0.8 },
  bush1: { key: 'bush1', frame: 128, scale: 0.8 }, bush2: { key: 'bush2', frame: 128, scale: 0.8 }, bush3: { key: 'bush3', frame: 128, scale: 0.8 }, bush4: { key: 'bush4', frame: 128, scale: 0.8 },
  stump1: { key: 'stump1', scale: 0.7 }, stump2: { key: 'stump2', scale: 0.7 },
};
const ALL_NAMES: readonly string[] = Object.keys(SOURCES);
const ATLAS = 'kf-props';
const CHUNK = 640;

/** The atlas: every ornament cut to its picture's opaque part with a shadow beneath; frame names are the ornament names. */
function makeAtlas(scene: Phaser.Scene): Map<string, { w: number; h: number }> {
  const frames = new Map<string, { w: number; h: number }>();
  if (scene.textures.exists(ATLAS)) {
    for (const n of ALL_NAMES) { const f = scene.textures.get(ATLAS).get(n); if (f && f.name === n) frames.set(n, { w: f.width, h: f.height }); }
    return frames;
  }
  const items: { name: string; crop: HTMLCanvasElement; w: number; h: number }[] = [];
  for (const name of ALL_NAMES) {
    const src = SOURCES[name];
    if (!scene.textures.exists(src.key)) continue;
    const img = scene.textures.get(src.key).getSourceImage() as HTMLImageElement;
    const fw = src.frame ?? img.width, fh = src.frame ?? img.height;
    const tmp = document.createElement('canvas');
    tmp.width = fw; tmp.height = fh;
    const tg = tmp.getContext('2d', { willReadFrequently: true })!;
    tg.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
    const d = tg.getImageData(0, 0, fw, fh).data;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (d[(y * fw + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) continue;
    const crop = document.createElement('canvas');
    crop.width = x1 - x0 + 1; crop.height = y1 - y0 + 1;
    crop.getContext('2d')!.drawImage(tmp, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height);
    items.push({ name, crop, w: Math.round(crop.width * src.scale) + 16, h: Math.round(crop.height * src.scale) + 14 });
  }
  const W = 512;
  let x = 0, y = 0, rowH = 0;
  const placed: { name: string; x: number; y: number; w: number; h: number; crop: HTMLCanvasElement }[] = [];
  for (const it of items) {
    if (x + it.w > W) { x = 0; y += rowH; rowH = 0; }
    placed.push({ ...it, x, y });
    x += it.w; rowH = Math.max(rowH, it.h);
  }
  if (placed.length === 0) return frames;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = y + rowH;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (const p of placed) {
    const sc = SOURCES[p.name].scale;
    g.fillStyle = 'rgba(22, 14, 34, 0.28)';
    g.beginPath(); g.ellipse(p.x + p.w / 2, p.y + p.h - 9, Math.min(p.crop.width * sc * 0.46, 40), 6, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(p.crop, p.x + 8, p.y + 2, Math.round(p.crop.width * sc), Math.round(p.crop.height * sc));
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
    // Low graphics: about a third of the ornaments, chosen by their place (the same ones every time).
    if (lowGraphics() && ((Math.imul(Math.round(x), 73856093) ^ Math.imul(Math.round(y), 19349663)) >>> 0) % 100 >= 34) return;
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
    const radiusOf: Record<string, number> = { rock1: 28, rock2: 28, rock3: 28, rock4: 28, bush1: 36, bush2: 36, bush3: 36, bush4: 36, stump1: 26, stump2: 26 };
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
    const wood: [string, number][] = [['bush1', 14], ['bush2', 14], ['bush3', 14], ['bush4', 14], ['rock1', 5], ['rock2', 5], ['rock3', 5], ['rock4', 5], ['stump1', 12], ['stump2', 12]];
    const w = b.x - a.x, h = b.y - a.y;
    // The roads keep a wide verge (about three tiles each side) clear of everything.
    const VERGE = 200;
    // the meadows between the castles: only bushes and small stones (no stumps outside the forests)
    const small: [string, number][] = [['bush1', 16], ['bush2', 16], ['bush3', 12], ['bush4', 12], ['rock1', 11], ['rock2', 11], ['rock3', 11], ['rock4', 11]];
    for (let i = 0, n = 0; i < 2000 && n < 90; i++) {
      const x = a.x + rnd() * w, y = a.y + rnd() * h;
      if (inForest(x, y)) continue;
      if (tryPlace(pick(small), x, y, VERGE)) n++;
    }
    // through the forest, between the pack's trees (half of what there was)
    for (const f of forests) {
      const c = toWorld(f.center), r = f.radius * 64;
      for (let i = 0, n = 0; i < 900 && n < 40; i++) {
        const ang = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.95;
        if (tryPlace(pick(wood), c.x + Math.cos(ang) * d, c.y + Math.sin(ang) * d * 0.9, VERGE - 40)) n++;
      }
    }
  }

  destroy(): void {
    for (const c of this.chunks.values()) c.blitter.destroy();
    this.chunks.clear();
  }
}
