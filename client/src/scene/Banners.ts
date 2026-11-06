import Phaser from 'phaser';
import { emblemCanvas } from '../ui/tiny-ui';

// Our own kingdom's banner, hung by our castle's gate: a pole with a top ornament and a crossbar, and under the bar a cloth in the kingdom's colour with
// the kingdom's emblem. Each kingdom has a few designs (a, b, c); CHOICE says which one the game hangs. The cloth is its own picture so that it can sway.
// Drawn in code at load time. Only our own castle has one: the kingdom is secret, a rival's castle never shows it.

/** The cloth colours of each kingdom: field, a lighter fold, a darker shade. */
const CLOTH: Record<string, [string, string, string]> = {
  golge: ['#5a3a8a', '#7552ad', '#3f2766'],
  tuccar: ['#c8861c', '#e3a53a', '#966110'],
  kahin: ['#2c6e98', '#4691bf', '#1e4d6c'],
  entrikaci: ['#a02d2d', '#c64747', '#701e1e'],
};
const OUTLINE = '#241a14', GOLD = '#f0c84a', GOLD_DARK = '#a77d1d', SILVER = '#d8dde6', SILVER_DARK = '#8a93a3', WOOD = '#8a5a34', WOOD_LIGHT = '#b07a48';
const W = 44, H = 78, FIELD_INSET = 4;

interface Spec {
  /** Where the cloth ends at column x (px from the top). */
  bot: (x: number) => number;
  border: 'gold' | 'silver' | 'none';
  pole: 'ball' | 'spear' | 'moon' | 'diamond';
  plate: 'square' | 'round' | 'none';
  stripes: 'folds' | 'bands' | 'diag' | 'none';
  trim: 'tassels' | 'coins' | 'none';
}

const tri = (x: number): number => 1 - Math.abs(x - (W - 1) / 2) / ((W - 1) / 2); // 0 at the sides, 1 in the middle
const RAGGED = [0, 3, 1, 5, 2, 7, 3, 1, 6, 2, 8, 4, 1, 5, 3, 9, 2, 6, 4, 1, 7, 3, 3, 7, 1, 4, 6, 2, 9, 3, 5, 1, 4, 8, 2, 6, 1, 3, 7, 2, 5, 1, 3, 0];

/** The designs: per kingdom three, a to c. */
export const DESIGNS: Record<string, Record<string, Spec>> = {
  golge: {
    a: { bot: (x) => 64 + RAGGED[x] * 0.9, border: 'silver', pole: 'moon', plate: 'round', stripes: 'folds', trim: 'none' },       // torn, wispy
    b: { bot: (x) => 54 + tri(x) * 22, border: 'silver', pole: 'spear', plate: 'square', stripes: 'none', trim: 'none' },          // a pointed pennant
    c: { bot: (x) => 58 + (x % 11 < 5.5 ? x % 11 : 11 - (x % 11)) * 1.6, border: 'none', pole: 'diamond', plate: 'round', stripes: 'diag', trim: 'none' }, // jagged hem
  },
  tuccar: {
    a: { bot: (x) => 62 + 6 * Math.abs(Math.sin((Math.PI * x) / 14.67)), border: 'gold', pole: 'ball', plate: 'square', stripes: 'bands', trim: 'coins' }, // scalloped, coin fringe
    b: { bot: () => 62, border: 'gold', pole: 'ball', plate: 'round', stripes: 'folds', trim: 'tassels' },                          // a plain tapestry with tassels
    c: { bot: (x) => 52 + 22 * Math.sqrt(Math.max(0, 1 - ((x - 21.5) / 22) ** 2)), border: 'gold', pole: 'diamond', plate: 'round', stripes: 'bands', trim: 'none' }, // a rounded shield shape
  },
  kahin: {
    a: { bot: (x) => 56 + tri(x) * 20, border: 'silver', pole: 'moon', plate: 'round', stripes: 'folds', trim: 'none' },           // a pointed pennant under a moon
    b: { bot: (x) => 58 + (x < 22 ? 14 - x * 0.64 : (x - 22) * 0.64), border: 'gold', pole: 'diamond', plate: 'square', stripes: 'none', trim: 'none' }, // a long swept streamer
    c: { bot: (x) => 60 + 10 * Math.abs(Math.sin((Math.PI * x) / 22)), border: 'silver', pole: 'spear', plate: 'round', stripes: 'bands', trim: 'tassels' },
  },
  entrikaci: {
    a: { bot: (x) => 54 + Math.abs(x - 21.5) / 21.5 * 18, border: 'gold', pole: 'spear', plate: 'square', stripes: 'folds', trim: 'tassels' }, // swallow-tail
    b: { bot: (x) => 60 + (x % 8 < 4 ? x % 8 : 8 - (x % 8)) * 2.6, border: 'none', pole: 'spear', plate: 'round', stripes: 'diag', trim: 'none' }, // a split two-tone with a saw hem
    c: { bot: (x) => 58 + Math.abs(x - 21.5) / 21.5 * 14, border: 'silver', pole: 'diamond', plate: 'square', stripes: 'bands', trim: 'coins' },
  },
};

