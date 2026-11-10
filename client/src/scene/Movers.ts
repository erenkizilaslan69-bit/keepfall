import Phaser from 'phaser';
import type { LastSeenView, MapStateView, MoverUnit, PlayerColor, Vec } from '../types';
import { esc } from '../format';
import { t } from '../i18n';
import { UNIT_SCALE, colorKey, playRandom, unitOriginY, unitScale } from './assets';
import { hearing } from './hearing';
import { sfx } from '../audio';
import type { Target } from '../ui/windows';
import type { WorldLabels } from '../ui/world-labels';
import { COLOR_CSS } from '../format';
import { reportError } from '../error-report';
import { toTiles, toWorld } from './world';
import { TILE } from './layout';
import { trace } from '../debug-trace';
import type { Effects } from './Effects';
import { lowGraphics } from '../prefs';

// Armies and scouts walking on the map: our own (we know their road) and the others the server lets
// us see (only where they are and which way they go). Every soldier is drawn in its own unit's
// sprite and its owner's colour, in marching order — shield bearers, swordsmen and spearmen in
// front, archers at the back — so whoever sees an army coming can read what it is made of.
// Between two server ticks positions are extrapolated (our own along the road, others along their
// heading) and corrected smoothly when the next tick arrives.
//
// The column (only the drawing: the server's position, timings and rules are untouched): every soldier gets a place in the column when it is formed
// (its row and its lane) and keeps it for the whole march. It walks the leader's own trail (the way the leader was drawn), a fixed distance behind
// along it, and stands its lane's width to the side of the trail there: round a bend the column snakes, rows do not swing round as a whole.
// On a narrow path the lanes close up a little (smoothly); nobody may stand on a wall or a tower, in a tree or in a building (they step in towards
// the column's line instead), and a column that stops keeps its order.

const RUN: Record<string, { anim: string; scale: number }> = {
  kalkanli: { anim: 'warrior-guard', scale: UNIT_SCALE },
  kilicli: { anim: 'swordsman-run', scale: unitScale('kilicli') },
  mizrakci: { anim: 'lancer-run', scale: UNIT_SCALE },
  okcu: { anim: 'archer-run', scale: UNIT_SCALE },
  kesis: { anim: 'monk-run', scale: UNIT_SCALE },
  mancinik: { anim: 'mancinik-run', scale: unitScale('mancinik') },
  suvari: { anim: 'suvari-run', scale: unitScale('suvari') },
};
/** Marching order, front to back. */
const ORDER = ['kalkanli', 'kilicli', 'mizrakci', 'okcu', 'mancinik', 'kesis', 'suvari']; // shields and blades lead, the catapults march in the middle, the cavalry guards the rear
/**
 * Only a part of a big army is drawn (the sign over it says how many there are): up to 10 as they are, then one more for every 4, never more than 22
 * (low graphics keeps the old thrift: one more for every 8, never more than 14). It depends only on the total the sign already shows.
 */
const drawnOf = (total: number): number => lowGraphics()
  ? Math.min(14, Math.max(Math.min(total, 10), 10 + Math.floor((total - 10) / 8)))
  : Math.min(22, Math.max(Math.min(total, 10), 10 + Math.floor((total - 10) / 4)));
const ROW_GAP = 34; // px: the zone that catches a click sits about one row behind the leader
/** How much room each kind needs: across the road (px) and along it (px). The catapult is big and the cavalry long; nobody stands on anybody. */
const FOOT: Record<string, { w: number; d: number }> = {
  mancinik: { w: 84, d: 84 }, suvari: { w: 54, d: 60 }, kilicli: { w: 42, d: 34 }, kalkanli: { w: 40, d: 34 }, mizrakci: { w: 40, d: 34 }, okcu: { w: 38, d: 32 }, kesis: { w: 36, d: 34 },
};
const FOOT_DEFAULT = { w: 40, d: 40 };
/** How wide a row may be on a forest path, on a road in the open, and at a crossing or on open ground (px); the outer lanes may stand this much wider (on the grass). */
const LANE_FOREST = 84, LANE_ROAD = 124, LANE_OPEN = 196, LANE_SPILL = 1.25;
/** Lanes of a column, fixed for the whole march: two abreast up to this many soldiers in the army, three beyond. A lane is this wide (px, an infantryman). */
const TWO_ABREAST_UP_TO = 12, LANE_PX = 46;
/** The lanes close up at most to this share of their width (26 px between two infantrymen), over about half a second. */
const LANE_MIN = 0.62, LANE_EASE = 0.5;
/** A soldier squeezed in by a wall, a tree or a building looks this far ahead (s) along its way, steps in fast (s) and back out slowly (s). */
const SQUEEZE_AHEAD = 0.45, SQUEEZE_IN = 0.1, SQUEEZE_OUT = 0.45;
/** How far along the trail (px) the way a soldier faces is averaged: a bend is taken over twice this, not in one step. */
const TURN_PX = 34;
/** A turn of the face needs this much sideways motion (px a second): a soldier walking straight up or down the screen does not flicker left and right. */
const FACE_PX = 10;

/** One drawn soldier's place in its column, set when the column is formed and never changed: its row and lane, how far behind the leader (px along its trail) and to the side (px). */
interface Slot { row: number; lane: number; back: number; side: number }

