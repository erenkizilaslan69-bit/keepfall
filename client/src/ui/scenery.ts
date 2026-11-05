import { assetUrl } from '../scene/assets';
import { flameCanvas } from '../scene/PixelArt';
import type { PlayerColor } from '../types';

// The living picture behind the home, lobby and end screens: a meadow of the game's own pieces (the grass tile, trees, bushes, rocks, a dirt road and the four
// castles, built once from the Tiny Swords sheets and scaled to cover the window with nearest-neighbour) with a small animated group in the free strip left
// of the panel, placed by the picture's own coordinates so it never stands on a castle: a camp fire with four soldiers of four colours.
// The panel of the screen is measured; a strip that is too narrow stays empty. Drawn on one transparent canvas at a low frame rate; it only draws while a menu screen is up.

/** The picture's size (px) and the places in it the groups stand at (fractions of its height). */
const BG = { w: 2752, h: 1536 };
/** The meadow is built at half of that, so one of its pixels is two of the picture's. */
const MEADOW = { w: 1376, h: 768 };
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

class Scenery {
  readonly canvas = document.createElement('canvas');
  private readonly g = this.canvas.getContext('2d')!;
  private cover = { k: 1, ox: 0, oy: 0 };
  private tick = 0;
  private readonly flames = [0, 1, 2, 3, 4, 5].map((f) => flameCanvas(f, 6));
  private last = 0;
  private measuredAt = -1000;
  private panel = { l: 0, r: 0 };
  private meadow: HTMLCanvasElement | null = null;

  constructor() {
    this.canvas.id = 'scenery';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.background = '#5a9a3c';
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** Kept for the screens that tell the scenery the players' colours; the camp fire group does not need them. */
  setColors(_colors: PlayerColor[]): void { /* nothing to recolour */ }

  private resize(): void {
    this.canvas.width = Math.max(1, window.innerWidth);
    this.canvas.height = Math.max(1, window.innerHeight);
    this.measuredAt = -1000;
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    if (!document.documentElement.classList.contains('in-menu') || document.hidden) return;
    if (now - this.last < 1000 / FPS) return;
    this.last = now;
    this.tick++;
    this.draw();
  }

  /** The meadow, once every sheet it needs has loaded (null until then, tried again on the next frame). */
  private buildMeadow(): HTMLCanvasElement | null {
    const tiles = image('Terrain/Tilemap_color1.png'.replace('Terrain/', 'Terrain/Tileset/'));
    const trees = [1, 2, 3, 4].map((i) => image(`Terrain/Resources/Wood/Trees/Tree${i}.png`));
    const bushes = [1, 2, 3, 4].map((i) => image(`Terrain/Decorations/Bushes/Bushe${i}.png`));
    const rocks = [1, 2, 3, 4].map((i) => image(`Terrain/Decorations/Rocks/Rock${i}.png`));
    const castles = ['Blue', 'Red', 'Yellow', 'Purple'].map((c) => image(`Buildings/${c} Buildings/Castle.png`));
    if (!tiles || [...trees, ...bushes, ...rocks, ...castles].some((i) => !i)) return null;
    const c = document.createElement('canvas');
    c.width = MEADOW.w; c.height = MEADOW.h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < MEADOW.h; y += 64) for (let x = 0; x < MEADOW.w; x += 64) g.drawImage(tiles, 64, 64, 64, 64, x, y, 64, 64);
    // a dirt road across the meadow, under everything else
    const road = (width: number, color: string) => {
      g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-40, MEADOW.h * 0.62); g.bezierCurveTo(MEADOW.w * 0.3, MEADOW.h * 0.78, MEADOW.w * 0.6, MEADOW.h * 0.5, MEADOW.w + 40, MEADOW.h * 0.66); g.stroke();
    };
    road(58, '#a98b57'); road(46, '#d8b779');
    // deterministic scatter
    let seed = 20_261_105;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    type Piece = { y: number; draw: () => void };
    const pieces: Piece[] = [];
    const put = (img: HTMLImageElement, fw: number, fh: number, x: number, y: number, scale: number) =>
      pieces.push({ y, draw: () => g.drawImage(img, 0, 0, fw, fh, x - (fw * scale) / 2, y - fh * scale * 0.85, fw * scale, fh * scale) });
    // castles in the four corners (their lower edges are the sorting line)
    [[0.1, 0.24], [0.9, 0.24], [0.1, 0.9], [0.9, 0.9]].forEach(([fx, fy], i) => {
      const img = castles[i]!; put(img, 320, 256, fx * MEADOW.w, fy * MEADOW.h, 0.8);
    });
    for (let i = 0; i < 46; i++) {
      const left = rnd() < 0.5;
      const x = (left ? rnd() * 0.24 : 0.76 + rnd() * 0.24) * MEADOW.w, y = (0.06 + rnd() * 0.9) * MEADOW.h;
      const corner = (x < 0.2 * MEADOW.w || x > 0.8 * MEADOW.w) && (y < 0.4 * MEADOW.h || y > 0.74 * MEADOW.h);
      if (corner) continue; // the castles stand there
      const t = Math.floor(rnd() * 4);
      put(trees[t]!, 192, t < 2 ? 256 : 192, x, y, 0.7 + rnd() * 0.3);
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * MEADOW.w, y = (0.05 + rnd() * 0.92) * MEADOW.h;
      if (rnd() < 0.6) put(bushes[Math.floor(rnd() * 4)]!, 128, 128, x, y, 0.6);
      else put(rocks[Math.floor(rnd() * 4)]!, 64, 64, x, y, 0.7);
    }
    pieces.sort((p, q) => p.y - q.y).forEach((p) => p.draw());
    return c;
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

  private draw(): void {
    const g = this.g, w = this.canvas.width, h = this.canvas.height;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    const k = Math.max(w / BG.w, h / BG.h);
    this.cover = { k, ox: (w - BG.w * k) / 2, oy: (h - BG.h * k) / 2 };
    this.meadow ??= this.buildMeadow();
    if (this.meadow) g.drawImage(this.meadow, this.cover.ox, this.cover.oy, BG.w * k, BG.h * k);

    const anim = Math.floor(this.tick / 2); // 6 frames a second
    const st = this.strips();
    const lw = st.left[1] - st.left[0], rw = st.right[1] - st.right[0];
    const L = lw >= MIN_STRIP, R = rw >= MIN_STRIP;
    // The figures grow with the window but never wider than the narrower strip allows.
    const s = Math.max(1, Math.min(3, Math.round(Math.min(h / 450, Math.min(L ? lw : 1e9, R ? rw : 1e9) / 60))));
    const u = s * 0.55; // unit scale: the 192 px frames hold a figure about 60 px wide
    const unit = (path: string, fw: number, f: number, x: number, y: number, flip = false, sc = u) => frame(g, path, fw, fw, f, x, y, sc, flip, 0.72);
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
      const flames = [this.flames[anim % 6], this.flames[(anim + 3) % 6]];
      flames.forEach((fr, i) => {
        const k = i ? 0.55 : 0.8;
        g.drawImage(fr, fx + (i ? 6 * s : 0) - (fr.width * s * k) / 2, fy - fr.height * s * k + (i ? 6 : 4) * s, fr.width * s * k, fr.height * s * k);
      });
      seats.filter((r) => r.y >= fy + 6 * s).forEach(draw);
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
