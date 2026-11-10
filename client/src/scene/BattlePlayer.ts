import Phaser from 'phaser';
import { trace } from '../debug-trace';
import { sfx } from '../audio';
import { reportError } from '../error-report';
import type { Effects } from './Effects';
import { reducedEffects } from '../prefs';
import type { BattleStartedView, PlayerColor, Vec } from '../types';
import { UNIT_SCALE, colorKey, playRandom, unitOriginY, unitScale } from './assets';
import { hearing } from './hearing';
import type { Point } from './layout';
import { toWorld } from './world';

// Replays a battle we fight in, exactly as the server simulated it: the two sides line up facing
// each other, the melee closes in during the approach, every hit in the record is an attack (archers
// loose an arrow), every soldier falls at the moment the record says, reserves step forward when it
// says. At a castle the defenders come down from the courtyard first and, if the attackers win, the
// survivors hammer the gate for the siege seconds. Time follows the server's clock (and game speed),
// so a battle joined late, after a reconnect, starts where it is.

/** The simulator's approach time (combat.approachTime): melee needs this long to reach the enemy. */
const APPROACH_SECONDS = 2.5;
const MAX_DRAWN = 40; // per side
const PER_LINE = 8;
const SIDE_GAP = 2.6; // tiles: two besiegers at one gate stand this far to either side of the middle
const COL = 0.75, LINE = 0.55; // tiles between soldiers across and along
const ACTIVE_MELEE_ROWS = 2, SECOND_GAP = 0.8; // mirrors config combat.meleeActiveRows; tiles between the first and second melee row
/** The hand-over from the marching column: a fighter that came out of a column slides to its place in the line over this many simulation seconds. */
const HANDOFF_SECONDS = 0.7;
/** The run in starts this many simulation seconds after the battle begins, and the line stands ready this long before the first blow. */
const RUN_DELAY = 0.3, READY_SECONDS = 0.6;
const FRONT_START = 1.3, FRONT_MEET = 0.6, BACK = 2.4, ROW_STEP = 0.9; // tiles from the centre
const ROW_ORDER = ['first', 'second', 'third', 'fourth'];

const LOOK: Record<string, { run: string; attack: string | null; scale: number }> = {
  kalkanli: { run: 'warrior-guard', attack: null, scale: UNIT_SCALE },
  kilicli: { run: 'swordsman-run', attack: 'swordsman-attack', scale: unitScale('kilicli') },
  mizrakci: { run: 'lancer-run', attack: 'lancer-attack', scale: UNIT_SCALE },
  okcu: { run: 'archer-run', attack: 'archer-shoot', scale: UNIT_SCALE },
  kesis: { run: 'monk-run', attack: null, scale: UNIT_SCALE },
  mancinik: { run: 'mancinik-run', attack: 'mancinik-fire', scale: unitScale('mancinik') },
  suvari: { run: 'suvari-run', attack: 'suvari-attack', scale: unitScale('suvari') },
};
/** They stand back and do not close in: shooters, the catapult and the monk. */
const STAYS_BACK = new Set(['okcu', 'mancinik', 'kesis']);

interface Fighter {
  sprite: Phaser.GameObjects.Sprite;
  side: number;
  unit: string;
  ranged: boolean;
  front: Point; // where it stands in the front row
  start: Point; // where it starts (front row melee walk from here to `front`)
  back: Point; // reserve spot
  inFront: boolean;
  dead: boolean;
  /** Squashing from a blow right now. */
  hurt?: boolean;
  /** Where it stood in the marching column that walked into this battle (it slides from there to its place in the line). */
  from?: Point;
  /** It has stopped running and stands in its idle pose. */
  settled?: boolean;
}

interface Replay {
  view: BattleStartedView;
  fighters: (Fighter | null)[];
  hit: number;
  death: number;
  advance: number;
  heal: number;
  gate: Point;
  ended: boolean;
}

export class BattlePlayer {
  private replays = new Map<string, Replay>();
  /** Development: how late each replay began, in game seconds after the server started the battle. */
  readonly lags: { id: string; kind: string; lagGame: number; lagReal: number; fight: number }[] = [];
  /** Development: every replay that was dropped after an error, and every one that ended: when (performance.now) it ended. */
  readonly endedAt = new Map<string, number>();