/** The places of a column's soldiers in marching order: rows of two or three (fewer where a big unit takes room), each a little apart, never re-sorted. */
function marchSlots(kinds: string[], soldiers: number): Slot[] {
  const width = (soldiers <= TWO_ABREAST_UP_TO ? 2 : 3) * LANE_PX;
  const rows: string[][] = [];
  let used = 0;
  for (const k of kinds) {
    const w = (FOOT[k] ?? FOOT_DEFAULT).w + 6;
    if (!rows.length || (used + w > width && rows[rows.length - 1].length)) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(k); used += w;
  }
  const out: Slot[] = [];
  let back = 0;
  rows.forEach((row, r) => {
    const widths = row.map((k) => (FOOT[k] ?? FOOT_DEFAULT).w + 6);
    let at = -widths.reduce((a, b) => a + b, 0) / 2;
    row.forEach((_k, lane) => {
      const i = out.length; // a small fixed stagger (the same every time): drilled rows would look like a parade
      out.push({ row: r, lane, back: back + ((i * 53) % 9) - 4, side: at + widths[lane] / 2 + ((i * 37) % 7) - 3 });
      at += widths[lane];
    });
    const depth = Math.max(...row.map((k) => (FOOT[k] ?? FOOT_DEFAULT).d));
    const nextDepth = r + 1 < rows.length ? Math.max(...rows[r + 1].map((k) => (FOOT[k] ?? FOOT_DEFAULT).d)) : depth;
    back += (depth + nextDepth) / 2;
  });
  return out;
}

/** Never extrapolate further than this many ticks without news (stops runaways if ticks stop). */
// How far the picture walks on by itself when no news arrives (a phone's network stalling, a throttled tab). A cap of 1.5 ticks made the column stand still
// during a gap of four seconds and then jump seven tiles when the news came: a wrong place to the player. The armies keep to known roads, so walking on is safe.
const MAX_AHEAD_TICKS = 6;
/** The column catches up at most this fast (tiles a second) when the news puts it farther ahead than a glide covers: it is seen running, not teleported. */
const CATCH_UP_TILES_PER_SECOND = 14;

interface ColumnMemo { color: PlayerColor; at: Vec; ms: number; soldiers: { kind: string; x: number; y: number }[] }

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
  /** When the column kicks up its next puff of dust (performance.now ms). */
  dustAt?: number;
  /** When it is next heard (a tramp of feet, hooves). */
  stepAt?: number;
  // What is drawn:
  shown: Vec;
  /** Our own armies: how far along the route (tiles) the column is drawn; the position is always read off the route, so a bend is never cut. */
  shownDist?: number;
  /** Drawn off its (new) road: it is walking over to it (at most the catch-up speed), not put on it. */
  rejoin?: boolean;
  heading: Vec;
  sprites: Phaser.GameObjects.Sprite[];
  /** Every sprite's fixed place in the column (see marchSlots). */
  slots: Slot[];
  /** The way the leader was drawn (scene px), oldest first, and how far along it each point is (px): the soldiers walk it behind the leader. */
  trail: { x: number; y: number }[];
  trailArc: number[];
  /** Per row: how wide its lanes are now (1 as formed, smaller on a narrow path; eased). */
  rowScale: number[];
  /** Per sprite: how far out to its lane it stands now (1 in its lane, 0 on the column's line: squeezed in by a wall, a tree or a building; eased). */
  squeeze: number[];
  /** Per sprite: its eased sideways motion (px a second) and which way it faces. */
  vx: number[];
  faceLeft: boolean[];
  /** The unit kind of every drawn sprite, in marching order. */
  kinds: string[];
  /** Ours only: what a click on it opens, and the invisible area that catches the click. */
  select: Target | null;
  zone: Phaser.GameObjects.Zone | null;
}

export class Movers {
  private tracks = new Map<string, Track>();
  private gameSpeed = 1;
  private fx: Effects | null = null;
  /** The effects the marching columns raise dust with. */
  setEffects(fx: Effects): void { this.fx = fx; }
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

  /** The forests (tiles): inside them the roads are narrow paths. */
  setForests(list: { center: Vec; radius: number }[]): void { this.forests = list; }
  private forests: { center: Vec; radius: number }[] = [];

  /**
   * How wide a row of the column may be (px) where it stands: the road is about 68 px wide in the open and 46 in the forest, and the soldiers keep to its lane (a
   * little wider than the road itself); at a crossing and on open ground there is room for four abreast.
   */
  private laneAt(at: { x: number; y: number }): number {
    const tile = toTiles(at);
    const inForest = this.forests.some((f) => Math.hypot(tile.x - f.center.x, tile.y - f.center.y) < f.radius * 0.95);
    let nearest = Infinity, roadsNear = 0;
    for (const road of this.roads) {
      let d = Infinity;
      for (let i = 0; i + 1 < road.length; i++) d = Math.min(d, distanceToSegment(tile, road[i], road[i + 1]));
      d *= TILE;
      nearest = Math.min(nearest, d);
      if (d < 70) roadsNear++;
    }
    if (roadsNear >= 2) return LANE_OPEN; // a crossing
    if (nearest < 50) return inForest ? LANE_FOREST : LANE_ROAD;
    return inForest ? LANE_FOREST : LANE_OPEN; // open ground (a castle's yard, a clearing); in the trees a path too
  }

