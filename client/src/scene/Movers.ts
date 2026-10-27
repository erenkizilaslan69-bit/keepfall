import Phaser from 'phaser';
import type { MapStateView, MoverUnit, PlayerColor, Vec } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, colorKey, playRandom, unitOriginY } from './assets';
import type { Target } from '../ui/windows';
import type { WorldLabels } from '../ui/world-labels';
import { COLOR_CSS } from '../format';
import { reportError } from '../error-report';
import { toWorld } from './world';
import { trace } from '../debug-trace';

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
  kesis: { anim: 'monk-run', scale: UNIT_SCALE },
  mancinik: { anim: 'mancinik-idle', scale: UNIT_SCALE },
  suvari: { anim: 'suvari-run', scale: UNIT_SCALE },
};
/** Marching order, front to back. */
const ORDER = ['suvari', 'kalkanli', 'kilicli', 'mizrakci', 'okcu', 'mancinik', 'kesis'];
const MAX_DRAWN = 30;
const PER_ROW = 3;
const ROW_GAP = 34, COL_GAP = 38; // px: far enough apart to tell the types from each other
/** Never extrapolate further than this many ticks without news (stops runaways if ticks stop). */
const MAX_AHEAD_TICKS = 1.5;

interface Track {
  key: string;
  color: PlayerColor;
  /** A scout or an envoy (one walker, no soldiers). */
  scout: boolean;
  /** An envoy: marked with a letter sign; it walks in its sender's colour. */
  envoy: boolean;
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
  /** Development: how far a column was from where the server put its army when the news came (tiles), for the debug layer to judge. */
  readonly corrections: { key: string; tiles: number; speed: number; ageMs: number; shown: Vec; position: Vec; velocity: Vec; before: Vec; beforeVelocity: Vec; onRoad: boolean; fighting: boolean }[] = [];

  /** Development: what the debug layer reads. */
  debugTracks(): { key: string; own: boolean; scout: boolean; fighting: boolean; position: Vec; shown: Vec; drawn: number; expected: number; route: Vec[] | null; units: number; ageMs: number }[] {
    const now = performance.now();
    return [...this.tracks.values()].map((t) => ({ key: t.key, own: t.key.startsWith('own:'), scout: t.scout, fighting: t.fighting, position: t.position, shown: t.shown,
      drawn: t.sprites.filter((s) => s.active).length, expected: t.sprites.length, route: t.route, units: t.units.reduce((n, u) => n + u.count, 0), ageMs: now - t.receivedAt }));
  }
  debugSprites(): Phaser.GameObjects.Sprite[] { return [...this.tracks.values()].flatMap((t) => t.sprites); }
  /** Development: is this sprite's column still known, and does it hold it? */
  debugOwner(s: Phaser.GameObjects.Sprite): string {
    const key = s.getData('track') as string | undefined;
    if (!key) return 'no column';
    const t = this.tracks.get(key);
    return t ? `column exists with ${t.sprites.length} sprites, holds this one: ${t.sprites.includes(s)}` : 'column is gone';
  }

  /** Set by the scene: a click on one of our armies or scouts. */
  onSelect: (target: Target) => void = () => {};
  /** The roads of the map (public, the same for everybody), as polylines in tiles: what others' armies and scouts are walked along between two pictures. */
  setRoads(roads: Vec[][]): void { this.roads = roads; }
  private roads: Vec[][] = [];

  /** Set by the scene: a battle replay is being played at this place (tiles). The column that walked into it stays hidden meanwhile. */
  inReplay: (at: Vec) => boolean = () => false;

  constructor(private readonly scene: Phaser.Scene, private readonly ownColor: PlayerColor, private readonly labels: WorldLabels) {}

  /** ×1 / ×5 / ×20: game seconds per real second, for extrapolating between ticks. */
  setGameSpeed(speed: number): void {
    this.gameSpeed = Math.max(1, speed);
  }

