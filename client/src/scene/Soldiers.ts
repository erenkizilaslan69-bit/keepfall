import Phaser from 'phaser';
import type { UnitView } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, unitOriginY } from './assets';
import type { WorldLabels } from '../ui/world-labels';
import { esc } from '../format';
import { CAMP, type Point } from './layout';
import { NO_OFFSET } from './parts';

// Soldiers wait in front of the castle around a camp fire, a group for each unit type (the groups sit round the fire in the order of
// the list), all turned toward the flames. Shield bearers always keep their shield raised (Warrior_Guard) and are drawn a bit larger,
// so they never read as swordsmen.

interface Look { anim: string; scale: number }

const LOOKS: Record<string, Look> = {
  okcu: { anim: 'archer-idle', scale: UNIT_SCALE },
  mizrakci: { anim: 'lancer-idle', scale: UNIT_SCALE },
  kilicli: { anim: 'warrior-idle', scale: UNIT_SCALE },
  kalkanli: { anim: 'warrior-guard', scale: SHIELD_SCALE },
  kesis: { anim: 'monk-idle', scale: UNIT_SCALE },
  mancinik: { anim: 'mancinik-idle', scale: UNIT_SCALE },
  suvari: { anim: 'suvari-idle', scale: UNIT_SCALE },
};
const BLOCK_ORDER = ['okcu', 'mancinik', 'kesis', 'mizrakci', 'kilicli', 'kalkanli', 'suvari'];
const FALLBACK: Look = { anim: 'pawn-idle', scale: UNIT_SCALE };

const COLS = 2;
const ROWS = 2;
const PER_BLOCK = COLS * ROWS;
const GAP_X = 22, GAP_Y = 20;

export class Soldiers {
  private blocks = new Map<string, Phaser.GameObjects.Sprite[]>();
  private fire: Phaser.GameObjects.GameObject[] = [];

  /** <paramref name="off"/>: where this castle's corner is; <paramref name="key"/> keeps the signs of several castles apart. */
  constructor(private readonly scene: Phaser.Scene, private readonly labels: WorldLabels,
    private readonly off: Point = NO_OFFSET, private readonly key = '',
    private readonly k: (key: string) => string = (key) => key) {
    this.buildFire();
  }

  destroy(): void {
    for (const sprites of this.blocks.values()) for (const s of sprites) s.destroy();
    this.labels.remove(`camp:${this.key}`);
    this.blocks.clear();
    for (const o of this.fire) o.destroy();
    this.fire = [];
  }

  /** The camp fire: ash and stones, two logs, the animated flame and a glow that breathes. */
  private buildFire(): void {
    const x = CAMP.x + this.off.x, y = CAMP.y + this.off.y;
    const g = this.scene.add.graphics().setDepth(y - 1);
    g.fillStyle(0x2b2018, 0.55).fillEllipse(x, y + 2, 64, 26);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const px = x + Math.cos(a) * 30, py = y + 2 + Math.sin(a) * 12;
      g.fillStyle(0x4a4f57, 1).fillEllipse(px, py + 1, 14, 9);
      g.fillStyle(0x9aa3ac, 1).fillEllipse(px, py - 1, 12, 7);
      g.fillStyle(0xc9d0d6, 1).fillEllipse(px - 2, py - 2, 5, 3);
    }
    g.lineStyle(7, 0x4b2e1a, 1).lineBetween(x - 20, y + 5, x + 16, y - 3).lineBetween(x + 20, y + 5, x - 14, y - 4);
    g.lineStyle(3, 0x7a4c2a, 1).lineBetween(x - 20, y + 4, x + 16, y - 4).lineBetween(x + 20, y + 4, x - 14, y - 5);
    const glow = this.scene.add.ellipse(x, y - 4, 230, 120, 0xffa63a, 0.14).setDepth(y - 2);
    this.scene.tweens.add({ targets: glow, alpha: 0.26, scaleX: 1.08, scaleY: 1.08, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const flame = this.scene.add.sprite(x, y + 4, 'campfire').setOrigin(0.5, 0.97).setScale(1.5).setDepth(y + 1);
    flame.play({ key: 'campfire', startFrame: Phaser.Math.Between(0, 5) });
    this.fire = [g, glow, flame];
  }

  sync(units: UnitView[]): void {
    const ids = [...BLOCK_ORDER.filter((id) => units.some((u) => u.id === id)),
      ...units.map((u) => u.id).filter((id) => !BLOCK_ORDER.includes(id))];
    ids.forEach((id, i) => {
      const unit = units.find((u) => u.id === id)!;
      // Round the fire, the first group at the bottom left, going round.
      const angle = Math.PI * 0.75 + (i / Math.max(ids.length, 1)) * Math.PI * 2;
      this.syncBlock(id, unit.soldiers, {
        x: CAMP.x + Math.cos(angle) * CAMP.rx + this.off.x,
        y: CAMP.y + Math.sin(angle) * CAMP.ry + this.off.y,
      });
    });
    // One sign for the whole camp (a sign for each group ran into the others): the counts of every type, and the people being armed.
    const rows = ids.map((id) => units.find((u) => u.id === id)!).filter((u) => u.soldiers > 0).map((u) => `<span><b>${esc(u.name)}</b> ${u.soldiers}</span>`);
    const arming = units.reduce((n, u) => n + u.arming, 0);
    if (arming > 0) rows.push(`<span><i class="ico ico-sword"></i> Kuşanıyor <b>${arming}</b></span>`);
    for (const id of this.blocks.keys()) this.labels.remove(`soldiers:${this.key}${id}`);
    this.labels.remove(`arming:${this.key}`);
    if (rows.length > 0)
      this.labels.set(`camp:${this.key}`, {
        x: CAMP.x + this.off.x, y: CAMP.y - CAMP.ry - 72 + this.off.y, anchor: 'bottom', minZoom: 0.6, cls: 'wl-small',
        html: `<div class="wl-sign camp-sign">${rows.join('')}</div>`,
      });
    else this.labels.remove(`camp:${this.key}`);
  }

  private syncBlock(id: string, count: number, centre: Point): void {
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

    // A little crowd: rows of three; everybody faces the flames.
    const fireX = CAMP.x + this.off.x;
    sprites.forEach((s, i) => {
      const row = Math.floor(i / COLS), col = i % COLS;
      const x = centre.x + (col - (COLS - 1) / 2) * GAP_X + (row % 2) * 7;
      const y = centre.y + (row - (ROWS - 1) / 2) * GAP_Y;
      s.setPosition(x, y).setDepth(y).setFlipX(x > fireX + 4);
    });
  }
}
