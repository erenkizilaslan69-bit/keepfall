import Phaser from 'phaser';
import { reducedEffects } from '../prefs';

// A small drifting smoke over the chimneys of the kingdoms' buildings, next to the still smoke the pictures already carry. The spots are the
// chimneys' tops as shares of the picture (x from the left, y from the top); a building without a chimney has none. Cosmetic only.

const KEY = 'kf-puff';
const DEPTH_SMOKE = 8_000;

/** Where the chimney of a picture ends, by `look:building`. */
export const CHIMNEYS: Record<string, [number, number]> = {
  'golge:forge': [0.85, 0.2], 'golge:lumberCamp': [0.47, 0.2],
  'tuccar:forge': [0.31, 0.06],
  'kahin:forge': [0.69, 0.14],
  'entrikaci:forge': [0.78, 0.07],
};

function puffTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(KEY)) return;
  const c = scene.textures.createCanvas(KEY, 16, 16)!;
  const g = c.getContext();
  // a blotch of a few blocky pixels, lighter in the middle
  const px = (x: number, y: number, w: number, h: number, a: number) => { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, y, w, h); };
  px(4, 2, 8, 12, 0.5); px(2, 4, 12, 8, 0.5); px(5, 4, 6, 8, 0.8); px(6, 6, 4, 4, 1);
  c.refresh();
}

export class Chimneys {
  private readonly emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();
  private readonly enabled: boolean;

  constructor(private readonly scene: Phaser.Scene) {
    this.enabled = new URLSearchParams(location.search).get('fx') !== '0';
    if (this.enabled) puffTexture(scene);
  }

  /** (Re)places the smoke of a building at the chimney's world position; `look` tints it (the shadow's smoke is purplish). */
  set(id: string, x: number, y: number, look: string): void {
    this.clear(id);
    if (!this.enabled) return;
    const tint = look === 'golge' ? [0x8c7aa8, 0x6e5f88] : look === 'kahin' ? [0xdfe6f2, 0xc2cce0] : [0xb4aaa0, 0x948a80];
    const e = this.scene.add.particles(x, y, KEY, {
      lifespan: { min: 2400, max: 3400 }, frequency: 420, quantity: 1,
      speedY: { min: -26, max: -16 }, speedX: { min: 5, max: 16 }, // up and a little downwind
      scale: { start: 0.9, end: 2.6 }, alpha: { start: 0.8, end: 0 }, tint, rotate: { min: -20, max: 20 },
    }).setDepth(DEPTH_SMOKE);
    this.emitters.set(id, e);
  }

  clear(id: string): void {
    this.emitters.get(id)?.destroy();
    this.emitters.delete(id);
  }

  /** Pauses the smoke of the players who asked for less motion. */
  update(): void {
    const still = reducedEffects();
    for (const e of this.emitters.values()) if (e.emitting === still) e.emitting = !still;
  }
}
