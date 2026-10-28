import Phaser from 'phaser';
import type { SiteKind, SiteView } from '../types';
import { esc } from '../format';
import type { WorldLabels } from '../ui/world-labels';
import { UNIT_SCALE, playRandom, unitOriginY } from './assets';
import { sign } from './parts';
import { toWorld } from './world';
import { FOREST_WIDTH, forestTexture } from './ForestSprites';

// The places of the forest we have found: a chest (a pile of gold), a village (black houses), a bandit camp (a
// tower, a fire and the bandits) and the big camp in the middle, each with its trail from the forest road. What
// is drawn is only what the server told us, as we last saw it: a place that has since been emptied by somebody
// else looks full until we see it again.

const DEPTH_TRAIL = -79_000;
/** A place is drawn above the trees round it (they are cleared away from it, too). */
const DEPTH_LIFT = 600;
/** The cleared ground under a place (px radius). */
const CLEARING: Record<SiteKind, number> = { chest: 46, village: 96, camp: 84, bigCamp: 170 };
const TRAIL_COLOR = 0xd8b779, TRAIL_EDGE = 0xa98b57;

export const SITE_NAME: Record<SiteKind, string> = { chest: 'Sandık', village: 'Köy', camp: 'Haydut kampı', bigCamp: 'Büyük haydut kampı' };
const ICON: Record<SiteKind, string> = { chest: 'ico-chest', village: 'ico-meat', camp: 'ico-skull', bigCamp: 'ico-skull' };

/** Bandit sprites by unit id (blue sheets' black twins). */
const BANDIT_ANIM: Record<string, string> = { kilicli: 'black-warrior-idle', kalkanli: 'black-warrior-guard', okcu: 'black-archer-idle', mizrakci: 'black-lancer-idle' };

interface Item {
  signature: string;
  sprites: Phaser.GameObjects.Sprite[];
  zone: Phaser.GameObjects.Zone;
}

export class SiteLayer {
  private readonly items = new Map<string, Item>();
  private readonly trails: Phaser.GameObjects.Graphics;
  private trailKey = '';
  private sites: SiteView[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly labels: WorldLabels, private readonly onSelect: (id: string) => void) {
    this.trails = scene.add.graphics().setDepth(DEPTH_TRAIL);
  }

  debugSprites(): Phaser.GameObjects.Sprite[] { return [...this.items.values()].flatMap((i) => i.sprites); }

  /** Where each place is (tiles), so the trees around it can be cleared. */
  tiles(): { position: { x: number; y: number }; kind: SiteKind }[] {
    return this.sites.map((s) => ({ position: s.position, kind: s.kind }));
  }

  /** Where a place is (scene px), for a window about it. */
  positionOf(id: string): { x: number; y: number } | null {
    const s = this.sites.find((x) => x.id === id);
    return s ? toWorld(s.position) : null;
  }

  sync(sites: SiteView[], now: number): void {
    this.sites = sites;
    const key = sites.map((s) => s.id).join(',');
    if (key !== this.trailKey) { this.trailKey = key; this.drawTrails(sites); }
    const alive = new Set(sites.map((s) => s.id));
    for (const [id, item] of this.items) {
      if (alive.has(id)) continue;
      this.destroyItem(id, item);
    }
    for (const s of sites) {
      const bandits = s.bandits.reduce((n, b) => n + b.count, 0);
      const signature = `${s.kind}|${s.gone}|${s.bandits.map((b) => `${b.unitId}:${b.count}`).join(',')}`;
      let item = this.items.get(s.id);
      if (!item || item.signature !== signature) {
        if (item) this.destroyItem(s.id, item, false);
        item = this.build(s, signature);
        this.items.set(s.id, item);
      }
      const p = toWorld(s.position);
      const age = Math.max(0, now - s.seenAt);
      const note = s.gone ? '' : age >= 60 ? ` <small class="muted-ink">${Math.floor(age / 60)} dk önce</small>` : '';
      const state = s.kind === 'chest' ? (s.gone ? ' · boş' : '')
        : s.kind === 'village' ? (s.gone ? ' · yağmalandı' : '')
        : s.gone ? ' · temizlendi' : ` · ≈${bandits}`;
      this.labels.set(`site:${s.id}`, {
        x: p.x, y: p.y + 30, anchor: 'top', minZoom: 0.5,
        html: sign(`<i class="ico ${ICON[s.kind]}"></i><b>${esc(SITE_NAME[s.kind])}</b><span>${state}</span>${note}`, s.gone ? 'wl-gone' : s.kind.endsWith('amp') ? 'wl-fight' : ''),
      });
    }
  }

