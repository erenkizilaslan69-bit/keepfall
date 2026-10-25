import Phaser from 'phaser';
import type { MapStateView, MoverUnit, PlayerColor, Vec } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, colorKey, unitOriginY } from './assets';
import type { Target } from '../ui/windows';
import type { WorldLabels } from '../ui/world-labels';
import { COLOR_CSS } from '../format';
import { toWorld } from './world';

// Armies and scouts walking on the map: our own (we know their road) and the others the server lets
// us see (only where they are and which way they go). Every soldier is drawn in its own unit's
// sprite and its owner's colour, in marching order — shield bearers, swordsmen and spearmen in
// front, archers at the back — so whoever sees an army coming can read what it is made of.
// Between two server ticks positions are extrapolated (our own along the road, others along their
// heading) and corrected smoothly when the next tick arrives.

const RUN: Record<string, { anim: string; scale: number }> = {
  kalkanli: { anim: 'warrior-guard', scale: SHIELD_SCALE },
  kilicli: { anim: 'warrior-run', scale: UNIT_SCALE },
  mizrakci: { anim: 'lancer-run', scale: UNIT_SCALE },
  okcu: { anim: 'archer-run', scale: UNIT_SCALE },
};
/** Marching order, front to back. */
const ORDER = ['kalkanli', 'kilicli', 'mizrakci', 'okcu'];
const MAX_DRAWN = 30;
const PER_ROW = 3;
const ROW_GAP = 34, COL_GAP = 38; // px: far enough apart to tell the types from each other
/** Never extrapolate further than this many ticks without news (stops runaways if ticks stop). */
const MAX_AHEAD_TICKS = 1.5;

interface Track {
  key: string;
  color: PlayerColor;
  scout: boolean;
  units: MoverUnit[];
  // From the latest tick:
  position: Vec;
  velocity: Vec;
  route: Vec[] | null;
  cumulative: number[];
  travelled: number;
  speed: number;
  vision: number;
  /** In a battle: the battle replay draws its soldiers, so the marching column is hidden. */
  fighting: boolean;
  receivedAt: number;
  // What is drawn:
  shown: Vec;
  heading: Vec;
  sprites: Phaser.GameObjects.Sprite[];
  /** Ours only: what a click on it opens, and the invisible area that catches the click. */
  select: Target | null;
  zone: Phaser.GameObjects.Zone | null;
}

export class Movers {
  private tracks = new Map<string, Track>();
  private gameSpeed = 1;

  /** Set by the scene: a click on one of our armies or scouts. */
  onSelect: (target: Target) => void = () => {};

  constructor(private readonly scene: Phaser.Scene, private readonly ownColor: PlayerColor, private readonly labels: WorldLabels) {}

  /** ×1 / ×5 / ×20: game seconds per real second, for extrapolating between ticks. */
  setGameSpeed(speed: number): void {
    this.gameSpeed = Math.max(1, speed);
  }