  sync(state: MapStateView): void {
    const now = performance.now();
    const alive = new Set<string>();
    for (const o of state.own) {
      const t = this.track(`own:${o.id}`, this.ownColor, o.kind !== 'army', o.units, o.position, o.kind === 'envoy');
      if (t.receivedAt > 0 && t.key === `own:${o.id}`) this.corrections.push({ key: t.key, tiles: Math.hypot(t.shown.x - o.position.x, t.shown.y - o.position.y), speed: this.gameSpeed, ageMs: now - t.receivedAt, shown: { ...t.shown }, position: { ...o.position }, velocity: { ...o.velocity }, before: { ...t.position }, beforeVelocity: { ...t.velocity }, onRoad: true, fighting: t.fighting || o.fighting });
      if (o.fighting !== t.fighting) trace(o.fighting ? 'fight-flag-on' : 'fight-flag-off', t.key);
      t.position = o.position;
      t.velocity = o.velocity;
      if (o.route.length === 0) o.route = [o.position]; // a road always has at least where the army stands
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
      t.select = o.kind === 'envoy' ? null : o.kind === 'scout'
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
      const t = this.track(`seen:${s.id}`, s.ownerColor, s.kind !== 'army', s.units, s.position, s.kind === 'envoy');
      if (t.receivedAt > 0 && performance.now() - t.receivedAt < 5000) this.corrections.push({ key: t.key, tiles: Math.hypot(t.shown.x - s.position.x, t.shown.y - s.position.y), speed: this.gameSpeed, ageMs: now - t.receivedAt, shown: { ...t.shown }, position: { ...s.position }, velocity: { ...s.velocity }, before: { ...t.position }, beforeVelocity: { ...t.velocity }, onRoad: followRoads(this.roads, t.position, t.velocity, 1) !== null, fighting: false });
      t.position = s.position;
      t.velocity = s.velocity;
      t.route = null;
      t.receivedAt = now;
      alive.add(t.key);
    }
    for (const [key, t] of this.tracks) {
      if (alive.has(key)) continue;
      // Out of sight (or home): it simply is not there any more.
      trace('track-removed', key, t.fighting ? 'while fighting' : '');
      for (const s of t.sprites) s.destroy();
      this.labels.remove(`army:${key}`);
      t.zone?.destroy();
      this.tracks.delete(key);
    }
  }

  /**
   * One army, one drawing: every column sprite on the scene must belong to the track of its key, and a key has one track.
   * Returns what is wrong (empty when all is well); the scene reports it, so a doubled army is caught instead of just seen.
   */
  audit(): string[] {
    const problems: string[] = [];
    const owned = new Set<Phaser.GameObjects.GameObject>();
    for (const t of this.tracks.values()) for (const s of t.sprites) owned.add(s);
    const perKey = new Map<string, number>();
    for (const o of this.scene.children.list) {
      const key = o.getData?.('track') as string | undefined;
      if (!key) continue;
      if (!owned.has(o)) problems.push(`stray sprite of ${key}`);
      else perKey.set(key, (perKey.get(key) ?? 0) + 1);
    }
    for (const [key, t] of this.tracks) {
      // Our own walkers keep to their road, bends included: a column drawn away from it has cut a corner.
      if (t.route && t.route.length > 1) {
        let near = Infinity;
        for (let i = 0; i + 1 < t.route.length; i++) near = Math.min(near, distanceToSegment(t.shown, t.route[i], t.route[i + 1]));
        if (near > 0.6) problems.push(`${key}: ${near.toFixed(1)} tiles off its road`);
      }
      const drawn = perKey.get(key) ?? 0;
      if (drawn !== t.sprites.length) problems.push(`${key}: ${drawn} drawn, ${t.sprites.length} expected`);
    }
    return problems;
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
    for (const t of [...this.tracks.values()]) {
      try {
        this.advance(t, now, dt);
      } catch (e) {
        reportError('movers', e, { source: t.key.startsWith('own:') ? 'own mover' : 'seen mover' });
        this.remove(t);
      }
    }
  }

