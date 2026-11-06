import Phaser from 'phaser';
import { emblemCanvas } from '../ui/tiny-ui';

// Our own kingdom's banner, hung by our castle's gate: a pole with a gilded top and a crossbar with brass knobs, and under the bar a cloth in the kingdom's
// colour with a gold border, folds, a swallow-tail with tassels and the kingdom's emblem. The cloth is its own picture so that it can sway in the wind.
// Drawn in code at load time. Only our own castle has one: the kingdom is secret, a rival's castle never shows it.

/** The cloth colours of each kingdom: field, a lighter fold, a darker shade. */
const CLOTH: Record<string, [string, string, string]> = {
  golge: ['#5a3a8a', '#7552ad', '#3f2766'],
  tuccar: ['#c8861c', '#e3a53a', '#966110'],
  kahin: ['#2c6e98', '#4691bf', '#1e4d6c'],
  entrikaci: ['#a02d2d', '#c64747', '#701e1e'],
};
const OUTLINE = '#241a14', GOLD = '#f0c84a', GOLD_DARK = '#a77d1d', WOOD = '#8a5a34', WOOD_LIGHT = '#b07a48';

export interface BannerKeys { pole: string; cloth: string }

/** The texture keys of a kingdom's banner (made once), or null for an unknown kingdom. */
export function kingdomBanner(scene: Phaser.Scene, id: string): BannerKeys | null {
  const pole = `kf-banner-pole`, cloth = `kf-banner-cloth-${id}`;
  const emblem = emblemCanvas(id, 2);
  if (!emblem) return null;
  if (!scene.textures.exists(pole)) {
    const c = document.createElement('canvas');
    c.width = 56; c.height = 120;
    const g = c.getContext('2d')!;
    const R = (color: string, x: number, y: number, w: number, h: number) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    R(OUTLINE, 25, 10, 6, 110); R(WOOD, 26, 10, 4, 110); R(WOOD_LIGHT, 26, 10, 1, 110);   // the pole
    R(OUTLINE, 23, 0, 10, 10); R(GOLD_DARK, 24, 1, 8, 8); R(GOLD, 25, 2, 5, 5); R('#fff2b0', 26, 3, 2, 2); // the gilded top
    R(OUTLINE, 3, 12, 50, 6); R(WOOD, 4, 13, 48, 4); R(WOOD_LIGHT, 4, 13, 48, 1);          // the crossbar
    for (const x of [0, 50]) { R(OUTLINE, x, 10, 6, 10); R(GOLD_DARK, x + 1, 11, 4, 8); R(GOLD, x + 1, 11, 3, 5); } // brass knobs
    scene.textures.addCanvas(pole, c);
  }
  if (!scene.textures.exists(cloth)) {
    const [field, light, dark] = CLOTH[id] ?? CLOTH.tuccar;
    const c = document.createElement('canvas');
    c.width = 44; c.height = 78;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const R = (color: string, x: number, y: number, w: number, h: number) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    // the body: rows to y=58, then a swallow-tail (two points) down to y=74
    const body = (color: string, inset: number, tail: number) => {
      R(color, inset, 0, 44 - inset * 2, 56);
      for (let k = 0; k < tail; k++) { // left point and right point, a notch between
        const w = Math.max(2, 17 - k - inset), y = 56 + k;
        R(color, inset, y, Math.max(0, w - inset + 2), 1);
        R(color, 44 - inset - Math.max(0, w - inset + 2), y, Math.max(0, w - inset + 2), 1);
      }
    };
    body(OUTLINE, 0, 20);
    body(GOLD_DARK, 1, 19);
    body(GOLD, 2, 18);
    body(OUTLINE, 3, 17);
    body(field, 4, 16);
    R(light, 8, 2, 6, 54); R(light, 28, 2, 4, 54);                      // folds: lighter stripes
    R(dark, 14, 2, 4, 54); R(dark, 34, 2, 3, 54);                        // and shades beside them
    R(dark, 4, 50, 36, 6);                                               // a shade at the foot
    g.globalAlpha = 0.5; R('#ffffff', 6, 3, 32, 1); g.globalAlpha = 1;  // the light on the top edge
    // the emblem on a small gold-edged plate
    R(OUTLINE, 6, 10, 32, 32); R(GOLD, 7, 11, 30, 30); R(OUTLINE, 8, 12, 28, 28); R('#efe3c2', 9, 13, 26, 26);
    g.drawImage(emblem, 10, 14);
    // tassels at the two points
    for (const x of [5, 36]) { R(OUTLINE, x, 70, 3, 6); R(GOLD, x + 1, 71, 1, 4); }
    scene.textures.addCanvas(cloth, c);
  }
  return { pole, cloth };
}