  /** Development: what the debug layer reads. */
  debugReplays(): { id: string; kind: string; ended: boolean; at: { x: number; y: number }; startedAt: number; fight: number; alive: number }[] {
    return [...this.replays.entries()].map(([id, r]) => ({ id, kind: r.view.kind, ended: r.ended, at: r.view.at, startedAt: r.view.startedAt, fight: r.view.fightSeconds,
      alive: r.fighters.filter((f) => f && f.sprite.active).length }));
  }
  debugSprites(): Phaser.GameObjects.Sprite[] {
    return [...this.replays.values()].flatMap((r) => r.fighters.filter((f): f is Fighter => !!f).map((f) => f.sprite));
  }
  /** The box (world px) the living soldiers of a replay take up right now, counting only those within `reach` px of where it is fought; null when it is not being replayed (the director frames it). */
  bounds(id: string, reach: number): { x: number; y: number; w: number; h: number } | null {
    const r = this.replays.get(id);
    if (!r || r.ended) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of r.fighters) {
      if (!f || !f.sprite.active || !f.sprite.visible) continue;
      if (Math.hypot(f.sprite.x - r.gate.x, f.sprite.y - r.gate.y) > reach) continue; // (defenders still coming down from the yard: not the fight yet)
      // (the frames are mostly empty around the figure: the figure is about a fifth of the frame either side of its middle)
      // the origin is at the feet: the figure stands above them
      const s = f.sprite, hw = s.displayWidth * 0.22;
      x0 = Math.min(x0, s.x - hw); y0 = Math.min(y0, s.y - s.displayHeight * 0.35); x1 = Math.max(x1, s.x + hw); y1 = Math.max(y1, s.y + s.displayHeight * 0.05);
    }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  /** Every battle that has been replayed here, for good: its "Savaş" cloud must not come back after the replay ends. */
  private played = new Set<string>();
  hasPlayed(id: string): boolean { return this.played.has(id); }
  /** A siege replay tells the scene how far the fight is (the scene smokes and burns the castle under attack): seat of the castle, 0..1, whether the attacker wins, over. */
  /** A replay began (the clip recorder listens). */
  onSiege: ((seat: number, progress: number, attackerWins: boolean, done: boolean) => void) | null = null;
  /** Set by the scene: where the soldiers of the column of this colour at this place (tiles) stand, so that they are not drawn anew somewhere else. */
  claimColumn: ((color: PlayerColor, at: Vec) => { kind: string; x: number; y: number }[] | null) | null = null;

  /**
   * <paramref name="clock"/>: the server's game time right now (seconds) and the game speed.
   * <paramref name="courtyardOf"/>: where a player's soldiers stand at home, for defenders coming down.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ownColor: PlayerColor,
    private readonly clock: () => { now: number; speed: number },
    private readonly courtyardOf: (seat: number) => Point | null,
    private readonly fx: Effects,
  ) {}

  /** Battles being replayed right now, for the minimap and for hiding the armies in them. */
  get active(): BattleStartedView[] {
    return [...this.replays.values()].filter((r) => !r.ended).map((r) => r.view);
  }

  start(view: BattleStartedView): void {
    if (view.update && this.replays.has(view.id)) { this.applyUpdate(view); return; }
    if (this.replays.has(view.id) || this.played.has(view.id)) { trace('battle-replay-duplicate', view.id, 'the server announced it again'); return; } // (each battle is replayed once: a repeat of the news must not play it again)
    this.played.add(view.id);
    {
      const { now, speed } = this.clock();
      this.lags.push({ id: view.id, kind: view.kind, lagGame: now - view.startedAt, lagReal: (now - view.startedAt) / Math.max(1, speed), fight: view.fightSeconds });
      trace('battle-replay-start', view.id, `${view.kind} lag ${(now - view.startedAt).toFixed(1)} game s, fight ${view.fightSeconds.toFixed(1)} s, sides ${view.sides.map((s) => s.soldiers.length).join('v')}`);
      for (const s of view.sides) if (s.seat) trace('battle-involves', `seat:${s.seat}`, view.id);
    }
    const fighters: (Fighter | null)[] = [];
    try {
      view.sides.forEach((side, s) => this.buildSide(view, side, s, fighters));
    } catch (e) {
      // A replay that cannot be built leaves nothing behind (the soldiers made so far are deleted) and the battle shows as a cloud.
      for (const f of fighters) if (f?.sprite.active) { this.scene.tweens.killTweensOf(f.sprite); f.sprite.destroy(); }
      this.played.delete(view.id);
      trace('battle-replay-failed', view.id, String(e));
      reportError('battle-replay', e, { source: `building battle ${view.id}` });
      return;
    }
    sfx.play('battleStart');
    const replay: Replay = { view, fighters, hit: 0, death: 0, advance: 0, heal: 0, gate: toWorld(view.at), ended: false };
    this.replays.set(view.id, replay);
    this.catchUp(replay);
  }

