import Phaser from 'phaser';
import { TILE, type Point } from './layout';
import { MAP_SCALE as S } from './mapscale';

// The ground inside a castle's wall: meadow grass with dirt tracks from the gate to every building and a small worn patch of earth in front of each
// (soft, ragged edges, not squares), a flagstone walk along the wall and a stone square before the castle gate. Painted in code (nothing of the Tiny Swords
// art is copied), once per region, into a small canvas (one pixel per 4 px cell, like the roads) that is scaled up without smoothing; the grass is the
// terrain showing through. Pure picture: no rule, no server data.

const REGION_W = 16 * TILE, REGION_H = 12 * TILE;
const CELL = 4;
const DEPTH_FLOOR = -85_000;
const GATE_SIDE_INSET = 40;

type Rgb = [number, number, number];
const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const EARTH = [rgb(0xb48e5b), rgb(0xaa8452), rgb(0xbf9a66), rgb(0xa27d4e)];
const EARTH_DARK = rgb(0x9a774b);
const FLAG = [rgb(0xb3ad9d), rgb(0xa59f8f), rgb(0xbdb7a6)];
const MORTAR = rgb(0x6f6552), SHINE = rgb(0xd9d3c0);
const PEBBLE = [rgb(0x9aa09c), rgb(0xc4c9c0), rgb(0x6f7778)];

