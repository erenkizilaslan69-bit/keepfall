import { recolor } from './KingdomSprites';
import type { PlayerColor } from '../types';
import { asset } from '../env';

// The cavalry's horse, from the generated sheet (public/art/horse/horse.png, cleaned by tools/art-ui.mjs horse: five frames of equal size, the saddle
// cloth at the same point of every frame): frame 0 stands, frames 1-4 gallop. The blue saddle cloth takes the player's colour (the gold trim, the saddle
// and the coat stay). The rider is the pack's own Lancer, composed at load time from the loaded sheets (nothing derived from the pack is written to
// disk): it sits on the saddle, shrunk a little (nearest neighbour, so the pixels stay crisp), its lower half hidden behind the horse and its leg showing
// at the horse's side. Idle: the horse stands and the Lancer idles; run: the horse gallops and the Lancer bobs; attack: the horse stands and the
// Lancer thrusts.

export type HorseTeam = PlayerColor;
export const HORSE_W = 240, HORSE_H = 150;
/** Frames in the sheet and the size of one (cells = pixels), and where the saddle cloth's centre is in a frame. */
const FW = 110, FH = 103, ANCHOR = { x: 60, y: 53 };
/** Where the hooves land on the 240×150 canvas, and the left edge of the horse. */
const FEET_Y = 142, LEFT = 44;
/** The rider is drawn at this share of the pack's size. */
const RIDER_SCALE = 0.62;
/** The Lancer sheets' frame size, and the soft ground shadow (below this alpha) that is left out. */
const LANCER = 320, SOLID = 200;

export interface LancerSheets { idle: CanvasImageSource & { width: number }; run: CanvasImageSource & { width: number }; attack: CanvasImageSource & { width: number } }
export type HorseMode = 'idle' | 'run' | 'attack';

let sheet: HTMLImageElement | null = null;
/** Starts fetching the horse (called when the app starts; the menus and the map need it a moment later). */
export function loadHorse(): Promise<void> {
  if (sheet) return sheet.decode().catch(() => undefined);
  sheet = new Image();
  sheet.src = asset('/art/horse/horse.png');
  return sheet.decode().catch(() => undefined);
}
export const horseReady = (): boolean => !!sheet && sheet.complete && sheet.naturalWidth > 0;

const cache = new Map<string, HTMLCanvasElement>();

/** One horse frame (0 stand, 1-4 gallop) in a player's colour. */
function horseFrame(team: HorseTeam, n: number): HTMLCanvasElement {
  const key = `h:${team}:${n}`;
  let c = cache.get(key);
  if (c) return c;
  const base = document.createElement('canvas');
  base.width = FW; base.height = FH;
  base.getContext('2d')!.drawImage(sheet!, n * FW, 0, FW, FH, 0, 0, FW, FH);
  c = recolor(base, team);
  cache.set(key, c);
  return c;
}

/** The solid pixels of one Lancer frame, cropped to its figure and shrunk by RIDER_SCALE with nearest neighbour; `foot` is where the feet are in it. */
function rider(img: CanvasImageSource & { width: number }, frame: number): { c: HTMLCanvasElement; footX: number; footY: number } {
  const full = document.createElement('canvas');
  full.width = LANCER; full.height = LANCER;
  const g = full.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, frame * LANCER, 0, LANCER, LANCER, 0, 0, LANCER, LANCER);
  const px = g.getImageData(0, 0, LANCER, LANCER);
  let x0 = LANCER, y0 = LANCER, x1 = 0, y1 = 0;
  for (let y = 0; y < LANCER; y++) for (let x = 0; x < LANCER; x++) {
    const o = (y * LANCER + x) * 4;
    if (px.data[o + 3] < SOLID) { px.data[o + 3] = 0; continue; }
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  g.putImageData(px, 0, 0);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * RIDER_SCALE)); c.height = Math.max(1, Math.round(h * RIDER_SCALE));
  const cg = c.getContext('2d')!;
  cg.imageSmoothingEnabled = false;
  cg.drawImage(full, x0, y0, w, h, 0, 0, c.width, c.height);
  // the feet: the figure's body (not the spear) stands about a third of the way in from the left in the upright poses and at the left in a thrust
  return { c, footX: Math.round((LANCER / 2 - x0) * RIDER_SCALE), footY: c.height };
}

/** The gallop's bounce: the rider rises and sinks a little with each frame. */
const BOB = [-2, 0, 2, 0];

/**
 * One frame of the cavalry on a 240×150 canvas (hooves at y≈142, the horse's left edge at x≈44). `frame`: idle 0..11 (the Lancer's own idle), run 0..3
 * (the gallop), attack 0..2 (the thrust). Empty until the horse picture has loaded.
 */
export function horsemanFrame(lancer: LancerSheets, team: HorseTeam, mode: HorseMode, frame = 0): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = HORSE_W; out.height = HORSE_H;
  if (!horseReady()) return out;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const gallop = mode === 'run' ? 1 + (((frame % 4) + 4) % 4) : 0;
  const bob = mode === 'run' ? BOB[gallop - 1] : 0;
  const hx = LEFT, hy = FEET_Y - (FH - 1);
  const horse = horseFrame(team, gallop);
  g.drawImage(horse, hx, hy);
  // the rider: sits with the seat on the saddle cloth, a little behind its centre
  const r = rider(mode === 'idle' ? lancer.idle : mode === 'run' ? lancer.run : lancer.attack, mode === 'idle' ? ((frame % 12) + 12) % 12 : mode === 'run' ? frame % 6 : Math.min(2, frame));
  const ax = hx + ANCHOR.x, ay = hy + ANCHOR.y + bob;
  const rx = ax - r.footX - 2, ry = ay - r.footY + 5;
  g.drawImage(r.c, rx, ry);
  // the horse's saddle cloth and flank cover the rider's lower half (it sits behind the saddle), its leg sticks out at the horse's side
  g.save();
  g.beginPath();
  g.rect(hx + ANCHOR.x - 20, ay - 9, 40, 9);
  g.clip();
  g.drawImage(horse, hx, hy + 0);
  g.restore();
  return out;
}
