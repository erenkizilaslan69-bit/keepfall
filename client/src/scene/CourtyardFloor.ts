import Phaser from 'phaser';
import { TILE, type Point } from './layout';

// The ground inside a castle's wall: packed earth with a flagstone walk along the wall and a stone square before the castle, so the castle
// reads as a yard and not as a meadow with a fence round it. Painted in code (nothing of the Tiny Swords art is copied), once per region, into a
// small canvas (one pixel per 4 px cell, like the roads) that is scaled up without smoothing. A few barrels, crates, stones, wood piles and
// a rail of fence stand along the inside of the north and south wall, where no building or worker walks. Pure picture: no rule, no server data.

const REGION_W = 16 * TILE, REGION_H = 12 * TILE;
const CELL = 4;
const DEPTH_FLOOR = -85_000;
const GATE_SIDE_INSET = 40;

type Rgb = [number, number, number];
const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const EARTH = [rgb(0xb48e5b), rgb(0xaa8452), rgb(0xbf9a66), rgb(0xa27d4e)];
const EARTH_DARK = rgb(0x9a774b), EARTH_LIGHT = rgb(0xcaa874);
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

// ---- the small wooden things (drawn from character grids: o outline, l light, m mid, d dark wood, b iron band) -----------------------

const PIXELS: Record<string, string[]> = {
  'kf-barrel': ['.ooooo.', 'olllllo', 'obbbbbo', 'omllmdo', 'omlmmdo', 'obbbbbo', 'omllmdo', '.ooooo.'],
  'kf-crate': ['oooooooo', 'ollllllo', 'olmmmddo', 'olmmdmdo', 'olmdmmdo', 'oddddddo', 'oooooooo'],
  'kf-crate-small': ['oooooo', 'ollllo', 'olmmdo', 'olmdmo', 'oddddo', 'oooooo'],
};
const COLORS: Record<string, string> = { o: '#241a14', l: '#c58f56', m: '#9d6a3b', d: '#744827', b: '#7d8896' };

function makeSmallThings(scene: Phaser.Scene): void {
  for (const [key, rows] of Object.entries(PIXELS)) {
    if (scene.textures.exists(key)) continue;
    const c = document.createElement('canvas');
    c.width = rows[0].length * CELL; c.height = rows.length * CELL;
    const g = c.getContext('2d')!;
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { g.fillStyle = COLORS[ch]; g.fillRect(i * CELL, j * CELL, CELL, CELL); } }));
    scene.textures.addCanvas(key, c);
  }
}

/** What stands along the north and south wall, region-local pixels (x, y of the base). */
const THINGS: { key: string; x: number; y: number; scale?: number; flip?: boolean }[] = [
  { key: 'rock2', x: 338, y: 86, scale: 0.55 },
  { key: 'kf-barrel', x: 404, y: 86 }, { key: 'kf-barrel', x: 428, y: 92 }, { key: 'kf-crate', x: 458, y: 88 },
  { key: 'kf-crate-small', x: 482, y: 90 },
  { key: 'wood-pile', x: 628, y: 92, scale: 0.8 }, { key: 'kf-barrel', x: 660, y: 88 },
  { key: 'rock4', x: 684, y: 84, scale: 0.5, flip: true },
  { key: 'kf-crate', x: 366, y: 704 }, { key: 'kf-barrel', x: 398, y: 706 }, { key: 'kf-crate-small', x: 424, y: 706 },
  { key: 'rock1', x: 492, y: 702, scale: 0.55 },
];
/** Fence rails (x from, x to, y) in front of the north wall and the south wall. */
const RAILS: [number, number, number][] = [[512, 596, 82], [440, 520, 714]];

export class CourtyardFloor {
  private image: Phaser.GameObjects.Image | null = null;
  private things: Phaser.GameObjects.GameObject[] = [];
  private fallen = false;

  /** `origin`: the region's top-left corner in scene pixels; `onEast`: the gate is in the east wall (the wall on the gate side stands further in). */
  constructor(private readonly scene: Phaser.Scene, private readonly origin: Point, private readonly onEast: boolean, private readonly key: string) {
    this.paint();
    this.furnish();
  }

  /** The castle has fallen: the yard greys out. */
  ruin(): void {
    if (this.fallen) return;
    this.fallen = true;
    this.image?.setAlpha(0.6).setTint(0x888888);
  }

  destroy(): void {
    this.image?.destroy(); this.image = null;
    for (const t of this.things) t.destroy();
    this.things = [];
  }

  private paint(): void {
    const tex = `kf-floor-${this.key}`;
    if (this.scene.textures.exists(tex)) this.scene.textures.remove(tex);
    const w = REGION_W / CELL, h = REGION_H / CELL;
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
        const plazaX = (i * CELL - 512) / 150, plazaY = (j * CELL - 478) / 38;
        const inPlaza = plazaX * plazaX + plazaY * plazaY < 1 + (noise(i, j, 5, seed + 5) - 0.5) * 0.25 && j * CELL > 430;
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
          c = EARTH[Math.floor(hash(i, j, seed) * EARTH.length)];
          const n = noise(i * CELL, j * CELL, 70, seed + 9);
          if (n < 0.33) c = EARTH_DARK; // worn, darker patches
          else if (n > 0.7 && hash(i, j, seed + 10) > 0.5) c = EARTH_LIGHT;
          const s = hash(i, j, seed + 11);
          if (s > 0.992) c = PEBBLE[Math.floor(hash(i, j, seed + 12) * PEBBLE.length)];
          else if (s < 0.012) c = EARTH_DARK;
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

  private furnish(): void {
    makeSmallThings(this.scene);
    const rnd = (n: number) => hash(n, 3, this.key.length * 17 + this.key.charCodeAt(0));
    THINGS.forEach((t, n) => {
      if (!this.scene.textures.exists(t.key)) return;
      const x = this.origin.x + t.x + (rnd(n) - 0.5) * 6, y = this.origin.y + t.y;
      const big = t.key.startsWith('rock') || t.key === 'wood-pile';
      const img = this.scene.add.image(x, y, t.key).setOrigin(0.5, big ? 0.75 : 1).setScale(t.scale ?? 1).setDepth(y).setFlipX(!!t.flip);
      this.things.push(img);
    });
    const g = this.scene.add.graphics();
    for (const [x1, x2, y] of RAILS) this.rail(g, this.origin.x + x1, this.origin.x + x2, this.origin.y + y);
    g.setDepth(this.origin.y + 90);
    this.things.push(g);
  }

  /** A short wooden fence (two rails and posts) in the pack's wood colours. */
  private rail(g: Phaser.GameObjects.Graphics, x1: number, x2: number, y: number): void {
    const dark = 0x4a2f1b, mid = 0x8a5a34, light = 0xb07a48;
    for (const dy of [-20, -9]) {
      g.lineStyle(6, dark, 1).lineBetween(x1, y + dy, x2, y + dy);
      g.lineStyle(3, mid, 1).lineBetween(x1, y + dy, x2, y + dy);
    }
    for (let x = x1; x <= x2 + 1; x += 22) {
      g.fillStyle(dark, 1).fillRect(x - 4, y - 30, 9, 34);
      g.fillStyle(mid, 1).fillRect(x - 3, y - 30, 6, 32);
      g.fillStyle(light, 1).fillRect(x - 3, y - 30, 2, 32);
      g.fillStyle(dark, 1).fillRect(x - 4, y - 33, 9, 4);
    }
  }
}
