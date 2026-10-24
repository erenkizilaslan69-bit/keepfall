import Phaser from 'phaser';
import type { BattleLineView, PlayerColor, Vec } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, colorKey, unitOriginY } from './assets';
import { toWorld } from './world';

// A battle at a castle gate, played as a short scene: the defenders come out of the gate, the
// attackers run in along the road, they fight (dust, sparks), the fallen fade away in the numbers
// the report says, and everyone clears off. Purely for show: the server settled the battle the
// moment the army arrived; the report pops up when the animation is over.

/** How long the whole clash takes on screen (ms); the battle report waits for it. */
export const CLASH_MS = 3400;
const APPROACH_MS = 800, FIGHT_MS = 1800;
const MAX_PER_SIDE = 12;
const PER_COL = 3, COL_GAP = 34, ROW_GAP = 28;

const LOOK: Record<string, { run: string; fight: string; scale: number }> = {
  kalkanli: { run: 'warrior-guard', fight: 'warrior-guard', scale: SHIELD_SCALE },
  kilicli: { run: 'warrior-run', fight: 'warrior-attack', scale: UNIT_SCALE },
  mizrakci: { run: 'lancer-run', fight: 'lancer-attack', scale: UNIT_SCALE },
  okcu: { run: 'archer-run', fight: 'archer-shoot', scale: UNIT_SCALE },
};
const ORDER = ['kalkanli', 'kilicli', 'mizrakci', 'okcu'];

export interface ClashSide { color: PlayerColor; lines: BattleLineView[] }

interface Fighter { sprite: Phaser.GameObjects.Sprite; unit: string; dies: boolean }

export class Clash {
  constructor(private readonly scene: Phaser.Scene, private readonly ownColor: PlayerColor) {}

  /**
   * <paramref name="gate"/>: the defender's gate (tiles). <paramref name="side"/>: +1 when the road
   * leaves the gate to the east (attackers come from there), −1 to the west.
   */
  play(gate: Vec, side: 1 | -1, attacker: ClashSide, defender: ClashSide): void {
    const g = toWorld(gate);
    const attackers = this.side(attacker, (col, row) => ({
      from: { x: g.x + side * (260 + col * COL_GAP), y: g.y + 34 + row * ROW_GAP },
      to: { x: g.x + side * (66 + col * COL_GAP), y: g.y + 34 + row * ROW_GAP },
    }), side > 0);
    const defenders = this.side(defender, (col, row) => ({
      from: { x: g.x, y: g.y - 6 },
      to: { x: g.x + side * (26 - col * COL_GAP), y: g.y + 34 + row * ROW_GAP },
    }), side < 0);
    const everyone = [...attackers, ...defenders];

    // Fight: attack animations, a little jostling, dust and sparks between the lines.
    this.scene.time.delayedCall(APPROACH_MS, () => {
      for (const f of everyone) {
        const fight = colorKey(f.sprite.getData('color'), this.ownColor, LOOK[f.unit]?.fight ?? 'warrior-attack');
        if (this.scene.anims.exists(fight)) f.sprite.play(fight);
        this.scene.tweens.add({ targets: f.sprite, x: f.sprite.x + Phaser.Math.Between(-5, 5), duration: 220, yoyo: true, repeat: 3 });
      }
      for (let i = 0; i < 5; i++) {
        this.scene.time.delayedCall(i * 330, () => {
          const at = { x: g.x + side * 46 + Phaser.Math.Between(-24, 24), y: g.y + 34 + Phaser.Math.Between(-30, 30) };
          const fx = this.scene.add.sprite(at.x, at.y, i % 2 ? 'dust' : 'explosion').setScale(i % 2 ? 1.6 : 0.5).setDepth(at.y + 40);
          fx.play(i % 2 ? 'dust' : 'explosion');
          this.scene.time.delayedCall(700, () => fx.destroy());
        });
      }
      // The fallen go down one by one during the fight.
      const dying = everyone.filter((f) => f.dies);
      Phaser.Utils.Array.Shuffle(dying).forEach((f, i) => {
        this.scene.time.delayedCall(300 + (i * (FIGHT_MS - 500)) / Math.max(1, dying.length), () => {
          f.sprite.setTint(0xff6b5e);
          this.scene.tweens.add({ targets: f.sprite, alpha: 0, y: f.sprite.y + 8, duration: 420 });
        });
      });
    });

    // Then everyone still standing clears off.
    this.scene.time.delayedCall(APPROACH_MS + FIGHT_MS, () => {
      this.scene.tweens.add({ targets: everyone.map((f) => f.sprite), alpha: 0, duration: CLASH_MS - APPROACH_MS - FIGHT_MS - 100 });
    });
    this.scene.time.delayedCall(CLASH_MS, () => everyone.forEach((f) => f.sprite.destroy()));
  }

  /** One side's fighters: up to 12 in proportion, front units first, as many marked to fall as the report says. */
  private side(side: ClashSide, at: (col: number, row: number) => { from: Vec; to: Vec }, faceLeft: boolean): Fighter[] {
    const lines = [...side.lines].filter((l) => l.count > 0).sort((a, b) => ORDER.indexOf(a.unitId) - ORDER.indexOf(b.unitId));
    const total = lines.reduce((n, l) => n + l.count, 0);
    if (total === 0) return [];
    const scale = Math.min(1, MAX_PER_SIDE / total);
    const fighters: Fighter[] = [];
    for (const l of lines) {
      const drawn = Math.max(1, Math.round(l.count * scale));
      const dead = l.lost === 0 ? 0 : Math.max(1, Math.round(drawn * (l.lost / l.count)));
      for (let i = 0; i < drawn; i++) {
        const index = fighters.length, col = Math.floor(index / PER_COL), row = (index % PER_COL) - 1;
        const { from, to } = at(col, row);
        const look = LOOK[l.unitId] ?? LOOK.kilicli;
        const run = colorKey(side.color, this.ownColor, look.run);
        const sprite = this.scene.add.sprite(from.x, from.y, run)
          .setScale(look.scale).setOrigin(0.5, unitOriginY(look.run)).setFlipX(faceLeft).setDepth(to.y).setData('color', side.color);
        sprite.play({ key: run, startFrame: Phaser.Math.Between(0, 3) });
        this.scene.tweens.add({ targets: sprite, x: to.x, y: to.y, duration: APPROACH_MS, ease: 'Sine.easeOut' });
        fighters.push({ sprite, unit: l.unitId, dies: i < dead });
      }
    }
    return fighters;
  }
}
