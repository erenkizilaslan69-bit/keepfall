import Phaser from 'phaser';
import type { ArmyView } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, unitOriginY } from './assets';
import { along, routeTo } from './Scouts';

// Our own armies on the road (the server never tells us about anyone else's). An army is drawn as a
// short column of up to six soldiers in its unit types, walking from the gate to the map edge on the
// target's side while it marches, out of sight while it is over there, and back along the same road.
// Shield bearers keep their shield raised (Warrior_Guard) even on the march.

const RUN: Record<string, { anim: string; scale: number }> = {
  okcu: { anim: 'archer-run', scale: UNIT_SCALE },
  kilicli: { anim: 'warrior-run', scale: UNIT_SCALE },
  mizrakci: { anim: 'lancer-run', scale: UNIT_SCALE },
  kalkanli: { anim: 'warrior-guard', scale: SHIELD_SCALE },
};
const MAX_SHOWN = 6;
const GAP = 0.035; // spacing along the road between soldiers of one column
const TWEEN_MS = 950;

export class Armies {
  private columns = new Map<number, Phaser.GameObjects.Sprite[]>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(armies: ArmyView[], opponentSeats: number[]): void {
    const active = new Set<number>();
    for (const a of armies) {
      active.add(a.id);
      const route = routeTo(a.targetSeat, opponentSeats);
      const sprites = this.columnFor(a);
      const heading = a.state === 'marching' ? 1 : -1;
      sprites.forEach((s, i) => {
        // Soldiers behind the leader trail along the road; the column vanishes at the edge.
        const f = Math.min(1, Math.max(0, a.distance - heading * i * GAP));
        const p = along(route, f);
        const target = { x: p.x, y: p.y + (i % 2 === 0 ? -6 : 6) };
        s.setVisible(a.distance < 0.98);
        if (Math.abs(target.x - s.x) > 1) s.setFlipX(target.x < s.x);
        this.scene.tweens.killTweensOf(s);
        this.scene.tweens.add({ targets: s, x: target.x, y: target.y, duration: TWEEN_MS, onUpdate: () => s.setDepth(s.y) });
      });
    }
    for (const [id, sprites] of this.columns) {
      if (active.has(id)) continue;
      for (const s of sprites) { this.scene.tweens.killTweensOf(s); s.destroy(); }
      this.columns.delete(id);
    }
  }

  /** One sprite per soldier up to MAX_SHOWN, in proportion to the army's unit types. */
  private columnFor(a: ArmyView): Phaser.GameObjects.Sprite[] {
    const total = a.units.reduce((n, u) => n + u.count, 0);
    const wanted: string[] = [];
    for (const u of a.units) {
      const share = Math.max(1, Math.round((u.count / Math.max(total, 1)) * Math.min(total, MAX_SHOWN)));
      for (let i = 0; i < share && wanted.length < MAX_SHOWN; i++) wanted.push(u.unitId);
    }
    let sprites = this.columns.get(a.id);
    if (!sprites || sprites.map((s) => s.getData('unit')).join() !== wanted.join()) {
      const from = sprites?.[0] ? { x: sprites[0].x, y: sprites[0].y } : null;
      sprites?.forEach((s) => s.destroy());
      sprites = wanted.map((unit) => {
        const look = RUN[unit] ?? { anim: 'pawn-run', scale: UNIT_SCALE };
        const s = this.scene.add.sprite(from?.x ?? 512, from?.y ?? 452, look.anim)
          .setScale(look.scale).setOrigin(0.5, unitOriginY(look.anim)).setData('unit', unit);
        s.play({ key: look.anim, startFrame: Phaser.Math.Between(0, 3) });
        return s;
      });
      this.columns.set(a.id, sprites);
    }
    return sprites;
  }
}
