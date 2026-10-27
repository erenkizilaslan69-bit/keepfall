import Phaser from 'phaser';
import type { Rect, TrailView, Vec, VisionView } from '../types';
import { TILE } from './layout';
import { toWorld } from './world';

// Fog of war, drawn: the map darkened everywhere except the circles the player sees through. This is
// only the picture; the real fog is on the server, which never sends what lies outside the circles.
// The castle's circle is fixed, the armies' and scouts' circles follow them as they walk. Drawn at an
// eighth of the map's resolution and scaled up, which also softens the edges.

const SCALE = 8;
const DEPTH = 9_500; // above everything that stands on the map, below labels and bars
const FOG_COLOR = 0x0b1016, FOG_ALPHA = 0.62;
const REDRAW_MS = 80;

export class Fog {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly hole: Phaser.GameObjects.Image;
  /** A plain rectangle, to wipe a corner's fog clean before it is laid down again. */
  private readonly block: Phaser.GameObjects.Image;
  private lastDraw = 0;

  /** The fog texture's top-left corner (scene px): it reaches <paramref name="pad"/> tiles beyond the map, over the sea too, so the water never changes shade at the map's edge. */
  private readonly base: { x: number; y: number };

  constructor(scene: Phaser.Scene, mapSize: number, pad = 0) {
    const size = Math.ceil(((mapSize + 2 * pad) * TILE) / SCALE);
    const topLeft = toWorld({ x: 0, y: 0 });
    this.base = { x: topLeft.x - pad * TILE, y: topLeft.y - pad * TILE };
    this.rt = scene.add.renderTexture(this.base.x, this.base.y, size, size).setOrigin(0).setScale(SCALE).setDepth(DEPTH);
    this.hole = scene.make.image({ key: Fog.holeTexture(scene), add: false });
    this.block = scene.make.image({ key: '__WHITE', add: false }).setOrigin(0);
  }

  setVisible(visible: boolean): void {
    this.rt.setVisible(visible);
  }

  /**
   * <paramref name="fixed"/>: the castle's sight; <paramref name="moving"/>: armies and scouts where they are now;
   * <paramref name="trail"/>: ground our scouts walked over (fading out as it closes); <paramref name="foreign"/>: other
   * players' corners, which the trail never opens.
   */
  draw(fixed: VisionView[], moving: { center: Vec; radius: number }[], trail: TrailView[] = [], foreign: Rect[] = [], force = false): void {
    const now = performance.now();
    if (!force && now - this.lastDraw < REDRAW_MS) return;
    this.lastDraw = now;
    const topLeft = this.base;
    this.rt.clear().fill(FOG_COLOR, FOG_ALPHA);
    const open = (c: { center: Vec; radius: number }, alpha: number) => {
      const p = toWorld(c.center);
      const diameter = (c.radius * 2 * TILE) / SCALE;
      this.hole.setDisplaySize(diameter * 1.15, diameter * 1.15) // the soft rim sits just outside the radius
        .setPosition((p.x - topLeft.x) / SCALE, (p.y - topLeft.y) / SCALE).setAlpha(alpha);
      this.rt.erase(this.hole);
    };
    for (const c of trail) open(c, c.fade);
    // What is inside a castle's corner is learned from reports, not by looking at it from the road.
    for (const r of foreign) {
      const p = toWorld({ x: r.x, y: r.y });
      const x = (p.x - topLeft.x) / SCALE, y = (p.y - topLeft.y) / SCALE, w = (r.w * TILE) / SCALE, h = (r.h * TILE) / SCALE;
      this.block.setDisplaySize(w, h).setPosition(x, y).setAlpha(1);
      this.rt.erase(this.block).fill(FOG_COLOR, FOG_ALPHA, x, y, w, h);
    }
    for (const c of [...fixed, ...moving]) open(c, 1);
  }

  /** A white disc fading out at the rim, made once. */
  private static holeTexture(scene: Phaser.Scene): string {
    const key = 'fog-hole';
    if (scene.textures.exists(key)) return key;
    const size = 128;
    const canvas = scene.textures.createCanvas(key, size, size)!;
    const ctx = canvas.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.8, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    canvas.refresh();
    return key;
  }
}