  /** A column that cannot be drawn is taken off the map; the next server tick makes a fresh one. */
  private remove(t: Track): void {
    for (const s of t.sprites) if (s.active) s.destroy();
    t.zone?.destroy();
    this.labels.remove(`army:${t.key}`);
    this.tracks.delete(t.key);
  }

  private advance(t: Track, now: number, dt: number): void {
    {
      const ahead = Math.min((now - t.receivedAt) / 1000, MAX_AHEAD_TICKS) * this.gameSpeed;
      let target: Vec, heading: Vec;
      if (t.route) {
        const length = t.cumulative[t.cumulative.length - 1];
        const d = Math.min(length, t.travelled + t.speed * ahead);
        ({ point: target, direction: heading } = along(t.route, t.cumulative, d));
      } else {
        // Somebody else's: only where they are and which way they go. They keep to the roads, so go on along the road (round its corners),
        // not straight on: a straight guess would run past a bend and then jump back onto the road.
        const walked = followRoads(this.roads, t.position, t.velocity, Math.hypot(t.velocity.x, t.velocity.y) * ahead);
        if (walked) { target = walked.point; heading = walked.direction; }
        else {
          target = { x: t.position.x + t.velocity.x * ahead, y: t.position.y + t.velocity.y * ahead };
          heading = normalise(t.velocity) ?? t.heading;
        }
      }
      // Glide onto the new estimate rather than jumping when a tick corrects it.
      const k = Math.min(1, dt * 12);
      const jump = Math.hypot(target.x - t.shown.x, target.y - t.shown.y) > 3;
      t.shown = jump ? target : { x: t.shown.x + (target.x - t.shown.x) * k, y: t.shown.y + (target.y - t.shown.y) * k };
      if (heading.x !== 0 || heading.y !== 0) t.heading = heading;
      const hidden = t.fighting || (!t.scout && this.inReplay(t.shown));
      for (const s of t.sprites) s.setVisible(!hidden);
      this.place(t);
    }
  }

