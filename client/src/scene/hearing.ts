import type Phaser from 'phaser';

/**
 * How loudly a sound at scene pixel (x, y) is heard, 0–1: full in the middle of the view, a little less towards its edge, faint beyond it, silent far away
 * (a battle on the other side of the map is no sound at all). The camera's zoom is part of it: zoomed out, more of the world is "in view".
 */
export function hearing(scene: Phaser.Scene, x: number, y: number): number {
  const cam = scene.cameras?.main;
  if (!cam) return 0;
  const v = cam.worldView;
  const d = Math.hypot(x - (v.x + v.width / 2), y - (v.y + v.height / 2));
  const r = Math.hypot(v.width, v.height) / 2;
  if (d <= r) return 1 - 0.45 * (d / r);
  if (d <= r * 2) return 0.55 * (2 - d / r) * 0.45;
  return 0;
}
