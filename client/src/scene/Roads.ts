import Phaser from 'phaser';
import type { RoadView } from '../types';
import { TILE, type Point } from './layout';
import { distanceToSegment, seeded, toWorld } from './world';

// The dirt roads, drawn once. The geometry is the server's (the roads' points are not touched); only how the ground looks changes:
// an uneven edge that crumbles into the grass, two shallow wheel ruts with gaps, patches of gravel and the odd pebble, rounded corners and
// junctions (a cell's colour comes from its distance to the nearest road, so where roads meet they simply merge). The pixels are 4 px
// cells like the pack's own art and the colours are the pack's earth and stone. Every square of the map a road touches is painted into one
// canvas texture at the start; after that a road costs a textured quad per square, nothing else.

const CELL = 4;
const CHUNK = 512;
const CELLS = CHUNK / CELL;
/** Half the width of a road in the open, and in the forest (a path there is narrower and less sure). */
const HALF_OPEN = 25, HALF_FOREST = 17;

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const DIRT = [rgb(0xdbbb7e), rgb(0xd3b273), rgb(0xcaa869), rgb(0xe3c88e)];
const WORN = rgb(0xe9d29b);
const RIM = [rgb(0xb89a62), rgb(0xa98b57), rgb(0xc2a56d)];
const RUT = [rgb(0xb39358), rgb(0xa5864f)];
const STONE = [rgb(0x9aa09c), rgb(0xc4c9c0), rgb(0x6f7778)];
const TUFT = [rgb(0x6c9a2e), rgb(0x84ac38), rgb(0x587f27)];