/** The design the game hangs for each kingdom (the player's pick). */
const CHOICE: Record<string, string> = { golge: 'a', tuccar: 'a', kahin: 'a', entrikaci: 'a' };

function make(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D, (color: string, x: number, y: number, w: number, h: number) => void] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g, (color, x, y, ww, hh) => { g.fillStyle = color; g.fillRect(x, y, ww, hh); }];
}

/** The pole picture: shaft, top ornament, crossbar with knobs. 56x120. */
export function poleCanvas(style: Spec['pole']): HTMLCanvasElement {
  const [c, g, R] = make(56, 120);
  R(OUTLINE, 25, 10, 6, 110); R(WOOD, 26, 10, 4, 110); R(WOOD_LIGHT, 26, 10, 1, 110);
  const disc = (cx: number, cy: number, r: number, color: string) => {
    g.fillStyle = color;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) g.fillRect(cx + x, cy + y, 1, 1);
  };
  if (style === 'ball') {
    R(OUTLINE, 23, 0, 10, 10); R(GOLD_DARK, 24, 1, 8, 8); R(GOLD, 25, 2, 5, 5); R('#fff2b0', 26, 3, 2, 2);
  } else if (style === 'spear') {
    for (let y = 0; y < 10; y++) { const half = Math.max(1, Math.floor(y / 2)); R(OUTLINE, 28 - half - 1, y, half * 2 + 2, 1); R(y < 3 ? SILVER : SILVER_DARK, 28 - half, y, half * 2, 1); }
    R('#ffffff', 27, 1, 1, 6);
  } else if (style === 'moon') {
    disc(27, 5, 5, OUTLINE); disc(27, 5, 4, GOLD); disc(26, 3, 1, '#fff2b0');
    g.globalCompositeOperation = 'destination-out'; disc(30, 4, 4, '#000000'); g.globalCompositeOperation = 'source-over'; // a crescent: bite out of the disc
    R(OUTLINE, 29, 8, 2, 2);
  } else { // diamond
    for (let y = 0; y < 10; y++) { const half = y < 5 ? y : 9 - y; R(OUTLINE, 27 - half, y, half * 2 + 2, 1); if (half > 0) R(y < 5 ? GOLD : GOLD_DARK, 28 - half, y, half * 2, 1); }
    R('#fff2b0', 27, 2, 1, 2);
  }
  R(OUTLINE, 3, 12, 50, 6); R(WOOD, 4, 13, 48, 4); R(WOOD_LIGHT, 4, 13, 48, 1);          // the crossbar
  for (const x of [0, 50]) { R(OUTLINE, x, 10, 6, 10); R(GOLD_DARK, x + 1, 11, 4, 8); R(GOLD, x + 1, 11, 3, 5); } // brass knobs
  return c;
}