  /** The outer edges of the wall rings (scene px). Development only (tools/corner-check.mjs measures who stands on a wall); the scene's `blocked` keeps the columns off. */
  setWalls(rects: { x: number; y: number; w: number; h: number }[]): void { this.walls = rects; }
  walls: { x: number; y: number; w: number; h: number }[] = [];

  /** Set by the scene: a battle replay is being played at this place (tiles). The column that walked into it stays hidden meanwhile. */
  inReplay: (at: Vec) => boolean = () => false;

  constructor(private readonly scene: Phaser.Scene, private readonly ownColor: PlayerColor, private readonly labels: WorldLabels) {}

  /** ×1 / ×5 / ×20: game seconds per real second, for extrapolating between ticks. */
  setGameSpeed(speed: number): void {
    this.gameSpeed = Math.max(1, speed);
  }

  sync(state: MapStateView): void {
    this.syncLastSeen(state.lastSeen ?? []);
    const now = performance.now();
    const alive = new Set<string>();
    for (const o of state.own) {
      const t = this.track(`own:${o.id}`, this.ownColor, o.kind !== 'army', o.units, o.position, o.kind === 'envoy');
      if (t.receivedAt > 0 && t.key === `own:${o.id}`) this.corrections.push({ key: t.key, tiles: Math.hypot(t.shown.x - o.position.x, t.shown.y - o.position.y), speed: this.gameSpeed, ageMs: now - t.receivedAt, shown: { ...t.shown }, position: { ...o.position }, velocity: { ...o.velocity }, before: { ...t.position }, beforeVelocity: { ...t.velocity }, onRoad: true, fighting: t.fighting || o.fighting });
      if (o.fighting !== t.fighting) trace(o.fighting ? 'fight-flag-on' : 'fight-flag-off', t.key);
      if (o.fighting && !t.fighting) this.remember(t); // it has walked into a battle: where its soldiers stand is where the replay's begin
      t.position = o.position;
      t.velocity = o.velocity;
      if (o.route.length === 0) o.route = [o.position]; // a road always has at least where the army stands
      const last = o.route.length - 1;
      if (t.route?.length !== o.route.length || t.route[0].x !== o.route[0].x || t.route[0].y !== o.route[0].y
        || t.route[last].x !== o.route[last].x || t.route[last].y !== o.route[last].y) { // a new order changes where the road ends
        t.route = o.route;
        t.cumulative = cumulative(o.route);
        t.shownDist = undefined; // the drawn distance is found again on the new road
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
      this.followRoadOf(t, s.position, s.velocity);
      t.receivedAt = now;
      alive.add(t.key);
    }
    for (const [key, t] of this.tracks) {
      if (alive.has(key)) continue;
      // Out of sight (or home): it simply is not there any more.
      trace('track-removed', key, t.fighting ? 'while fighting' : '');
      this.remember(t);
      for (const s of t.sprites) s.destroy();
      this.labels.remove(`army:${key}`);
      t.zone?.destroy();
      this.tracks.delete(key);
    }
  }

  /**
   * Somebody else's walker: all we know is where it is and which way it goes, so the road it walks is worked out from the public roads (as far as it
   * can get before the next picture is due) and it is then drawn the way ours are: a distance along that road, corners rounded, rows following the bend.
   * The road is kept while the news keeps agreeing with it (the walker is on it, going the same way, with road enough left); otherwise it is worked out again.
   */
  private followRoadOf(t: Track, position: Vec, velocity: Vec): void {
    const speed = Math.hypot(velocity.x, velocity.y);
    const v = normalise(velocity);
    const reach = speed * MAX_AHEAD_TICKS * this.gameSpeed * 2 + 4;
    if (t.route && v && t.route.length > 1) {
      const length = t.cumulative[t.cumulative.length - 1];
      const p = projectOnRoute(t.route, t.cumulative, position);
      const dir = along(t.route, t.cumulative, p.d).direction;
      if (p.off < 0.5 && dir.x * v.x + dir.y * v.y > 0.3 && p.d + speed * MAX_AHEAD_TICKS * this.gameSpeed < length) {
        t.travelled = p.d; t.speed = speed;
        return;
      }
    }
    const ahead = v ? roadAhead(this.roads, position, velocity, reach) : null;
    if (!ahead || ahead.length < 2) { t.route = null; t.cumulative = []; t.shownDist = undefined; return; }
    // The road behind it too (the rows of the column stand there), so that a bend the leader has just passed is followed by the rows and not cut straight on.
    const behind = roadAhead(this.roads, position, { x: -velocity.x, y: -velocity.y }, 12);
    const route = behind && behind.length > 1 ? [...behind.slice(1).reverse(), ...ahead] : ahead;
    t.route = route;
    t.cumulative = cumulative(route);
    t.travelled = behind && behind.length > 1 ? cumulative(behind)[behind.length - 1] : 0;
    t.speed = speed;
    t.shownDist = undefined; // the drawn distance is found again on the new road
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
      if (t.route && t.route.length > 1 && !t.rejoin) { // (one walking over to its new road is not off it)
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

  /** Where the soldiers of a column that has just gone into a battle stood (scene px): the replay's fighters start from there instead of popping up in a line. */
  private lastColumns: ColumnMemo[] = [];
  private remember(t: Track): void {
    if (t.scout || t.envoy) return;
    const soldiers = t.sprites.map((s, i) => ({ kind: t.kinds[i], x: s.x, y: s.y, active: s.active })).filter((s) => s.active && s.kind).map(({ kind, x, y }) => ({ kind, x, y }));
    if (soldiers.length === 0) return;
    this.lastColumns.push({ color: t.color, at: t.shown, ms: performance.now(), soldiers });
    if (this.lastColumns.length > 8) this.lastColumns.shift();
  }

  /**
   * The soldiers of the column of this colour that is (or, a moment ago, was) at this place (tiles): the battle replay takes its starting places from them.
   * Only what is drawn on the map already (which units stand where in a column), nothing the player could not see. Null when there is none.
   */
  claimColumn(color: PlayerColor, at: Vec): { kind: string; x: number; y: number }[] | null {
    let best: { soldiers: { kind: string; x: number; y: number }[]; d: number; old: ColumnMemo | null } | null = null;
    const now = performance.now();
    for (const t of this.tracks.values()) {
      if (t.scout || t.envoy || t.color !== color || t.sprites.length === 0) continue;
      const d = Math.hypot(t.shown.x - at.x, t.shown.y - at.y);
      if (d < 4 && (!best || d < best.d)) best = { soldiers: t.sprites.map((s, i) => ({ kind: t.kinds[i], x: s.x, y: s.y, active: s.active })).filter((s) => s.active && s.kind).map(({ kind, x, y }) => ({ kind, x, y })), d, old: null };
    }
    for (const c of this.lastColumns) {
      const d = Math.hypot(c.at.x - at.x, c.at.y - at.y);
      if (now - c.ms < 4000 && c.color === color && d < 4 && (!best || d < best.d)) best = { soldiers: c.soldiers, d, old: c };
    }
    if (!best || best.soldiers.length === 0) return null;
    if (best.old) this.lastColumns.splice(this.lastColumns.indexOf(best.old), 1);
    return best.soldiers;
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
        // Ours: the column is a distance along the road. The server's news moves the distance it should be at (travelled + speed × the time since the news);
        // the drawn distance follows it (a glide when close, a fast run when far, a jump when very far), and the place is read off the road with its bends
        // rounded a little, so the column never leaves the road, whatever the news does.
        const length = t.cumulative[t.cumulative.length - 1];
        const want = Math.min(length, t.travelled + t.speed * ahead);
        if (t.shownDist === undefined) {
          const p = projectOnRoute(t.route, t.cumulative, t.shown);
          t.shownDist = p.off > 0.6 ? want : p.d;
          // drawn away from the new road (a new order, or a guess of somebody else's road that the news corrected): it walks over to it, it is not put there
          t.rejoin = p.off > 0.6;
        }
        const diff = want - t.shownDist;
        if (Math.abs(diff) > 30) t.shownDist = want;
        else if (diff > 3) t.shownDist += Math.min(diff, CATCH_UP_TILES_PER_SECOND * Math.max(dt, 0.016));
        else t.shownDist += Math.sign(diff) * Math.min(Math.abs(diff) * Math.min(1, dt * 12), CATCH_UP_TILES_PER_SECOND * Math.max(dt, 0.016)); // (a glide, never faster than the catch-up run: the soldiers behind follow it)
        t.shownDist = Math.min(length, Math.max(0, t.shownDist));
        const here = alongSmooth(t.route, t.cumulative, t.shownDist);
        if (t.rejoin && Math.hypot(here.point.x - t.shown.x, here.point.y - t.shown.y) < 0.05) t.rejoin = false;
        if (!t.rejoin) t.shown = here.point; // (rejoining: the glide below takes it there)
        target = here.point; heading = here.direction;
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
      const gap = Math.hypot(target.x - t.shown.x, target.y - t.shown.y);
      // Somebody else's column that is behind its estimate catches up ALONG the road it is on (a straight glide cut the corner of a bend), as long as the
      // estimate lies ahead of it the way it is going; otherwise (ahead of the estimate, or off the roads) the straight glide below.
      const ahead2 = !t.route && !t.rejoin && gap > 1e-4 && gap <= 30 && (target.x - t.shown.x) * t.heading.x + (target.y - t.shown.y) * t.heading.y > 0;
      const stepLen = Math.min(gap > 3 ? Infinity : gap * k, CATCH_UP_TILES_PER_SECOND * Math.max(dt, 0.016));
      const walked = ahead2 ? followRoads(this.roads, t.shown, t.heading, Math.min(gap, stepLen)) : null;
      if (walked) t.shown = walked.point;
      else if (gap > 30) t.shown = target; // (a recall or a new order from far away: not a correction)
      else if (gap > 3) { const step = Math.min(gap, CATCH_UP_TILES_PER_SECOND * Math.max(dt, 0.016)) / gap; t.shown = { x: t.shown.x + (target.x - t.shown.x) * step, y: t.shown.y + (target.y - t.shown.y) * step }; }
      else { const g = Math.min(k, gap > 1e-9 ? (CATCH_UP_TILES_PER_SECOND * Math.max(dt, 0.016)) / gap : 1); t.shown = { x: t.shown.x + (target.x - t.shown.x) * g, y: t.shown.y + (target.y - t.shown.y) * g }; } // (a glide, never faster than the catch-up run)
      if (heading.x !== 0 || heading.y !== 0) t.heading = heading;
      const hidden = t.fighting || (!t.scout && this.inReplay(t.shown));
      for (const s of t.sprites) s.setVisible(!hidden);
      this.record(t);
      this.place(t, dt);
      if (!hidden && !t.scout && !t.envoy && this.fx && now >= (t.dustAt ?? 0) && Math.hypot(t.velocity.x, t.velocity.y) > 0.2) {
        const horses = t.units.some((u) => u.unitId === 'suvari');
        t.dustAt = now + (horses ? 170 : 380) / Math.max(1, Math.min(this.gameSpeed, 3));
        const at = toWorld(t.shown);
        this.fx.march(at.x - t.heading.x * 34, at.y - t.heading.y * 34 + 8, horses);
      }
      if (!hidden && !t.scout && !t.envoy && now >= (t.stepAt ?? 0) && Math.hypot(t.velocity.x, t.velocity.y) > 0.2) {
        const horses = t.units.some((u) => u.unitId === 'suvari');
        t.stepAt = now + (horses ? 2600 : 520) / Math.max(1, Math.min(this.gameSpeed, 3));
        const at = toWorld(t.shown), l = hearing(this.scene, at.x, at.y);
        if (l > 0.06 && !horses) sfx.play('march', l * (t.key.startsWith('own:') ? 1 : 0.8)); // (a cavalry column is heard as the gallop loop, see gallopLevel)
      }
    }
  }

  /** The rivals' armies we saw and no longer see: a faded ring where they were, with a sign (how many we made out, how long ago). Only what the server remembers for us. */
  private readonly ghosts = new Map<string, Phaser.GameObjects.Arc>();
  private syncLastSeen(list: LastSeenView[]): void {
    const alive = new Set<string>();
    for (const g of list) {
      alive.add(g.id);
      const at = toWorld(g.position), total = g.units.reduce((n, u) => n + u.count, 0);
      let ring = this.ghosts.get(g.id);
      if (!ring) {
        ring = this.scene.add.circle(at.x, at.y, 20, 0xffffff, 0.12).setStrokeStyle(3, hexOf(COLOR_CSS[g.ownerColor]), 0.6).setDepth(at.y - 1);
        this.ghosts.set(g.id, ring);
      }
      ring.setPosition(at.x, at.y).setDepth(at.y - 1);
      const age = g.secondsAgo < 60 ? t('{0} sn önce', Math.round(g.secondsAgo)) : t('{0} dk önce', Math.floor(g.secondsAgo / 60));
      this.labels.set(`ghost:${g.id}`, {
        x: at.x, y: at.y - 28, anchor: 'bottom', minZoom: 0.45, cls: 'wl-small',
        html: `<div class="wl-sign wl-gone"><i class="dot" style="background:${COLOR_CSS[g.ownerColor] ?? '#888'}"></i><i class="ico ico-sword"></i><b>≈${total}</b><span>${esc(age)}</span></div>`,
      });
    }
    for (const [id, ring] of this.ghosts) {
      if (alive.has(id)) continue;
      ring.destroy(); this.ghosts.delete(id); this.labels.remove(`ghost:${id}`);
    }
  }

  /** How loudly the gallop loop is wanted now (0–1): the loudest cavalry column on the map in earshot of the camera. */
  gallopLevel(): number {
    let best = 0;
    for (const t of this.tracks.values()) {
      if (t.scout || t.envoy || t.fighting || Math.hypot(t.velocity.x, t.velocity.y) < 0.2 || !t.units.some((u) => u.unitId === 'suvari')) continue;
      const at = toWorld(t.shown);
      best = Math.max(best, hearing(this.scene, at.x, at.y) * (t.key.startsWith('own:') ? 1 : 0.8));
    }
    return best;
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
      receivedAt: performance.now(), shown: t?.shown ?? position, heading: t?.heading ?? { x: 1, y: 0 }, sprites, kinds,
      slots: scout ? [{ row: 0, lane: 0, back: 0, side: 0 }] : marchSlots(kinds, units.reduce((n, u) => n + u.count, 0)),
      trail: [], trailArc: [], rowScale: [], squeeze: kinds.map(() => 1), vx: kinds.map(() => 0), faceLeft: kinds.map(() => (t?.heading.x ?? 1) < -0.1),
      select: null, zone: null,
    };
    this.tracks.set(key, fresh);
    if (!t && key.startsWith('own:') && this.fx) { const at = toWorld(position); this.fx.dust(at.x, at.y, scout ? 0.8 : 1.3, 0xd6c49a); } // it sets out: a puff of dust
    return fresh;
  }

  /** Set by the scene: may a soldier stand at `p` (scene px), coming from `from` (its column's line)? Walls, towers, trees and buildings say no. */
  blocked: (p: { x: number; y: number }, from: { x: number; y: number }) => boolean = () => false;

  /** Development (tools/corner-check.mjs): every drawn soldier's fixed place, where it stands and the point of its column's line it stands beside. */
  debugSlots(): { key: string; i: number; row: number; lane: number; side: number; x: number; y: number; line: { x: number; y: number } }[] {
    const out: { key: string; i: number; row: number; lane: number; side: number; x: number; y: number; line: { x: number; y: number } }[] = [];
    for (const t of this.tracks.values()) t.sprites.forEach((s, i) => {
      const sl = t.slots[i];
      if (sl && s.active) out.push({ key: t.key, i, row: sl.row, lane: sl.lane, side: (s.getData('side') as number) ?? 0, x: s.x, y: s.y, line: (s.getData('line') as { x: number; y: number }) ?? { x: s.x, y: s.y } });
    });
    return out;
  }

  /**
   * The leader's trail grows where the leader is drawn now. A small step back (the news put the leader a little behind where it was drawn, still going the
   * same way) cuts the trail back instead of folding it; a turn round (a recall) is walked like any bend; a jump (a new order far away) forms the column anew.
   */
  private record(t: Track): void {
    const p = toWorld(t.shown);
    const n = t.trail.length;
    if (n === 0) { this.seed(t, p); return; }
    const last = t.trail[n - 1];
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d > 3 * TILE) { this.seed(t, p); return; }
    if (d < 2) return;
    if (n >= 2) {
      const prev = t.trail[n - 2], dir = { x: last.x - prev.x, y: last.y - prev.y };
      const back = (p.x - last.x) * dir.x + (p.y - last.y) * dir.y < 0;
      const stillForward = t.heading.x * dir.x + t.heading.y * dir.y > 0;
      if (back && stillForward && d < TILE) {
        while (t.trail.length > 1) {
          const e = t.trail[t.trail.length - 1], f = t.trail[t.trail.length - 2];
          if ((e.x - p.x) * (e.x - f.x) + (e.y - p.y) * (e.y - f.y) <= 0) break; // (e is behind p: keep it)
          t.trail.pop(); t.trailArc.pop();
        }
      }
    }
    const end = t.trail[t.trail.length - 1];
    t.trail.push(p);
    t.trailArc.push(t.trailArc[t.trailArc.length - 1] + Math.hypot(p.x - end.x, p.y - end.y));
    // only as much trail as the column is long (and a little more)
    const keep = t.trailArc[t.trailArc.length - 1] - (t.slots[t.slots.length - 1]?.back ?? 0) - 4 * TILE;
    let drop = 0;
    while (drop + 2 < t.trail.length && t.trailArc[drop + 1] < keep) drop++;
    if (drop > 0) { t.trail.splice(0, drop); t.trailArc.splice(0, drop); }
  }

