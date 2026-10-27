import { assetUrl } from '../scene/assets';
import { flameCanvas } from '../scene/PixelArt';
import type { PlayerColor } from '../types';

// The living picture behind the home, lobby and end screens: a small island of the Tiny Swords ground with a castle, a camp fire with
// soldiers waiting round it, sheep that wander and graze, trees that sway and clouds that drift. Drawn on one canvas at a low frame rate;
// it only draws while a menu screen is up (the game has its own map), and it is made once for the whole page.

const FOLDER: Record<PlayerColor, string> = { blue: 'Blue', red: 'Red', yellow: 'Yellow', purple: 'Purple', black: 'Black' };
const TILE = 64;
const GRASS = { tl: 0, t: 1, tr: 2, l: 9, c: 10, r: 11, bl: 18, b: 19, br: 20 };
const FPS = 12;

const images = new Map<string, HTMLImageElement>();
function image(path: string): HTMLImageElement | null {
  let img = images.get(path);
  if (!img) {
    img = new Image();
    img.src = assetUrl(path);
    images.set(path, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** One frame of a horizontal sheet. */
function frame(g: CanvasRenderingContext2D, path: string, frameW: number, frameH: number, index: number, x: number, y: number, scale: number,
  flip = false, originY = 1): void {
  const img = image(path);
  if (!img) return;
  const frames = Math.max(1, Math.floor(img.naturalWidth / frameW));
  const f = ((index % frames) + frames) % frames;
  const w = frameW * scale, h = frameH * scale;
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  g.drawImage(img, f * frameW, 0, frameW, frameH, -w / 2, -h * originY, w, h);
  g.restore();
}

interface Walker { x: number; speed: number; y: number; phase: number; dir: 1 | -1; graze: number }
interface Cloud { x: number; y: number; speed: number; variant: number; scale: number }

class Scenery {
  readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private backdrop: HTMLCanvasElement | null = null;
  private backdropKey = '';
  private tick = 0;
  private last = 0;
  private colors: PlayerColor[] = ['blue', 'red'];
  private readonly flames = [0, 1, 2, 3, 4, 5].map((f) => flameCanvas(f, 6));
  private readonly sheep: Walker[] = [0, 1, 2].map((i) => ({ x: 0.15 + i * 0.3, speed: 0.012 + i * 0.004, y: 0.86 + (i % 2) * 0.05, phase: i * 3, dir: i % 2 ? -1 : 1, graze: 0 }));
  private readonly clouds: Cloud[] = Array.from({ length: 6 }, (_, i) => ({ x: i / 6, y: 0.05 + ((i * 37) % 30) / 100, speed: 0.004 + (i % 3) * 0.0025, variant: 1 + (i % 8), scale: 0.7 + (i % 3) * 0.25 }));

  constructor() {
    this.canvas.id = 'scenery';
    this.canvas.setAttribute('aria-hidden', 'true');
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** The soldiers at the fire come in the colours of the players in the room. */
  setColors(colors: PlayerColor[]): void {
    if (colors.length > 0) this.colors = colors;
  }

  private resize(): void {
    this.canvas.width = Math.max(1, window.innerWidth);
    this.canvas.height = Math.max(1, window.innerHeight);
    this.backdrop = null;
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    if (!document.documentElement.classList.contains('in-menu') || document.hidden) return;
    if (now - this.last < 1000 / FPS) return;
    const dt = Math.min(0.2, (now - this.last) / 1000);
    this.last = now;
    this.tick++;
    this.draw(dt);
  }

  /** Native pixel scale of the pack's art: bigger windows get chunkier pixels. */
  private get scale(): number {
    return Math.max(1, Math.min(3, Math.round(Math.min(this.canvas.width / 1100, this.canvas.height / 700))));
  }

  /** Water, the island of grass and everything that stands still: drawn once per window size and colour set, then copied every frame. */
  private makeBackdrop(): HTMLCanvasElement | null {
    const w = this.canvas.width, h = this.canvas.height, s = this.scale;
    const tiles = image('Terrain/Tileset/Tilemap_color1.png'), water = image('Terrain/Tileset/Water Background color.png');
    const castle = image('Buildings/Blue Buildings/Castle.png');
    if (!tiles || !water || !castle) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y += TILE * s) for (let x = 0; x < w; x += TILE * s) g.drawImage(water, x, y, TILE * s, TILE * s);
    const t = TILE * s;
    const cols = Math.ceil(w / t) + 1, rows = Math.ceil(h / t) + 1;
    const margin = 1;
    for (let r = margin; r < rows - margin - 1; r++)
      for (let q = margin; q < cols - margin - 1; q++) {
        const top = r === margin, bottom = r === rows - margin - 2, left = q === margin, right = q === cols - margin - 2;
        const f = top ? (left ? GRASS.tl : right ? GRASS.tr : GRASS.t) : bottom ? (left ? GRASS.bl : right ? GRASS.br : GRASS.b) : left ? GRASS.l : right ? GRASS.r : GRASS.c;
        g.drawImage(tiles, (f % 9) * TILE, Math.floor(f / 9) * TILE, TILE, TILE, q * t, r * t, t, t);
      }
    // A few flowers and tufts in the grass, always the same.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const colors = ['#f4f0e8', '#f2c84b', '#e0675e', '#a381cd', '#7fb3ee'];
    for (let i = 0; i < 70; i++) {
      const x = (margin + 1 + rnd() * (cols - 2 * margin - 3)) * t, y = (margin + 1 + rnd() * (rows - 2 * margin - 3)) * t;
      g.fillStyle = colors[i % colors.length];
      g.fillRect(x, y, 2 * s, 2 * s);
      g.fillStyle = '#4f7d2a';
      g.fillRect(x, y + 2 * s, s, 3 * s);
    }
    // The castle, left of the middle, with a tower and a house beside it.
    const cx = Math.max(w * 0.14, (castle.naturalWidth * s) / 2 + 6), cy = h * 0.5;
    g.drawImage(castle, cx - (castle.naturalWidth * s) / 2, cy - castle.naturalHeight * s, castle.naturalWidth * s, castle.naturalHeight * s);
    const tower = image('Buildings/Blue Buildings/Tower.png'), house = image('Buildings/Blue Buildings/House1.png');
    if (tower) g.drawImage(tower, cx + 190 * s * 0.8, cy - tower.naturalHeight * s * 0.8, tower.naturalWidth * s * 0.8, tower.naturalHeight * s * 0.8);
    if (house) g.drawImage(house, cx - 330 * s * 0.8, cy - house.naturalHeight * s * 0.55 + 20 * s, house.naturalWidth * s * 0.8, house.naturalHeight * s * 0.8);
    const rock = image('Terrain/Decorations/Rocks/Rock1.png');
    if (rock) for (const [px, py] of [[0.44, 0.34], [0.92, 0.45], [0.06, 0.8]]) g.drawImage(rock, w * px, h * py, 64 * s * 0.7, 64 * s * 0.7);
    this.backdropKey = `${w}x${h}`;
    return c;
  }

  private draw(dt: number): void {
    const g = this.g, w = this.canvas.width, h = this.canvas.height, s = this.scale;
    g.imageSmoothingEnabled = false;
    if (!this.backdrop || this.backdropKey !== `${w}x${h}`) this.backdrop = this.makeBackdrop();
    if (this.backdrop) g.drawImage(this.backdrop, 0, 0);
    else { g.fillStyle = '#47aba9'; g.fillRect(0, 0, w, h); }

    const anim = Math.floor(this.tick / 2); // 6 frames a second

    // Trees that sway, at the edges of the island.
    for (const [tx, ty, flip] of [[0.045, 0.3, false], [0.95, 0.38, true], [0.9, 0.78, false], [0.5, 0.97, true]] as const)
      frame(g, 'Terrain/Resources/Wood/Trees/Tree1.png', 192, 256, anim + Math.floor(tx * 20), w * tx, h * ty + 190 * s * 0.5, s * 0.8, flip);

    // The camp: fire and the soldiers round it, each looking at the flames.
    const fx = w * 0.82, fy = h * 0.66;
    const kinds = [
      { path: (c: string) => `Units/${c} Units/Warrior/Warrior_Idle.png`, w: 192, scale: 0.6 },
      { path: (c: string) => `Units/${c} Units/Archer/Archer_Idle.png`, w: 192, scale: 0.6 },
      { path: (c: string) => `Units/${c} Units/Lancer/Lancer_Idle.png`, w: 320, scale: 0.6 },
      { path: (c: string) => `Units/${c} Units/Monk/Idle.png`, w: 192, scale: 0.6 },
      { path: (c: string) => `Units/${c} Units/Pawn/Pawn_Idle.png`, w: 192, scale: 0.6 },
      { path: (c: string) => `Units/${c} Units/Warrior/Warrior_Idle.png`, w: 192, scale: 0.6 },
    ];
    const ring: { x: number; y: number; k: number }[] = kinds.map((_, i) => {
      const a = Math.PI * 0.15 + (i / kinds.length) * Math.PI * 2;
      return { x: fx + Math.cos(a) * 78 * s, y: fy + Math.sin(a) * 30 * s + 6 * s, k: i };
    }).sort((a, b) => a.y - b.y);
    // Back half of the ring behind the fire, front half in front of it.
    const behind = ring.filter((r) => r.y < fy + 6 * s), front = ring.filter((r) => r.y >= fy + 6 * s);
    const drawUnit = (r: { x: number; y: number; k: number }) => {
      const kind = kinds[r.k], color = FOLDER[this.colors[r.k % this.colors.length]];
      frame(g, kind.path(color), kind.w, kind.w, anim + r.k * 2, r.x, r.y, s * kind.scale, r.x > fx, 0.72);
    };
    behind.forEach(drawUnit);
    // Stones round the fire, the glow and the flame.
    g.fillStyle = 'rgba(255, 166, 58, 0.16)';
    g.beginPath(); g.ellipse(fx, fy, 60 * s, 30 * s, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.fillStyle = '#4a4f57'; g.fillRect(fx + Math.cos(a) * 14 * s - 3 * s, fy + Math.sin(a) * 6 * s, 6 * s, 3 * s);
      g.fillStyle = '#b4bcc4'; g.fillRect(fx + Math.cos(a) * 14 * s - 3 * s, fy + Math.sin(a) * 6 * s - s, 5 * s, 2 * s);
    }
    g.fillStyle = '#4b2e1a';
    g.fillRect(fx - 9 * s, fy - s, 18 * s, 3 * s);
    const fr = this.flames[anim % this.flames.length];
    g.drawImage(fr, fx - (fr.width * s * 0.9) / 2, fy - fr.height * s * 0.9 + 4 * s, fr.width * s * 0.9, fr.height * s * 0.9);
    front.forEach(drawUnit);

    // Sheep wander along the bottom and stop to graze.
    for (const sh of this.sheep) {
      sh.phase += dt;
      if (sh.graze > 0) sh.graze -= dt;
      else {
        sh.x += sh.dir * sh.speed * dt;
        if (sh.x > 0.9) sh.dir = -1;
        if (sh.x < 0.1) sh.dir = 1;
        if (Math.random() < dt * 0.15) sh.graze = 3 + Math.random() * 4;
      }
      const f = Math.floor(sh.phase * 6);
      if (sh.graze > 0) frame(g, 'Terrain/Resources/Meat/Sheep/Sheep_Grass.png', 128, 128, f, sh.x * w, sh.y * h, s * 0.8, sh.dir < 0, 0.8);
      else frame(g, 'Terrain/Resources/Meat/Sheep/Sheep_Move.png', 128, 128, f, sh.x * w, sh.y * h, s * 0.8, sh.dir < 0, 0.8);
    }

    // Clouds drift across, with their shadow on the ground.
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > 1.25) c.x = -0.25;
      const img = image(`Terrain/Decorations/Clouds/Clouds_0${c.variant}.png`);
      if (!img) continue;
      const cw = img.naturalWidth * s * c.scale * 0.6, ch = img.naturalHeight * s * c.scale * 0.6;
      g.globalAlpha = 0.14;
      g.filter = 'brightness(0)';
      g.drawImage(img, c.x * w, c.y * h + 300 * s, cw, ch * 0.6);
      g.filter = 'none';
      g.globalAlpha = 0.95;
      g.drawImage(img, c.x * w, c.y * h, cw, ch);
      g.globalAlpha = 1;
    }
  }
}

let scenery: Scenery | null = null;

/** Puts the scenery behind the page (once). */
export function mountScenery(): Scenery {
  if (!scenery) {
    scenery = new Scenery();
    document.body.prepend(scenery.canvas);
  }
  return scenery;
}