/** The cloth picture of a design. 44x78. */
export function clothCanvas(id: string, design: string): HTMLCanvasElement | null {
  const spec = DESIGNS[id]?.[design];
  const emblem = emblemCanvas(id, 2);
  if (!spec || !emblem) return null;
  const [field, light, dark] = CLOTH[id] ?? CLOTH.tuccar;
  const [c, g, R] = make(W, H);
  const bot = (x: number) => Math.min(H - 1, Math.round(spec.bot(x)));
  /** Fills the columns from x0..x1 and rows y0..y1, but never below the cloth's edge less `inset`. */
  const paint = (color: string, x0: number, x1: number, y0: number, y1: number, inset: number) => {
    g.fillStyle = color;
    for (let x = Math.max(x0, inset); x <= Math.min(x1, W - 1 - inset); x++) { const yb = Math.min(y1, bot(x) - inset); if (yb >= y0) g.fillRect(x, y0, 1, yb - y0 + 1); }
  };
  const layer = (color: string, inset: number) => paint(color, 0, W - 1, inset, 1000, inset);
  const [edge, edgeDark] = spec.border === 'silver' ? [SILVER, SILVER_DARK] : [GOLD, GOLD_DARK];
  let fieldInset: number;
  layer(OUTLINE, 0);
  if (spec.border === 'none') { layer(dark, 1); fieldInset = 2; }
  else { layer(edgeDark, 1); layer(edge, 2); layer(OUTLINE, 3); fieldInset = FIELD_INSET; }
  layer(field, fieldInset);
  const f = fieldInset;
  if (spec.stripes === 'folds') {
    paint(light, 8, 13, f, 1000, f); paint(light, 28, 31, f, 1000, f);
    paint(dark, 14, 17, f, 1000, f); paint(dark, 34, 36, f, 1000, f);
  } else if (spec.stripes === 'bands') {
    for (const y of [46, 52]) paint(dark, 0, W, y, y + 2, f);
    for (const y of [47, 53]) paint(light, 0, W, y, y, f);
    paint(light, 0, W, 4, 4, f);
  } else if (spec.stripes === 'diag') {
    g.fillStyle = dark;
    for (let x = f; x < W - f; x++) for (let y = f; y <= bot(x) - f; y++) if (y - x * 1.15 > 8) g.fillRect(x, y, 1, 1);
    g.fillStyle = light;
    for (let x = f; x < W - f; x++) { const y = Math.round(x * 1.15 + 8); if (y >= f && y <= bot(x) - f) g.fillRect(x, y, 1, 1); }
  }
  g.globalAlpha = 0.45; R('#ffffff', f + 1, f, W - f * 2 - 2, 1); g.globalAlpha = 1;       // the light on the top edge
  // the emblem, on a plate
  if (spec.plate === 'square') { R(OUTLINE, 6, 10, 32, 32); R(edge, 7, 11, 30, 30); R(OUTLINE, 8, 12, 28, 28); R('#efe3c2', 9, 13, 26, 26); }
  else if (spec.plate === 'round') {
    const ring = (r: number, color: string) => { g.fillStyle = color; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) g.fillRect(22 + x, 26 + y, 1, 1); };
    ring(17, OUTLINE); ring(16, edge); ring(14, OUTLINE); ring(13, '#efe3c2');
  }
  g.drawImage(emblem, 10, 14);
  // the hem trimmings
  if (spec.trim === 'tassels') {
    for (const x of [6, 21, 36]) { const y = bot(x) - 1; if (y < H - 7) { R(OUTLINE, x - 1, y, 4, 7); R(edge, x, y + 1, 2, 5); } }
  } else if (spec.trim === 'coins') {
    for (let x = 4; x < W - 3; x += 7) { const y = bot(x); if (y < H - 5) { R(OUTLINE, x - 1, y, 5, 5); R(GOLD, x, y + 1, 3, 3); R('#fff2b0', x, y + 1, 1, 1); } }
  }
  return c;
}

export interface BannerKeys { pole: string; cloth: string }

/** The texture keys of a kingdom's banner (made once), or null for an unknown kingdom. */
export function kingdomBanner(scene: Phaser.Scene, id: string): BannerKeys | null {
  const design = CHOICE[id] ?? 'a';
  const spec = DESIGNS[id]?.[design];
  if (!spec) return null;
  const pole = `kf-banner-pole-${spec.pole}`, cloth = `kf-banner-cloth-${id}-${design}`;
  if (!scene.textures.exists(pole)) scene.textures.addCanvas(pole, poleCanvas(spec.pole));
  if (!scene.textures.exists(cloth)) {
    const c = clothCanvas(id, design);
    if (!c) return null;
    scene.textures.addCanvas(cloth, c);
  }
  return { pole, cloth };
}