  /** A column that is formed (or formed anew): its trail is laid behind the leader along its road (ours, or the one worked out), else straight back. */
  private seed(t: Track, p: { x: number; y: number }): void {
    const length = (t.slots[t.slots.length - 1]?.back ?? 0) + 2 * TILE, step = 16;
    const pts: { x: number; y: number }[] = [];
    for (let k = Math.ceil(length / step); k >= 1; k--) {
      const back = (k * step) / TILE;
      if (t.route && t.shownDist !== undefined && t.route.length > 1) {
        const d = t.shownDist - back;
        if (d >= 0) pts.push(toWorld(alongSmooth(t.route, t.cumulative, d).point));
        else { const f = alongSmooth(t.route, t.cumulative, 0); pts.push(toWorld({ x: f.point.x + f.direction.x * d, y: f.point.y + f.direction.y * d })); }
      } else pts.push({ x: p.x - t.heading.x * back * TILE, y: p.y - t.heading.y * back * TILE });
    }
    pts.push(p);
    t.trail = pts;
    t.trailArc = cumulativePx(pts);
  }

  /** The point of the trail at distance `s` along it (px); before its start, straight on back the way its first stretch runs. */
  private trailAt(t: Track, s: number): { x: number; y: number } {
    const tr = t.trail, arc = t.trailArc, n = tr.length;
    if (n === 1) return { x: tr[0].x - t.heading.x * (arc[0] - s), y: tr[0].y - t.heading.y * (arc[0] - s) };
    if (s <= arc[0]) {
      const l = Math.max(1e-6, arc[1] - arc[0]), ux = (tr[1].x - tr[0].x) / l, uy = (tr[1].y - tr[0].y) / l;
      return { x: tr[0].x - ux * (arc[0] - s), y: tr[0].y - uy * (arc[0] - s) };
    }
    if (s >= arc[n - 1]) return tr[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m; }
    const k = (s - arc[lo]) / Math.max(1e-6, arc[hi] - arc[lo]);
    return { x: tr[lo].x + (tr[hi].x - tr[lo].x) * k, y: tr[lo].y + (tr[hi].y - tr[lo].y) * k };
  }

