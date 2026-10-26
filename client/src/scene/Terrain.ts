import Phaser from 'phaser';
import type { MapLayoutView, RoadView, Vec } from '../types';
import { TILE } from './layout';
import { distanceToSegment, seeded, toWorld } from './world';

// The look of the ground: sea with moving ripples and foam, a sandy beach with rocks along the coast, grass in a few tones, dirt patches,
// flowers and tufts, soft shadows, a darker forest floor. Everything here is cosmetic and drawn from the map's public layout and a seed
// (the room code), so everyone in a match sees the same map; it never depends on what a player has found or can see.
//
// Cost: the still parts are painted ONCE into textures (a low-resolution tone layer, the beach strips, dirt patches) or batched in a
// Blitter (flowers, tufts, shadows: one draw call for thousands); only the sea moves, with two scrolling tile sprites and the foam sprites.
// Layers sit between the water/ground at the bottom and the roads and everything that stands on the map, so nothing here can cover a unit,
// a road or a sign; the fog (depth 9 500) is drawn over all of it.

export const DEPTH = { ripple: -99_500, foam: -99_000, rocksWater: -98_500, tone: -89_000, dirt: -88_500, sand: -88_000, flora: -85_000, shade: -70_000 };

const SHADE_W = 112, SHADE_H = 56;
const CELL = 3; // pixel-art "pixel" of the hand-made sprites (px)

/** Bobs in one Blitter per square of the map, so only the squares the camera sees are drawn. */
class Chunked {
  private readonly cells = new Map<string, { blitter: Phaser.GameObjects.Blitter; x: number; y: number }>();
  constructor(private readonly scene: Phaser.Scene, private readonly texture: string, private readonly depth: number, private readonly size = 640) {}

  create(x: number, y: number, frame: string): void {
    const cx = Math.floor(x / this.size), cy = Math.floor(y / this.size), key = `${cx},${cy}`;
    let cell = this.cells.get(key);
    if (!cell) {
      cell = { blitter: this.scene.add.blitter(0, 0, this.texture).setDepth(this.depth), x: cx * this.size, y: cy * this.size };
      this.cells.set(key, cell);
    }
    cell.blitter.create(x, y, frame);
  }

  cull(view: Phaser.Geom.Rectangle): void {
    const m = 60;
    for (const c of this.cells.values()) {
      const visible = c.x + this.size + m > view.x && c.x - m < view.right && c.y + this.size + m > view.y && c.y - m < view.bottom;
      if (c.blitter.visible !== visible) c.blitter.setVisible(visible);
    }
  }
}

export class Terrain {
  private readonly ripples: Phaser.GameObjects.TileSprite[] = [];
  /** Foam and rocks in the water: their frames are stepped by hand, and only the ones the camera sees are alive. */
  private readonly watery: { sprite: Phaser.GameObjects.Sprite; offset: number }[] = [];
  private readonly foams: Phaser.GameObjects.RenderTexture[][] = [];
  private clock = 0;
  private lastFrame = -1;
  private readonly trees: Chunked;
  private readonly flora: Chunked;
  private readonly N: number;
  private readonly left: number; private readonly top: number; private readonly right: number; private readonly bottom: number;

  constructor(private readonly scene: Phaser.Scene, private readonly layout: MapLayoutView, private readonly seed: number, ground: Phaser.Tilemaps.TilemapLayer | null = null) {
    this.N = layout.size;
    const a = toWorld({ x: 1, y: 1 }), b = toWorld({ x: this.N - 1, y: this.N - 1 }); // the island: inside the one-tile sea border
    this.left = a.x; this.top = a.y; this.right = b.x; this.bottom = b.y;
    makeTextures(scene);
    this.trees = new Chunked(scene, 'kf-shade', DEPTH.shade);
    this.flora = new Chunked(scene, 'kf-flora', DEPTH.flora);
    const flag = new URLSearchParams(location.search).get('tx') ?? ''; // dev only: ?tx=sea,foam,tone,beach,dirt,flora,shade switches parts off for frame-rate tests
    if (!flag.includes('sea')) this.sea();
    if (!flag.includes('foam')) this.foam();
    if (ground && !flag.includes('tone')) this.tintGround(ground);
    if (!flag.includes('beach')) this.beach();
    if (!flag.includes('dirt')) this.dirt();
    if (!flag.includes('flora')) this.blooms();
  }

