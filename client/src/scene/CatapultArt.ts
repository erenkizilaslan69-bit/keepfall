// The catapult, from one picture (art/inbox/mancinik-final.png, made with Retro Diffusion; copied to public/art/mancinik.png): the pixel grid is
// found, the black tyres become wooden wheels with an iron rim, the blue cloth and hubs take the player's colour, a thick dark outline is
// added (like the cavalry's) and the throwing arm (the bucket and the beam left of the pivot) is cut out so it can swing for the throw.
// No dependency on PixelArt.ts: that file asks this one for frames and falls back to its own drawing until the picture has loaded.

export type CatapultTeam = 'blue' | 'red' | 'yellow' | 'black' | 'purple';
export const CATAPULT_W = 180, CATAPULT_H = 130, GROUND_Y = 114;

/** Palettes: [dark, mid, light] of the player's colour. */
const TEAM: Record<CatapultTeam, [string, string, string]> = {
  blue: ['#2a4f8e', '#3f78c4', '#79aee8'], red: ['#97302a', '#d4503f', '#f08a74'], yellow: ['#a47c22', '#e0b73a', '#f6dc7c'],
  black: ['#2c3038', '#4a4f5c', '#8a90a0'], purple: ['#683a8e', '#9a58c8', '#c590ea'],
};
const WOOD: [string, string, string] = ['#47291a', '#744827', '#a56d3c'];
const IRON = ['#3a3f47', '#5c6470'];
const OUTLINE = '#1a1424';
/** Pixels of the picture's grid drawn this many screen pixels wide: it puts the catapult at the size of the pack's units. */
const SCALE = 1;
/** The throwing arm: everything left of / above this in the picture's grid (the pivot sits at the right end of this box). */
const ARM = { x1: 52, y1: 44 }, PIVOT = { x: 54, y: 25 };

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ramp = (p: [string, string, string], t: number) => (t < 0.5 ? mix(rgb(p[0]), rgb(p[1]), t * 2) : mix(rgb(p[1]), rgb(p[2]), (t - 0.5) * 2));

interface Grid { w: number; h: number; data: Uint8ClampedArray }
let grid: Grid | null = null;
const cache = new Map<string, HTMLCanvasElement>();

export const catapultReady = (): boolean => grid !== null;

/** Finds the real pixel grid of the picture (blocks of one colour, 4×4 in a 512 px picture) and keeps one value per block. */
export function setCatapultSource(img: CanvasImageSource & { width: number; height: number }): void {
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, w, h).data;
  let block = 1;
  for (const b of [8, 4, 3, 2]) {
    if (w % b || h % b) continue;
    let same = 0, total = 0;
    for (let by = 0; by < h; by += b * 3) for (let bx = 0; bx < w; bx += b * 3) {
      const o = (by * w + bx) * 4;
      let ok = true;
      for (let y = 0; y < b && ok; y++) for (let x = 0; x < b; x++) {
        const p = ((by + y) * w + bx + x) * 4;
        if (Math.abs(src[p] - src[o]) + Math.abs(src[p + 1] - src[o + 1]) + Math.abs(src[p + 2] - src[o + 2]) + Math.abs(src[p + 3] - src[o + 3]) > 36) { ok = false; break; }
      }
      total++; if (ok) same++;
    }
    if (same / total > 0.93) { block = b; break; }
  }
  const gw = Math.floor(w / block), gh = Math.floor(h / block);
  const out = new Uint8ClampedArray(gw * gh * 4);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const p = ((y * block + (block >> 1)) * w + x * block + (block >> 1)) * 4, o = (y * gw + x) * 4;
    out[o] = src[p]; out[o + 1] = src[p + 1]; out[o + 2] = src[p + 2]; out[o + 3] = src[p + 3] >= 128 ? 255 : 0;
  }
  grid = { w: gw, h: gh, data: out };
  cache.clear();
  parts.clear();
}

// Load it for the menus and as a fallback (the game scene may hand over the same picture through setCatapultSource too).
if (typeof Image !== 'undefined') {
  const img = new Image();
  img.onload = () => setCatapultSource(img);
  img.src = '/art/mancinik.png';
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** The picture in the player's colour with wooden wheels: the base (everything but the arm) and the arm, as grids. */
function recolor(team: CatapultTeam): { base: Grid; arm: Grid } {
  const { w, h, data } = grid!;
  const d = new Uint8ClampedArray(data);
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[idx(x, y) + 3] > 0;
  // Which pixels are tyre: dark and grey (the wood is orange, the cloth and hubs blue, the outline navy and darker still).
  const tyre = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = idx(x, y);
    if (!d[o + 3]) continue;
    const r = d[o], g = d[o + 1], b = d[o + 2], l = lum(r, g, b), sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 56 && l > 28 && l < 130) tyre[y * w + x] = 1;
  }
  // Depth into the tyre from its edge: the rim is iron, the inside wood.
  const depth = new Uint8Array(w * h);
  for (let pass = 1; pass <= 4; pass++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tyre[y * w + x] || depth[y * w + x]) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return !solid(nx, ny) || !tyre[ny * w + nx] || (depth[ny * w + nx] > 0 && depth[ny * w + nx] < pass);
    });
    if (edge) depth[y * w + x] = pass;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = idx(x, y);
    if (!d[o + 3]) continue;
    const r = d[o], g = d[o + 1], b = d[o + 2], l = lum(r, g, b);
    let c: number[] | null = null;
    if (tyre[y * w + x]) {
      const dp = depth[y * w + x];
      if (dp === 0 || dp >= 3) c = ramp(WOOD, Math.min(1, Math.max(0, (l - 30) / 80) * 0.5 + (dp === 0 ? 0.28 : 0.12)));
      else c = rgb(IRON[(x + y) % 3 === 0 ? 1 : 0]); // the iron rim, two pixels thick
    } else if (b > r + 24 && l > 42) {
      c = ramp(TEAM[team], Math.min(1, Math.max(0, (l - 42) / 110))); // cloth and hubs
    }
    if (c) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; }
  }
  const base = new Uint8ClampedArray(d), arm = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x > ARM.x1 || y > ARM.y1) continue;
    const o = idx(x, y);
    if (!d[o + 3]) continue;
    arm.set(d.subarray(o, o + 4), o);
    base[o + 3] = 0;
  }
  return { base: { w, h, data: base }, arm: { w, h, data: arm } };
}