  /** Which way the trail runs at `s`, averaged over a stretch of it (a sharp corner of the road is turned over a short curve). */
  private trailDir(t: Track, s: number): Vec {
    const end = t.trailArc[t.trailArc.length - 1];
    const a = this.trailAt(t, Math.min(end, s + TURN_PX)), b = this.trailAt(t, Math.min(end, s) - TURN_PX);
    return normalise({ x: a.x - b.x, y: a.y - b.y }) ?? t.heading;
  }

  /** Every soldier at its fixed place: its distance behind the leader along the trail, its lane to the side (closed up on a narrow path, stepped in from obstacles). */
  private place(t: Track, dt: number): void {
    const lead = toWorld(t.shown), h = t.heading;
    const end = t.trailArc[t.trailArc.length - 1];
    const ease = (tau: number) => 1 - Math.exp(-Math.max(dt, 0.001) / tau);
    // the lanes of each row: as wide as the road lets them be where the row is (every few frames), eased
    const rows = (t.slots[t.slots.length - 1]?.row ?? 0) + 1;
    for (let r = 0; r < rows; r++) {
      if (t.rowScale[r] === undefined) t.rowScale[r] = 1;
      const members = t.slots.filter((sl) => sl.row === r);
      if (members.length < 2) continue;
      const span = Math.max(...members.map((sl) => sl.side)) - Math.min(...members.map((sl) => sl.side)) + LANE_PX;
      const want = Math.min(1, Math.max(LANE_MIN, (this.laneAt(this.trailAt(t, end - members[0].back)) * LANE_SPILL) / span));
      t.rowScale[r] += (want - t.rowScale[r]) * ease(LANE_EASE);
    }
    const speedPx = Math.hypot(t.velocity.x, t.velocity.y) * this.gameSpeed * TILE;
    t.sprites.forEach((sprite, i) => {
      const sl = t.slots[i];
      if (!sl) return;
      const s = end - sl.back;
      const c = this.trailAt(t, s), d = this.trailDir(t, s), n = { x: -d.y, y: d.x };
      const side = sl.side * (t.rowScale[sl.row] ?? 1);
      // stepped in from a wall, a tree or a building: the furthest out it may stand here and a little further along its way
      let sq = 1;
      if (side !== 0) {
        const fit = (cc: { x: number; y: number }, nn: Vec) => {
          for (const f of [1, 0.75, 0.5, 0.25]) if (!this.blocked({ x: cc.x + nn.x * side * f, y: cc.y + nn.y * side * f }, cc)) return f;
          return 0;
        };
        sq = fit(c, n);
        if (speedPx > 1) {
          const s2 = Math.min(end, s + speedPx * SQUEEZE_AHEAD), d2 = this.trailDir(t, s2);
          sq = Math.min(sq, fit(this.trailAt(t, s2), { x: -d2.y, y: d2.x }));
        }
      }
      t.squeeze[i] = (t.squeeze[i] ?? 1) + (sq - (t.squeeze[i] ?? 1)) * ease(sq < (t.squeeze[i] ?? 1) ? SQUEEZE_IN : SQUEEZE_OUT);
      const off = side * t.squeeze[i];
      const x = c.x + n.x * off, y = c.y + n.y * off;
      // which way it faces: the way it moves sideways (eased; a soldier going straight up or down keeps the way it faced)
      const fresh = sprite.x === 0 && sprite.y === 0;
      if (!fresh && dt > 0) t.vx[i] += ((x - sprite.x) / dt - t.vx[i]) * ease(0.25);
      if (t.vx[i] < -FACE_PX) t.faceLeft[i] = true;
      else if (t.vx[i] > FACE_PX) t.faceLeft[i] = false;
      else if (fresh) t.faceLeft[i] = h.x < -0.1;
      sprite.setPosition(x, y).setDepth(y).setFlipX(t.faceLeft[i]).setData('side', off).setData('line', c);
    });
    this.label(t, lead, h);
  }

