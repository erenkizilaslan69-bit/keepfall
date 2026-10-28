import Phaser from 'phaser';
import type { SiteKind } from '../types';

// The places of the forest as generated pictures (public/art/forest, cleaned by tools/art-ui.mjs, one pixel per cell: these are small things in a dense forest, so the fine variant). The "empty" looks are made from the same pictures in code: a plundered village is faded and sooty, a cleared camp has its fire put out
// (the flames turn to ash) and its tent fallen over, an opened chest has no gold and its lid open.

export const FOREST_FILES = ['village', 'camp', 'bigCamp', 'chest'] as const;
/** How wide each place is drawn (world px). */
export const FOREST_WIDTH: Record<SiteKind, number> = { village: 165, camp: 125, bigCamp: 235, chest: 58 };

const srcKey = (name: string) => `forest:${name}`;

export function preloadForestArt(scene: Phaser.Scene): void {
  for (const f of FOREST_FILES) scene.load.image(srcKey(f), `/art/forest/${f}.png`);
}

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [h < 0 ? h + 360 : h, mx === 0 ? 0 : d / mx, mx / 255];
}

function copy(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
  return c;
}

/** The fire's flames (bright orange and yellow) become cold ash. */
function putOutFire(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [h, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
    if (h >= 0 && h <= 62 && s > 0.5 && v > 0.62) { const a = 54 + Math.round(v * 40); d[i] = a; d[i + 1] = a - 4; d[i + 2] = a - 8; }
  }
}

function fade(d: Uint8ClampedArray, keep: number, dark: number): void {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const grey = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    for (let k = 0; k < 3; k++) d[i + k] = (grey + (d[i + k] - grey) * keep) * dark;
  }
}

function emptyChest(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [h, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
    if (h >= 36 && h <= 62 && s > 0.45 && v > 0.65) d[i + 3] = 0; // the gold
  }
  fade(d, 0.7, 0.95);
  g.putImageData(img, 0, 0);
  // The lid stands open: the dark inside shows in the top of the chest.
  const x0 = Math.round(c.width * 0.3), x1 = Math.round(c.width * 0.72), y0 = Math.round(c.height * 0.2);
  g.fillStyle = '#1a1424'; g.fillRect(x0, y0 + 2, x1 - x0, Math.round(c.height * 0.2));
  g.fillStyle = '#4a2c18'; g.fillRect(x0, y0 - 1, x1 - x0, 3);
  g.fillStyle = '#2c2030'; g.fillRect(x0 + 2, y0 + 4, x1 - x0 - 4, 2);
  return c;
}

/** The texture of a place, full or emptied; made once from the loaded picture. */
export function forestTexture(scene: Phaser.Scene, kind: SiteKind, gone: boolean): string | null {
  const name = kind;
  if (!scene.textures.exists(srcKey(name))) return null;
  if (!gone) return srcKey(name);
  const key = `${srcKey(name)}:empty`;
  if (scene.textures.exists(key)) return key;
  let c = copy(scene.textures.get(srcKey(name)).getSourceImage() as HTMLImageElement);
  if (kind === 'chest') c = emptyChest(c);
  else {
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const img = g.getImageData(0, 0, c.width, c.height);
    if (kind !== 'village') putOutFire(img.data);
    fade(img.data, kind === 'village' ? 0.55 : 0.6, kind === 'village' ? 0.78 : 0.82);
    g.putImageData(img, 0, 0);
    if (kind === 'camp') {
      // The tent has fallen over: the whole picture squashed and leaning on its base.
      const f = document.createElement('canvas');
      f.width = c.width + 8; f.height = c.height;
      const fg = f.getContext('2d')!;
      fg.imageSmoothingEnabled = false;
      fg.translate(f.width / 2, f.height);
      fg.rotate(-0.1);
      fg.scale(1, 0.68);
      fg.drawImage(c, -c.width / 2, -c.height);
      c = f;
    }
  }
  scene.textures.addCanvas(key, c);
  return key;
}