  /** A battle joined late (a reconnect, or one already going on): what happened before now is not played again, the fallen are simply not there. */
  private catchUp(r: Replay): void {
    const v = r.view, { now } = this.clock();
    const tick = ((now - v.startedAt) * v.playback) / v.tickSeconds;
    if (tick * v.tickSeconds < 1.5) return; // (just begun: play it all)
    r.hit = skipTo(v.hits, 3, tick);
    r.heal = skipTo(v.heals ?? [], 3, tick);
    for (r.advance = 0; r.advance < v.advances.length && v.advances[r.advance] <= tick; r.advance += 2) {
      const f = r.fighters[v.advances[r.advance + 1]];
      if (f) { f.inFront = true; f.start = f.front; }
    }
    for (r.death = 0; r.death < v.deaths.length && v.deaths[r.death] <= tick; r.death += 2) {
      const f = r.fighters[v.deaths[r.death + 1]];
      if (!f) continue;
      f.dead = true;
      if (f.sprite.active) { this.scene.tweens.killTweensOf(f.sprite); f.sprite.destroy(); }
    }
  }

  /** Where a battle's line-up is centred, and which way it faces: at a castle the fight is in front of the gate, on the road the attackers came along. */
  private frame(view: BattleStartedView): { f: Vec; p: Vec; centre: Vec } {
    const f = normalise(view.facing);
    return { f, p: { x: -f.y, y: f.x }, centre: view.kind === 'siege' ? { x: view.at.x - f.x * 1.6, y: view.at.y - f.y * 1.6 } : view.at };
  }

  /** Sideways (tiles) where a side stands: at a gate with two besiegers they stand next to each other, the castle in the middle. */
  private lateral(view: BattleStartedView, s: number): number {
    return view.kind === 'siege' && view.sides.length >= 3 && s !== 1 ? (s === 0 ? -SIDE_GAP : SIDE_GAP) : 0;
  }

  /** Draws one side's soldiers into `fighters` (at their record indices). */
  private buildSide(view: BattleStartedView, side: BattleStartedView['sides'][number], s: number, fighters: (Fighter | null)[]): void {
    const { f, p, centre } = this.frame(view);
    const lateral = this.lateral(view, s);
    const sign = s === 1 ? 1 : -1; // the castle stands in front of the centre, every attacker behind it
    // The side's rows, front to back (one unit type each): the first stands up front, the others behind it, one step further each.
    const rowKeys = [...new Set(side.soldiers.map((x) => x.row))].sort((p, q) => ROW_ORDER.indexOf(p) - ROW_ORDER.indexOf(q));
    const groups = rowKeys.map((key, r) => ({ r, list: side.soldiers.map((x, i) => ({ ...x, i })).filter((x) => x.row === key) }));
    const place = (k: number, n: number, depth: number): Point => {
      const line = Math.floor(k / PER_LINE), inLine = Math.min(PER_LINE, n - line * PER_LINE);
      const across = ((k % PER_LINE) - (inLine - 1) / 2) * COL + lateral;
      const along = sign * (depth + line * LINE);
      return toWorld({ x: centre.x + f.x * along + p.x * across, y: centre.y + f.y * along + p.y * across });
    };
    const courtyard = view.kind === 'siege' && s === 1 ? this.courtyardOf(side.seat) : null;
    // The column that walked into the battle: its soldiers become the fighters (a soldier of the same kind first), so the armies do not vanish and reappear.
    const column = courtyard ? null : [...(this.claimColumn?.(side.color, view.at) ?? [])];
    const take = (unit: string): Point | undefined => {
      if (!column || column.length === 0) return undefined;
      const i = column.findIndex((c) => c.kind === unit);
      const c = column.splice(i >= 0 ? i : 0, 1)[0];
      return { x: c.x, y: c.y };
    };
    let drawn = 0;
    for (const { r, list } of groups) {
      const isFront = r === 0, behind = BACK + Math.max(0, r - 1) * ROW_STEP;
      list.forEach((x, k) => {
        if (drawn >= MAX_DRAWN) { fighters[offset(view, s) + x.i] = null; return; }
        drawn++;
        const look = LOOK[x.unitId] ?? LOOK.kilicli;
        const ranged = STAYS_BACK.has(x.unitId);
        // Melee soldiers of the first ACTIVE_MELEE_ROWS rows fight (combat.meleeActiveRows): the second row closes in right behind the first.
        const second = !isFront && !ranged && r < ACTIVE_MELEE_ROWS;
        const front = place(k, list.length, second ? FRONT_MEET + SECOND_GAP : ranged || !isFront ? FRONT_START : FRONT_MEET);
        const start = place(k, list.length, isFront ? FRONT_START : behind);
        const back = place(k, list.length, isFront ? BACK : behind);
        const from = take(x.unitId);
        const at = courtyard ?? from ?? (isFront ? start : back);
        let key = colorKey(side.color, this.ownColor, look.run);
        if (!this.scene.textures.exists(key)) key = colorKey(side.color, this.ownColor, LOOK.kilicli.run); // (never the black square)
        const sprite = this.scene.add.sprite(at.x, at.y, key).setScale(look.scale).setOrigin(0.5, unitOriginY(look.run));
        sprite.setFlipX(sign > 0 ? f.x > 0 : f.x < 0).setDepth(at.y).setData('replay', view.id);
        playRandom(sprite, key);
        fighters[offset(view, s) + x.i] = { sprite, side: s, unit: x.unitId, ranged, front, start, back, inFront: isFront || second, dead: false, from };
        if (courtyard) this.walk(sprite, isFront ? start : back, 1.6); // down from the courtyard to the gate
      });
    }
  }