  /** The sea's ripples drift: a few thin tile sprites moving, nothing else. */
  update(dt: number, view?: Phaser.Geom.Rectangle): void {
    if (view) { this.trees.cull(view); this.flora.cull(view); }
    for (const r of this.ripples) r.setTilePosition(r.tilePositionX + 9 * dt, r.tilePositionY + 4 * dt);
    this.clock += dt;
    // the two foam frames trade places
    const wave = 0.5 + 0.5 * Math.sin(this.clock * 1.6);
    this.foams[0]?.forEach((rt) => rt.setAlpha(0.25 + 0.75 * wave));
    this.foams[1]?.forEach((rt) => rt.setAlpha(0.25 + 0.75 * (1 - wave)));
    const frame = Math.floor(this.clock * 8); // 8 frames a second, like the pack's animations
    for (const w of this.watery) {
      const s = w.sprite;
      const seen = !view || (s.x + 120 > view.x && s.x - 120 < view.right && s.y + 120 > view.y && s.y - 120 < view.bottom);
      if (seen !== s.active) { s.setActive(seen).setVisible(seen); if (seen) s.setFrame((frame + w.offset) % 16); }
      else if (seen && frame !== this.lastFrame) s.setFrame((frame + w.offset) % 16);
    }
    this.lastFrame = frame;
  }

  /** A soft shadow on the ground for a tree (batched: thousands cost one draw). */
  treeShadow(x: number, y: number, scale = 1): void {
    this.trees.create(x - (SHADE_W * scale) / 2 + 10, y - (SHADE_H * scale) / 2 - 2, '__BASE');
  }

  /** A soft shadow under a building or a bigger thing: <paramref name="w"/> wide, standing on (x, y). */
  shade(x: number, y: number, w: number, h = w * 0.3): Phaser.GameObjects.Image {
    return this.scene.add.image(x + w * 0.06, y - h * 0.2, 'kf-shade').setDisplaySize(w, h).setDepth(DEPTH.shade).setAlpha(0.9);
  }

