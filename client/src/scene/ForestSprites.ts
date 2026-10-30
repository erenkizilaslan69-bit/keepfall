import Phaser from 'phaser';
import type { SiteKind } from '../types';

// The places of the forest as generated pictures (public/art/forest, cleaned by tools/art-ui.mjs, one pixel per cell: these are small things in a dense forest, so the fine variant). The "empty" looks are made from the same pictures in code: a plundered village is faded and sooty, a cleared camp has its fire put out
// (the flames turn to ash) and its tent fallen over, an opened chest has no gold and its lid open.

export const FOREST_FILES = ['village', 'camp', 'bigCamp', 'chest'] as const;
/** How wide each place is drawn (world px): a whole multiple of its picture's width, so every pixel is drawn the same size. */
export const FOREST_WIDTH: Record<SiteKind, number> = { village: 166, camp: 156, bigCamp: 258, chest: 76 }; // whole-number scales (x2, x2, x3, x2) of the pictures

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

/** Soot: a share of the picture's pixels turn charcoal (a fixed pattern, so the same place always looks the same). */
function soot(d: Uint8ClampedArray, w: number, share: number): void {
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    if (!d[i + 3]) continue;
    if (((n * 2654435761) >>> 7) % 100 < share * 100) { d[i] = 38; d[i + 1] = 34; d[i + 2] = 36; }
  }
  void w;
}

/** The smoke of the fire (pale, nearly colourless pixels) is gone. */
function clearSmoke(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
    if (s < 0.16 && v > 0.58) d[i + 3] = 0;
  }
}

/** Roofs, thatch and hay (brown and orange) are burnt black, with a few embers left. */
function char(d: Uint8ClampedArray): void {
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    if (!d[i + 3]) continue;
    const [h, s, v] = hsv(d[i], d[i + 1], d[i + 2]);
    if (h >= 12 && h <= 58 && s > 0.2 && v > 0.36) {
      const k = 0.3 + ((n * 40503) % 17) / 100;
      const grey = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) * k;
      const ember = ((n * 2246822519) >>> 9) % 100 < 3;
      d[i] = ember ? 150 : grey; d[i + 1] = ember ? 52 : grey * 0.95; d[i + 2] = ember ? 22 : grey * 0.92;
    }
  }
}

/** Two flags lying on the ground (a pole and a torn cloth), in front of a ruined camp. */
function fallenFlags(c: HTMLCanvasElement): void {
  const g = c.getContext('2d')!;
  const put = (x: number, y: number, dir: number) => {
    g.fillStyle = '#1a1424'; g.fillRect(x, y, 16 * dir, 3);
    g.fillStyle = '#5a3a22'; g.fillRect(x, y + 1, 16 * dir, 1);
    g.fillStyle = '#1a1424'; g.fillRect(x + 4 * dir, y + 3, 9 * dir, 6);
    g.fillStyle = '#6a1f2a'; g.fillRect(x + 5 * dir, y + 4, 7 * dir, 4);
  };
  put(Math.round(c.width * 0.2), c.height - 9, 1);
  put(Math.round(c.width * 0.78), c.height - 6, -1);
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
    if (kind === 'village') {
      char(img.data);
      fade(img.data, 0.35, 0.8);
      soot(img.data, c.width, 0.07);
    } else {
      putOutFire(img.data);
      clearSmoke(img.data);
      fade(img.data, 0.18, 0.78); // nearly grey
      soot(img.data, c.width, 0.09);
    }
    g.putImageData(img, 0, 0);
    if (kind !== 'village') {
      // The tents have fallen over: the whole picture squashed and leaning, flags lying in front.
      const f = document.createElement('canvas');
      f.width = c.width + 8; f.height = c.height;
      const fg = f.getContext('2d')!;
      fg.imageSmoothingEnabled = false;
      fg.translate(f.width / 2, f.height);
      fg.rotate(kind === 'camp' ? -0.12 : -0.05);
      fg.scale(1, kind === 'camp' ? 0.62 : 0.58);
      fg.drawImage(c, -c.width / 2, -c.height);
      fallenFlags(f);
      c = f;
    }
  }
  scene.textures.addCanvas(key, c);
  return key;
}