  private label(t: Track, lead: { x: number; y: number }, h: Vec): void {
    // A sign with the number of soldiers over the column (scouts have none); hidden while the fight is replayed.
    const total = t.units.reduce((n, u) => n + u.count, 0);
    if (t.envoy) this.labels.set(`army:${t.key}`, { x: lead.x, y: lead.y - 44, anchor: 'bottom', minZoom: 0.45, cls: 'wl-small', html: '<div class="wl-sign"><i class="ico ico-envoy"></i></div>' });
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

const hexOf = (css: string | undefined): number => (css ? parseInt(css.replace('#', ''), 16) : 0xffffff);

/** One entry per soldier drawn (a part of a big army, see drawnOf), in marching order; types keep their share and none disappears. */
function formation(units: MoverUnit[]): string[] {
  const total = units.reduce((n, u) => n + u.count, 0);
  const sorted = [...units].sort((a, b) => rank(a.unitId) - rank(b.unitId));
  const cap = Math.max(drawnOf(total), sorted.length);
  if (total <= cap) return sorted.flatMap((u) => Array<string>(u.count).fill(u.unitId));
  const share = sorted.map((u) => (u.count / total) * cap);
  const drawn = share.map((x) => Math.max(1, Math.floor(x)));
  const sum = () => drawn.reduce((a, b) => a + b, 0);
  while (sum() > cap) drawn[drawn.indexOf(Math.max(...drawn))]--;
  while (sum() < cap) {
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
  const way = walkRoads(roads, pos, vel, distance);
  return way ? { point: way.point, direction: way.direction } : null;
}

/** The corners of the road from <paramref name="pos"/> on for <paramref name="distance"/> tiles (the position first, the end last); null when no road is there. */
export function roadAhead(roads: Vec[][], pos: Vec, vel: Vec, distance: number): Vec[] | null {
  return walkRoads(roads, pos, vel, distance)?.corners ?? null;
}

function walkRoads(roads: Vec[][], pos: Vec, vel: Vec, distance: number): { point: Vec; direction: Vec; corners: Vec[] } | null {
  const v = normalise(vel);
  if (!v || roads.length === 0) return null;
  // The road segment under the position that points the same way (either way along it). At a crossing several are under it: the one that runs most the
  // way it goes wins over a slightly nearer one that bends off (a wrong guess sends the drawn column down the wrong road until the news corrects it).
  let best: { road: number; seg: number; t: number; dist: number; sign: 1 | -1 } | null = null;
  roads.forEach((pts, ri) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      if (len2 < 1e-9) continue;
      const t = Math.min(1, Math.max(0, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / len2));
      const d = Math.hypot(pos.x - (a.x + dx * t), pos.y - (a.y + dy * t));
      const dot = (dx * v.x + dy * v.y) / Math.sqrt(len2);
      const score = d + (1 - Math.abs(dot)) * 1.5;
      if (d > 0.7 || Math.abs(dot) < 0.5 || (best && score >= best.dist)) continue;
      best = { road: ri, seg: i, t, dist: score, sign: dot > 0 ? 1 : -1 };
    }
  });
  if (!best) return null;
  let { road, seg, t, sign } = best as { road: number; seg: number; t: number; sign: 1 | -1 };
  let remaining = distance;
  let x = roads[road][seg].x + (roads[road][seg + 1].x - roads[road][seg].x) * t, y = roads[road][seg].y + (roads[road][seg + 1].y - roads[road][seg].y) * t;
  let dir = { x: v.x, y: v.y };
  const corners: Vec[] = [{ x, y }];
  for (let guard = 0; guard < 64 && remaining > 1e-6; guard++) {
    const pts = roads[road];
    const from = sign > 0 ? pts[seg] : pts[seg + 1], to = sign > 0 ? pts[seg + 1] : pts[seg];
    const segDir = normalise({ x: to.x - from.x, y: to.y - from.y });
    if (!segDir) break;
    dir = segDir;
    const left = Math.hypot(to.x - x, to.y - y);
    if (remaining <= left) { x += dir.x * remaining; y += dir.y * remaining; remaining = 0; corners.push({ x, y }); break; }
    x = to.x; y = to.y; remaining -= left;
    corners.push({ x, y });
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
  if (corners[corners.length - 1].x !== x || corners[corners.length - 1].y !== y) corners.push({ x, y });
  return { point: { x, y }, direction: dir, corners };
}

function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function cumulativePx(points: { x: number; y: number }[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return out;
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

/** The distance along a road of the point of it nearest to <paramref name="p"/>, and how far p is from the road. */
function projectOnRoute(points: Vec[], cum: number[], p: Vec): { d: number; off: number } {
  let best = { d: 0, off: Infinity };
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const off = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (off < best.off) best = { d: cum[i] + t * (cum[i + 1] - cum[i]), off };
  }
  return best;
}

/** How far a bend is rounded off (tiles each side of the corner). The rounding stays inside the road: at most a tenth of a tile away from the corner. */
export const CORNER_RADIUS = 0.3;

/** `along`, with every corner of the road rounded by a small curve (a quadratic one through the two points <see cref="CORNER_RADIUS"/> before and after it). */
export function alongSmooth(points: Vec[], cum: number[], d: number): { point: Vec; direction: Vec } {
  const plain = along(points, cum, d);
  for (let v = 1; v + 1 < points.length; v++) {
    const into = cum[v] - cum[v - 1], out = cum[v + 1] - cum[v];
    const r = Math.min(CORNER_RADIUS, into / 2, out / 2);
    if (r <= 1e-6 || d < cum[v] - r || d > cum[v] + r) continue;
    const a = points[v - 1], c = points[v], b = points[v + 1];
    const din = normalise({ x: c.x - a.x, y: c.y - a.y }), dout = normalise({ x: b.x - c.x, y: b.y - c.y });
    if (!din || !dout) break;
    const p0 = { x: c.x - din.x * r, y: c.y - din.y * r }, p2 = { x: c.x + dout.x * r, y: c.y + dout.y * r };
    const s = (d - (cum[v] - r)) / (2 * r), u = 1 - s;
    const point = { x: u * u * p0.x + 2 * u * s * c.x + s * s * p2.x, y: u * u * p0.y + 2 * u * s * c.y + s * s * p2.y };
    const tan = normalise({ x: 2 * u * (c.x - p0.x) + 2 * s * (p2.x - c.x), y: 2 * u * (c.y - p0.y) + 2 * s * (p2.y - c.y) });
    return { point, direction: tan ?? plain.direction };
  }
  return plain;
}

function normalise(v: Vec): Vec | null {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? null : { x: v.x / l, y: v.y / l };
}
