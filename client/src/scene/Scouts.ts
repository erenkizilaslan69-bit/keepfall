import Phaser from 'phaser';
import type { ScoutingView } from '../types';
import { UNIT_SCALE, unitOriginY } from './assets';
import { GATE, WORLD_HEIGHT, WORLD_WIDTH, type Point } from './layout';

// Scouts on a mission. The server only sends each mission's progress (0..1); a scout walks from the
// gate to the map edge on the side of its target during the first quarter, is out of sight while it
// travels and looks, and walks back the same way in the last quarter. The pawn that became the scout
// leaves through the gate (Workers) and the returning one reappears there as idle.

/** Each opponent gets a side of the map, in seat order: right, left, bottom. */
const ROUTES: Point[][] = [
  [GATE, { x: 728, y: 452 }, { x: WORLD_WIDTH + 30, y: 452 }],
  [GATE, { x: 296, y: 452 }, { x: -30, y: 452 }],
  [GATE, { x: GATE.x, y: WORLD_HEIGHT + 40 }],
];

const OUT = 0.25;   // walking out until this progress
const BACK = 0.75;  // walking back from this progress
const TWEEN_MS = 950; // a little under one server tick, so walking looks continuous

export class Scouts {
  private sprites = new Map<number, Phaser.GameObjects.Sprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(scouting: ScoutingView): void {
    const order = [...scouting.targets].sort((a, b) => a.seat - b.seat).map((t) => t.seat);
    const active = new Set<number>();

    for (const m of scouting.missions) {
      active.add(m.targetSeat);
      const route = ROUTES[Math.max(0, order.indexOf(m.targetSeat)) % ROUTES.length];
      const away = m.progress >= OUT && m.progress < BACK;
      // Fraction of the way from the gate to the edge.
      const f = m.progress < OUT ? m.progress / OUT : m.progress >= BACK ? (1 - m.progress) / (1 - BACK) : 1;
      const target = along(route, Math.min(1, Math.max(0, f)));

      let sprite = this.sprites.get(m.targetSeat);
      if (!sprite) {
        sprite = this.scene.add.sprite(GATE.x, GATE.y, 'pawn-run')
          .setScale(UNIT_SCALE).setOrigin(0.5, unitOriginY('pawn'));
        sprite.play('pawn-run');
        this.sprites.set(m.targetSeat, sprite);
      }
      sprite.setVisible(!away);
      if (Math.abs(target.x - sprite.x) > 1) sprite.setFlipX(target.x < sprite.x);
      this.scene.tweens.killTweensOf(sprite);
      this.scene.tweens.add({
        targets: sprite, x: target.x, y: target.y, duration: TWEEN_MS,
        onUpdate: () => sprite!.setDepth(sprite!.y),
      });
    }

    for (const [seat, sprite] of this.sprites) {
      if (active.has(seat)) continue;
      this.scene.tweens.killTweensOf(sprite);
      sprite.destroy();
      this.sprites.delete(seat);
    }
  }
}

/** The point at fraction <paramref name="f"/> of the polyline's length. */
function along(points: Point[], f: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let d = f * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : Math.min(1, d / lengths[i]);
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    d -= lengths[i];
  }
  return points[points.length - 1];
}
