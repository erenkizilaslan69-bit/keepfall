// The director (cameraman) page: `?director=<key>` on a local / LAN build. A hidden watcher of a real match for trailer and store footage: it is not a
// player, sees the whole map live (the server sends it the fallen players' picture with nothing held back), and moves the camera by itself:
// the interesting events are scored (a battle at a gate, a castle falling, a three-sided siege, a big army setting out, a phantom army, a clash on a road)
// and the camera eases over to the best one, follows it until it is over, and drifts slowly over the map when nothing is on. The interface and the
// mouse pointer are hidden. tools/director.mjs records the screen and cuts every event into its own clip from the log kept here
// (window.keepfallDirector). The server refuses all of this unless it was started with Keepfall__DirectorKey, and never on Render or in Steam.
import type { BattleStartedView, MapLayoutView, SeenMoverView, SpectatorStateView, Vec } from './types';
import type { WorldScene } from './scene/WorldScene';
import { toWorld } from './scene/world';
import { CASTLE, TILE } from './scene/layout';
import { MAP_SCALE } from './scene/mapscale';

export type DirectorEventType = 'castle-fall' | 'three-way-siege' | 'gate-battle' | 'road-clash' | 'phantom-army' | 'army-march';

/** One event as the recorder sees it: wall-clock times (Date.now()) and the match minute it began in. */
export interface DirectorLogEntry {
  id: string; type: DirectorEventType; minute: number; score: number; start: number; end: number; shot: boolean;
  /** When the camera was on it (wall clock ms): from the start of the move over until it cut away (or the event ended). */
  shotAt?: number; shotEnd?: number;
}

interface Ev {
  id: string; type: DirectorEventType; score: number;
  /** Wall-clock ms: when it began and when it is over (a march: as long as we follow it). */
  start: number; end: number;
  /** Where to look, now (a moving army is looked up in the latest picture). */
  at: () => { x: number; y: number } | null;
  /** How much of the map to show: world pixels across the screen. */
  span: number;
  log: DirectorLogEntry;
}

const BASE: Record<DirectorEventType, number> = {
  'castle-fall': 120, 'three-way-siege': 105, 'gate-battle': 80, 'phantom-army': 70, 'road-clash': 60, 'army-march': 40,
};
/** World pixels across the screen for each kind of shot (the map's art scale multiplies them). */
const SPAN: Record<DirectorEventType | 'idle', number> = {
  'castle-fall': 1250, 'three-way-siege': 1300, 'gate-battle': 1150, 'road-clash': 1000, 'phantom-army': 1500, 'army-march': 1500, idle: 2600,
};
/** An army this big setting out is worth a look (soldiers). */
const BIG_ARMY = 8;
/** The smallest battles worth a shot (soldiers on all sides): on a road, at a gate (a gate attack on an empty castle still is one: the castle falls). */
const MIN_CLASH = 6, MIN_GATE = 3;
/** A shot is held at least this long before something better may take over (ms), and that something must score this much more. */
const MIN_SHOT = 5000, OVERTAKE = 25;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic

export class DirectorCamera {
  private readonly events: Ev[] = [];
  readonly log: DirectorLogEntry[] = [];
  private current: Ev | null = null;
  private shotSince = 0;
  /** The camera move under way: from where, to which event, how long. */
  private move: { x: number; y: number; span: number; t0: number; ms: number } | null = null;
  private pos: { x: number; y: number; span: number } | null = null;
  private movers = new Map<string, SeenMoverView>();
  private moversAt = 0;
  private elapsed = 0;
  private seenMovers = new Set<string>();
  private fallen = new Set<number>();
  private battles = new Set<string>();
  private idle = { from: 0, to: 1, t0: 0 };
  private raf = 0;
  /** Frames drawn (the recorder reads it twice to tell the page's frame rate). */
  frames = 0;
  matchStart = 0;
  matchEnd = 0;

