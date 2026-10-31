import Phaser from 'phaser';
import type { BuildingType, PlayerColor } from '../types';
import { CHIMNEYS } from './Chimneys';
import { asset } from '../env';

// The kingdoms' own castles and buildings: pictures in client/public/art/kingdoms (cleaned from the generated art by tools/art-clean.mjs: one pixel per
// fake pixel, a limited palette, transparent background), drawn one grid pixel at CASTLE_CELL / BUILD_CELL world pixels. Only the saturated blue of
// a picture (the roofs, banners and trim) takes the player's colour; the pale bluish stones (the Oracle's marble) stay as they are.
// A rival's castle and buildings look like this only while the server names their kingdom to us (their castle in live sight, or a scout report);
// every client loads all of these files whoever holds which kingdom, so loading them says nothing.

export const KINGDOM_LOOKS = ['golge', 'tuccar', 'kahin', 'entrikaci'] as const;
const FILES = ['castle', 'farm', 'lumberCamp', 'mine', 'forge'] as const;
/**
 * The pictures come in two sizes: "full" (one pixel per fake pixel, about twice as fine as the pack's art) and "half" (2×2 cells made one, the outline kept),
 * drawn twice as large so the sprite is as big on the screen but its pixels are as chunky as the pack's.
 */
export type Variant = 'full' | 'half';
/** Full by default (finer, closer to what the generated art looks like); `?kv=half` draws the chunky variant for comparison. */
export const VARIANT: Variant = new URLSearchParams(location.search).get('kv') === 'half' ? 'half' : 'full';
const SIZE = VARIANT === 'half' ? 2 : 1;
/** World pixels per grid pixel of the picture. */
// Whole numbers: with nearest-neighbour drawing a fractional scale makes some pixels wider than others and the picture looks blocky and uneven.
export const CASTLE_CELL = 2 * SIZE;
export const BUILD_CELL = 2 * SIZE;
const DIR = VARIANT === 'half' ? 'kingdoms-half' : 'kingdoms';
/** A building keeps its size at every level (a whole-number scale; what the level adds are the extras below). */
export const LEVEL_SCALE = [1, 1, 1, 1];

const srcKey = (look: string, name: string) => `kdsrc:${look}:${name}`;
export const kingdomKey = (look: string, name: string, color: PlayerColor) => `kd:${look}:${name}:${color}`;
export const isKingdomLook = (look: string | null | undefined): look is string => !!look && (KINGDOM_LOOKS as readonly string[]).includes(look);

export function preloadKingdomArt(scene: Phaser.Scene): void {
  for (const look of KINGDOM_LOOKS) for (const f of FILES) scene.load.image(srcKey(look, f), asset(`/art/${DIR}/${look}-${f}.png`));
}

const TEAM: Record<PlayerColor, [string, string, string]> = {
  blue: ['#2a54a0', '#3c7dd9', '#8fbcf2'], red: ['#97302a', '#d4503f', '#f08a74'], yellow: ['#a47c22', '#e0b73a', '#f6dc7c'],
  black: ['#2c3038', '#4a4f5c', '#8a90a0'], purple: ['#683a8e', '#9a58c8', '#c590ea'],
};
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Is this pixel the saturated blue of the team colour (hue 200–245°, clearly saturated)? */
function isTeamBlue(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 70 || b !== max) return false;
  const s = (max - min) / max;
  if (s < 0.42) return false;
  const h = 60 * (4 + (r - g) / (max - min)); // b is the max
  return h >= 200 && h <= 248;
}

export function recolor(src: HTMLCanvasElement, color: PlayerColor): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  if (color !== 'blue') {
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    const pal = TEAM[color].map(rgb);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3] || !isTeamBlue(d[i], d[i + 1], d[i + 2])) continue;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const t = Math.min(1, Math.max(0, (l - 40) / 150));
      const out = t < 0.5 ? mix(pal[0], pal[1], t * 2) : mix(pal[1], pal[2], (t - 0.5) * 2);
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
    }
    g.putImageData(img, 0, 0);
  }
  return c;
}

/** The (recoloured) texture of a kingdom's castle ("castle") or building (a BuildingType) in a player's colour; null if its picture is not loaded. */
export function kingdomTexture(scene: Phaser.Scene, look: string, name: string, color: PlayerColor): string | null {
  const key = kingdomKey(look, name, color);
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(srcKey(look, name))) return null;
  const img = scene.textures.get(srcKey(look, name)).getSourceImage() as HTMLImageElement;
  const base = document.createElement('canvas');
  base.width = img.width; base.height = img.height;
  base.getContext('2d')!.drawImage(img, 0, 0);
  scene.textures.addCanvas(key, recolor(base, color));
  return key;
}

