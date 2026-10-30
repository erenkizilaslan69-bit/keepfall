import Phaser from 'phaser';
import type { BuildingType, PlayerColor, SpectatorCastleView } from '../types';
import type { WorldLabels } from '../ui/world-labels';
import { COLORED_IMAGES, colorKey } from './assets';
import { drawBuilding } from './BuildingArt';
import { Chimneys } from './Chimneys';
import { Guards } from './Guards';
import { isKingdomLook } from './KingdomSprites';
import { SITES, type Point } from './layout';
import { buildingSign } from './parts';
import { Soldiers } from './Soldiers';
import { Workers } from './Workers';

// The inside of a castle that is not ours (buildings, workers, soldiers), drawn the way our own is, for a
// fallen player who watches the whole map. Not clickable; fed by the (delayed) spectator pictures only.

export class RegionDisplay {
  private readonly slots = new Map<BuildingType, { level: number; sprites: Phaser.GameObjects.Sprite[]; dust: Phaser.GameObjects.Sprite }>();
  private readonly workers: Workers;
  private readonly soldiers: Soldiers;
  private readonly chimneys: Chimneys;
  private readonly guards: Guards;
  private look: string | null = null;

  private readonly buildingKey: (key: string) => string;

  /** `color`: the castle owner; `own`: our colour (whose sheets have plain keys). */
  constructor(private readonly scene: Phaser.Scene, private readonly labels: WorldLabels, private readonly seat: number,
    private readonly off: Point, private readonly color: PlayerColor, own: PlayerColor) {
    const k = (key: string) => colorKey(color, own, key);
    this.buildingKey = (key) => (COLORED_IMAGES.includes(key) ? k(key) : key);
    this.workers = new Workers(scene, labels, off, false, k);
    this.soldiers = new Soldiers(scene, labels, off, `${seat}:`, k);
    this.chimneys = new Chimneys(scene);
    this.guards = new Guards(scene, off, k);
    for (const type of Object.keys(SITES) as BuildingType[]) {
      const dust = scene.add.sprite(SITES[type].center.x + off.x, SITES[type].center.y + off.y, 'dust').setScale(2).setDepth(9_000 + off.y).setVisible(false);
      this.slots.set(type, { level: 0, sprites: [], dust });
    }
  }

  debugSprites(): Phaser.GameObjects.Sprite[] { return [...this.workers.debugSprites(), ...this.soldiers.debugSprites(), ...this.guards.debugSprites()]; }

  /** The castle's kingdom (a spectator is told every one): its buildings are drawn in that kingdom's pictures. */
  setLook(look: string | null | undefined): void {
    const next = isKingdomLook(look) ? look : null;
    if (next === this.look) return;
    this.look = next;
    for (const slot of this.slots.values()) slot.level = 0; // drawn again in the new style
  }

  sync(castle: SpectatorCastleView): void {
    this.setLook(castle.kingdom);
    for (const b of castle.buildings) {
      const slot = this.slots.get(b.type);
      if (!slot) continue;
      const site = SITES[b.type];
      if (slot.level !== b.level) {
        slot.sprites.forEach((s) => s.destroy());
        this.chimneys.clear(b.type);
        const art = drawBuilding(this.scene, b.type, b.level, this.look, this.color, this.off, this.buildingKey, this.chimneys, b.type);
        slot.sprites = art.sprites;
        this.workers.setBlocks(b.type, art.feet);
        slot.level = b.level;
      }
      const upgrading = b.upgradeRemaining !== null;
      slot.dust.setVisible(upgrading);
      if (upgrading && !slot.dust.anims.isPlaying) slot.dust.play('dust');
      const workers = castle.jobs.find((j) => j.job === b.worker)?.count ?? 0;
      this.labels.set(`building:${this.seat}:${b.type}`, {
        x: site.center.x + this.off.x, y: Math.min(site.center.y + site.area.h / 2 - 6, 684) + this.off.y,
        anchor: 'bottom', minZoom: 0.5, html: buildingSign(b, workers),
      });
    }
    this.workers.sync(castle.jobs);
    this.soldiers.sync(castle.units);
    this.guards.sync(castle.guards ?? 0);
  }

  destroy(): void {
    for (const [type, slot] of this.slots) {
      slot.sprites.forEach((s) => s.destroy());
      slot.dust.destroy();
      this.labels.remove(`building:${this.seat}:${type}`);
    }
    this.slots.clear();
    this.chimneys.clearAll();
    this.guards.destroy();
    this.workers.destroy();
    this.soldiers.destroy();
  }

  update(dt: number): void {
    this.workers.update(dt);
  }
}
