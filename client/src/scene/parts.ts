import Phaser from 'phaser';
import type { BuildingView } from '../types';
import { esc } from '../format';
import { playRandom } from './assets';
import type { Part, Point } from './layout';

// Pieces shared by our own castle and the castles a spectator sees: a building part drawn at a place,
// and the sign over a building.

export const NO_OFFSET: Point = { x: 0, y: 0 };

type ShadeHook = (x: number, y: number, w: number, h: number) => Phaser.GameObjects.Image;
let shadeHook: ShadeHook | null = null;
/** The terrain says how a soft shadow is made; every building part and tree then gets one that goes when the part does. */
export function setShadeHook(hook: ShadeHook): void { shadeHook = hook; }

/** One sprite of a building. <paramref name="off"/> moves the whole castle to another corner of the map. */
export function placePart(scene: Phaser.Scene, p: Part, off: Point = NO_OFFSET, keyOf: (key: string) => string = (k) => k): Phaser.GameObjects.Sprite {
  const flat = /^(sheep|stone|rock|wood-pile|bush|stump)/.test(p.key);
  const sprite = scene.add.sprite(p.x + off.x, p.y + off.y, keyOf(p.key))
    .setOrigin(0.5, flat ? 0.7 : 0.9)
    .setScale(p.scale ?? 1)
    .setFlipX(!!p.flip)
    .setDepth(p.y + off.y);
  if (p.grey) sprite.preFX?.addColorMatrix().grayscale(0.9).brightness(1.05, true);
  if (shadeHook && !flat) {
    const s = p.scale ?? 1;
    const size = /^(house|tower|barracks|archery)/.test(p.key) ? [150 * s, 46 * s] : /^tree/.test(p.key) ? [95 * s, 34 * s] : null;
    if (size) { const shade = shadeHook(p.x + off.x, p.y + off.y, size[0], size[1]); sprite.once('destroy', () => shade.destroy()); }
  }
  if (p.anim) playRandom(sprite, p.key);
  return sprite;
}

/** A sprite of a kingdom's picture (feet at the bottom of the picture), with the soft shadow the other parts get. */
export function placeKingdomPart(scene: Phaser.Scene, p: { key: string; x: number; y: number; scale: number; depthY: number }): Phaser.GameObjects.Sprite {
  const sprite = scene.add.sprite(p.x, p.y, p.key).setOrigin(0.5, 1).setScale(p.scale).setDepth(p.depthY);
  if (shadeHook && sprite.width * p.scale > 60) { const shade = shadeHook(p.x, p.y, sprite.width * p.scale * 0.8, 40); sprite.once('destroy', () => shade.destroy()); }
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