  /** Pebbles and tufts along the edges of the roads (the roads themselves are drawn by the scene). */
  roadEdges(roads: RoadView[], halfWidth: number): void {
    const rnd = seeded(this.seed ^ 0x51ed);
    for (const road of roads) {
      const pts = road.points.map((p) => toWorld(p));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) continue;
        const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
        for (let d = 10; d < len - 10; d += 26 + rnd() * 30) {
          for (const side of [-1, 1]) {
            if (rnd() < 0.35) continue;
            const off = side * (halfWidth + 3 + rnd() * 9);
            const x = a.x + ((b.x - a.x) * d) / len + nx * off, y = a.y + ((b.y - a.y) * d) / len + ny * off;
            this.bloom(x, y, rnd() < 0.55 ? 'tuft' + Math.floor(rnd() * 3) : 'pebble' + Math.floor(rnd() * 2));
          }
        }
      }
    }
  }

  // ---- the sea -------------------------------------------------------------------------------

  private sea(): void {
    // The sea shows only in the one-tile border round the island, so the ripples are four thin strips, not a map-sized layer.
    const o = toWorld({ x: 0, y: 0 }), size = this.N * TILE;
    const strips = [[o.x, o.y, size, TILE], [o.x, o.y + size - TILE, size, TILE], [o.x, o.y + TILE, TILE, size - 2 * TILE], [o.x + size - TILE, o.y + TILE, TILE, size - 2 * TILE]];
    for (const [i, alpha] of [[0, 0.45]] as const)
      for (const [x, y, w, h] of strips)
        this.ripples.push(this.scene.add.tileSprite(x, y, w, h, 'kf-ripple').setOrigin(0).setAlpha(alpha).setDepth(DEPTH.ripple + i)
          .setTilePosition(i * 70, i * 40));
  }

  /**
   * Foam along the coast: two frames of the pack's foam are painted once into thin strips round the island, and the strips cross-fade
   * (a few strips instead of one animated sprite per coast tile, which cost frames).
   */
  private foam(): void {
    const last = this.N - 2, size = this.N * TILE, o = toWorld({ x: 0, y: 0 });
    const strips: { x: number; y: number; w: number; h: number; tiles: [number, number][] }[] = [];
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
    strips.push({ x: o.x, y: o.y, w: size, h: TILE, tiles: range(1, last).map((i) => [i, 1]) });
    strips.push({ x: o.x, y: o.y + size - TILE, w: size, h: TILE, tiles: range(1, last).map((i) => [i, last]) });
    strips.push({ x: o.x, y: o.y + TILE, w: TILE, h: size - 2 * TILE, tiles: range(2, last - 1).map((i) => [1, i]) });
    strips.push({ x: o.x + size - TILE, y: o.y + TILE, w: TILE, h: size - 2 * TILE, tiles: range(2, last - 1).map((i) => [last, i]) });
    for (const frame of [2, 10]) {
      const tmp = this.scene.make.sprite({ key: 'foam', frame, add: false });
      const layer: Phaser.GameObjects.RenderTexture[] = [];
      for (const st of strips) {
        const rt = this.scene.add.renderTexture(st.x, st.y, st.w, st.h).setOrigin(0).setDepth(DEPTH.foam);
        for (const [tx, ty] of st.tiles) { const p = toWorld({ x: tx + 0.5, y: ty + 0.5 }); tmp.setPosition(p.x - st.x, p.y - st.y); rt.draw(tmp); }
        layer.push(rt);
      }
      tmp.destroy();
      this.foams.push(layer);
    }
    // rocks standing in the water, a little off the coast
    const r2 = seeded(this.seed ^ 0xa11);
    for (let k = 0; k < 18; k++) {
      const side = k % 4, t = r2();
      const along = (side % 2 === 0 ? this.left + 150 + t * (this.right - this.left - 300) : this.top + 150 + t * (this.bottom - this.top - 300));
      const off = 18 + r2() * 14;
      const x = side === 0 ? along : side === 1 ? this.right + off : side === 2 ? along : this.left - off;
      const y = side === 0 ? this.top - off : side === 1 ? along : side === 2 ? this.bottom + off : along;
      const key = `wrock${1 + Math.floor(r2() * 4)}`;
      this.watery.push({ sprite: this.scene.add.sprite(x, y, key, 0).setDepth(DEPTH.rocksWater).setScale(0.8 + r2() * 0.3).setActive(false).setVisible(false), offset: Math.floor(r2() * 16) });
    }
  }

  // ---- grass tones, the forest floor -------------------------------------------------------------

  /**
   * Grass in a few tones, and a darker forest floor: each ground tile gets a slight tint from smooth noise, so there is nothing extra to
   * draw over the screen (a map-sized layer of soft blobs cost frames).
   */
  private tintGround(ground: Phaser.Tilemaps.TilemapLayer): void {
    const rnd = seeded(this.seed ^ 0x7013);
    const G = 9, lattice = Array.from({ length: G + 2 }, () => Array.from({ length: G + 2 }, () => rnd()));
    const noise = (x: number, y: number) => {
      const fx = (x / this.N) * G, fy = (y / this.N) * G, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const sm = (u: number) => u * u * (3 - 2 * u);
      const a = lattice[iy][ix], b = lattice[iy][ix + 1], c = lattice[iy + 1][ix], d = lattice[iy + 1][ix + 1];
      return (a + (b - a) * sm(tx)) * (1 - sm(ty)) + (c + (d - c) * sm(tx)) * sm(ty);
    };
    const forests = this.layout.features.filter((f) => f.kind === 'forest');
    const o = toWorld({ x: 0, y: 0 });
    ground.forEachTile((tile) => {
      if (tile.index < 0) return;
      const tx = tile.x + 0.5, ty = tile.y + 0.5;
      const n = noise(tx, ty) + (rnd() - 0.5) * 0.06;
      let r = 255, g = 255, b = 255;
      if (n < 0.5) { const k = (0.5 - n) * 2; r -= 40 * k; g -= 18 * k; b -= 44 * k; }          // deeper green
      else { const k = (n - 0.5) * 2; b -= 52 * k; g -= 6 * k; }                                    // warmer, sunlit
      for (const f of forests) {                                                                    // the forest floor: darker toward the middle
        const d = Math.hypot(tx - f.center.x, ty - f.center.y) / (f.radius * 1.25);
        if (d < 1) { const k = (1 - d) * (1 - d) * 0.5 + (1 - d) * 0.22; r -= 85 * k; g -= 62 * k; b -= 80 * k; }
      }
      tile.tint = Phaser.Display.Color.GetColor(Math.max(0, r), Math.max(0, g), Math.max(0, b));
    });
    void o;
  }

  // ---- the beach ------------------------------------------------------------------------------

  /** A strip of sand along every coast, its inner edge stepping in and out in pixel blocks; rocks lie on it. */
  private beach(): void {
    const rnd = seeded(this.seed ^ 0xbeac);
    const phase = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
    const MAXW = 96;
    const strip = (side: number) => {
      const horizontal = side % 2 === 0;
      const len = Math.round(this.right - this.left);
      const w = horizontal ? len : MAXW, h = horizontal ? MAXW : len;
      const x0 = side === 1 ? this.right - MAXW : this.left, y0 = side === 2 ? this.bottom - MAXW : this.top;
      const rt = this.scene.add.renderTexture(x0, y0, w, h).setOrigin(0).setDepth(DEPTH.sand);
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      const flip = side === 1 || side === 2; // the water is on the far side of the strip (right and bottom coasts)
      const rect = (u: number, d0: number, d1: number, color: number, alpha = 1, thick = 8) => {
        // u: along the coast, d0..d1: distance from the water
        g.fillStyle(color, alpha);
        const a = flip ? MAXW - d1 : d0, b = flip ? MAXW - d0 : d1;
        if (horizontal) g.fillRect(u, a, thick, b - a); else g.fillRect(a, u, b - a, thick);
      };
      const p = phase[side];
      for (let u = 0; u < len; u += 8) {
        const wob = Math.sin(u * 0.011 + p) * 12 + Math.sin(u * 0.037 + p * 2) * 7 + (rnd() - 0.5) * 6;
        const width = Math.max(30, Math.min(MAXW - 12, Math.round((54 + wob) / 4) * 4));
        rect(u, 0, 14, 0xd3b680);                    // wet sand at the water
        rect(u, 14, width, 0xe9d095);                // dry sand
        rect(u, 14, Math.max(16, width - 22), 0xf2e0aa, 0.9); // sun-bleached middle
        if (rnd() < 0.55) rect(u, width, width + 4 + Math.floor(rnd() * 4) * 2, 0xe0c98c, 0.8, 4 + Math.floor(rnd() * 2) * 4); // ragged border
      }
      // speckles
      for (let i = 0; i < len / 7; i++) {
        const u = Math.floor(rnd() * len), d = 14 + Math.floor(rnd() * 50);
        g.fillStyle(rnd() < 0.5 ? 0xc7a76d : 0xfbf0c6, 0.85);
        const a = flip ? MAXW - d - 2 : d;
        if (horizontal) g.fillRect(u, a, 2, 2); else g.fillRect(a, u, 2, 2);
      }
      rt.draw(g);
      g.destroy();
    };
    for (let s = 0; s < 4; s++) strip(s);

    // rocks on the sand (ordinary sprites: they stand like anything else, in front of or behind by their y)
    for (let k = 0; k < 34; k++) {
      const side = k % 4, t = rnd(), inset = 16 + rnd() * 36;
      const along = (side % 2 === 0 ? this.left + 90 + t * (this.right - this.left - 180) : this.top + 90 + t * (this.bottom - this.top - 180));
      const x = side === 0 || side === 2 ? along : side === 1 ? this.right - inset : this.left + inset;
      const y = side === 1 || side === 3 ? along : side === 0 ? this.top + inset : this.bottom - inset;
      this.scene.add.image(x, y, `rock${1 + Math.floor(rnd() * 4)}`).setOrigin(0.5, 0.75).setScale(0.45 + rnd() * 0.45).setDepth(y).setFlipX(rnd() < 0.5);
    }
  }

  // ---- dirt, flowers, tufts ----------------------------------------------------------------------

  /** Where decorations may go: on grass, away from the coast, the roads and (mostly) the players' corners. */
  private grass(x: number, y: number, roadMargin: number, edge = 130): boolean {
    if (x < this.left + edge || x > this.right - edge || y < this.top + edge || y > this.bottom - edge) return false;
    return this.layout.roads.every((r) => r.points.slice(1).every((b, j) => {
      const a = r.points[j];
      return distanceToSegment(this.toTiles(x, y), a, b) > roadMargin / TILE;
    }));
  }

  private toTiles(x: number, y: number): Vec {
    const o = toWorld({ x: 0, y: 0 });
    return { x: (x - o.x) / TILE, y: (y - o.y) / TILE };
  }

  private inCorner(x: number, y: number, pad = 0): boolean {
    const t = this.toTiles(x, y);
    return this.layout.regions.some((r) => t.x > r.origin.x - pad && t.x < r.origin.x + r.width + pad && t.y > r.origin.y - pad && t.y < r.origin.y + r.height + pad);
  }

  private inForest(x: number, y: number): number {
    const t = this.toTiles(x, y);
    for (const f of this.layout.features) if (f.kind === 'forest') { const d = Math.hypot(t.x - f.center.x, t.y - f.center.y) / f.radius; if (d < 1) return d; }
    return -1;
  }

  /**
   * Patches of bare earth: few, of very different sizes (mostly small, an occasional big one), a part of them in small groups
   * (a big patch with one or two small ones round it) and the rest on their own, so they do not read as a pattern.
   */
  private dirt(): void {
    const rnd = seeded(this.seed ^ 0xd127);
    const placed: { x: number; y: number; r: number }[] = [];
    const free = (x: number, y: number, r: number, gap: number) =>
      this.grass(x, y, 150 + r * 0.4, 220) && !this.inCorner(x, y, 1) && this.inForest(x, y) < 0 && placed.every((q) => Math.hypot(q.x - x, q.y - y) > gap + q.r + r);
    const put = (x: number, y: number, scale: number): void => {
      placed.push({ x, y, r: 70 * scale });
      this.scene.add.image(x, y, `kf-dirt${Math.floor(rnd() * 4)}`).setDepth(DEPTH.dirt).setScale(scale).setFlipX(rnd() < 0.5).setFlipY(rnd() < 0.5)
        .setAngle((rnd() - 0.5) * 24).setAlpha(0.92);
    };
    const where = (): Vec => ({ x: this.left + rnd() * (this.right - this.left), y: this.top + rnd() * (this.bottom - this.top) });
    // sizes: many small, few big
    const size = () => 0.3 + rnd() * rnd() * 1.15;

    // groups: one bigger patch and one or two smaller ones close by
    for (let g = 0, tries = 0; g < 3 && tries < 600; tries++) {
      const c = where(), big = 0.7 + rnd() * 0.55;
      if (!free(c.x, c.y, 70 * big, 520)) continue;
      put(c.x, c.y, big);
      for (let k = 0, n = 1 + Math.floor(rnd() * 2), t = 0; k < n && t < 40; t++) {
        const angle = rnd() * Math.PI * 2, dist = 90 * big + 60 + rnd() * 90, sm = 0.28 + rnd() * 0.4;
        const x = c.x + Math.cos(angle) * dist, y = c.y + Math.sin(angle) * dist;
        if (!free(x, y, 70 * sm, 18)) continue;
        put(x, y, sm);
        k++;
      }
      g++;
    }
    // loners, far from everything
    for (let n = 0, tries = 0; n < 4 && tries < 600; tries++) {
      const p = where(), sc = size();
      if (!free(p.x, p.y, 70 * sc, 420)) continue;
      put(p.x, p.y, sc);
      n++;
    }
  }

  private bloom(x: number, y: number, frame: string): void {
    this.flora.create(x - 18, y - 30, frame);
  }

  /** Flowers in clumps, tufts of grass, a few pebbles and mushrooms. */
  private blooms(): void {
    const rnd = seeded(this.seed ^ 0xf10a);
    const flowers = ['daisy', 'butter', 'pink', 'violet', 'blue', 'poppy'];
    for (let c = 0; c < 260; c++) {
      const cx = this.left + rnd() * (this.right - this.left), cy = this.top + rnd() * (this.bottom - this.top);
      const forest = this.inForest(cx, cy);
      const corner = this.inCorner(cx, cy, 0);
      if (!this.grass(cx, cy, 52, 150) || (corner && rnd() < 0.7)) continue;
      const kind = forest >= 0 ? (rnd() < 0.5 ? 'mush' : 'tuft0') : flowers[Math.floor(rnd() * flowers.length)];
      const n = forest >= 0 ? 2 : 3 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++) {
        const x = cx + (rnd() - 0.5) * 100, y = cy + (rnd() - 0.5) * 70;
        if (!this.grass(x, y, 46, 140)) continue;
        this.bloom(x, y, rnd() < 0.8 ? kind : 'tuft' + Math.floor(rnd() * 3));
      }
    }
    for (let i = 0; i < 520; i++) {
      const x = this.left + rnd() * (this.right - this.left), y = this.top + rnd() * (this.bottom - this.top);
      if (!this.grass(x, y, 46, 130) || (this.inCorner(x, y, 0) && rnd() < 0.6)) continue;
      this.bloom(x, y, rnd() < 0.85 ? 'tuft' + Math.floor(rnd() * 3) : 'pebble' + Math.floor(rnd() * 2));
    }
  }
}