  destroy(): void {
    for (const [id, item] of this.items) this.destroyItem(id, item);
    this.trails.destroy();
  }

  private destroyItem(id: string, item: Item, removeLabel = true): void {
    item.sprites.forEach((s) => s.destroy());
    item.zone.destroy();
    this.items.delete(id);
    if (removeLabel) this.labels.remove(`site:${id}`);
  }

  /** The dirt trails, from the forest road to each place we know. */
  private drawTrails(sites: SiteView[]): void {
    this.trails.clear();
    for (const s of sites) {
      const c = toWorld(s.position), r = CLEARING[s.kind];
      this.trails.fillStyle(TRAIL_EDGE, 1).fillEllipse(c.x, c.y + 14, r * 2 + 14, r * 1.3 + 14);
      this.trails.fillStyle(TRAIL_COLOR, 1).fillEllipse(c.x, c.y + 14, r * 2, r * 1.3);
    }
    for (const s of sites) {
      if (s.spur.length < 2) continue;
      const pts = s.spur.map(toWorld);
      this.trails.lineStyle(19, TRAIL_EDGE, 1).beginPath().moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) this.trails.lineTo(p.x, p.y);
      this.trails.strokePath();
      this.trails.lineStyle(13, TRAIL_COLOR, 1).beginPath().moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) this.trails.lineTo(p.x, p.y);
      this.trails.strokePath();
    }
  }

  private build(s: SiteView, signature: string): Item {
    const p = toWorld(s.position);
    const sprites: Phaser.GameObjects.Sprite[] = [];
    const add = (x: number, y: number, key: string, scale: number, depthShift = 0, originY = 0.9): Phaser.GameObjects.Sprite => {
      const sp = this.scene.add.sprite(x, y, key).setOrigin(0.5, originY).setScale(scale).setDepth(y + depthShift + DEPTH_LIFT);
      sprites.push(sp);
      return sp;
    };
    const fire = (x: number, y: number, scale = 1): void => {
      const f = add(x, y, 'fire', scale, 5, 0.85);
      f.play({ key: 'fire', startFrame: Phaser.Math.Between(0, 5) });
    };

    const key = forestTexture(this.scene, s.kind, s.gone);
    if (key) {
      // The generated picture (full, or its emptied look); bandits stand inside a camp, a plundered village still smoulders.
      const tex = this.scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const scale = FOREST_WIDTH[s.kind] / tex.width;
      add(p.x, p.y + 10, key, scale, 0, 0.88);
      if (s.kind === 'village' && s.gone) fire(p.x - 4, p.y + 6, 0.9);
      if (s.kind === 'camp' || s.kind === 'bigCamp') {
        if (!s.gone) {
          const big = s.kind === 'bigCamp';
          const list: string[] = [];
          for (const b of s.bandits) for (let i = 0; i < b.count; i++) list.push(b.unitId);
          const shown = list.slice(0, big ? 10 : 4);
          shown.forEach((unit, i) => {
            const a = (i / shown.length) * Math.PI * 2 + 0.4;
            const r = (big ? 44 : 30) + (i % 2) * 6;
            const bk = BANDIT_ANIM[unit] ?? 'black-warrior-idle';
            const sp = add(p.x + Math.cos(a) * r, p.y + (big ? 30 : 22) + Math.sin(a) * r * 0.5, bk, UNIT_SCALE, 0, unitOriginY(bk));
            sp.setFlipX(Math.cos(a) > 0);
            if (this.scene.anims.exists(bk)) playRandom(sp, bk, 5);
          });
        }
      }
    }

    const zone = this.scene.add.zone(p.x, p.y - 10, s.kind === 'bigCamp' ? 260 : 130, s.kind === 'bigCamp' ? 200 : 110)
      .setDepth(15_000).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.onSelect(s.id));
    return { signature, sprites, zone };
  }
}
