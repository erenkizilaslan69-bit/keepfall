import { asset } from '../env';
import { flameCanvas } from '../scene/PixelArt';
import type { PlayerColor } from '../types';

// The interface art, built at start-up from the Tiny Swords packs (nothing derived from them is written to disk or into the repository):
//  - the paper, the dark special paper and the wooden table are cut into 9-slice pictures for CSS `border-image` (--kf-paper-9, --kf-special-9, --kf-wood-9);
//  - the pack's icons come as custom properties (--kfi-…); the ones the pack has no icon for (iron, people, hourglass, heart, scout, envoy, skull, chest,
//    crown) and the four kingdom emblems are drawn from small character grids in the pack's outline-and-three-tones style;
//  - the end screen's victory and defeat pictures are composed from the player's castle and the lord (see endArt).
// If the packs are missing (they are not in the repository) the CSS falls back to its own drawn frames and the icons stay empty.

const UI = asset('/assets/tiny-swords/Tiny Swords (Free Pack)/UI Elements/UI Elements/');
const BUILDINGS = asset('/assets/tiny-swords/Tiny Swords (Free Pack)/Buildings/');
const KING = asset('/assets/Warfare_001/Warfare/King/King Animations/');
const FOLDER: Record<PlayerColor, string> = { blue: 'Blue', red: 'Red', yellow: 'Yellow', purple: 'Purple', black: 'Black' };

const cache = new Map<string, Promise<HTMLImageElement | null>>();
export function load(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = encodeURI(url);
    });
    cache.set(url, p);
  }
  return p;
}

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
};

/** Cuts the nine pieces of a sheet (columns xs/widths, rows ys/heights) and lays them side by side in one picture. */
function nineSlice(img: HTMLImageElement, xs: number[], ws: number[], ys: number[], hs: number[]): string {
  const W = ws.reduce((a, b) => a + b, 0), H = hs.reduce((a, b) => a + b, 0);
  const [c, g] = canvas(W, H);
  let dy = 0;
  for (let j = 0; j < 3; j++) {
    let dx = 0;
    for (let i = 0; i < 3; i++) { g.drawImage(img, xs[i], ys[j], ws[i], hs[j], dx, dy, ws[i], hs[j]); dx += ws[i]; }
    dy += hs[j];
  }
  return c.toDataURL('image/png');
}

// ---- icons and emblems drawn from grids -------------------------------------------------------------------------------------------

type Grid = { rows: string[]; palette: Record<string, string> };
const O = '#241a14';

function drawGrid({ rows, palette }: Grid, cell = 5, size = 64): string {
  const w = Math.max(...rows.map((r) => r.length));
  const [c, g] = canvas(size, size);
  const ox = Math.floor((size - w * cell) / 2), oy = Math.floor((size - rows.length * cell) / 2);
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const color = palette[ch];
    if (color) { g.fillStyle = color; g.fillRect(ox + i * cell, oy + j * cell, cell, cell); }
  }));
  return c.toDataURL('image/png');
}