  /**
   * Somebody joined a battle already being replayed (or one of its sides chose a new foe): the server sends the whole battle again, the same
   * up to `fromTick`. The newcomer's soldiers are drawn (its marching column becomes them), the first attacker makes room at the gate,
   * and the replay goes on from where it is on the new story.
   */
  private applyUpdate(view: BattleStartedView): void {
    const r = this.replays.get(view.id);
    if (!r || r.ended) return;
    const old = r.view;
    try {
      if (old.sides.length < 3 && view.sides.length >= 3) this.makeRoom(r, view, 0);
      for (let s = old.sides.length; s < view.sides.length; s++) this.buildSide(view, view.sides[s], s, r.fighters);
      trace('battle-replay-update', view.id, `from tick ${view.fromTick ?? 0}, sides ${view.sides.map((x) => x.soldiers.length).join('v')}`);
    } catch (e) {
      reportError('battle-replay', e, { source: `updating battle ${view.id}` });
      return;
    }
    r.view = view;
    // Go on on the new story: what already happened stays shown, what the new story says has happened since falls now.
    const { now } = this.clock();
    const tick = ((now - view.startedAt) * view.playback) / view.tickSeconds;
    r.hit = skipTo(view.hits, 3, tick);
    r.heal = skipTo(view.heals ?? [], 3, tick);
    r.advance = skipTo(view.advances, 2, tick);
    const d = view.deaths;
    let i = 0;
    for (; i < d.length && d[i] <= tick; i += 2) this.fall(r.fighters[d[i + 1]], 1);
    r.death = i;
  }

  /** The first attacker steps aside to make room for the second one: its whole line shifts sideways. */
  private makeRoom(r: Replay, view: BattleStartedView, s: number): void {
    const { p } = this.frame(view);
    const o = toWorld({ x: 0, y: 0 }), d = toWorld({ x: p.x * this.lateral(view, s), y: p.y * this.lateral(view, s) });
    const dx = d.x - o.x, dy = d.y - o.y;
    for (const f of r.fighters) {
      if (!f || f.side !== s || f.dead) continue;
      for (const pt of [f.start, f.front, f.back]) { pt.x += dx; pt.y += dy; }
      if (f.from) { f.from.x += dx; f.from.y += dy; }
      if (f.sprite.active && f.settled) this.walk(f.sprite, { x: f.sprite.x + dx, y: f.sprite.y + dy }, 0.8);
    }
  }

  update(): void {
    const { now, speed } = this.clock();
    for (const [id, r] of this.replays) {
      if (r.ended) continue; // its sprites are fading out or gone: nothing left to move
      try {
        this.step(id, r, now, speed);
      } catch (e) {
        // One broken replay must not stop the whole game loop (an error out of a scene's update ends Phaser's frame loop for good: the picture
        // freezes and the canvas takes no more clicks). Report it and clear that fight off the map.
        reportError('battle-replay', e, { source: `battle ${id}` });
        this.drop(id, r);
      }
    }
  }