  sync(state: MapStateView): void {
    const now = performance.now();
    const alive = new Set<string>();
    for (const o of state.own) {
      const t = this.track(`own:${o.id}`, this.ownColor, o.kind === 'scout', o.units, o.position);
      t.position = o.position;
      t.velocity = o.velocity;
      const last = o.route.length - 1;
      if (t.route?.length !== o.route.length || t.route[0].x !== o.route[0].x || t.route[0].y !== o.route[0].y
        || t.route[last].x !== o.route[last].x || t.route[last].y !== o.route[last].y) { // a new order changes where the road ends
        t.route = o.route;
        t.cumulative = cumulative(o.route);
      }
      t.travelled = o.travelled;
      t.speed = o.speed;
      t.vision = o.visionRadius;
      t.fighting = o.fighting;
      t.select = o.kind === 'scout'
        ? { kind: 'scout', id: o.missionKind === 'explore' ? `q:${o.quarter}` : o.missionKind === 'chest' ? `c:${o.siteId}` : String(o.targetSeat) }
        : { kind: 'army', id: o.id };
      if (!t.zone) {
        const zone = this.scene.add.zone(0, 0, 84, 76).setDepth(20_000).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => { if (t.select) this.onSelect(t.select); });
        t.zone = zone;
      }
      t.receivedAt = now;
      alive.add(t.key);
    }
    for (const s of state.seen) {
      const t = this.track(`seen:${s.id}`, s.ownerColor, s.kind === 'scout', s.units, s.position);
      t.position = s.position;
      t.velocity = s.velocity;
      t.route = null;
      t.receivedAt = now;
      alive.add(t.key);
    }
    for (const [key, t] of this.tracks) {
      if (alive.has(key)) continue;
      // Out of sight (or home): it simply is not there any more.
      for (const s of t.sprites) s.destroy();
      this.labels.remove(`army:${key}`);
      t.zone?.destroy();
      this.tracks.delete(key);
    }
  }

  /** What our own armies and scouts see from where they are drawn right now (tiles). */
  ownVision(): { center: Vec; radius: number }[] {
    return [...this.tracks.values()].filter((t) => t.key.startsWith('own:')).map((t) => ({ center: t.shown, radius: t.vision }));
  }

  /** Everything drawn right now, for the minimap. */
  all(): { position: Vec; color: PlayerColor; own: boolean; scout: boolean }[] {
    return [...this.tracks.values()].map((t) => ({ position: t.shown, color: t.color, own: t.key.startsWith('own:'), scout: t.scout }));
  }

  update(dt: number): void {
    const now = performance.now();
    for (const t of this.tracks.values()) {
      const ahead = Math.min((now - t.receivedAt) / 1000, MAX_AHEAD_TICKS) * this.gameSpeed;
      let target: Vec, heading: Vec;
      if (t.route) {
        const length = t.cumulative[t.cumulative.length - 1];
        const d = Math.min(length, t.travelled + t.speed * ahead);
        ({ point: target, direction: heading } = along(t.route, t.cumulative, d));
      } else {
        target = { x: t.position.x + t.velocity.x * ahead, y: t.position.y + t.velocity.y * ahead };
        heading = normalise(t.velocity) ?? t.heading;
      }
      // Glide onto the new estimate rather than jumping when a tick corrects it.
      const k = Math.min(1, dt * 12);
      const jump = Math.hypot(target.x - t.shown.x, target.y - t.shown.y) > 3;
      t.shown = jump ? target : { x: t.shown.x + (target.x - t.shown.x) * k, y: t.shown.y + (target.y - t.shown.y) * k };
      if (heading.x !== 0 || heading.y !== 0) t.heading = heading;
      for (const s of t.sprites) s.setVisible(!t.fighting);
      this.place(t);
    }
  }

  private track(key: string, color: PlayerColor, scout: boolean, units: MoverUnit[], position: Vec): Track {
    let t = this.tracks.get(key);
    const signature = scout ? 'scout' : units.map((u) => `${u.unitId}:${u.count}`).join(',');
    if (t && t.sprites.map((s) => s.getData('sig'))[0] === signature) return t;
    if (t) { for (const s of t.sprites) s.destroy(); t.zone?.destroy(); }

    const kinds = scout ? ['pawn'] : formation(units);
    const sprites = kinds.map((unit) => {
      const look = unit === 'pawn' ? { anim: 'pawn-run', scale: UNIT_SCALE } : RUN[unit] ?? { anim: 'pawn-run', scale: UNIT_SCALE };
      const anim = colorKey(color, this.ownColor, look.anim);
      const s = this.scene.add.sprite(0, 0, anim).setScale(look.scale).setOrigin(0.5, unitOriginY(look.anim)).setData('sig', signature);
      s.play({ key: anim, startFrame: Phaser.Math.Between(0, 3) });
      return s;
    });
    const fresh: Track = {
      key, color, scout, units, position, velocity: { x: 0, y: 0 }, route: null, cumulative: [], travelled: 0, speed: 0, vision: 0, fighting: false,
      receivedAt: performance.now(), shown: t?.shown ?? position, heading: t?.heading ?? { x: 1, y: 0 }, sprites,
      select: null, zone: null,
    };
    this.tracks.set(key, fresh);
    return fresh;
  }

  /** The column: rows of three across the road, the first row at the army's position. */
  private place(t: Track): void {
    const lead = toWorld(t.shown);
    const h = t.heading, p = { x: -h.y, y: h.x };
    const faceLeft = h.x < -0.1;
    t.sprites.forEach((s, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, t.sprites.length - row * PER_ROW);
      const col = (i % PER_ROW) - (inRow - 1) / 2;
      const x = lead.x - h.x * row * ROW_GAP + p.x * col * COL_GAP;
      const y = lead.y - h.y * row * ROW_GAP + p.y * col * COL_GAP;
      s.setPosition(x, y).setDepth(y).setFlipX(faceLeft);
    });
    // A sign with the number of soldiers over the column (scouts have none); hidden while the fight is replayed.
    const total = t.units.reduce((n, u) => n + u.count, 0);
    if (t.scout || t.fighting) this.labels.remove(`army:${t.key}`);
    else this.labels.set(`army:${t.key}`, {
      x: lead.x, y: lead.y - 44, anchor: 'bottom', minZoom: 0.45, cls: 'wl-small',
      html: `<div class="wl-sign"><i class="dot" style="background:${COLOR_CSS[t.color] ?? '#888'}"></i><i class="ico ico-sword"></i><b>${total}</b></div>`,
    });
    t.zone?.setPosition(lead.x - h.x * ROW_GAP, lead.y - h.y * ROW_GAP - 18);
  }

  /** Where one of our armies or scouts is drawn now (scene px), for the window that is about it. */
  worldPosition(target: Target): { x: number; y: number } | null {
    const key = JSON.stringify(target);
    for (const t of this.tracks.values())
      if (t.select && JSON.stringify(t.select) === key) return toWorld(t.shown);
    return null;
  }
}

