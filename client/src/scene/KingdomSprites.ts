import Phaser from 'phaser';
import type { BuildingType, PlayerColor } from '../types';

// The kingdoms' own castles and buildings: pictures in client/public/art/kingdoms (cleaned from the generated art by tools/art-clean.mjs: one pixel per
// fake pixel, a limited palette, transparent background), drawn one grid pixel at CASTLE_CELL / BUILD_CELL world pixels. Only the saturated blue of
// a picture (the roofs, banners and trim) takes the player's colour; the pale bluish stones (the Oracle's marble) stay as they are.
// A rival's castle and buildings look like this only while the server names their kingdom to us (their castle in live sight, or a scout report);
// every client loads all of these files whoever holds which kingdom, so loading them says nothing.

export const KINGDOM_LOOKS = ['golge', 'tuccar', 'kahin', 'entrikaci'] as const;
const FILES = ['castle', 'farm', 'lumberCamp', 'mine', 'forge'] as const;
/** World pixels per grid pixel of the picture. */
export const CASTLE_CELL = 2.2;
export const BUILD_CELL = 1.9;
/** A building grows a little with each level. */
export const LEVEL_SCALE = [1, 1.06, 1.12, 1.19];

const srcKey = (look: string, name: string) => `kdsrc:${look}:${name}`;
export const kingdomKey = (look: string, name: string, color: PlayerColor) => `kd:${look}:${name}:${color}`;
export const isKingdomLook = (look: string | null | undefined): look is string => !!look && (KINGDOM_LOOKS as readonly string[]).includes(look);

export function preloadKingdomArt(scene: Phaser.Scene): void {
  for (const look of KINGDOM_LOOKS) for (const f of FILES) scene.load.image(srcKey(look, f), `/art/kingdoms/${look}-${f}.png`);
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

export function extraTexture(scene: Phaser.Scene, look: string, kind: ExtraKind, color: PlayerColor): string {
  const key = `kdx:${look}:${kind}:${color}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, recolor(drawExtra(look, kind), color));
  return key;
}

/** What each level adds, and where (in the main picture's own frame: x from its centre, y up from its base, as shares of its width/height). */
export const ADDITIONS: { level: number; kind: ExtraKind; x: number; y: number }[] = [
  { level: 2, kind: 'banner', x: 0.46, y: 0 },
  { level: 3, kind: 'chest', x: -0.36, y: 0.02 },
  { level: 4, kind: 'fence', x: 0.2, y: 0.01 },
  { level: 4, kind: 'lantern', x: -0.46, y: 0 },
];

export interface KingdomPart { key: string; x: number; y: number; scale: number; depthY: number }

/** The sprites of a building of a kingdom at a level: the picture grown a little, and what the level adds. The site's centre (x, y) is where its feet stand. */
export function kingdomBuildingParts(scene: Phaser.Scene, look: string, type: BuildingType, level: number, color: PlayerColor, cx: number, baseY: number): KingdomPart[] {
  const key = kingdomTexture(scene, look, type, color);
  if (!key) return [];
  const tex = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const scale = BUILD_CELL * (LEVEL_SCALE[Math.min(level, 4) - 1] ?? 1);
  const w = tex.width * scale, h = tex.height * scale;
  const parts: KingdomPart[] = [{ key, x: cx, y: baseY, scale, depthY: baseY }];
  for (const a of ADDITIONS) {
    if (level < a.level) continue;
    parts.push({ key: extraTexture(scene, look, a.kind, color), x: cx + a.x * w, y: baseY - a.y * h, scale: BUILD_CELL, depthY: baseY + 4 });
  }
  return parts;
}