  constructor(private readonly scene: () => WorldScene | null, private readonly layout: () => MapLayoutView | null) {
    const tick = () => { this.raf = requestAnimationFrame(tick); this.frames++; try { this.frame(); } catch { /* the camera must never stop the page */ } };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  // ---- what happens ----------------------------------------------------------------------------

  /** Every picture from the server (about once a second). */
  onPicture(f: SpectatorStateView): void {
    const now = Date.now();
    if (!this.matchStart) this.matchStart = now;
    this.elapsed = f.elapsedSeconds;
    this.movers = new Map(f.movers.map((m) => [m.id, m]));
    this.moversAt = performance.now();
    for (const b of f.started) this.onBattle(b, now);
    for (const c of f.castles) {
      if (!c.eliminated || this.fallen.has(c.seat)) continue;
      this.fallen.add(c.seat);
      if (this.fallen.size === 1 && f.elapsedSeconds < 5) continue; // (a castle already down when we joined)
      const at = this.castleOf(c.seat);
      if (at) this.add('castle-fall', `fall-${c.seat}`, now, 9000, () => at, 0);
    }
    for (const m of f.movers) {
      if (m.kind !== 'army' || this.seenMovers.has(m.id)) continue;
      this.seenMovers.add(m.id);
      const soldiers = m.units.reduce((n, u) => n + u.count, 0);
      const follow = () => { const x = this.movers.get(m.id); return x ? this.moverAt(x) : null; };
      if (m.fake) this.add('phantom-army', `phantom-${m.id}`, now, 11000, follow, Math.min(20, soldiers));
      else if (soldiers >= BIG_ARMY) this.add('army-march', `march-${m.id}`, now, 10000, follow, Math.min(30, soldiers));
    }
    // a march that has reached its goal (or turned into a battle) is over
    for (const e of this.events) if ((e.type === 'army-march' || e.type === 'phantom-army') && !this.movers.has(e.id.slice(e.id.indexOf('-') + 1))) e.end = Math.min(e.end, now + 600);
  }

  private onBattle(b: BattleStartedView, now: number): void {
    const three = b.sides.length >= 3;
    if (this.battles.has(b.id) && !(three && !this.battles.has(b.id + '#3'))) return;
    this.battles.add(b.id);
    if (three) this.battles.add(b.id + '#3');
    const soldiers = b.sides.reduce((n, s) => n + s.soldiers.length, 0);
    const type: DirectorEventType | null = three ? 'three-way-siege' : b.kind === 'siege' ? 'gate-battle' : b.kind === 'field' ? 'road-clash' : null;
    if (!type) return; // (a forest camp being cleared: not a trailer moment)
    if (soldiers < (type === 'road-clash' ? MIN_CLASH : MIN_GATE)) return; // (two scouts' worth of soldiers on a road is an empty crossroads on screen)
    const speed = this.scene()?.speedNow ?? 1;
    const ms = Math.min(30_000, Math.max(5000, (b.fightSeconds / Math.max(1, speed)) * 1000 + 2500));
    const at = toWorld(b.at);
    const id = three ? `${b.id}-3` : b.id;
    // a battle that grows into a three-sided one: the two-sided event ends where the bigger one begins
    if (three) for (const e of this.events) if (e.id === b.id) e.end = now;
    this.add(type, id, now, ms, () => at, Math.min(40, soldiers));
  }

  private add(type: DirectorEventType, id: string, now: number, ms: number, at: Ev['at'], bonus: number): void {
    const score = BASE[type] + bonus;
    const log: DirectorLogEntry = { id, type, minute: Math.floor(this.elapsed / 60), score, start: now, end: now + ms, shot: false };
    this.log.push(log);
    this.events.push({ id, type, score, start: now, end: now + ms, at, span: SPAN[type], log });
  }

  // ---- the camera ------------------------------------------------------------------------------

  private frame(): void {
    const scene = this.scene();
    const cam = scene?.cameras?.main;
    if (!scene || !cam || !this.layout()) return;
    const now = Date.now();
    for (const e of this.events) e.log.end = e.end;
    // drop what is over; pick the best of the rest
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i].end < now) this.events.splice(i, 1);
    const cur = this.current && this.events.includes(this.current) ? this.current : null;
    let best: Ev | null = null;
    for (const e of this.events) {
      const s = e.score - (now - e.start) / 1000; // newer is better
      if (!best || s > best.score - (now - best.start) / 1000) best = e;
    }
    const held = now - this.shotSince;
    if (best && best !== cur && (!cur || (held > MIN_SHOT && best.score > cur.score + OVERTAKE) || cur.end < now + 300)) this.cut(best, cam);
    else if (!best && cur) this.leave();
    if (this.current && !this.events.includes(this.current)) this.leave();