const ICON_GRIDS: Record<string, Grid> = {
  iron: { palette: { o: O, l: '#dfe6ee', m: '#a5b2c0', d: '#6c7a8c' }, rows: [
    '............', '............', '....oooooo..', '...ollllmo..', '..ommmmmmdo.', '.oooooooooo.', 'ollllmoollmo', 'ommmmddommdo', 'oooooooooooo'] },
  people: { palette: { o: O, t: '#f0c9a0', h: '#8a5a34', u: '#3f78c4', v: '#2a4f8e' }, rows: [
    '...oooooo...', '..ohhhhhho..', '..ottttttto.'.slice(0, 12), '..otttttto..', '...oooooo...', '.oooooooooo.', 'ouuuuuuuuuvo', 'ouuuuuuuuvvo', 'oooooooooooo'] },
  hourglass: { palette: { o: O, m: '#9d6a3b', d: '#744827', w: '#e9f2f4', y: '#f0c35a' }, rows: [
    'oooooooooooo', 'ommmmmmmmmdo', '.owwyyyywwo.', '..owyyyywo..', '...owyywo...', '....owwo....', '....owwo....', '...owwywo...', '..owwyyywo..', '.owyyyyyywo.', 'ommmmmmmmmdo', 'oooooooooooo'] },
  heart: { palette: { o: O, r: '#d9453d', l: '#ff8f7a', d: '#8c2a2e' }, rows: [
    '..oo....oo..', '.orro..orro.', 'orlrrooorrro', 'orlrrrrrrrro', 'orrrrrrrrrdo', '.orrrrrrrdo.', '..orrrrrdo..', '...orrrdo...', '....ordo....', '.....oo.....'] },
  scout: { palette: { o: O, w: '#f4ecd2', u: '#4a8fd0' }, rows: [
    '..oooooooo..', '.owwwwwwwwo.', 'owwwuuuuwwwo', 'owwuuooouwwo', 'owwuuooouwwo', 'owwwuuuuwwwo', '.owwwwwwwwo.', '..oooooooo..'] },
  envoy: { palette: { o: O, w: '#f4ecd2', r: '#d9453d', s: '#cbbf98' }, rows: [
    'oooooooooooo', 'owowwwwwwowo', 'owwowwwwowwo', 'owwwowwowwwo', 'owwwwooowwwo', 'owwwwwrwwwwo', 'osssssssssso', 'oooooooooooo'] },
  skull: { palette: { o: O, w: '#eee6d2', s: '#bfb59a' }, rows: [
    '..oooooooo..', '.owwwwwwwwo.', 'owwwwwwwwwwo', 'owooowwooowo', 'owooowwooowo', 'owwwwooowwwo', '.owwwwwwwwso', '..owowowowo.', '..oooooooo..'] },
  crown: { palette: { o: O, y: '#f6c945', d: '#b98a1e', r: '#d9453d', g: '#4ac36a' }, rows: [
    'o....oo....o', 'oo..oyyo..oo', 'oyoooyyoooyo', 'oyyyyyyyyyyo', 'oyyryyyyryyo', 'oyyyyyyyyydo', 'oyygyyyygyyo', 'oddddddddddo', 'oooooooooooo'] },
  chest: { palette: { o: O, l: '#c58f56', m: '#9d6a3b', d: '#744827', b: '#7d8896', g: '#ffd34a' }, rows: [
    '.oooooooooo.', 'ollllllllllo', 'olmmmmmmmmdo', 'obbbbbbbbbbo', 'olmmmggmmmdo', 'olmmmggmmmdo', 'olmmmmmmmmdo', 'oddddddddddo', '.oooooooooo.'] },
};

const SHIELD = [
  'oooooooooooo', 'olssssssssdo', 'olssssssssdo', 'olssssssssdo', 'olssssssssdo', 'olssssssssdo', 'olssssssssdo',
  '.olssssssdo.', '.olssssssdo.', '..olssssdo..', '..olssssdo..', '...olssdo...', '....oddo....', '.....oo.....',
];
/** A 6-wide symbol in the shield's upper middle: w light, k dark. */
const SYMBOLS: Record<string, string[]> = {
  golge: ['wwwwww', 'wkwwkw', 'wwwwww', 'wwkkww', 'wkwwkw'],
  tuccar: ['.wwww.', 'wwkwww', 'wkkkww', 'wwwkww', 'wwkkww', '.wwww.'],
  kahin: ['.wwww.', 'wkkkkw', 'wkwwkw', 'wkkkkw', '.wwww.'],
  entrikaci: ['..ww..', '..ww..', '..ww..', 'wwwwww', '..kk..', '..kk..'],
};
const SHIELD_COLORS: Record<string, { s: string; d: string; l: string }> = {
  golge: { s: '#5b3f8c', d: '#3b2a5c', l: '#8b6cc0' },
  tuccar: { s: '#d9a031', d: '#9b6f1c', l: '#f4cf6a' },
  kahin: { s: '#2f7d8c', d: '#1e5560', l: '#5fb4c4' },
  entrikaci: { s: '#a8362f', d: '#6e211e', l: '#d9685c' },
};
function emblemGrid(id: string): Grid {
  const rows = SHIELD.map((r) => [...r]);
  SYMBOLS[id].forEach((sym, j) => [...sym].forEach((ch, i) => { if (ch !== '.') rows[3 + j][3 + i] = ch; }));
  const c = SHIELD_COLORS[id];
  return { rows: rows.map((r) => r.join('')), palette: { o: O, s: c.s, d: c.d, l: c.l, w: '#f6efd6', k: '#241a14' } };
}

