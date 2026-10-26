import Phaser from 'phaser';
import type { Corner, PlayerColor } from '../types';
import { colorKey } from './assets';
import { TILE, type Point } from './layout';

// The wall around a castle's region (16×12 tiles), on the region's edge so every building and worker is inside. It is only a picture of the
// castle's wall level (the server decides the level): 1 a wooden fence, 2 a stone wall, 3 a thick stone wall with towers. The road leaves
// the region sideways at the castle's gate height (west castles: east side, east castles: west side), and that is where the wall has its gate;
// armies and people go through it. Everything is baked once into one texture per region (and re-baked when the level changes);
// the towers are sprites of the pack, in the owner's colour.
//
// The stone is the elevation tileset of Tiny Swords' CC0 "old version" (public/cc0), cut into a cobbled top and a stone face; the fence is
// drawn in code in the pack's colours (the pack has none).

export const REGION_W = 16 * TILE, REGION_H = 12 * TILE;
/** Height (px, region-local) of the gate in the side wall: where the road leaves the castle. */
export const GATE_Y = 452;
const GATE_HALF = 40;
const DEPTH_WALL = -60_000;

const OUTLINE = 0x141a2b;
const FENCE = { dark: 0x4a2f1b, mid: 0x8a5a34, light: 0xb07a48 };

/** Frames cut out of the elevation sheet (the lower group of the sheet: a cobbled top, and the stone face under it). */
export const WALL_SHEET = 'wall-elev';
export const WALL_TOP = 'wall-top', WALL_FACE = 'wall-face';

export function cutWallFrames(scene: Phaser.Scene): void {
  const tex = scene.textures.get(WALL_SHEET);
  if (!tex.has(WALL_TOP)) tex.add(WALL_TOP, 0, 10, 264, 168, 48);
  if (!tex.has(WALL_FACE)) tex.add(WALL_FACE, 0, 6, 324, 176, 48);
}

/** Sizes by level: scale of the stone pieces and the tower scale. */
const STONE = { 2: { scale: 0.42, tower: 0.5 }, 3: { scale: 0.55, tower: 0.62 } } as const;

export class WallRing {
  private level = 0;
  private fallen = false;
  private rt: Phaser.GameObjects.RenderTexture | null = null;
  private towers: Phaser.GameObjects.Image[] = [];

  /**
   * `origin`: the region's top-left corner in scene pixels. `corner`: which corner of the map the region is in (decides which side the gate is on).
   * `color`: the owner's colour; `own`: our colour (whose images have plain keys).
   */
  constructor(private readonly scene: Phaser.Scene, private readonly origin: Point, private readonly corner: Corner,
    private readonly color: PlayerColor, private readonly own: PlayerColor) {}

  /** The gate is on the east side for the western regions, on the west side for the eastern ones. */
  private get gateOnEast(): boolean { return this.corner === 'northWest' || this.corner === 'southWest'; }

  setLevel(level: number): void {
    level = Math.max(1, Math.min(3, Math.floor(level)));
    if (level === this.level) return;
    this.level = level;
    this.destroy();
    cutWallFrames(this.scene);
    const rt = this.scene.add.renderTexture(this.origin.x, this.origin.y, REGION_W, REGION_H).setOrigin(0).setDepth(DEPTH_WALL);
    this.rt = rt;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    if (level === 1) this.fence(g); else this.stone(rt, g, level as 2 | 3);
    rt.draw(g, 0, 0);
    g.destroy();
  }

  /** Where the siege is fought: just outside the gate in the side wall (scene pixels). */
  gatePoint(): Point {
    return { x: this.origin.x + (this.gateOnEast ? REGION_W - 24 : 24), y: this.origin.y + GATE_Y };
  }

  /** The castle has fallen: the wall greys out, the towers are gone (with dust). */
  ruin(fx?: { dust(x: number, y: number, scale: number, tint: number): void }): void {
    if (this.fallen) return;
    this.fallen = true;
    this.rt?.setAlpha(0.45).setTint(0x888888);
    for (const t of this.towers) { fx?.dust(t.x, t.y - 30, 1.6, 0x8a7a66); t.destroy(); }
    this.towers = [];
  }

  destroy(): void {
    this.rt?.destroy();
    this.rt = null;
    for (const t of this.towers) t.destroy();
    this.towers = [];
  }

  // ---- level 1: a wooden fence -------------------------------------------------------------------------------------------------------

