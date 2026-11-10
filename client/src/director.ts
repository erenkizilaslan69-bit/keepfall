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

type Box = { x: number; y: number; w: number; h: number };

interface Ev {
  id: string; type: DirectorEventType; score: number;
  /** Wall-clock ms: when it began and when it is over (a march: as long as we follow it). */
  start: number; end: number;
  /** Where to look, now (a moving army is looked up in the latest picture). */
  at: () => { x: number; y: number } | null;
  /** A battle: the box its soldiers take up right now (world px), to frame it. */
  box?: () => Box | null;
  /** The zoom of the shot (whole numbers: the pixel art stays crisp); a battle's is fitted to its soldiers. */
  zoom: number;
  /** Since when a closer zoom would fit (ms): the shot only moves in once that has held a while. */
  closerSince: number;
  log: DirectorLogEntry;
}

const BASE: Record<DirectorEventType, number> = {
  'castle-fall': 120, 'three-way-siege': 105, 'gate-battle': 80, 'phantom-army': 70, 'road-clash': 60, 'army-march': 40,
};
/**
 * The zoom of each kind of shot before a battle's soldiers are on the field to fit it to (screen px per world px; whole numbers only).
 * A march is seen a little wider than a fight.
 */
const ZOOM: Record<DirectorEventType, number> = {
  'castle-fall': 2, 'three-way-siege': 2, 'gate-battle': 2, 'road-clash': 3, 'phantom-army': 2, 'army-march': 2,
};
/** The zoom steps a shot may use, and how much of the screen a battle's soldiers should fill (about 60 %, never over 90 %). */
const ZOOM_MIN = 1, ZOOM_MAX = 3, FILL = 0.6, FILL_MAX = 0.9;
/** Room around the soldiers (world px), so the front lines are not at the edge. */
const PAD = 40;
/** A castle falling: looked at a little above its foot (the blasts and the smoke go up). */
const CASTLE_LIFT = 110;
/** Nothing on: stay on the last interesting place this long, then follow the biggest army on the move (or look at a castle still standing) this long. */
const LINGER = 12_000, IDLE_LEG = 20_000;
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
  /** The last interesting place looked at (and when), and what the camera looks at while nothing is on. */
  private lastSpot: { x: number; y: number; span: number } | null = null;
  private lastSpotAt = 0;
  private idleKey = '';
  private idleFocus: { army?: string; seat?: number; until: number } | null = null;
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
    this.add(type, id, now, ms, () => at, Math.min(40, soldiers), () => this.scene()?.battleBounds(b.id) ?? null);
  }

  private add(type: DirectorEventType, id: string, now: number, ms: number, at: Ev['at'], bonus: number, box?: Ev['box']): void {
    const score = BASE[type] + bonus;
    const log: DirectorLogEntry = { id, type, minute: Math.floor(this.elapsed / 60), score, start: now, end: now + ms, shot: false };
    this.log.push(log);
    this.events.push({ id, type, score, start: now, end: now + ms, at, box, zoom: ZOOM[type], closerSince: 0, log });
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
    if (!this.pos) this.pos = { x: cam.midPoint.x, y: cam.midPoint.y, span: cam.width / cam.zoom };
    const ev = this.current;
    let target: { x: number; y: number; span: number } | null = ev ? this.eventTarget(ev, cam, now) : null;
    if (target) { this.lastSpot = target; this.lastSpotAt = now; this.idleKey = ''; }
    else {
      const t = this.idleTarget(now, cam);
      // a new idle subject: a slow glide over (not the quick move of a cut)
      if (t.key !== this.idleKey) {
        if (this.idleKey || !this.move) this.move = { ...this.pos, t0: performance.now(), ms: Math.min(7000, Math.max(3500, 2500 + Math.hypot(t.x - this.pos.x, t.y - this.pos.y) / 0.9)) };
        this.idleKey = t.key;
      }
      target = t;
    }
    if (this.move) {
      const t = Math.min(1, (performance.now() - this.move.t0) / this.move.ms), k = ease(t);
      this.pos = {
        x: this.move.x + (target.x - this.move.x) * k, y: this.move.y + (target.y - this.move.y) * k,
        span: Math.exp(Math.log(this.move.span) + (Math.log(target.span) - Math.log(this.move.span)) * k),
      };
      if (t >= 1) this.move = null;
    } else {
      // following: a soft lag, the same at any frame rate; a zoom step is eased the same way and then settles on the whole number exactly
      const a = 1 - Math.exp(-(ev ? 2.2 : 0.6) / 60), za = 1 - Math.exp(-1.6 / 60);
      this.pos = {
        x: this.pos.x + (target.x - this.pos.x) * a, y: this.pos.y + (target.y - this.pos.y) * a,
        span: Math.exp(Math.log(this.pos.span) + (Math.log(target.span) - Math.log(this.pos.span)) * za),
      };
      if (Math.abs(this.pos.span / target.span - 1) < 0.004) this.pos.span = target.span;
    }
    const size = this.layout()!.size * TILE;
    const minZoom = Math.max(cam.width / size, cam.height / size);
    cam.setZoom(Math.min(ZOOM_MAX, Math.max(minZoom, cam.width / this.pos.span)));
    cam.centerOn(this.pos.x, this.pos.y);
  }

  /** What an event's shot looks at now, and how close (null: it has nothing to show any more). */
  private eventTarget(ev: Ev, cam: Phaser.Cameras.Scene2D.Camera, now: number): { x: number; y: number; span: number } | null {
    const p = ev.at();
    if (!p) return null;
    let { x, y } = p;
    const box = ev.box?.();
    if (box) {
      // frame the soldiers: their box fills about 60 % of the screen at the nearest whole-number zoom that still leaves room around it
      x = box.x + box.w / 2; y = box.y + box.h / 2;
      const w = box.w + PAD * 2, h = box.h + PAD * 2;
      let z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(Math.min((FILL * cam.width) / w, (FILL * cam.height) / h))));
      while (z > ZOOM_MIN && (w * z > FILL_MAX * cam.width || h * z > FILL_MAX * cam.height)) z--;
      // out at once when the fight no longer fits; in only once a closer shot has fitted for two seconds (a step back and forth looks restless)
      if (z < ev.zoom) { ev.zoom = z; ev.closerSince = 0; }
      else if (z > ev.zoom) { if (!ev.closerSince) ev.closerSince = now; else if (now - ev.closerSince > 2000) { ev.zoom = z; ev.closerSince = 0; } }
      else ev.closerSince = 0;
    }
    if (ev.type === 'castle-fall') y -= CASTLE_LIFT;
    return { x, y, span: cam.width / ev.zoom };
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

  /**
   * Nothing on: first stay on the last interesting place (drifting a little), then follow the biggest army on the move, and with none, look at the
   * castles still standing one after another. Never the empty land between them.
   */
  private idleTarget(now: number, cam: Phaser.Cameras.Scene2D.Camera): { x: number; y: number; span: number; key: string } {
    const drift = (p: { x: number; y: number }) => ({ x: p.x + Math.sin(now / 5200) * 26, y: p.y + Math.cos(now / 6900) * 16 });
    const soldiers = (m: SeenMoverView) => m.units.reduce((n, u) => n + u.count, 0);
    if (this.lastSpot && now - this.lastSpotAt < LINGER) return { ...drift(this.lastSpot), span: this.lastSpot.span, key: 'spot' };
    // the subject in hand, while it lasts
    const f = this.idleFocus;
    if (f && now < f.until) {
      const m = f.army ? this.movers.get(f.army) : undefined;
      if (m) return { ...this.moverAt(m), span: cam.width / 2, key: `army:${m.id}` };
      const c = f.seat !== undefined && !this.fallen.has(f.seat) ? this.castleOf(f.seat) : null;
      if (c) return { ...drift(c), span: cam.width, key: `castle:${f.seat}` };
    }
    // a new one: the biggest army on the move (not the one just followed), else the next castle still standing
    const armies = [...this.movers.values()]
      .filter((m) => m.kind === 'army' && m.id !== f?.army && Math.hypot(m.velocity.x, m.velocity.y) > 0.01)
      .sort((a, b) => soldiers(b) - soldiers(a));
    if (armies.length) {
      this.idleFocus = { army: armies[0].id, until: now + IDLE_LEG };
      return { ...this.moverAt(armies[0]), span: cam.width / 2, key: `army:${armies[0].id}` };
    }
    const seats = (this.layout()?.regions ?? []).map((r) => r.seat).filter((s): s is number => s !== null && !this.fallen.has(s));
    if (seats.length) {
      const next = seats[(seats.indexOf(f?.seat ?? -1) + 1) % seats.length];
      this.idleFocus = { seat: next, until: now + IDLE_LEG };
      return { ...drift(this.castleOf(next)!), span: cam.width, key: `castle:${next}` };
    }
    const layout = this.layout()!;
    return { ...toWorld({ x: layout.size / 2, y: layout.size / 2 }), span: cam.width, key: 'mid' };
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