/** A grid drawn scaled (nearest neighbour, no smoothing) onto a canvas of its own. */
function drawGrid(g: Grid, scale: number): HTMLCanvasElement {
  const small = document.createElement('canvas');
  small.width = g.w; small.height = g.h;
  small.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(g.data), g.w, g.h), 0, 0);
  const big = document.createElement('canvas');
  big.width = Math.ceil(g.w * scale); big.height = Math.ceil(g.h * scale);
  const c = big.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

const parts = new Map<string, { base: HTMLCanvasElement; arm: HTMLCanvasElement; box: { x: number; y: number; w: number; h: number } }>();
function partsOf(team: CatapultTeam) {
  let p = parts.get(team);
  if (p) return p;
  const { base, arm } = recolor(team);
  // The whole sprite's solid box in the grid, to stand it in the frame with its wheels on the ground.
  let x0 = base.w, y0 = base.h, x1 = 0, y1 = 0;
  for (const gr of [base, arm]) for (let y = 0; y < gr.h; y++) for (let x = 0; x < gr.w; x++)
    if (gr.data[(y * gr.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  p = { base: drawGrid(base, SCALE), arm: drawGrid(arm, SCALE), box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
  parts.set(team, p);
  return p;
}

/** Adds a dark outline `r` pixels thick round everything drawn. */
function outline(src: HTMLCanvasElement, r: number): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const s = src.getContext('2d')!.getImageData(0, 0, w, h);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const oc = out.getContext('2d')!;
  const o = oc.createImageData(w, h);
  const [or, og, ob] = rgb(OUTLINE);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (s.data[i + 3] > 0) { o.data.set(s.data.subarray(i, i + 4), i); continue; }
    let near = false;
    for (let dy = -r; dy <= r && !near; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && s.data[(ny * w + nx) * 4 + 3] > 0 && dx * dx + dy * dy <= r * r + 1) { near = true; break; }
    }
    if (near) { o.data[i] = or; o.data[i + 1] = og; o.data[i + 2] = ob; o.data[i + 3] = 255; }
  }
  oc.putImageData(o, 0, 0);
  return out;
}

export interface CatapultPose {
  /** The arm's turn in degrees (negative: the bucket pulled back and down, positive: swung up and forward). */
  arm?: number;
  /** The whole machine rocking on the road: pixels up and a lean in degrees. */
  bob?: number;
  lean?: number;
}

/** One 180×130 frame, the wheels' ground line at y 114; null until the picture has loaded. */
export function catapultFrame(team: CatapultTeam, pose: CatapultPose = {}): HTMLCanvasElement | null {
  if (!grid) return null;
  const key = `${team}:${pose.arm ?? 0}:${pose.bob ?? 0}:${pose.lean ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = partsOf(team);
  const sc = SCALE;
  const ox = Math.round((CATAPULT_W - p.box.w * sc) / 2 - p.box.x * sc);
  const oy = Math.round(GROUND_Y - (p.box.y + p.box.h) * sc - (pose.bob ?? 0));
  const layer = document.createElement('canvas');
  layer.width = CATAPULT_W; layer.height = CATAPULT_H;
  const c = layer.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.save();
  if (pose.lean) { c.translate(CATAPULT_W / 2, GROUND_Y); c.rotate((pose.lean * Math.PI) / 180); c.translate(-CATAPULT_W / 2, -GROUND_Y); }
  c.drawImage(p.base, ox, oy);
  c.save();
  c.translate(ox + PIVOT.x * sc, oy + PIVOT.y * sc);
  c.rotate(((pose.arm ?? 0) * Math.PI) / 180);
  c.drawImage(p.arm, -PIVOT.x * sc, -PIVOT.y * sc);
  c.restore();
  c.restore();
  const done = outline(layer, 2);
  cache.set(key, done);
  return done;
}

/** The throw: the arm is pulled back, whips forward over the top, swings out and comes to rest. */
export const FIRE_ARM = [-30, 34, 66, 22];
/** Rolling along the road: four frames of a small rocking. */
export const RUN_POSE: CatapultPose[] = [{ bob: 0, lean: -0.8, arm: -2 }, { bob: 1.5, lean: 0, arm: 0 }, { bob: 0, lean: 0.8, arm: 2 }, { bob: 1.5, lean: 0, arm: 0 }];