  private fence(g: Phaser.GameObjects.Graphics): void {
    const L = 16, R = REGION_W - 16, T = 40, B = REGION_H - 14;
    const east = this.gateOnEast;
    const gate = [GATE_Y - GATE_HALF, GATE_Y + GATE_HALF];
    const rail = (x1: number, y1: number, x2: number, y2: number) => {
      for (const dy of [-20, -9]) {
        g.lineStyle(6, FENCE.dark, 1).lineBetween(x1, y1 + dy, x2, y2 + dy);
        g.lineStyle(3, FENCE.mid, 1).lineBetween(x1, y1 + dy, x2, y2 + dy);
      }
    };
    const post = (x: number, y: number) => {
      g.fillStyle(FENCE.dark, 1).fillRect(x - 4, y - 30, 9, 34);
      g.fillStyle(FENCE.mid, 1).fillRect(x - 3, y - 30, 6, 32);
      g.fillStyle(FENCE.light, 1).fillRect(x - 3, y - 30, 2, 32);
      g.fillStyle(FENCE.dark, 1).fillRect(x - 4, y - 33, 9, 4); // a sharpened top
    };
    rail(L, T, R, T);
    rail(L, B, R, B);
    // the side with the gate has an opening; the other side is whole
    const gateX = east ? R : L, solidX = east ? L : R;
    rail(solidX, T, solidX, B);
    rail(gateX, T, gateX, gate[0]);
    rail(gateX, gate[1], gateX, B);
    for (let x = L; x <= R; x += 22) { post(x, T); post(x, B); }
    for (let y = T; y <= B; y += 22) {
      post(solidX, y);
      if (y < gate[0] - 6 || y > gate[1] + 6) post(gateX, y);
    }
    post(gateX, gate[0]); post(gateX, gate[1]); // the gate posts, a little taller
    g.fillStyle(FENCE.dark, 1).fillRect(gateX - 6, gate[0] - 40, 13, 14).fillRect(gateX - 6, gate[1] - 40, 13, 14);
  }

  // ---- levels 2 and 3: a stone wall (3 is thicker and has towers) --------------------------------------------------------------------

  private stone(rt: Phaser.GameObjects.RenderTexture, g: Phaser.GameObjects.Graphics, level: 2 | 3): void {
    const { scale, tower } = STONE[level];
    const topH = 48 * scale, faceH = 48 * scale, pieceW = 168 * scale;
    const band = topH + faceH;
    const side = 60 * scale * 0.5; // the side walls show only the cobbled top, as a strip
    const L = 4, R = REGION_W - 4, T = 4, B = REGION_H - 4;
    const east = this.gateOnEast;
    const gate = [GATE_Y - GATE_HALF, GATE_Y + GATE_HALF];
    const piece = (key: string, x: number, y: number, w: number, h: number) => {
      const img = this.scene.make.image({ key: WALL_SHEET, frame: key }, false).setOrigin(0).setDisplaySize(w, h);
      rt.draw(img, x, y);
      img.destroy();
    };
    const row = (x0: number, x1: number, yTop: number) => { // a horizontal stretch of wall: cobbled top, stone face under it
      for (let x = x0; x < x1; x += pieceW) {
        const w = Math.min(pieceW, x1 - x);
        piece(WALL_TOP, x, yTop, w, topH);
        piece(WALL_FACE, x, yTop + topH, w, faceH);
      }
    };
    const column = (x: number, y0: number, y1: number) => { // a vertical stretch: the cobbled top seen from above
      for (let y = y0; y < y1; y += topH + 2) piece(WALL_TOP, x, y, side * 2, Math.min(topH + 2, y1 - y));
      g.lineStyle(2, OUTLINE, 1).strokeRect(x, y0, side * 2, y1 - y0);
    };
    row(L, R, T);                    // north
    row(L, R, B - band);             // south
    const sideX = (onEast: boolean) => (onEast ? R - side * 2 : L);
    column(sideX(!east), T + band, B - band);                       // the whole side (no gate)
    column(sideX(east), T + band, gate[0]);                         // the gate side, above the gate…
    column(sideX(east), gate[1], B - band);                         // …and below it
    // dark line along the outside of the rows, so the wall reads against the grass
    g.lineStyle(2, OUTLINE, 0.9).lineBetween(L, T, R, T).lineBetween(L, B, R, B);

    // towers: the corners, and (level 3) either side of the gate; level 2 has two stone posts at the gate
    const gx = east ? R - side : L + side;
    const key = colorKey(this.color, this.own, 'tower');
    const put = (x: number, baseY: number, towerScale: number = tower) => {
      if (!this.scene.textures.exists(key)) return;
      const img = this.scene.add.image(this.origin.x + x, this.origin.y + baseY, key).setOrigin(0.5, 0.92).setScale(towerScale).setDepth(this.origin.y + baseY);
      this.towers.push(img);
    };
    const cornerTower = (x: number, y: number) => put(x, y);
    if (level === 3) {
      cornerTower(L + 26, T + band + 8); cornerTower(R - 26, T + band + 8);
      cornerTower(L + 26, B - 4); cornerTower(R - 26, B - 4);
      // the gate towers stand off the road: the north one just above it, the south one far enough down that its body does not cover the opening
      put(gx, gate[0] - 2, 0.55); put(gx, gate[1] + 128, 0.55);
    } else {
      piece(WALL_TOP, gx - 14, gate[0] - topH, 28, topH); piece(WALL_FACE, gx - 14, gate[0], 28, faceH);
      piece(WALL_TOP, gx - 14, gate[1], 28, topH); piece(WALL_FACE, gx - 14, gate[1] + topH, 28, faceH);
    }
  }
}