/** A number between 0 and 1 that is always the same for the same (x, y, salt). */
function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1: the hash on a lattice, blended. */
function noise(x: number, y: number, size: number, salt: number): number {
  const gx = x / size, gy = y / size, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, salt), b = hash(ix + 1, iy, salt), c = hash(ix, iy + 1, salt), d = hash(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

interface Segment { ax: number; ay: number; bx: number; by: number }

/**
 * Paints the roads into canvas textures, one per 512 px square the roads touch, and returns the images (at <paramref name="depth"/>).
 * <paramref name="forest"/>: the forest's centre and radius in scene pixels, where the roads are narrower.
 */
export function bakeRoads(scene: Phaser.Scene, roads: RoadView[], mapSize: number, forest: { center: Point; radius: number } | null, depth: number): Phaser.GameObjects.Image[] {
  const segments: Segment[] = roads.flatMap((road) => road.points.slice(1).map((b, j) => {
    const a = toWorld(road.points[j]), e = toWorld(b);
    return { ax: a.x, ay: a.y, bx: e.x, by: e.y };
  }));
  const started = performance.now();
  const origin = toWorld({ x: 0, y: 0 }), size = mapSize * TILE;
  const images: Phaser.GameObjects.Image[] = [];
  const forestAt = (x: number, y: number) => {
    if (!forest) return 0;
    const d = Math.hypot(x - forest.center.x, y - forest.center.y);
    return Math.max(0, Math.min(1, (forest.radius - d) / (TILE * 2.5)));
  };

  for (let cy = 0; cy * CHUNK < size; cy++) {
    for (let cx = 0; cx * CHUNK < size; cx++) {
      const x0 = origin.x + cx * CHUNK, y0 = origin.y + cy * CHUNK;
      const reach = CHUNK * 0.71 + HALF_OPEN + 8;
      const mid = { x: x0 + CHUNK / 2, y: y0 + CHUNK / 2 };
      const near = segments.filter((s) => distanceToSegment(mid, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by }) < reach);
      if (near.length === 0) continue;

      const key = `kf-road-${cx}-${cy}`;
      const canvas = scene.textures.createCanvas(key, CHUNK, CHUNK)!;
      const ctx = canvas.getContext();
      const image = ctx.createImageData(CHUNK, CHUNK);
      const px = new Uint32Array(image.data.buffer);
      let any = false;

      for (let j = 0; j < CELLS; j++) {
        for (let i = 0; i < CELLS; i++) {
          const wx = x0 + i * CELL + CELL / 2, wy = y0 + j * CELL + CELL / 2;
          // the nearest road, and which side of it the cell is on
          let d = Infinity, side = 1;
          for (const s of near) {
            const dx = s.bx - s.ax, dy = s.by - s.ay, len2 = dx * dx + dy * dy;
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((wx - s.ax) * dx + (wy - s.ay) * dy) / len2));
            const qx = s.ax + dx * t, qy = s.ay + dy * t, dist = Math.hypot(wx - qx, wy - qy);
            if (dist < d) { d = dist; side = (wx - s.ax) * dy - (wy - s.ay) * dx >= 0 ? 1 : -1; }
          }
          if (d > HALF_OPEN + 8) continue;
          const gi = Math.floor(wx / CELL), gj = Math.floor(wy / CELL);
          const f = forestAt(wx, wy);
          // the edge wanders: the road is wider here, narrower there, and ragged cell by cell
          const half = (HALF_OPEN + (HALF_FOREST - HALF_OPEN) * f) + (noise(wx, wy, 70, 1) - 0.5) * 8 + (hash(gi, gj, 2) - 0.5) * 4 - f * (noise(wx, wy, 34, 11) - 0.35) * 6;
          if (d > half) continue;
          const edge = half - d; // 0 at the edge, growing inwards
          let color: [number, number, number] | null = null;

          if (edge < 11) {
            // the crumbling edge: bare rim, with more and more grass showing through towards the outside
            const bare = Math.pow(edge / 11, 0.9 + f * 0.5);
            if (hash(gi, gj, 3) > bare + 0.1) {
              // grass shows: nothing painted (the ground is the grass), now and then a tuft of it grown over the rim
              if (hash(gi, gj, 4) > 0.8) color = TUFT[Math.floor(hash(gi, gj, 5) * TUFT.length)];
            } else {
              color = RIM[Math.floor(hash(gi, gj, 6) * RIM.length)];
            }
          } else {
            // the body: three or four tones in soft blotches, a worn lighter strip in the middle
            const blotch = noise(wx, wy, 46, 7) * 0.7 + hash(gi, gj, 8) * 0.3;
            color = DIRT[Math.min(DIRT.length - 1, Math.floor(blotch * DIRT.length))];
            if (d < 7 && noise(wx, wy, 90, 9) > 0.45 && hash(gi, gj, 10) > 0.35) color = WORN;
            // wheel ruts: two shallow grooves either side of the middle, broken where the ground is firmer
            const rutAt = Math.abs(d - (9 + f * -2));
            if (rutAt < 2.6 && noise(wx, wy, 38, 12 + (side > 0 ? 0 : 20)) > 0.3 && hash(gi, gj, 13) > 0.18) color = RUT[hash(gi, gj, 14) > 0.5 ? 0 : 1];
            // gravel patches and the odd pebble
            const gravel = noise(wx, wy, 64, 15);
            if (gravel > 0.72 && hash(gi, gj, 16) > 0.86) color = STONE[Math.floor(hash(gi, gj, 17) * 2)];
            else if (hash(gi, gj, 18) > 0.9935 - f * 0.004) color = STONE[Math.floor(hash(gi, gj, 19) * STONE.length)];
          }
          if (!color) continue;
          any = true;
          const rgba = (255 << 24) | (color[2] << 16) | (color[1] << 8) | color[0]; // little-endian RGBA
          for (let v = 0; v < CELL; v++) {
            const row = (j * CELL + v) * CHUNK + i * CELL;
            for (let u = 0; u < CELL; u++) px[row + u] = rgba;
          }
        }
      }
      if (!any) { scene.textures.remove(key); continue; }
      ctx.putImageData(image, 0, 0);
      canvas.refresh();
      images.push(scene.add.image(x0, y0, key).setOrigin(0).setDepth(depth));
    }
  }
  if (import.meta.env.DEV) (window as unknown as { keepfallRoadMs: number }).keepfallRoadMs = Math.round(performance.now() - started); // how long the one-off painting took
  return images;
}

/**
 * Small wooden signposts where roads meet (the pack's own, CC0): one by every junction, a little off the road, none on top of another.
 */
export function placeSignposts(scene: Phaser.Scene, roads: RoadView[], seed: number): Phaser.GameObjects.Image[] {
  if (!scene.textures.exists('signpost')) return [];
  const rnd = seeded(seed ^ 0x51a9);
  const ends = new Map<string, { p: { x: number; y: number }; n: number }>();
  for (const road of roads)
    for (const p of [road.points[0], road.points[road.points.length - 1]]) {
      const k = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      const e = ends.get(k) ?? { p, n: 0 };
      e.n++;
      ends.set(k, e);
    }
  const out: Phaser.GameObjects.Image[] = [];
  for (const { p, n } of ends.values()) {
    if (n < 3) continue; // a signpost where a road forks, not at the ends of a road
    const w = toWorld(p);
    const side = rnd() < 0.5 ? -1 : 1;
    const x = w.x + side * 44, y = w.y - 30;
    out.push(scene.add.image(x, y, 'signpost').setOrigin(0.5, 0.88).setScale(0.8).setFlipX(side < 0).setDepth(y));
  }
  return out;
}

