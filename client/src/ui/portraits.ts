import { assetUrl } from '../scene/assets';
import { catapultCanvas, type TeamName } from '../scene/PixelArt';
import { horseReady, horsemanFrame } from '../scene/HorseArt';
import type { PlayerColor } from '../types';

// The portraits on the deck cards: each unit's own sprite in the player's team colour, idling (the swordsman breathes, the horse paws the
// ground, the catapult's wheel turns). Drawn into small canvases from the loaded sheets; one timer moves them all and forgets a canvas
// that has left the page.

const FOLDER: Record<PlayerColor, string> = { blue: 'Blue', red: 'Red', yellow: 'Yellow', purple: 'Purple', black: 'Black' };

interface Sheet { path: (folder: string) => string; frame: number; crop: { x: number; y: number; w: number; h: number } }
const SHEETS: Record<string, Sheet> = {
  kilicli: { path: (f) => `Units/${f} Units/Warrior/Warrior_Idle.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  kalkanli: { path: (f) => `Units/${f} Units/Warrior/Warrior_Guard.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  okcu: { path: (f) => `Units/${f} Units/Archer/Archer_Idle.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  kesis: { path: (f) => `Units/${f} Units/Monk/Idle.png`, frame: 192, crop: { x: 48, y: 44, w: 96, h: 100 } },
  mizrakci: { path: (f) => `Units/${f} Units/Lancer/Lancer_Idle.png`, frame: 320, crop: { x: 104, y: 112, w: 112, h: 118 } },
};
const LANCER = (f: string, sheet: string) => `Units/${f} Units/Lancer/Lancer_${sheet}.png`;

const images = new Map<string, HTMLImageElement>();
function image(path: string): HTMLImageElement | null {
  let img = images.get(path);
  if (!img) { img = new Image(); img.src = assetUrl(path); images.set(path, img); }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

const made = new Map<string, HTMLCanvasElement[]>();
/** The frames of the two units that are drawn in code (cavalry: four gallop poses, catapult: the wheel turning). */
function codeFrames(unitId: string, color: PlayerColor): HTMLCanvasElement[] | null {
  const key = `${unitId}:${color}`;
  if (made.has(key)) return made.get(key)!;
  let frames: HTMLCanvasElement[] | null = null;
  if (unitId === 'mancinik') frames = [0, 0.25, 0.5, 0.75].map((w) => catapultCanvas(color as TeamName, false, w));
  else if (unitId === 'suvari') {
    const sheets = { idle: image(LANCER(FOLDER[color], 'Idle')), run: image(LANCER(FOLDER[color], 'Run')), attack: image(LANCER(FOLDER[color], 'Right_Attack')) };
    if (sheets.idle && sheets.run && sheets.attack && horseReady()) frames = [0, 3, 6, 9].map((f) => horsemanFrame(sheets as never, color, 'idle', f));
  }
  if (frames) made.set(key, frames);
  return frames;
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
  const frames = codeFrames(p.unitId, p.color);
  if (!frames) return;
  const src = frames[tick % frames.length];
  // Both are drawn in a generous frame: fit the middle of it.
  const crop = p.unitId === 'suvari' ? { x: 36, y: 8, w: 168, h: 138 } : { x: 14, y: 4, w: 152, h: 120 };
  const k = Math.min(W / crop.w, H / crop.h);
  g.drawImage(src, crop.x, crop.y, crop.w, crop.h, (W - crop.w * k) / 2, (H - crop.h * k) / 2 + 6, crop.w * k, crop.h * k);
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