// ---- generated textures (once per game) ---------------------------------------------------------------

function makeTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  const canvas = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    if (tex.exists(key)) return;
    const c = tex.createCanvas(key, w, h)!;
    draw(c.getContext());
    c.refresh();
  };
  const px = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x * CELL, y * CELL, w * CELL, h * CELL); };

  // soft white disc (tone blobs)
  canvas('kf-soft', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
  // soft shadow: a dark ellipse fading out
  canvas('kf-shade', SHADE_W, SHADE_H, (ctx) => {
    ctx.save(); ctx.scale(1, SHADE_H / SHADE_W);
    const g = ctx.createRadialGradient(SHADE_W / 2, SHADE_W / 2, 0, SHADE_W / 2, SHADE_W / 2, SHADE_W / 2);
    g.addColorStop(0, 'rgba(14,30,10,.5)'); g.addColorStop(0.6, 'rgba(14,30,10,.3)'); g.addColorStop(1, 'rgba(14,30,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, SHADE_W, SHADE_W); ctx.restore();
  });
  // sea ripples: short light dashes, drawn twice so the tile joins without a seam
  canvas('kf-ripple', 192, 192, (ctx) => {
    const rnd = seeded(4242);
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rnd() * 192), y = Math.floor(rnd() * 96) * 2, w = 12 + Math.floor(rnd() * 5) * 6;
      ctx.fillStyle = rnd() < 0.7 ? 'rgba(255,255,255,.45)' : 'rgba(190,235,240,.5)';
      for (const dx of [0, -192]) for (const dy of [0, -192]) ctx.fillRect(x + dx, y + dy, w, 3);
    }
  });
  // dirt patches: pixel-stepped blobs with a darker rim
  for (let v = 0; v < 4; v++) {
    canvas(`kf-dirt${v}`, 200, 136, (ctx) => {
      const rnd = seeded(900 + v * 31), a = rnd() * 6, b = rnd() * 6, c = rnd() * 6;
      const cell = 4, cols = 50, rows = 34;
      const inside = (i: number, j: number) => {
        const dx = (i - cols / 2) / (cols / 2), dy = (j - rows / 2) / (rows / 2), r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        return r < 0.86 + 0.12 * Math.sin(3 * ang + a) + 0.08 * Math.sin(5 * ang + b) + 0.05 * Math.sin(8 * ang + c);
      };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (!inside(i, j)) continue;
        const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
        ctx.fillStyle = edge ? '#9a7442' : rnd() < 0.12 ? '#c4a06a' : rnd() < 0.1 ? '#a98150' : '#b58d58';
        ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    });
  }
  // flowers, tufts, pebbles, a mushroom: 12×12 "pixels" of 3 px in a 36×36 frame
  const names = ['daisy', 'butter', 'pink', 'violet', 'blue', 'poppy', 'tuft0', 'tuft1', 'tuft2', 'pebble0', 'pebble1', 'mush'];
  if (!tex.exists('kf-flora')) {
    const c = tex.createCanvas('kf-flora', 36 * names.length, 36)!;
    const ctx = c.getContext();
    const frame = (i: number, draw: (ox: (x: number) => number) => void) => draw((x) => x + i * 12);
    const colors: Record<string, [string, string]> = {
      daisy: ['#ffffff', '#f5c542'], butter: ['#f7d23e', '#e08a12'], pink: ['#f48fb1', '#b8326c'], violet: ['#b58cf5', '#6a3fb5'], blue: ['#7ab8ff', '#2c6cc5'], poppy: ['#e8503a', '#7a1a10'],
    };
    names.forEach((name, i) => {
      frame(i, (ox) => {
        if (colors[name]) {
          const [petal, center] = colors[name];
          px(ctx, ox(5), 6, 1, 5, '#3f7d2a'); px(ctx, ox(4), 8, 1, 1, '#4f9a34'); px(ctx, ox(6), 9, 1, 1, '#4f9a34');
          for (const [x, y] of [[5, 1], [4, 2], [6, 2], [3, 3], [7, 3], [4, 4], [6, 4], [5, 5]]) px(ctx, ox(x), y, 1, 1, petal);
          px(ctx, ox(5), 3, 1, 1, center); px(ctx, ox(4), 3, 1, 1, center); px(ctx, ox(6), 3, 1, 1, center); px(ctx, ox(5), 2, 1, 1, center); px(ctx, ox(5), 4, 1, 1, center);
        } else if (name.startsWith('tuft')) {
          const v = Number(name[4]);
          const blades = [[[2, 6, 1, 5], [5, 3, 1, 8], [8, 5, 1, 6], [10, 7, 1, 4]], [[3, 5, 1, 6], [6, 2, 1, 9], [9, 6, 1, 5]], [[1, 7, 1, 4], [4, 4, 1, 7], [7, 6, 1, 5], [10, 3, 1, 8]]][v];
          blades.forEach(([x, y, w, h], k) => px(ctx, ox(x), y, w, h, k % 2 ? '#6fb23a' : '#3f7d2a'));
        } else if (name.startsWith('pebble')) {
          px(ctx, ox(3), 8, 5, 3, '#8f969d'); px(ctx, ox(4), 7, 3, 1, '#a9b0b6'); px(ctx, ox(4), 8, 2, 1, '#c9cdd1');
          if (name === 'pebble1') { px(ctx, ox(8), 9, 3, 2, '#7e858c'); px(ctx, ox(8), 9, 2, 1, '#b6bbc0'); }
        } else {
          px(ctx, ox(5), 7, 2, 4, '#f0e6d0'); px(ctx, ox(3), 5, 6, 3, '#d84a3a'); px(ctx, ox(4), 4, 4, 1, '#d84a3a'); px(ctx, ox(4), 6, 1, 1, '#ffffff'); px(ctx, ox(7), 5, 1, 1, '#ffffff');
        }
      });
      c.add(name, 0, i * 36, 0, 36, 36);
    });
    c.refresh();
  }
}