// ---- the small additions that come with the levels (drawn in code on the same pixel grid, in the kingdom's palette) -------------------------------

interface Palette { accent: string; dark: string; wood: string }
const PALETTE: Record<string, Palette> = {
  golge: { accent: '#7a5cc0', dark: '#2a2140', wood: '#4a3d55' },
  tuccar: { accent: '#d8a527', dark: '#4a2c18', wood: '#a56d3c' },
  kahin: { accent: '#9edcff', dark: '#4a5068', wood: '#b8bfd2' },
  entrikaci: { accent: '#b24a4a', dark: '#2a1a1a', wood: '#6b4426' },
};
const OUT = '#1a1424';

function pix(w: number, h: number, draw: (px: (x: number, y: number, ww: number, hh: number, c: string) => void) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); });
  return c;
}

export type ExtraKind = 'banner' | 'chest' | 'fence' | 'lantern';

export function drawExtra(look: string, kind: ExtraKind): HTMLCanvasElement {
  const p = PALETTE[look];
  const BLUE = '#3c7dd9', BLUE_D = '#2a54a0';
  switch (kind) {
    case 'banner': return pix(13, 28, (px) => {
      px(2, 0, 3, 28, OUT); px(3, 1, 1, 26, p.wood);
      px(4, 2, 9, 11, OUT); px(5, 3, 7, 9, BLUE); px(5, 3, 7, 1, p.accent); px(5, 10, 7, 2, BLUE_D); px(7, 5, 3, 3, p.accent);
      px(5, 12, 2, 2, OUT); px(5, 12, 1, 1, BLUE_D);
    });
    case 'chest': return pix(15, 11, (px) => {
      px(0, 2, 15, 9, OUT); px(1, 3, 13, 7, p.wood); px(1, 3, 13, 2, p.accent); px(1, 8, 13, 2, p.dark); px(6, 2, 3, 9, p.accent); px(7, 6, 1, 2, OUT);
    });
    case 'fence': return pix(26, 11, (px) => {
      px(0, 3, 26, 2, OUT); px(0, 7, 26, 2, OUT); px(1, 4, 24, 1, p.wood); px(1, 8, 24, 1, p.wood);
      for (let x = 1; x < 26; x += 8) { px(x - 1, 0, 4, 11, OUT); px(x, 1, 2, 9, p.wood); px(x, 1, 2, 1, p.accent); }
    });
    case 'lantern': return pix(9, 20, (px) => {
      px(3, 4, 3, 16, OUT); px(4, 5, 1, 14, p.wood);
      px(1, 0, 7, 7, OUT); px(2, 1, 5, 5, p.dark); px(3, 2, 3, 3, p.accent); px(4, 3, 1, 1, '#ffffff');
    });
  }
}

/** Half the size: 2×2 pixels become one (a pixel stays when two of the four are filled, or one is dark outline), the darkest of an edge block wins. */
export function halveCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = Math.ceil(src.width / 2), h = Math.ceil(src.height / 2);
  const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!, out = g.createImageData(w, h);
  const lum = (r: number, gg: number, b: number) => 0.299 * r + 0.587 * gg + 0.114 * b;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cells: number[][] = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = x * 2 + dx, sy = y * 2 + dy;
      if (sx >= src.width || sy >= src.height) continue;
      const i = (sy * src.width + sx) * 4;
      if (d[i + 3] > 0) cells.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (!cells.length) continue;
    const dark = cells.reduce((m, q) => (lum(q[0], q[1], q[2]) < lum(m[0], m[1], m[2]) ? q : m), cells[0]);
    const outline = lum(dark[0], dark[1], dark[2]) < 70;
    if (cells.length < 2 && !outline) continue;
    const col = outline && cells.length < 4 ? dark : [0, 1, 2].map((k) => cells.reduce((a, q) => a + q[k], 0) / cells.length);
    const o = (y * w + x) * 4;
    out.data[o] = col[0]; out.data[o + 1] = col[1]; out.data[o + 2] = col[2]; out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

export function extraTexture(scene: Phaser.Scene, look: string, kind: ExtraKind, color: PlayerColor): string {
  const key = `kdx:${look}:${kind}:${color}`;
  if (!scene.textures.exists(key)) {
    const art = drawExtra(look, kind);
    scene.textures.addCanvas(key, recolor(VARIANT === 'half' ? halveCanvas(art) : art, color));
  }
  return key;
}