  private track(key: string, color: PlayerColor, scout: boolean, units: MoverUnit[], position: Vec, envoy = false): Track {
    let t = this.tracks.get(key);
    const signature = envoy ? 'envoy' : scout ? 'scout' : units.map((u) => `${u.unitId}:${u.count}`).join(',');
    if (t && t.sprites.map((s) => s.getData('sig'))[0] === signature) return t;
    if (t) { for (const s of t.sprites) s.destroy(); t.zone?.destroy(); }

    const kinds = scout ? ['pawn'] : formation(units);
    const sprites: Phaser.GameObjects.Sprite[] = [];
    try {
    for (const unit of kinds) {
      const look = unit === 'pawn' ? { anim: 'pawn-run', scale: UNIT_SCALE } : RUN[unit] ?? { anim: 'pawn-run', scale: UNIT_SCALE };
      const anim = colorKey(color, this.ownColor, look.anim);
      const s = this.scene.add.sprite(0, 0, anim).setScale(look.scale).setOrigin(0.5, unitOriginY(look.anim)).setData('sig', signature).setData('track', key);
      sprites.push(s);
      playRandom(s, anim);
    }
    } catch (e) {
      // A column that cannot be built is not left half drawn: what was made is deleted, and the column stands as an empty one (nothing is retried every tick).
      for (const s of sprites) s.destroy();
      sprites.length = 0;
      reportError('movers', e, { source: `building column ${key}` });
    }
    trace('track-created', key, `${kinds.length} drawn of ${units.reduce((n, u) => n + u.count, 0)}${t ? ' (rebuilt: its soldiers changed)' : ''}`);
    const fresh: Track = {
      key, color, scout, envoy, units, position, velocity: { x: 0, y: 0 }, route: null, cumulative: [], travelled: 0, speed: 0, vision: 0, fighting: false,
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
    if (t.envoy) this.labels.set(`army:${t.key}`, { x: lead.x, y: lead.y - 44, anchor: 'bottom', minZoom: 0.45, cls: 'wl-small', html: '<div class="wl-sign">✉</div>' });
    else if (t.scout || t.fighting) this.labels.remove(`army:${t.key}`);
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

/**
 * Walks <paramref name="distance"/> tiles from <paramref name="pos"/> along the road that lies under it and runs the way <paramref name="vel"/> points,
 * round bends and on to the next road at a junction (the one that bends least). Null when no road is there (the forest paths, open ground).
 */
export function followRoads(roads: Vec[][], pos: Vec, vel: Vec, distance: number): { point: Vec; direction: Vec } | null {
  const v = normalise(vel);
  if (!v || roads.length === 0) return null;
  // The road segment under the position that points the same way (either way along it).
  let best: { road: number; seg: number; t: number; dist: number; sign: 1 | -1 } | null = null;
  roads.forEach((pts, ri) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      if (len2 < 1e-9) continue;
      const t = Math.min(1, Math.max(0, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2));
      const d = Math.hypot(pos.x - (a.x + dx * t), pos.y - (a.y + dy * t));
      const dot = (dx * v.x + dy * v.y) / Math.sqrt(len2);
      if (d > 0.7 || Math.abs(dot) < 0.5 || (best && d >= best.dist)) continue;
      best = { road: ri, seg: i, t, dist: d, sign: dot > 0 ? 1 : -1 };
    }
  });
  if (!best) return null;
  let { road, seg, t, sign } = best as { road: number; seg: number; t: number; sign: 1 | -1 };
  let remaining = distance;
  let x = roads[road][seg].x + (roads[road][seg + 1].x - roads[road][seg].x) * t, y = roads[road][seg].y + (roads[road][seg + 1].y - roads[road][seg].y) * t;
  let dir = { x: v.x, y: v.y };
  for (let guard = 0; guard < 64 && remaining > 1e-6; guard++) {
    const pts = roads[road];
    const from = sign > 0 ? pts[seg] : pts[seg + 1], to = sign > 0 ? pts[seg + 1] : pts[seg];
    const segDir = normalise({ x: to.x - from.x, y: to.y - from.y });
    if (!segDir) break;
    dir = segDir;
    const left = Math.hypot(to.x - x, to.y - y);
    if (remaining <= left) { x += dir.x * remaining; y += dir.y * remaining; remaining = 0; break; }
    x = to.x; y = to.y; remaining -= left;
    const next = sign > 0 ? seg + 1 : seg - 1;
    if (next >= 0 && next + 1 < pts.length) { seg = next; continue; }
    // The end of this road: a road that starts or ends right here and bends least from where we were going.
    let pick: { road: number; seg: number; sign: 1 | -1; dot: number } | null = null;
    roads.forEach((other, oi) => {
      if (oi === road) return;
      const first = other[0], last = other[other.length - 1];
      if (Math.hypot(first.x - x, first.y - y) < 0.3 && other.length > 1) {
        const d = normalise({ x: other[1].x - first.x, y: other[1].y - first.y });
        if (d && (!pick || d.x * dir.x + d.y * dir.y > pick.dot)) pick = { road: oi, seg: 0, sign: 1, dot: d.x * dir.x + d.y * dir.y };
      }
      if (Math.hypot(last.x - x, last.y - y) < 0.3 && other.length > 1) {
        const d = normalise({ x: other[other.length - 2].x - last.x, y: other[other.length - 2].y - last.y });
        if (d && (!pick || d.x * dir.x + d.y * dir.y > pick.dot)) pick = { road: oi, seg: other.length - 2, sign: -1, dot: d.x * dir.x + d.y * dir.y };
      }
    });
    if (!pick || (pick as { dot: number }).dot < -0.2) break; // a dead end (or only a turn-back): wait here for the next picture
    ({ road, seg, sign } = pick as { road: number; seg: number; sign: 1 | -1 });
  }
  return { point: { x, y }, direction: dir };
}

function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

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
