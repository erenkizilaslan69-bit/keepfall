import Phaser from 'phaser';
import type { BuildingView } from '../types';
import { esc } from '../format';
import type { Part, Point } from './layout';

// Pieces shared by our own castle and the castles a spectator sees: a building part drawn at a place,
// and the sign over a building.

export const NO_OFFSET: Point = { x: 0, y: 0 };

/** One sprite of a building. <paramref name="off"/> moves the whole castle to another corner of the map. */
export function placePart(scene: Phaser.Scene, p: Part, off: Point = NO_OFFSET, keyOf: (key: string) => string = (k) => k): Phaser.GameObjects.Sprite {
  const flat = /^(sheep|stone|rock|wood-pile|bush|stump)/.test(p.key);
  const sprite = scene.add.sprite(p.x + off.x, p.y + off.y, keyOf(p.key))
    .setOrigin(0.5, flat ? 0.7 : 0.9)
    .setScale(p.scale ?? 1)
    .setFlipX(!!p.flip)
    .setDepth(p.y + off.y);
  if (p.grey) sprite.preFX?.addColorMatrix().grayscale(0.9).brightness(1.05, true);
  if (p.anim) sprite.play({ key: p.key, startFrame: Phaser.Math.Between(0, 3) });
  return sprite;
}

export const sign = (inner: string, cls = '') => `<div class="wl-sign ${cls}">${inner}</div>`;

/** The sign over a building: level badge, name, workers, and the upgrade's progress while it is being built. */
export function buildingSign(b: BuildingView, workers: number): string {
  const progress = b.upgradeRemaining !== null
    ? `<div class="wl-prog" title="Yükseltiliyor"><i style="width:${100 * (1 - b.upgradeRemaining / b.upgradeTotal)}%"></i></div>` : '';
  const state = b.capacity > 0 && workers >= b.capacity ? ' full' : workers === 0 ? ' empty' : '';
  return sign(`<span class="wl-lv" title="Seviye ${b.level}">${b.level}</span><b>${esc(b.name)}</b>
    <span class="wl-workers${state}" title="İşçi"><i class="ico ico-hammer"></i><b>${workers}/${b.capacity}</b></span>${progress}`, 'post');
}
