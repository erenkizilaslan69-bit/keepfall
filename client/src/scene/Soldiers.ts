import Phaser from 'phaser';
import type { UnitView } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, unitOriginY } from './assets';
import type { WorldLabels } from '../ui/world-labels';
import { esc } from '../format';
import { CASTLE, COURTYARD, type Point } from './layout';
import { NO_OFFSET } from './parts';

// Soldiers stand in the castle courtyard, one block per unit type from left to right
// (archers, spearmen, swordsmen, shield bearers). Shield bearers always keep their shield raised
// (Warrior_Guard) and are drawn a bit larger, so they never read as swordsmen.

interface Look { anim: string; scale: number }

const LOOKS: Record<string, Look> = {
  okcu: { anim: 'archer-idle', scale: UNIT_SCALE },
  mizrakci: { anim: 'lancer-idle', scale: UNIT_SCALE },
  kilicli: { anim: 'warrior-idle', scale: UNIT_SCALE },
  kalkanli: { anim: 'warrior-guard', scale: SHIELD_SCALE },
};
const BLOCK_ORDER = ['okcu', 'mizrakci', 'kilicli', 'kalkanli'];
const FALLBACK: Look = { anim: 'pawn-idle', scale: UNIT_SCALE };

const COLS = 3;
const ROWS = 3;
const PER_BLOCK = COLS * ROWS;
const COL_GAP = 22;
/** The courtyard is on top of the castle sprite, which sorts at its base (CASTLE.y). */
const DEPTH_BASE = CASTLE.y + 1;

export class Soldiers {
  private blocks = new Map<string, Phaser.GameObjects.Sprite[]>();

  /** <paramref name="off"/>: where this castle's corner is; <paramref name="key"/> keeps the signs of several castles apart. */
  constructor(private readonly scene: Phaser.Scene, private readonly labels: WorldLabels,
    private readonly off: Point = NO_OFFSET, private readonly key = '',
    private readonly k: (key: string) => string = (key) => key) {}

  destroy(): void {
    for (const sprites of this.blocks.values()) for (const s of sprites) s.destroy();
    for (const id of this.blocks.keys()) this.labels.remove(`soldiers:${this.key}${id}`);
    this.blocks.clear();
  }

  sync(units: UnitView[]): void {
    const ids = [...BLOCK_ORDER.filter((id) => units.some((u) => u.id === id)),
      ...units.map((u) => u.id).filter((id) => !BLOCK_ORDER.includes(id))];
    const blockWidth = (COURTYARD.right - COURTYARD.left) / Math.max(ids.length, 1);
    ids.forEach((id, i) => {
      const unit = units.find((u) => u.id === id)!;
      this.syncBlock(id, unit.name, unit.soldiers, COURTYARD.left + blockWidth * (i + 0.5));
    });
  }

  private syncBlock(id: string, name: string, count: number, centerX: number): void {
    const look = LOOKS[id] ?? FALLBACK;
    const sprites = this.blocks.get(id) ?? [];
    const shown = Math.min(count, PER_BLOCK);

    while (sprites.length > shown) sprites.pop()!.destroy();
    while (sprites.length < shown) {
      const sprite = this.scene.add.sprite(0, 0, this.k(look.anim))
        .setScale(look.scale)
        .setOrigin(0.5, unitOriginY(look.anim))
        .setAlpha(0);
      sprite.play({ key: this.k(look.anim), startFrame: Phaser.Math.Between(0, 4) });
      this.scene.tweens.add({ targets: sprite, alpha: 1, duration: 400 });
      sprites.push(sprite);
    }
    this.blocks.set(id, sprites);

    // Fill front row first (closest to the gate), then the rows behind it.
    const rowGap = (COURTYARD.bottom - COURTYARD.top) / (ROWS - 1);
    sprites.forEach((s, i) => {
      const row = Math.floor(i / COLS), col = i % COLS;
      const y = COURTYARD.bottom - row * rowGap;
      // Stagger alternate rows a little so heads don't line up exactly.
      const x = centerX + (col - (COLS - 1) / 2) * COL_GAP + (row % 2) * 6;
      s.setPosition(x + this.off.x, y + this.off.y).setDepth(DEPTH_BASE + this.off.y + y / 1000 + 0.00001 * col);
    });

    // Name and the real count on the wall below the block (a block shows at most PER_BLOCK).
    if (count > 0)
      this.labels.set(`soldiers:${this.key}${id}`, {
        x: centerX + this.off.x, y: COURTYARD.bottom + 14 + this.off.y, anchor: 'top', minZoom: 0.6, cls: 'wl-small',
        html: `<div class="wl-sign"><b>${esc(name)}</b> ${count}</div>`,
      });
    else this.labels.remove(`soldiers:${this.key}${id}`);
  }
}