    // where to look
    let target: { x: number; y: number; span: number };
    const ev = this.current;
    const p = ev?.at();
    if (ev && p) target = { ...p, span: ev.span * MAP_SCALE };
    else target = this.idleTarget(now);
    if (!this.pos) this.pos = { x: cam.midPoint.x, y: cam.midPoint.y, span: cam.width / cam.zoom };
    if (this.move) {
      const t = Math.min(1, (performance.now() - this.move.t0) / this.move.ms), k = ease(t);
      this.pos = {
        x: this.move.x + (target.x - this.move.x) * k, y: this.move.y + (target.y - this.move.y) * k,
        span: Math.exp(Math.log(this.move.span) + (Math.log(target.span) - Math.log(this.move.span)) * k),
      };
      if (t >= 1) this.move = null;
    } else {
      // following: a soft lag, the same at any frame rate
      const a = 1 - Math.exp(-(ev ? 2.2 : 0.8) / 60);
      this.pos = { x: this.pos.x + (target.x - this.pos.x) * a, y: this.pos.y + (target.y - this.pos.y) * a, span: Math.exp(Math.log(this.pos.span) + (Math.log(target.span) - Math.log(this.pos.span)) * a) };
    }
    const size = this.layout()!.size * TILE;
    const minZoom = Math.max(cam.width / size, cam.height / size);
    cam.setZoom(Math.min(1.5, Math.max(minZoom, cam.width / this.pos.span)));
    cam.centerOn(this.pos.x, this.pos.y);
  }

  private leave(): void {
    if (this.current && !this.current.log.shotEnd) this.current.log.shotEnd = Date.now();
    this.current = null;
  }

  /** A new shot: an eased move over, longer the further it goes. */
  private cut(ev: Ev, cam: Phaser.Cameras.Scene2D.Camera): void {
    const to = ev.at();
    if (!to) return;
    if (this.current && this.current !== ev && !this.current.log.shotEnd) this.current.log.shotEnd = Date.now();
    this.current = ev;
    this.shotSince = Date.now();
    ev.log.shot = true;
    ev.log.shotAt = Date.now();
    const from = this.pos ?? { x: cam.midPoint.x, y: cam.midPoint.y, span: cam.width / cam.zoom };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    this.move = { ...from, t0: performance.now(), ms: Math.min(2600, Math.max(1100, 700 + dist / (3.2 * MAP_SCALE))) };
  }

  /** Nothing on: a slow drift from castle to castle (and over the forest in the middle). */
  private idleTarget(now: number): { x: number; y: number; span: number } {
    const points = this.idlePoints();
    const leg = 22_000;
    if (!this.idle.t0) this.idle = { from: 0, to: 1, t0: now };
    let t = (now - this.idle.t0) / leg;
    if (t >= 1) { this.idle = { from: this.idle.to, to: (this.idle.to + 1) % points.length, t0: now }; t = 0; }
    const a = points[this.idle.from % points.length], b = points[this.idle.to % points.length];
    const k = ease(t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, span: SPAN.idle * MAP_SCALE };
  }

  private idlePoints(): { x: number; y: number }[] {
    const layout = this.layout()!;
    const castles = layout.regions.filter((r) => r.seat !== null).map((r) => this.castleOf(r.seat!)).filter((p): p is { x: number; y: number } => !!p);
    const mid = toWorld({ x: layout.size / 2, y: layout.size / 2 });
    const out: { x: number; y: number }[] = [];
    for (const c of castles) { out.push(c); out.push({ x: (c.x + mid.x) / 2, y: (c.y + mid.y) / 2 }); }
    return out.length ? out : [mid];
  }

  private castleOf(seat: number): { x: number; y: number } | null {
    const r = this.layout()?.regions.find((x) => x.seat === seat);
    return r ? toWorld({ x: r.origin.x + CASTLE.x / TILE, y: r.origin.y + CASTLE.y / TILE }) : null;
  }

  /** Where a mover is now: its last position carried on by its velocity (tiles per game second) since that picture. */
  private moverAt(m: SeenMoverView): { x: number; y: number } {
    const dt = Math.min(2, (performance.now() - this.moversAt) / 1000) * (this.scene()?.speedNow ?? 1);
    const v: Vec = { x: m.position.x + m.velocity.x * dt, y: m.position.y + m.velocity.y * dt };
    return toWorld(v);
  }
}