// ---- the paved ground in front of a castle gate ------------------------------------------------------------------------------------

const COBBLE = [rgb(0x86b8ba), rgb(0x7aaab0), rgb(0x92c2c0)];
const MORTAR = rgb(0x3f6571);
const SHINE = rgb(0xcfe3cf);

/**
 * The road between the castle gate and the wall gate, paved with cobbles when the wall is strong: level 2 paves the stretch in front of
 * the castle, level 3 all the way to the wall. (A picture of the wall level; the road under it is the same one.) Painted once per region.
 */
export class GatePaving {
  private image: Phaser.GameObjects.Image | null = null;
  private level = 0;

  /** `origin`: the region's corner in scene pixels; the road runs from x = 512 (the castle gate) to the side wall at height `gateY`. */
  constructor(private readonly scene: Phaser.Scene, private readonly origin: Point, private readonly onEast: boolean,
    private readonly key: string, private readonly gateY: number, private readonly castleX: number, private readonly regionW: number) {}

  setLevel(level: number): void {
    if (level === this.level) return;
    this.level = level;
    if (level < 2) { this.image?.setVisible(false); return; }
    if (!this.image) this.paint();
    if (!this.image) return;
    this.image.setVisible(true);
    // level 2: only the stretch by the castle; level 3: all of it
    const reach = level >= 3 ? this.image.width : Math.min(this.image.width, 150);
    if (this.onEast) this.image.setCrop(0, 0, reach, this.image.height);
    else this.image.setCrop(this.image.width - reach, 0, reach, this.image.height);
  }

  private paint(): void {
    const from = this.onEast ? this.castleX : 18, to = this.onEast ? this.regionW - 18 : this.castleX;
    const w = Math.ceil((to - from) / CELL) * CELL, h = 64;
    const tex = `kf-paving-${this.key}`;
    if (this.scene.textures.exists(tex)) this.scene.textures.remove(tex);
    const canvas = this.scene.textures.createCanvas(tex, w, h)!;
    const ctx = canvas.getContext();
    const image = ctx.createImageData(w, h);
    const px = new Uint32Array(image.data.buffer);
    const seed = this.key.split('').reduce((n, c) => n * 31 + c.charCodeAt(0), 7);
    for (let j = 0; j < h / CELL; j++) {
      for (let i = 0; i < w / CELL; i++) {
        const wx = from + i * CELL, y = j * CELL + CELL / 2 - h / 2; // y: distance from the road's middle
        const edge = 26 + (noise(wx, 0, 40, seed) - 0.5) * 5 + (hash(i, j, seed) - 0.5) * 3;
        if (Math.abs(y) > edge) continue;
        // bricks in rows of 12 px, each row shifted: mortar on the row's top line and between bricks
        const row = Math.floor((j * CELL + h) / 12), inRow = (j * CELL + h) % 12;
        const brickW = 20 + Math.floor(hash(row, 0, seed + 1) * 8), shift = Math.floor(hash(row, 1, seed + 2) * brickW);
        const col = Math.floor((wx - from + shift) / brickW), inCol = (wx - from + shift) % brickW;
        let c = COBBLE[Math.floor(hash(col, row, seed + 3) * COBBLE.length)];
        if (inRow < CELL || inCol < CELL) c = MORTAR;
        else if (inRow < CELL * 2 && inCol < brickW - CELL && hash(col, row, seed + 4) > 0.5) c = SHINE;
        const rgba = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
        for (let v = 0; v < CELL; v++) for (let u = 0; u < CELL; u++) px[(j * CELL + v) * w + i * CELL + u] = rgba;
      }
    }
    ctx.putImageData(image, 0, 0);
    canvas.refresh();
    this.image = this.scene.add.image(this.origin.x + from, this.origin.y + this.gateY - h / 2, tex).setOrigin(0).setDepth(-79_000);
  }

  destroy(): void {
    this.image?.destroy();
    this.image = null;
  }
}
