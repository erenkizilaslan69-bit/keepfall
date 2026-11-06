import Phaser from 'phaser';
import type { SiteKind, SiteView } from '../types';
import { esc } from '../format';
import { t } from '../i18n';
import type { WorldLabels } from '../ui/world-labels';
import { UNIT_SCALE, playRandom, unitOriginY } from './assets';
import { sign } from './parts';
import { toWorld } from './world';
import { reducedEffects } from '../prefs';
import { makeFenceTexture, makeGlintTexture } from './ForestSprites';

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

export const SITE_NAME: Record<SiteKind, string> = { chest: t('Sandık'), village: t('Köy'), camp: t('Haydut kampı'), bigCamp: t('Büyük haydut kampı') };
const ICON: Record<SiteKind, string> = { chest: 'ico-chest', village: 'ico-meat', camp: 'ico-skull', bigCamp: 'ico-skull' };

/** Bandit sprites by unit id (blue sheets' black twins). */
const BANDIT_ANIM: Record<string, string> = { kilicli: 'black-warrior-idle', kalkanli: 'black-warrior-guard', okcu: 'black-archer-idle', mizrakci: 'black-lancer-idle' };

interface Item {
  signature: string;
  sprites: Phaser.GameObjects.Sprite[];
  zone: Phaser.GameObjects.Zone;
  /** Short-lived decorations (the glint of a chest that has just been found). */
  extras: Phaser.GameObjects.GameObject[];
}