  private step(id: string, r: Replay, now: number, speed: number): void {
    const v = r.view;
    const t = (now - v.startedAt) * v.playback; // simulation seconds into the battle
    const tick = t / v.tickSeconds;

    // The melee of both front rows closes in during the approach.
    // The melee runs in at a steady pace and is there a little before the first blow is due (the simulator's approach time), then stands ready: it no longer
    // wades in slowly for the whole approach and stops mid-stride.
    const k = Math.min(1, Math.max(0, (t - RUN_DELAY) / (APPROACH_SECONDS - RUN_DELAY - READY_SECONDS))), charge = k;
    const handoff = Math.min(1, Math.max(0, t / HANDOFF_SECONDS)), glide = handoff * handoff * (3 - 2 * handoff);
    for (const f of r.fighters) {
      if (!f || f.dead || !f.sprite.active || this.scene.tweens.isTweening(f.sprite)) continue;
      const melee = !f.ranged && f.inFront;
      // where it belongs now: the melee closes in, the others stand where they were put
      const rest: Point = melee ? { x: f.start.x + (f.front.x - f.start.x) * charge, y: f.start.y + (f.front.y - f.start.y) * charge } : f.inFront ? f.start : f.back;
      if (f.from && handoff < 1) f.sprite.setPosition(f.from.x + (rest.x - f.from.x) * glide, f.from.y + (rest.y - f.from.y) * glide).setDepth(f.sprite.y);
      else if (melee) f.sprite.setPosition(rest.x, rest.y).setDepth(f.sprite.y);
      else if (f.from) { f.sprite.setPosition(rest.x, rest.y).setDepth(f.sprite.y); f.from = undefined; }
      // standing: the running stops where the movement stops (an archer that does not walk never runs)
      if (!f.settled && (melee ? k >= 1 : handoff >= 1 || !f.from)) this.settle(f);
    }

    const h = v.hits;
    for (; r.hit < h.length && h[r.hit] <= tick; r.hit += 3) this.strike(r, h[r.hit + 1], h[r.hit + 2], speed);
    const hl = v.heals ?? [];
    for (; r.heal < hl.length && hl[r.heal] <= tick; r.heal += 3) this.healFx(r, hl[r.heal + 1], hl[r.heal + 2], speed);
    const a = v.advances;
    for (; r.advance < a.length && a[r.advance] <= tick; r.advance += 2) {
      const f = r.fighters[a[r.advance + 1]];
      if (f && !f.dead) { f.inFront = true; f.start = f.front; this.walk(f.sprite, f.front, 0.6 / speed); }
    }
    const d = v.deaths;
    for (; r.death < d.length && d[r.death] <= tick; r.death += 2) this.fall(r.fighters[d[r.death + 1]], speed);

    if (v.kind === 'siege') this.onSiege?.(v.sides[1].seat, Math.min(1, (now - v.startedAt) / Math.max(1, v.fightSeconds)), v.winner === 'attacker', false);
    if (now >= v.startedAt + v.fightSeconds) this.end(id, r);
  }

  /** How loud a fight at this place is: louder towards the middle of the view, faint beyond it, nothing far away (a battle elsewhere would just be noise). */
  private loudness(x: number, y: number): number {
    return hearing(this.scene, x, y);
  }

  /** Remove a replay whose code failed: its sprites go, it is not drawn or counted as active again. */
  private drop(id: string, r: Replay): void {
    r.ended = true;
    this.endedAt.set(id, performance.now());
    trace('battle-replay-dropped', id, 'after an error');
    for (const f of r.fighters) if (f?.sprite.active) { this.scene.tweens.killTweensOf(f.sprite); f.sprite.destroy(); }
    this.replays.delete(id);
  }