function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, size: number, salt: number): number {
  const gx = x / size, gy = y / size, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, salt), b = hash(ix + 1, iy, salt), c = hash(ix, iy + 1, salt), d = hash(ix + 1, iy + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---- dirt: tracks (polylines from the gate square) and worn patches (ellipses before the buildings), region-local px --------------------

const TRACK_HALF = 17;
const TRACKS_1: [number, number][][] = [
  [[512, 482], [400, 504], [288, 486], [262, 400], [258, 300]],  // farm
  [[512, 482], [624, 504], [736, 486], [764, 400], [770, 300]],  // woodcutter
  [[400, 504], [340, 548], [300, 596]],                           // mine
  [[624, 504], [712, 536], [790, 596]],                           // forge
];
/** [x, y, rx, ry]: the worn earth in front of each building. */
const PATCHES_1: [number, number, number, number][] = [
  [246, 304, 48, 118], [778, 316, 44, 118], [284, 624, 88, 28], [806, 656, 76, 28],
];

const TRACKS = TRACKS_1.map((line) => line.map(([x, y]) => [x * S, y * S] as [number, number]));
const PATCHES = PATCHES_1.map(([x, y, rx, ry]) => [x * S, y * S, rx * S, ry * S] as [number, number, number, number]);

/** 1 on the middle of a track or patch, falling to 0 at its edge (negative outside). */
function dirtCover(x: number, y: number): number {
  let best = -1;
  for (const line of TRACKS) {
    for (let k = 0; k + 1 < line.length; k++) {
      const [ax, ay] = line[k], [bx, by] = line[k + 1];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
      best = Math.max(best, 1 - d / TRACK_HALF);
    }
  }
  for (const [cx, cy, rx, ry] of PATCHES) best = Math.max(best, 1 - Math.hypot((x - cx) / rx, (y - cy) / ry));
  return best;
}

export class CourtyardFloor {
  private image: Phaser.GameObjects.Image | null = null;
  private fallen = false;

  /** `origin`: the region's top-left corner in scene pixels; `onEast`: the gate is in the east wall (the wall on the gate side stands further in). */
  constructor(private readonly scene: Phaser.Scene, private readonly origin: Point, private readonly onEast: boolean, private readonly key: string) {
    this.paint();
  }

  /** The castle has fallen: the yard greys out. */
  ruin(): void {
    if (this.fallen) return;
    this.fallen = true;
    this.image?.setAlpha(0.6).setTint(0x888888);
  }

  destroy(): void {
    this.image?.destroy(); this.image = null;
  }

  private paint(): void {
    const tex = `kf-floor-${this.key}`;
    if (this.scene.textures.exists(tex)) this.scene.textures.remove(tex);
    const w = Math.ceil(REGION_W / CELL), h = Math.ceil(REGION_H / CELL);
    const canvas = this.scene.textures.createCanvas(tex, w, h)!;
    const ctx = canvas.getContext();
    const image = ctx.createImageData(w, h);
    const px = new Uint32Array(image.data.buffer);
    const seed = this.key.split('').reduce((n, c) => n * 31 + c.charCodeAt(0), 11);
    // The yard reaches into the middle of the wall (the wall is drawn over it); at the gate side the wall stands 40 px in.
    const x0 = (this.onEast ? 12 : 12 + GATE_SIDE_INSET) / CELL, x1 = (REGION_W - (this.onEast ? 12 + GATE_SIDE_INSET : 12)) / CELL;
    const y0 = 30 / CELL, y1 = (REGION_H - 30) / CELL;
    const WALK = 9; // cells: the flagstone walk along the wall (36 px)
    const north = 58 / CELL, south = (REGION_H - 56) / CELL; // where the wall's face ends / begins
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (i < x0 || i > x1 || j < y0 || j > y1) continue;
        const rag = (noise(i, j, 7, seed) - 0.5) * 3;
        let c: Rgb;
        // the walk: a band along the inside of the wall (north, south and the whole side without a gate)
        const dN = j - north, dS = south - j, dSide = (this.onEast ? i - x0 : x1 - i) - 3;
        const inWalk = (dN < WALK + rag && dN > -2) || (dS < WALK + rag && dS > -2) || (dSide < WALK + rag && dSide > -3);
        // the stone square in front of the castle gate
        const plazaX = (i * CELL - 512 * S) / (150 * S), plazaY = (j * CELL - 478 * S) / (38 * S);
        const inPlaza = plazaX * plazaX + plazaY * plazaY < 1 + (noise(i, j, 5, seed + 5) - 0.5) * 0.25 && j * CELL > 430 * S;
        if (inWalk || inPlaza) {
          const wx = i * CELL, wy = j * CELL;
          const row = Math.floor(wy / 12), inRow = wy % 12;
          const bw = 22 + Math.floor(hash(row, 0, seed + 1) * 8), shift = Math.floor(hash(row, 1, seed + 2) * bw);
          const col = Math.floor((wx + shift) / bw), inCol = (wx + shift) % bw;
          c = FLAG[Math.floor(hash(col, row, seed + 3) * FLAG.length)];
          if (inRow < CELL || inCol < CELL) c = MORTAR;
          else if (inRow < CELL * 2 && inCol < bw - CELL && hash(col, row, seed + 4) > 0.55) c = SHINE;
          // a missing stone here and there: bare earth shows through
          if (hash(col, row, seed + 6) > 0.96 && c !== MORTAR) c = EARTH[1];
        } else {
          // grass shows through; dirt where a track or patch covers (ragged edge, a darker rim)
          const cover = dirtCover(i * CELL, j * CELL) + (noise(i * CELL, j * CELL, 26, seed + 13) - 0.5) * 0.5 + (hash(i, j, seed + 14) - 0.5) * 0.12;
          if (cover < 0.04) continue;
          c = EARTH[Math.floor(hash(i, j, seed) * EARTH.length)];
          if (cover < 0.16) c = EARTH_DARK;
          else if (noise(i * CELL, j * CELL, 70, seed + 9) < 0.3) c = EARTH_DARK;
          const sp = hash(i, j, seed + 11);
          if (sp > 0.992) c = PEBBLE[Math.floor(hash(i, j, seed + 12) * PEBBLE.length)];
        }
        px[j * w + i] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
      }
    }
    ctx.putImageData(image, 0, 0);
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.image?.destroy();
    this.image = this.scene.add.image(this.origin.x, this.origin.y, tex).setOrigin(0).setScale(CELL).setDepth(DEPTH_FLOOR);
  }
}
