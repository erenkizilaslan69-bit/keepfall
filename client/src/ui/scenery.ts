import { assetUrl } from '../scene/assets';
import { catapultCanvas, flameCanvas, horsemanCanvas } from '../scene/PixelArt';
import type { PlayerColor } from '../types';

// The living picture behind the home, lobby and end screens: the generated lobby picture (public/art/ui/lobby-bg.jpg, scaled to cover the window with
// nearest-neighbour, it carries the four castles, the forest, the meadow and the river) with a few small animated groups in the free strips left and
// right of the panel, placed by the picture's own coordinates so they never stand on a castle: a camp fire with four soldiers of four colours, a catapult
// and a monk, a horseman now and then; a miner, a woodcutter, a shepherd with sheep and a small army on patrol. The panel of the screen is measured;
// a strip that is too narrow stays empty. Drawn on one transparent canvas at a low frame rate; it only draws while a menu screen is up.

/** The picture's size (px) and the places in it the groups stand at (fractions of its height). */
const BG = { w: 2752, h: 1536 };
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

class Scenery {
  readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private cover = { k: 1, ox: 0, oy: 0 };
  private tick = 0;
  private last = 0;
  private colors: PlayerColor[] = ['blue', 'red'];
  private measuredAt = -1000;
  private panel = { l: 0, r: 0 };
  private readonly horse = { t: -1, next: 6 };
  private readonly squad = { y: 0.52, dir: 1 as 1 | -1 };
  private readonly cache = new Map<string, HTMLCanvasElement[]>();
  private readonly flames = [0, 1, 2, 3, 4, 5].map((f) => flameCanvas(f, 6));
  private readonly sheep: Walker[] = [0, 1].map((i) => ({ x: 0.3 + i * 0.35, speed: 0.012 + i * 0.004, y: 0.86 + (i % 2) * 0.05, phase: i * 3, dir: i % 2 ? -1 : 1, graze: 0 }));

  constructor() {
    this.canvas.id = 'scenery';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.background = "#3d6b3a url('/art/ui/lobby-bg.jpg') center / cover no-repeat";
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

  /** Where a fraction of the picture's height lands on the screen (the picture covers the window, centred). */
  private yAt(f: number): number { return this.cover.oy + f * BG.h * this.cover.k; }

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
  private cavalry(g: CanvasRenderingContext2D, x0: number, x1: number, s: number, dt: number): void {
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
    const x = x0 + (x1 - x0) * (0.25 + 0.5 * k), y = this.yAt(0.37 + 0.22 * k), z = s * 0.28;
    g.drawImage(f, 36, 8, 168, 138, x - 84 * z, y - 138 * z, 168 * z, 138 * z);
    if (k >= 1) { hs.t = -1; hs.next = 20 + Math.random() * 15; }
  }

  /** Four soldiers (swords, spear, bow) march up and down the lower part of the right strip. */
  private patrol(g: CanvasRenderingContext2D, x0: number, x1: number, s: number, dt: number, anim: number): void {
    const sq = this.squad, cx = (x0 + x1) / 2;
    sq.y += sq.dir * dt * 0.006;
    if (sq.y > 0.55) sq.dir = -1;
    if (sq.y < 0.5) sq.dir = 1;
    const kinds = [
      { p: 'Units/Blue Units/Warrior/Warrior_Run.png', w: 192, k: 0.5 },
      { p: 'Units/Blue Units/Lancer/Lancer_Run.png', w: 320, k: 0.3 },
      { p: 'Units/Blue Units/Archer/Archer_Run.png', w: 192, k: 0.5 },
      { p: 'Units/Blue Units/Warrior/Warrior_Run.png', w: 192, k: 0.5 },
    ];
    kinds.forEach((kd, i) => {
      const x = cx + (i % 2 ? 16 : -16) * s, y = this.yAt(sq.y) + (Math.floor(i / 2) * 24 + (i % 2) * 8) * s * 0.7;
      frame(g, kd.p, kd.w, kd.w, anim * 2 + i, x, y, s * kd.k, sq.dir < 0, 0.72);
    });
  }

  private draw(dt: number): void {
    const g = this.g, w = this.canvas.width, h = this.canvas.height;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    const k = Math.max(w / BG.w, h / BG.h);
    this.cover = { k, ox: (w - BG.w * k) / 2, oy: (h - BG.h * k) / 2 };

    const anim = Math.floor(this.tick / 2); // 6 frames a second
    const work = this.tick; // 12 frames a second
    const st = this.strips();
    const lw = st.left[1] - st.left[0], rw = st.right[1] - st.right[0];
    const L = lw >= MIN_STRIP, R = rw >= MIN_STRIP;
    // The figures grow with the window but never wider than the narrower strip allows.
    const s = Math.max(1, Math.min(3, Math.round(Math.min(h / 450, Math.min(L ? lw : 1e9, R ? rw : 1e9) / 60))));
    const u = s * 0.55; // unit scale: the 192 px frames hold a figure about 60 px wide
    const unit = (path: string, fw: number, f: number, x: number, y: number, flip = false, sc = u) => frame(g, path, fw, fw, f, x, y, sc, flip, 0.72);
    const pawn = (color: string, sheet: string) => `Units/${color} Units/Pawn/Pawn_${sheet}.png`;
    const y = (f: number) => this.yAt(f);

    if (L) {
      const [x0, x1] = st.left, cx = (x0 + x1) / 2, sw = x1 - x0;
      // The camp fire: four soldiers in four colours sit round it and take turns to talk (a small bob).
      const fx = cx, fy = y(0.455);
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
      // A catapult and a monk a little below.
      const cat = this.catapult(this.colors[0] ?? 'blue');
      const z = s * 0.34;
      g.drawImage(cat, 14, 4, 152, 120, cx - 76 * z - 10 * s, y(0.585) - 120 * z, 152 * z, 120 * z);
      unit('Units/Blue Units/Monk/Idle.png', 192, anim, cx + 52 * s, y(0.585), false, s * 0.45);
      // A horseman now and then crosses the strip.
      this.cavalry(g, x0, x1, s, dt);
    }

    if (R) {
      const [x0, x1] = st.right, cx = (x0 + x1) / 2, sw = x1 - x0;
      // A miner at the gold stones, a woodcutter at a tree, a shepherd with sheep that wander and graze.
      const stone = image('Terrain/Resources/Gold/Gold Stones/Gold Stone 3.png');
      if (stone) g.drawImage(stone, cx + 4 * s, y(0.37) - 48 * s, 64 * s * 0.7, 64 * s * 0.7);
      unit(pawn('Yellow', 'Interact Pickaxe'), 192, work, cx - 14 * s, y(0.37) + 4 * s);
      frame(g, 'Terrain/Resources/Wood/Trees/Tree1.png', 192, 256, anim, cx + 22 * s, y(0.415) + 30 * s, s * 0.45, true);
      unit(pawn('Red', 'Interact Axe'), 192, work, cx - 8 * s, y(0.415) + 8 * s);
      const fy = y(0.46);
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
          x0 + sh.x * sw, fy + (sh.y - 0.86) * 130 * s + 8 * s, s * 0.5, sh.dir < 0, 0.8);
      }
      // A small army on patrol, up and down the strip.
      this.patrol(g, x0, x1, s, dt, anim);
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
