import { assetUrl } from '../scene/assets';
import type { PlayerColor } from '../types';

// The portraits on the deck cards: each unit's own sprite in the player's team colour, idling (the swordsman breathes, the horse paws the
// ground, the catapult's wheels turn). Drawn into small canvases from the Tiny Swords sheets; one timer moves them all and forgets a canvas
// that has left the page.

const FOLDER: Record<PlayerColor, string> = { blue: 'Blue', red: 'Red', yellow: 'Yellow', purple: 'Purple', black: 'Black' };

interface Sheet { path: (folder: string) => string; frame: number; crop: { x: number; y: number; w: number; h: number } }
const wf = (dir: string, file: string) => (f: string) => `@wf/${dir}/${dir} Animations/${dir}_${f}/${file}_${f}.png`;
const SHEETS: Record<string, Sheet> = {
  kilicli: { path: wf('Swordsman', 'Swordsman_Idle'), frame: 320, crop: { x: 98, y: 80, w: 125, h: 135 } },
  kalkanli: { path: (f) => `Units/${f} Units/Warrior/Warrior_Guard.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  okcu: { path: (f) => `Units/${f} Units/Archer/Archer_Idle.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  kesis: { path: (f) => `Units/${f} Units/Monk/Idle.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  mizrakci: { path: (f) => `Units/${f} Units/Lancer/Lancer_Idle.png`, frame: 320, crop: { x: 104, y: 112, w: 112, h: 118 } },
  suvari: { path: wf('Horseman', 'Horseman_Idle'), frame: 320, crop: { x: 100, y: 58, w: 140, h: 170 } },
  mancinik: { path: wf('Catapult', 'Catapult_Move'), frame: 256, crop: { x: 36, y: 52, w: 162, h: 158 } },
};

const images = new Map<string, HTMLImageElement>();
function image(path: string): HTMLImageElement | null {
  let img = images.get(path);
  if (!img) { img = new Image(); img.src = assetUrl(path); images.set(path, img); }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

interface Portrait { canvas: HTMLCanvasElement; unitId: string; color: PlayerColor }
const portraits = new Set<Portrait>();
let timer = 0;
let tick = 0;

function paint(p: Portrait): void {
  const g = p.canvas.getContext('2d')!;
  const W = p.canvas.width, H = p.canvas.height;
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  const sheet = SHEETS[p.unitId];
  if (sheet) {
    const img = image(sheet.path(FOLDER[p.color]));
    if (!img) return;
    const frames = Math.floor(img.naturalWidth / sheet.frame);
    const f = Math.floor(tick / 1) % frames;
    const { x, y, w, h } = sheet.crop;
    const k = Math.min(W / w, H / h);
    g.drawImage(img, f * sheet.frame + x, y, w, h, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
    return;
  }
}

function run(): void {
  tick++;
  for (const p of [...portraits]) {
    if (!p.canvas.isConnected) { portraits.delete(p); continue; }
    paint(p);
  }
  if (portraits.size === 0) { window.clearInterval(timer); timer = 0; }
}

/** Draws the unit into <paramref name="canvas"/> and keeps it moving while it is on the page. */
export function mountPortrait(canvas: HTMLCanvasElement, unitId: string, color: PlayerColor): void {
  portraits.add({ canvas, unitId, color });
  if (!timer) timer = window.setInterval(run, 150);
  paint({ canvas, unitId, color });
}