  private strike(r: Replay, attacker: number, target: number, speed: number): void {
    const a = r.fighters[attacker], b = r.fighters[target];
    if (!a || a.dead || !a.sprite.active) return;
    if (b) a.sprite.setFlipX(b.sprite.x < a.sprite.x);
    const look = LOOK[a.unit] ?? LOOK.kilicli;
    sfx.play(a.unit === 'mancinik' ? 'catapult' : a.ranged ? 'arrow' : look.attack ? 'sword' : 'shield', this.loudness(a.sprite.x, a.sprite.y));
    if (look.attack) {
      const key = colorKey(r.view.sides[a.side].color, this.ownColor, look.attack);
      if (this.scene.anims.exists(key)) {
        a.sprite.play({ key, timeScale: Math.min(3, speed) });
        a.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (!a.dead && a.sprite.active) a.sprite.anims.stop(); });
      }
    } else if (b) {
      // Shield bearers keep their guard up and shove.
      const dx = Math.sign(b.sprite.x - a.sprite.x) * 8;
      this.scene.tweens.add({ targets: a.sprite, x: a.sprite.x + dx, duration: 120 / speed, yoyo: true });
    }
    if (a.ranged && b) {
      const stone = a.unit === 'mancinik';
      const arrow = this.scene.add.image(a.sprite.x, a.sprite.y - (stone ? 60 : 30), stone ? 'stone-shot' : 'arrow').setScale(stone ? 0.4 : 0.6).setDepth(20_000);
      // The shot flies in an arc (a stone high and slow) and the arrow turns along it; it ends where its target stood.
      const from = { x: arrow.x, y: arrow.y }, to = { x: b.sprite.x, y: b.sprite.y - 24 };
      const lift = Math.min(70, 14 + Math.hypot(to.x - from.x, to.y - from.y) * (stone ? 0.45 : 0.18));
      const pos = (u: number) => ({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - Math.sin(Math.PI * u) * lift });
      const flight = { u: 0 };
      // A stone drifts over the ground in its own shadow (smaller and fainter the higher it is).
      const shadow = stone && !reducedEffects() ? this.scene.add.ellipse(from.x, a.sprite.y, 22, 9, 0x000000, 0.3).setDepth(arrow.depth - 1) : null;
      this.scene.tweens.add({
        targets: flight, u: 1, duration: (stone ? 520 : 280) / speed,
        onUpdate: () => {
          const p = pos(flight.u), q = pos(Math.min(1, flight.u + 0.03));
          arrow.setPosition(p.x, p.y);
          if (shadow) {
            const gx = from.x + (to.x - from.x) * flight.u, gy = a.sprite.y + ((b.sprite.y) - a.sprite.y) * flight.u;
            const high = Math.sin(Math.PI * flight.u);
            shadow.setPosition(gx, gy).setScale(1 - high * 0.4).setAlpha(0.32 - high * 0.14);
          }
          if (!stone) arrow.setRotation(Math.atan2(q.y - p.y, q.x - p.x));
          this.fx.trail(p.x, p.y);
        },
        onComplete: () => {
          shadow?.destroy(); this.fx.stick(arrow, stone);
          if (!stone) sfx.play('arrowHit', this.loudness(to.x, to.y) * 0.8);
          if (stone) { this.fx.stoneLanding(to.x, to.y + 24); sfx.play(r.view.kind === 'siege' && a.side !== 1 ? 'castleHit' : 'stone', this.loudness(to.x, to.y)); } // a stone at the gate is a blow on the gate
        },
      });
    }
    // at a gate the attackers' blows raise wall dust (the catapult's stones every time, the others now and then)
    if (r.view.kind === 'siege' && a.side !== 1 && (a.unit === 'mancinik' || Math.random() < 0.2)) {
      this.fx.dust(r.gate.x + Phaser.Math.Between(-30, 30), r.gate.y + Phaser.Math.Between(-50, 20), a.unit === 'mancinik' ? 1.1 : 0.7, 0xb8a888);
    }
    if (b && b.sprite.active) this.fx.hit(b.sprite.x, b.sprite.y - 22, a.ranged ? 'arrow' : look.attack ? 'melee' : 'shield');
    if (b && !a.ranged && this.loudness(a.sprite.x, a.sprite.y) > 0.75 && Math.random() < 0.3) this.fx.hitStop(45); // the weight of a blow
    if (b && !b.dead && b.sprite.active) {
      b.sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => { if (!b.dead && b.sprite.active) b.sprite.clearTint(); });
      // the blow squashes the one it lands on for a moment (scale only: its position belongs to the walking tweens)
      if (!b.hurt && !reducedEffects()) {
        b.hurt = true;
        const sx = b.sprite.scaleX, sy = b.sprite.scaleY;
        this.scene.tweens.add({
          targets: b.sprite, scaleX: sx * 1.14, scaleY: sy * 0.88, duration: 55, yoyo: true,
          onComplete: () => { b.hurt = false; if (b.sprite.active) b.sprite.setScale(sx, sy); },
        });
      }
    }
  }

  /** The fighter stops running and stands in its idle pose (a frozen frame of the run is what it showed before: a statue in mid-stride). */
  private settle(f: Fighter): void {
    f.settled = true;
    if (!f.sprite.anims.isPlaying || !f.sprite.anims.currentAnim?.key.endsWith('-run')) return;
    const run = f.sprite.anims.currentAnim.key, idle = run.replace(/(\w+)-run$/, '$1-idle');
    if (idle !== run && this.scene.anims.exists(idle)) playRandom(f.sprite, idle);
    else f.sprite.anims.stop();
  }

  /** A monk heals: it raises its arms and a green sparkle rises round the one it heals. */
  private healFx(r: Replay, healer: number, patient: number, speed: number): void {
    const h = r.fighters[healer], p = r.fighters[patient];
    if (h && !h.dead && h.sprite.active) {
      const key = colorKey(r.view.sides[h.side].color, this.ownColor, 'monk-heal');
      if (this.scene.anims.exists(key)) {
        h.sprite.play({ key, timeScale: Math.min(3, speed) });
        h.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (!h.dead && h.sprite.active) h.sprite.anims.stop(); });
      }
    }
    if (p && !p.dead && p.sprite.active && this.scene.anims.exists('monk-heal-fx')) {
      const fx = this.scene.add.sprite(p.sprite.x, p.sprite.y, 'monk-heal-fx').setScale(UNIT_SCALE).setOrigin(0.5, 0.65).setDepth(p.sprite.y + 1);
      fx.play({ key: 'monk-heal-fx', timeScale: Math.min(3, speed) });
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    }
  }

  private fall(f: Fighter | null | undefined, speed: number): void {
    if (!f || f.dead) return;
    f.dead = true;
    if (!f.sprite.active) return;
    sfx.play('death', this.loudness(f.sprite.x, f.sprite.y));
    f.sprite.anims.stop();
    this.fx.dust(f.sprite.x, f.sprite.y - 4, 0.55);
    f.sprite.setTint(0xff6b5e);
    this.scene.tweens.killTweensOf(f.sprite);
    this.scene.tweens.add({
      targets: f.sprite, angle: f.sprite.flipX ? -80 : 80, alpha: 0, y: f.sprite.y + 6, duration: 650 / Math.min(speed, 4),
      onComplete: () => { if (f.sprite.active) f.sprite.destroy(); },
    });
  }

  private end(id: string, r: Replay): void {
    if (r.ended) return;
    r.ended = true;
    this.endedAt.set(id, performance.now());
    if (r.view.kind === 'siege') this.onSiege?.(r.view.sides[1].seat, 1, r.view.winner === 'attacker', true);
    trace('battle-replay-end', id, `${r.view.kind}, ${r.fighters.filter((f) => f && !f.dead && f.sprite.active).length} left standing`);
    const left = r.fighters.filter((f): f is Fighter => !!f && !f.dead);
    this.scene.tweens.add({ targets: left.map((f) => f.sprite), alpha: 0, duration: 400, onComplete: () => left.forEach((f) => f.sprite.destroy()) });
    this.scene.time.delayedCall(500, () => this.replays.delete(id));
  }

  private walk(sprite: Phaser.GameObjects.Sprite, to: Point, seconds: number, done?: () => void): void {
    this.scene.tweens.killTweensOf(sprite);
    if (Math.abs(to.x - sprite.x) > 2) sprite.setFlipX(to.x < sprite.x);
    this.scene.tweens.add({
      targets: sprite, x: to.x, y: to.y, duration: Math.max(50, seconds * 1000),
      onUpdate: () => { if (sprite.active) sprite.setDepth(sprite.y); },
      onComplete: () => { if (!sprite.active) return; if (!done) sprite.anims.stop(); done?.(); },
    });
  }
}

/** Index of side <paramref name="s"/>'s first soldier in the record (side A first). */
function offset(view: BattleStartedView, s: number): number {
  let n = 0;
  for (let i = 0; i < s; i++) n += view.sides[i].soldiers.length;
  return n;
}

/** Index of the first entry (groups of `stride`) whose tick is after `tick`. */
function skipTo(list: readonly number[], stride: number, tick: number): number {
  let i = 0;
  while (i < list.length && list[i] <= tick) i += stride;
  return i;
}

function normalise(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
}

