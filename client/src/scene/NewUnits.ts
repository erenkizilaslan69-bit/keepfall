import Phaser from 'phaser';
import { flameCanvas } from './PixelArt';

// The camp fire's flame, drawn in code at load time. (The cavalry and the catapult are Tiny Swords Warfare sheets now: see assets.ts.)

/** The camp fire's flame: six frames, 48×64, in a strip texture and an animation named "campfire". */
export const FLAME_FRAME = { w: 48, h: 64 };
export function makeCampfire(scene: Phaser.Scene): void {
  if (scene.textures.exists('campfire')) return;
  const frames = [0, 1, 2, 3, 4, 5].map((f) => flameCanvas(f, 6));
  const { w, h } = FLAME_FRAME;
  const strip = document.createElement('canvas');
  strip.width = w * frames.length; strip.height = h;
  const g = strip.getContext('2d')!;
  frames.forEach((f, i) => g.drawImage(f, i * w, 0));
  const tex = scene.textures.addCanvas('campfire', strip)!;
  frames.forEach((_, i) => tex.add(i, 0, i * w, 0, w, h));
  scene.anims.create({ key: 'campfire', frames: frames.map((_, i) => ({ key: 'campfire', frame: i })), frameRate: 9, repeat: -1 });
}