/** What each level adds, and where (in the main picture's own frame: x from its centre, y up from its base, as shares of its width/height). */
export const ADDITIONS: { level: number; kind: ExtraKind; x: number; y: number }[] = [
  { level: 2, kind: 'banner', x: 0.46, y: 0 },
  { level: 3, kind: 'chest', x: -0.36, y: 0.02 },
  { level: 4, kind: 'fence', x: 0.2, y: 0.01 },
  { level: 4, kind: 'lantern', x: -0.46, y: 0 },
];

export interface KingdomPart { key: string; x: number; y: number; scale: number; depthY: number; chimney?: { x: number; y: number } }

/** The sprites of a building of a kingdom at a level: the picture grown a little, and what the level adds. The site's centre (x, y) is where its feet stand. */
export function kingdomBuildingParts(scene: Phaser.Scene, look: string, type: BuildingType, level: number, color: PlayerColor, cx: number, baseY: number): KingdomPart[] {
  const key = kingdomTexture(scene, look, type, color);
  if (!key) return [];
  const tex = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const scale = BUILD_CELL * (LEVEL_SCALE[Math.min(level, 4) - 1] ?? 1);
  const w = tex.width * scale, h = tex.height * scale;
  const parts: KingdomPart[] = [{ key, x: cx, y: baseY, scale, depthY: baseY }];
  const chimney = CHIMNEYS[`${look}:${type}`];
  if (chimney) parts[0].chimney = { x: cx + (chimney[0] - 0.5) * w, y: baseY - h + chimney[1] * h };
  for (const a of ADDITIONS) {
    if (level < a.level) continue;
    parts.push({ key: extraTexture(scene, look, a.kind, color), x: cx + a.x * w, y: baseY - a.y * h, scale: BUILD_CELL, depthY: baseY + 4 });
  }
  return parts;
}

// ---- the stone of the walls and towers in each kingdom's own colour (a colour transformation of the pack's pictures) -------------------------------

/** Dark → light stops of each kingdom's stone: dark violet-grey, sandstone, white marble, red-brown. */
const STONE_RAMP: Record<string, [string, string, string, string]> = {
  golge: ['#1c1728', '#3b3150', '#6a5f86', '#a99fc2'],
  tuccar: ['#5a4020', '#a47c46', '#d9b878', '#f3e0b0'],
  kahin: ['#7a84a4', '#b3bbd2', '#e2e7f2', '#ffffff'],
  entrikaci: ['#2e1610', '#5e2f22', '#94523a', '#c98a68'],
};

function ramp(look: string, l: number): [number, number, number] {
  const stops = STONE_RAMP[look].map(rgb), t = Math.min(1, Math.max(0, l)) * 3, i = Math.min(2, Math.floor(t));
  return mix(stops[i], stops[i + 1], t - i) as [number, number, number];
}

/** A stone colour (r, g, b) of the pack's teal stone in a kingdom's stone, by its brightness (for the paving that is painted in code). */
export function stoneColor(look: string, c: number[]): [number, number, number] {
  return ramp(look, Math.pow((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255, 0.9));
}

/** A copy of a picture whose stone pixels take the kingdom's ramp by their brightness. `keepTeam`: warm pixels (a tower's wooden top) stay as they are. */
function restone(src: CanvasImageSource & { width: number; height: number }, look: string, keepTeam: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
    if (keepTeam && max > 0 && (max - min) / max > 0.3) {
      const h = max === d[i] ? 60 * (((d[i + 1] - d[i + 2]) / (max - min) + 6) % 6) : max === d[i + 1] ? 60 * ((d[i + 2] - d[i]) / (max - min) + 2) : 60 * ((d[i] - d[i + 1]) / (max - min) + 4);
      if (h < 60 || h > 340) continue; // the warm colours (the tower's wooden top, a red team's trim) stay
    }
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const out = ramp(look, Math.pow(l, 0.9));
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** The elevation sheet of the walls in a kingdom's stone (a texture with the same frames; its key is returned). */
export function stoneSheet(scene: Phaser.Scene, look: string, sheet: string, frames: [string, number, number, number, number][]): string {
  const key = `${sheet}:${look}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.addCanvas(key, restone(scene.textures.get(sheet).getSourceImage() as HTMLImageElement, look, false))!;
    for (const [name, x, y, w, h] of frames) tex.add(name, 0, x, y, w, h);
  }
  return key;
}

/** A tower picture with its stone in the kingdom's colour (its wooden top stays). */
export function stoneTower(scene: Phaser.Scene, look: string, towerKey: string): string {
  const key = `${towerKey}:${look}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, restone(scene.textures.get(towerKey).getSourceImage() as HTMLImageElement, look, true));
  return key;
}
