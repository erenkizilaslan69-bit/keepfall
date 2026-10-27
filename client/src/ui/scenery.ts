import { assetUrl } from '../scene/assets';
import { catapultCanvas, flameCanvas, horsemanCanvas } from '../scene/PixelArt';
import type { PlayerColor } from '../types';

// The living picture behind the home, lobby and end screens: an island of the Tiny Swords ground with a camp fire and four soldiers of four
// colours chatting round it, a mine, a lumber camp, a smithy and a sheep field with their workers, a small army on patrol, a horseman now
// and then, a catapult and a monk far off, and clouds that drift. The panel of the screen is measured and everything stands in the free
// strips to its left and right, so nothing hides behind the panel or is squeezed against the window's edge (a strip that is too narrow
// stays empty). Drawn on one canvas at a low frame rate; it only draws while a menu screen is up and is made once for the whole page.

const TILE = 64;
const GRASS = { tl: 0, t: 1, tr: 2, l: 9, c: 10, r: 11, bl: 18, b: 19, br: 20 };
const FPS = 12;
/** A strip narrower than this stays empty. */
const MIN_STRIP = 76;

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
  private measuredAt = -1000;
  private panel = { l: 0, r: 0 };
  private readonly horse = { t: -1, next: 6 };
  private readonly squad = { y: 0.7, dir: 1 as 1 | -1 };
  private readonly cache = new Map<string, HTMLCanvasElement[]>();
  private readonly flames = [0, 1, 2, 3, 4, 5].map((f) => flameCanvas(f, 6));
  private readonly sheep: Walker[] = [0, 1].map((i) => ({ x: 0.3 + i * 0.35, speed: 0.012 + i * 0.004, y: 0.86 + (i % 2) * 0.05, phase: i * 3, dir: i % 2 ? -1 : 1, graze: 0 }));
  private readonly clouds: Cloud[] = Array.from({ length: 6 }, (_, i) => ({ x: i / 6, y: 0.05 + ((i * 37) % 30) / 100, speed: 0.004 + (i % 3) * 0.0025, variant: 1 + (i % 8), scale: 0.7 + (i % 3) * 0.25 }));

  constructor() {
    this.canvas.id = 'scenery';
    this.canvas.setAttribute('aria-hidden', 'true');
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** The catapult takes the colour of the first player in the room. */
  setColors(colors: PlayerColor[]): void {
    if (colors.length > 0) this.colors = colors;
  }

  private resize(): void {
    this.canvas.width = Math.max(1, window.innerWidth);
    this.canvas.height = Math.max(1, window.innerHeight);
    this.backdrop = null;
    this.measuredAt = -1000;
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

  /** Water, the island of grass and everything that stands still: drawn once per window size, then copied every frame. */
  private makeBackdrop(): HTMLCanvasElement | null {
    const w = this.canvas.width, h = this.canvas.height, s = this.scale;
    const tiles = image('Terrain/Tileset/Tilemap_color1.png'), water = image('Terrain/Tileset/Water Background color.png');
    if (!tiles || !water) return null;
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
    this.backdropKey = `${w}x${h}`;
    return c;
  }

  /** The free strips left and right of the panel (re-measured twice a second). */
  private strips(): { left: [number, number]; right: [number, number] } {
    const now = performance.now();
    if (now - this.measuredAt > 500) {
      this.measuredAt = now;
      const r = document.querySelector<HTMLElement>('.screen')?.getBoundingClientRect();
      const w = this.canvas.width;
      this.panel = r && r.width > 0 ? { l: r.left, r: r.right } : { l: w * 0.3, r: w * 0.7 };
    }
    return { left: [0, this.panel.l], right: [this.panel.r, this.canvas.width] };
  }

  private catapult(color: PlayerColor): HTMLCanvasElement {
    const key = `cat:${color}`;
    if (!this.cache.has(key)) this.cache.set(key, [catapultCanvas(color, false, 0)]);
    return this.cache.get(key)![0];
  }

  /** A horseman gallops through the left strip from the top corner to the bottom one every half minute or so. */
  private cavalry(g: CanvasRenderingContext2D, x0: number, x1: number, h: number, s: number, dt: number): void {
    const hs = this.horse;
    if (hs.t < 0) {
      hs.next -= dt;
      if (hs.next > 0) return;
      hs.t = 0;
    }
    const lancer = image('Units/Red Units/Lancer/Lancer_Right_Attack.png');
    if (!lancer) { hs.t = -1; hs.next = 4; return; }
    hs.t += dt;
    if (!this.cache.has('horse:red')) this.cache.set('horse:red', [1, 2, 1, 0].map((p) => horsemanCanvas(lancer, 'red', p, 0)));
    const frames = this.cache.get('horse:red')!;
    const k = Math.min(1, hs.t / 7);
    const f = frames[Math.floor(hs.t * 8) % frames.length];
    const x = x0 + (x1 - x0) * (0.25 + 0.5 * k), y = h * (0.06 + 0.88 * k), z = s * 0.28;
    g.drawImage(f, 36, 8, 168, 138, x - 84 * z, y - 138 * z, 168 * z, 138 * z);
    if (k >= 1) { hs.t = -1; hs.next = 20 + Math.random() * 15; }
  }

  /** Four soldiers (swords, spear, bow) march up and down the lower part of the right strip. */
  private patrol(g: CanvasRenderingContext2D, x0: number, x1: number, h: number, s: number, dt: number, anim: number): void {
    const sq = this.squad, cx = (x0 + x1) / 2;
    sq.y += sq.dir * dt * 0.03;
    if (sq.y > 0.84) sq.dir = -1;
    if (sq.y < 0.58) sq.dir = 1;
    const kinds = [
      { p: 'Units/Blue Units/Warrior/Warrior_Run.png', w: 192, k: 0.5 },
      { p: 'Units/Blue Units/Lancer/Lancer_Run.png', w: 320, k: 0.3 },
      { p: 'Units/Blue Units/Archer/Archer_Run.png', w: 192, k: 0.5 },
      { p: 'Units/Blue Units/Warrior/Warrior_Run.png', w: 192, k: 0.5 },
    ];
    kinds.forEach((kd, i) => {
      const x = cx + (i % 2 ? 16 : -16) * s, y = h * sq.y + (Math.floor(i / 2) * 24 + (i % 2) * 8) * s;
      frame(g, kd.p, kd.w, kd.w, anim * 2 + i, x, y, s * kd.k, sq.dir < 0, 0.72);
    });
  }

  private draw(dt: number): void {
    const g = this.g, w = this.canvas.width, h = this.canvas.height, ground = this.scale;
    g.imageSmoothingEnabled = false;
    if (!this.backdrop || this.backdropKey !== `${w}x${h}`) this.backdrop = this.makeBackdrop();
    if (this.backdrop) g.drawImage(this.backdrop, 0, 0);
    else { g.fillStyle = '#47aba9'; g.fillRect(0, 0, w, h); }

    const anim = Math.floor(this.tick / 2); // 6 frames a second
    const work = this.tick; // 12 frames a second
    const st = this.strips();
    const lw = st.left[1] - st.left[0], rw = st.right[1] - st.right[0];
    const L = lw >= MIN_STRIP, R = rw >= MIN_STRIP;
    // The figures grow with the window but never wider than the narrower strip allows.
    const s = Math.max(1, Math.min(3, Math.round(Math.min(h / 450, Math.min(L ? lw : 1e9, R ? rw : 1e9) / 60))));
    const u = s * 0.55; // unit scale: the 192 px frames hold a figure about 60 px wide
    const unit = (path: string, fw: number, f: number, x: number, y: number, flip = false, k = u) => frame(g, path, fw, fw, f, x, y, k, flip, 0.72);
    const pawn = (color: string, sheet: string) => `Units/${color} Units/Pawn/Pawn_${sheet}.png`;

    if (L) {
      const [x0, x1] = st.left, cx = (x0 + x1) / 2, sw = x1 - x0;
      // Mine: gold stones and a miner swinging the pickaxe.
      const my = h * 0.17;
      const stone = image('Terrain/Resources/Gold/Gold Stones/Gold Stone 3.png');
      if (stone) g.drawImage(stone, cx + 2 * s, my - 52 * s, 64 * s * 0.8, 64 * s * 0.8);
      unit(pawn('Yellow', 'Interact Pickaxe'), 192, work, cx - 18 * s, my + 4 * s);
      // Lumber camp: a swaying tree and a woodcutter chopping.
      const ly = h * 0.37;
      frame(g, 'Terrain/Resources/Wood/Trees/Tree1.png', 192, 256, anim, cx + 16 * s, ly + 34 * s, s * 0.5, true);
      unit(pawn('Red', 'Interact Axe'), 192, work, cx - 24 * s, ly + 12 * s);
      // The camp fire: four soldiers in four colours sit round it and take turns to talk (a small bob).
      const fx = cx, fy = h * 0.64;
      const rx = Math.max(24, Math.min(46 * s, sw / 2 - 26)), ry = rx * 0.42;
      const folk = [
        { color: 'Blue', path: (c: string) => `Units/${c} Units/Warrior/Warrior_Idle.png` },
        { color: 'Red', path: (c: string) => `Units/${c} Units/Archer/Archer_Idle.png` },
        { color: 'Yellow', path: (c: string) => `Units/${c} Units/Pawn/Pawn_Idle.png` },
        { color: 'Purple', path: (c: string) => `Units/${c} Units/Monk/Idle.png` },
      ];
      const seats = folk.map((f, i) => {
        const a = Math.PI * 0.25 + (i / folk.length) * Math.PI * 2;
        const speaking = Math.floor(this.tick / 30) % folk.length === i && this.tick % 6 < 3;
        return { f, x: fx + Math.cos(a) * rx, y: fy + Math.sin(a) * ry + 6 * s - (speaking ? s : 0), i };
      }).sort((p, q) => p.y - q.y);
      const draw = (r: typeof seats[number]) => unit(r.f.path(r.f.color), 192, anim + r.i * 2, r.x, r.y, r.x > fx);
      seats.filter((r) => r.y < fy + 6 * s).forEach(draw);
      g.fillStyle = 'rgba(255, 166, 58, 0.16)';
      g.beginPath(); g.ellipse(fx, fy, rx * 0.9, ry * 1.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4b2e1a';
      g.fillRect(fx - 8 * s, fy - s, 16 * s, 3 * s);
      const fr = this.flames[anim % this.flames.length];
      g.drawImage(fr, fx - (fr.width * s * 0.7) / 2, fy - fr.height * s * 0.7 + 4 * s, fr.width * s * 0.7, fr.height * s * 0.7);
      seats.filter((r) => r.y >= fy + 6 * s).forEach(draw);
      // Far off in the corner: a monk.
      unit('Units/Blue Units/Monk/Idle.png', 192, anim, cx, h * 0.95, false, s * 0.4);
      // A horseman now and then crosses the strip.
      this.cavalry(g, x0, x1, h, s, dt);
    }

    if (R) {
      const [x0, x1] = st.right, cx = (x0 + x1) / 2, sw = x1 - x0;
      // Smithy: a house with a hammering smith.
      const sy = h * 0.25;
      const house = image('Buildings/Black Buildings/House3.png');
      if (house) { const k = s * 0.5; g.drawImage(house, cx - 6 * s, sy - house.naturalHeight * k + 12 * s, house.naturalWidth * k, house.naturalHeight * k); }
      unit(pawn('Purple', 'Interact Hammer'), 192, work, cx - 28 * s, sy + 6 * s);
      // Sheep field: a shepherd and sheep that wander inside the strip and graze.
      const fy = h * 0.4;
      unit(pawn('Blue', 'Idle'), 192, anim, x0 + sw * 0.22, fy);
      for (const sh of this.sheep) {
        sh.phase += dt;
        if (sh.graze > 0) sh.graze -= dt;
        else {
          sh.x += sh.dir * sh.speed * dt * 6;
          if (sh.x > 0.8) sh.dir = -1;
          if (sh.x < 0.4) sh.dir = 1;
          if (Math.random() < dt * 0.15) sh.graze = 3 + Math.random() * 4;
        }
        const f = Math.floor(sh.phase * 6);
        frame(g, sh.graze > 0 ? 'Terrain/Resources/Meat/Sheep/Sheep_Grass.png' : 'Terrain/Resources/Meat/Sheep/Sheep_Move.png', 128, 128, f,
          x0 + sh.x * sw, fy + (sh.y - 0.86) * 260 * s + 10 * s, s * 0.5, sh.dir < 0, 0.8);
      }
      // A small army on patrol, up and down the strip.
      this.patrol(g, x0, x1, h, s, dt, anim);
      // Far off: a catapult.
      const cat = this.catapult(this.colors[0] ?? 'blue');
      const z = s * 0.4;
      g.drawImage(cat, 14, 4, 152, 120, cx - 76 * z, h * 0.97 - 120 * z, 152 * z, 120 * z);
    }

    // Clouds drift across, with their shadow on the ground.
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > 1.25) c.x = -0.25;
      const img = image(`Terrain/Decorations/Clouds/Clouds_0${c.variant}.png`);
      if (!img) continue;
      const cw = img.naturalWidth * ground * c.scale * 0.6, ch = img.naturalHeight * ground * c.scale * 0.6;
      g.globalAlpha = 0.14;
      g.filter = 'brightness(0)';
      g.drawImage(img, c.x * w, c.y * h + 300 * ground, cw, ch * 0.6);
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