let ready: Promise<void> | null = null;

/** Builds the 9-slices, icons and emblems and hands them to CSS; resolves when done (also when the packs are missing). */
export function buildTinyUi(): Promise<void> {
  ready ??= (async () => {
    const root = document.documentElement.style;
    const set = (name: string, url: string) => root.setProperty(name, `url("${url}")`);
    try {
      for (const [name, grid] of Object.entries(ICON_GRIDS)) set(`--kfi-${name}`, drawGrid(grid));
      for (const id of Object.keys(SYMBOLS)) set(`--kfe-${id}`, drawGrid(emblemGrid(id), 4, 56));
      const [paper, special, wood] = await Promise.all([load(`${UI}Papers/RegularPaper.png`), load(`${UI}Papers/SpecialPaper.png`), load(`${UI}Wood Table/WoodTable.png`)]);
      if (paper) set('--kf-paper-9', nineSlice(paper, [0, 128, 256], [64, 64, 64], [0, 128, 256], [64, 64, 64]));
      if (special) set('--kf-special-9', nineSlice(special, [0, 128, 256], [64, 64, 64], [0, 128, 256], [64, 64, 64]));
      if (wood) set('--kf-wood-9', nineSlice(wood, [0, 192, 320], [128, 64, 128], [0, 192, 320], [128, 64, 128]));
      document.documentElement.classList.toggle('kf-tiny-frames', !!(paper && special && wood));
    } catch (e) {
      console.warn('Tiny Swords arayüz parçaları kurulamadı.', e);
    }
  })();
  return ready;
}

// ---- the end screen's pictures ---------------------------------------------------------------------------------------------------

/**
 * The victory picture (the winner's castle with its lord at the gate, a flag on each tower) or the defeat picture (the castle grey and burning, the
 * lord fallen), in the player's colour; null when the packs are missing.
 */
export async function endArt(won: boolean, color: PlayerColor): Promise<string | null> {
  const folder = FOLDER[color];
  const [castle, king] = await Promise.all([load(`${BUILDINGS}${folder} Buildings/Castle.png`), load(`${KING}King_${folder}/King_Idle_${folder}.png`)]);
  if (!castle) return null;
  const [c, g] = canvas(360, 300);
  // the ground under it: a patch of earth
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(180, 270, 150, 26, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9a56b'; g.beginPath(); g.ellipse(180, 262, 140, 22, 0, 0, Math.PI * 2); g.fill();
  if (!won) g.filter = 'grayscale(0.85) brightness(0.7)';
  g.drawImage(castle, 20, 12);
  g.filter = 'none';
  if (king) {
    g.save();
    if (won) g.drawImage(king, 0, 0, 192, 192, 128, 112, 192, 192);
    else { g.translate(250, 262); g.rotate(Math.PI / 2 - 0.1); g.globalAlpha = 0.85; g.drawImage(king, 0, 0, 192, 192, -96, -134, 192, 192); }
    g.restore();
  }
  if (won) {
    // two little flags (a pole, a cloth in the player's colour) and sparkles
    const cloth: Record<PlayerColor, string> = { blue: '#3f78c4', red: '#d4503f', yellow: '#e0b73a', purple: '#9a58c8', black: '#4a4f5c' };
    for (const x of [64, 296]) {
      g.fillStyle = O; g.fillRect(x, 70, 4, 60);
      g.fillStyle = cloth[color]; g.fillRect(x + 4, 74, 26, 16); g.fillStyle = O; g.fillRect(x + 30, 74, 3, 16); g.fillRect(x + 4, 74, 26, 2); g.fillRect(x + 4, 88, 26, 2);
    }
    g.fillStyle = '#fff6c0';
    for (const [x, y] of [[40, 40], [320, 56], [180, 8], [96, 20], [270, 20]]) { g.fillRect(x, y - 6, 3, 13); g.fillRect(x - 5, y, 13, 3); }
  } else {
    // two fires on the towers
    for (const [x, y, s] of [[88, 70, 1.5], [270, 78, 1.8]] as const) {
      const f = flameCanvas(Math.floor(Math.random() * 6), 6);
      g.drawImage(f, x - (f.width * s) / 2, y - f.height * s + 14, f.width * s, f.height * s);
    }
  }
  return c.toDataURL('image/png');
}