export class SiteLayer {
  private readonly items = new Map<string, Item>();
  private readonly trails: Phaser.GameObjects.Graphics;
  private trailKey = '';
  private sites: SiteView[] = [];
  /** Places already drawn once; a chest found after the first picture glints briefly. */
  private readonly seen = new Set<string>();
  private synced = false;

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
    queueMicrotask(() => { for (const s of sites) this.seen.add(s.id); this.synced = true; });
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
        const fresh = this.synced && !this.seen.has(s.id);
        item = this.build(s, signature, fresh);
        this.items.set(s.id, item);
      }
      const p = toWorld(s.position);
      const age = Math.max(0, now - s.seenAt);
      const note = s.gone ? '' : age >= 60 ? ` <small class="muted-ink">${t('{0} dk önce', Math.floor(age / 60))}</small>` : '';
      const state = s.kind === 'chest' ? (s.gone ? ` · ${t('boş')}` : '')
        : s.kind === 'village' ? (s.gone ? ` · ${t('yağmalandı')}` : '')
        : s.gone ? ` · ${t('temizlendi')}` : ` · ≈${bandits}`;
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

  /** A short glow and a few sparkles over a chest that has just been found. */
  private glint(x: number, y: number, extras: Phaser.GameObjects.GameObject[]): void {
    const key = makeGlintTexture(this.scene);
    const depth = y + DEPTH_LIFT + 20;
    const glow = this.scene.add.ellipse(x, y + 6, 104, 58, 0xffe27a, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth);
    extras.push(glow);
    this.scene.tweens.add({ targets: glow, fillAlpha: 0.55, duration: 420, yoyo: true, repeat: 2, ease: 'Sine.easeInOut', onComplete: () => glow.setVisible(false) });
    for (let i = 0; i < 8; i++) {
      const spark = this.scene.add.image(x + Phaser.Math.Between(-34, 34), y + Phaser.Math.Between(-24, 14), key).setScale(0.1).setAlpha(0).setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
      extras.push(spark);
      this.scene.tweens.add({ targets: spark, alpha: { from: 0, to: 1 }, scale: { from: 0.2, to: 1.5 }, y: spark.y - 16, duration: 520, delay: i * 150, yoyo: true, repeat: 1, ease: 'Sine.easeOut', onComplete: () => spark.setVisible(false) });
    }
  }

  /** The gold heap's own light: a soft glow that breathes and a few twinkles that come and go (not with reduced effects). */
  private shimmer(x: number, y: number, extras: Phaser.GameObjects.GameObject[]): void {
    const key = makeGlintTexture(this.scene);
    const depth = y + DEPTH_LIFT + 30;
    const glow = this.scene.add.ellipse(x, y + 16, 92, 46, 0xffe27a, 0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 25);
    extras.push(glow);
    this.scene.tweens.add({ targets: glow, fillAlpha: 0.34, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 4; i++) {
      const sx = x + Phaser.Math.Between(-30, 30), sy = y + Phaser.Math.Between(-4, 26);
      const spark = this.scene.add.image(sx, sy, key).setScale(0.1).setAlpha(0).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
      extras.push(spark);
      this.scene.tweens.add({ targets: spark, alpha: { from: 0, to: 1 }, scale: { from: 0.1, to: 1 }, duration: 520, delay: 400 + i * 700, hold: 60, yoyo: true, repeat: -1, repeatDelay: 2200, ease: 'Sine.easeOut' });
    }
  }

  private destroyItem(id: string, item: Item, removeLabel = true): void {
    item.sprites.forEach((s) => s.destroy());
    for (const e of item.extras) { this.scene.tweens.killTweensOf(e); e.destroy(); }
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

  private build(s: SiteView, signature: string, fresh = false): Item {
    const p = toWorld(s.position);
    const sprites: Phaser.GameObjects.Sprite[] = [];
    const extras: Phaser.GameObjects.GameObject[] = [];
    const add = (x: number, y: number, key: string, scale: number, depthShift = 0, originY = 0.9): Phaser.GameObjects.Sprite => {
      const sp = this.scene.add.sprite(x, y, key).setOrigin(0.5, originY).setScale(scale).setDepth(y + depthShift + DEPTH_LIFT);
      sprites.push(sp);
      return sp;
    };
    const fire = (x: number, y: number, scale = 1): void => {
      const f = add(x, y, 'campfire', scale, 5, 0.97); // the same flame as the soldiers' camp fire at home
      f.play({ key: 'campfire', startFrame: Phaser.Math.Between(0, 5) });
    };

    // Built from the pack's black buildings (the bandits' colour); a place that is gone is the same picture, burnt out and grey.
    const ruin = (sp: Phaser.GameObjects.Sprite): Phaser.GameObjects.Sprite => (s.gone ? sp.setTint(0x6b6870).setAlpha(0.92) : sp);
    const bandits = (cx: number, radius: number, rise: number, count: number, spread = 0.5): void => {
      const list: string[] = [];
      for (const b of s.bandits) for (let i = 0; i < b.count; i++) list.push(b.unitId);
      const shown = list.slice(0, count);
      shown.forEach((unit, i) => {
        const a = (i / shown.length) * Math.PI * 2 + 0.4;
        const r = radius + (i % 2) * 6;
        const bk = BANDIT_ANIM[unit] ?? 'black-warrior-idle';
        const sp = add(cx + Math.cos(a) * r, p.y + rise + Math.sin(a) * r * spread, bk, UNIT_SCALE, 0, unitOriginY(bk));
        sp.setFlipX(Math.cos(a) > 0);
        if (this.scene.anims.exists(bk)) playRandom(sp, bk, 5);
      });
    };
    // A fence section at (x, y), turned along the ring it stands on.
    const fence = (x: number, y: number, turn: number): void => {
      makeFenceTexture(this.scene);
      const sp = add(x, y, 'kf-fence', 1, -2, 0.9);
      sp.setRotation(Phaser.Math.Clamp(turn, -0.5, 0.5));
      if (s.gone) sp.setTint(0x6b6870).setAlpha(0.9);
    };
    /** Fence sections round the back and sides of an ellipse (rx, ry) about (cx, cy); the front (the way in) stays open. */
    const palisade = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, step: number): void => {
      const n = Math.max(2, Math.round(((to - from) * rx) / step));
      for (let i = 0; i <= n; i++) {
        const a = from + ((to - from) * i) / n;
        fence(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx));
      }
    };
    const TOP = Math.PI * 1.5;
    if (s.kind === 'village') {
      // three black houses; a plundered village stands burnt out, smouldering
      ruin(add(p.x - 50, p.y + 22, 'black-house2', 0.62));
      ruin(add(p.x + 48, p.y + 18, 'black-house1', 0.6));
      ruin(add(p.x, p.y - 2, 'black-house3', 0.62));
      if (s.gone) { fire(p.x - 20, p.y + 40, 1); fire(p.x + 26, p.y + 36, 0.8); }
    } else if (s.kind === 'camp') {
      // the same family as the big camp, smaller: a watch tower and a hut behind a short fence, the fire in the middle and the bandits in a ring round it
      palisade(p.x, p.y + 14, 96, 50, TOP - 1.25, TOP + 1.25, 36);
      ruin(add(p.x - 66, p.y - 4, 'black-tower', 0.56));
      ruin(add(p.x + 64, p.y - 8, 'black-house1', 0.5));
      if (!s.gone) { fire(p.x, p.y + 26, 1.15); bandits(p.x, 46, 18, 4, 0.5); }
      else add(p.x, p.y + 24, 'rock3', 0.4, 0, 0.75).setTint(0x4a4a50);
    } else if (s.kind === 'bigCamp') {
      // a bandit town, not a castle: black towers at the back corners, huts, a fence round the back and sides, a big fire in the middle and the bandits round it
      palisade(p.x, p.y + 16, 178, 112, TOP - 1.45, TOP + 1.45, 44);
      ruin(add(p.x - 138, p.y - 40, 'black-tower', 0.62));
      ruin(add(p.x + 138, p.y - 40, 'black-tower', 0.62));
      ruin(add(p.x - 66, p.y - 66, 'black-house2', 0.6));
      ruin(add(p.x + 64, p.y - 70, 'black-house1', 0.58));
      ruin(add(p.x + 2, p.y - 92, 'black-house3', 0.6));
      if (!s.gone) { fire(p.x, p.y + 28, 1.7); bandits(p.x, 74, 20, 10, 0.5); }
      else add(p.x, p.y + 26, 'rock3', 0.6, 0, 0.75).setTint(0x4a4a50);
    } else {
      // a heap of gold: the pack's gold stones piled up (with a slow shimmer); looted: only the trampled ground and one dull stone are left
      if (s.gone) {
        this.scene.add.ellipse(p.x, p.y + 14, 64, 26, 0x6b5a3a, 0.5).setDepth(p.y + DEPTH_LIFT - 1);
        add(p.x + 4, p.y + 14, 'stone2', 0.34, 0, 0.55).setTint(0x6f6a64);
      } else {
        const heap: [number, number, string, number][] = [[-30, 16, 'stone1', 0.46], [28, 14, 'stone4', 0.46], [0, 18, 'stone3', 0.62], [-14, 4, 'stone5', 0.5], [16, 2, 'stone2', 0.5], [0, -10, 'gold-pile', 0.78]];
        for (const [dx, dy, key, sc] of heap) add(p.x + dx, p.y + 14 + dy, key, sc, dy > 6 ? 0 : 1, 0.62);
        if (!reducedEffects()) this.shimmer(p.x, p.y, extras);
      }
    }

    const zone = this.scene.add.zone(p.x, p.y - 10, s.kind === 'bigCamp' ? 260 : 130, s.kind === 'bigCamp' ? 200 : 110)
      .setDepth(15_000).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.onSelect(s.id));
    if (fresh && s.kind === 'chest' && !s.gone && !reducedEffects()) this.glint(p.x, p.y, extras);
    return { signature, sprites, zone, extras };
  }
}