/** One entry per soldier drawn (at most MAX_DRAWN), in marching order; types keep their share. */
function formation(units: MoverUnit[]): string[] {
  const total = units.reduce((n, u) => n + u.count, 0);
  const sorted = [...units].sort((a, b) => rank(a.unitId) - rank(b.unitId));
  if (total <= MAX_DRAWN) return sorted.flatMap((u) => Array<string>(u.count).fill(u.unitId));
  // Too many: every type keeps its share of the 30, and at least one, so no type disappears.
  const share = sorted.map((u) => (u.count / total) * MAX_DRAWN);
  const drawn = share.map((x) => Math.max(1, Math.floor(x)));
  const sum = () => drawn.reduce((a, b) => a + b, 0);
  while (sum() > MAX_DRAWN) drawn[drawn.indexOf(Math.max(...drawn))]--;
  while (sum() < MAX_DRAWN) {
    const gaps = share.map((x, i) => x - drawn[i]);
    drawn[gaps.indexOf(Math.max(...gaps))]++;
  }
  return sorted.flatMap((u, i) => Array<string>(drawn[i]).fill(u.unitId));
}

const rank = (id: string) => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };

function cumulative(points: Vec[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return out;
}

function along(points: Vec[], cum: number[], d: number): { point: Vec; direction: Vec } {
  let i = 0;
  while (i < points.length - 2 && cum[i + 1] < d) i++;
  const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
  const seg = cum[i + 1] - cum[i];
  const t = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i]) / seg)) : 0;
  return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, direction: normalise({ x: b.x - a.x, y: b.y - a.y }) ?? { x: 1, y: 0 } };
}

function normalise(v: Vec): Vec | null {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? null : { x: v.x / l, y: v.y / l };
}
