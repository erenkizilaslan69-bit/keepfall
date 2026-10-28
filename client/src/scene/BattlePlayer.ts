import Phaser from 'phaser';
import { trace } from '../debug-trace';
import { sfx } from '../audio';
import { reportError } from '../error-report';
import type { Effects } from './Effects';
import type { BattleStartedView, PlayerColor, Vec } from '../types';
import { SHIELD_SCALE, UNIT_SCALE, colorKey, playRandom, unitOriginY } from './assets';
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
const COL = 0.75, LINE = 0.55; // tiles between soldiers across and along
const FRONT_START = 1.7, FRONT_MEET = 0.6, BACK = 2.4; // tiles from the centre

const LOOK: Record<string, { run: string; attack: string | null; scale: number }> = {
  kalkanli: { run: 'warrior-guard', attack: null, scale: SHIELD_SCALE },
  kilicli: { run: 'warrior-run', attack: 'warrior-attack', scale: UNIT_SCALE },
  mizrakci: { run: 'lancer-run', attack: 'lancer-attack', scale: UNIT_SCALE },
  okcu: { run: 'archer-run', attack: 'archer-shoot', scale: UNIT_SCALE },
  kesis: { run: 'monk-run', attack: null, scale: UNIT_SCALE },
  mancinik: { run: 'mancinik-run', attack: 'mancinik-fire', scale: UNIT_SCALE },
  suvari: { run: 'suvari-run', attack: 'suvari-attack', scale: UNIT_SCALE },
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
  /** Every battle that has been replayed here, for good: its "Savaş" cloud must not come back after the replay ends. */
  private played = new Set<string>();
  hasPlayed(id: string): boolean { return this.played.has(id); }

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
    if (this.replays.has(view.id) || this.played.has(view.id)) { trace('battle-replay-duplicate', view.id, 'the server announced it again'); return; } // (each battle is replayed once: a repeat of the news must not play it again)
    this.played.add(view.id);
    {
      const { now, speed } = this.clock();
      this.lags.push({ id: view.id, kind: view.kind, lagGame: now - view.startedAt, lagReal: (now - view.startedAt) / Math.max(1, speed), fight: view.fightSeconds });
      trace('battle-replay-start', view.id, `${view.kind} lag ${(now - view.startedAt).toFixed(1)} game s, fight ${view.fightSeconds.toFixed(1)} s, sides ${view.sides.map((s) => s.soldiers.length).join('v')}`);
      for (const s of view.sides) if (s.seat) trace('battle-involves', `seat:${s.seat}`, view.id);
    }
    const f = normalise(view.facing);
    const p = { x: -f.y, y: f.x };
    // At a castle the fight is in front of the gate, on the road the attackers came along.
    const centre = view.kind === 'siege' ? { x: view.at.x - f.x * 1.6, y: view.at.y - f.y * 1.6 } : view.at;
    const fighters: (Fighter | null)[] = [];
    try {
    view.sides.forEach((side, s) => {
      const sign = s === 0 ? -1 : 1; // side A stands behind the centre, side B in front of it
      const fronts = side.soldiers.map((x, i) => ({ ...x, i })).filter((x) => x.row === 'front');
      const backs = side.soldiers.map((x, i) => ({ ...x, i })).filter((x) => x.row !== 'front');
      const place = (k: number, n: number, depth: number): Point => {
        const line = Math.floor(k / PER_LINE), inLine = Math.min(PER_LINE, n - line * PER_LINE);
        const across = ((k % PER_LINE) - (inLine - 1) / 2) * COL;
        const along = sign * (depth + line * LINE);
        return toWorld({ x: centre.x + f.x * along + p.x * across, y: centre.y + f.y * along + p.y * across });
      };
      const courtyard = view.kind === 'siege' && s === 1 ? this.courtyardOf(side.seat) : null;
      let drawn = 0;
      for (const [list, isFront] of [[fronts, true], [backs, false]] as const) {
        list.forEach((x, k) => {
          if (drawn >= MAX_DRAWN) { fighters[offset(view, s) + x.i] = null; return; }
          drawn++;
          const look = LOOK[x.unitId] ?? LOOK.kilicli;
          const ranged = STAYS_BACK.has(x.unitId);
          const front = place(k, list.length, ranged || !isFront ? FRONT_START : FRONT_MEET);
          const start = place(k, list.length, isFront ? FRONT_START : BACK);
          const back = place(k, list.length, BACK);
          const at = courtyard ?? (isFront ? start : back);
          const key = colorKey(side.color, this.ownColor, look.run);
          const sprite = this.scene.add.sprite(at.x, at.y, key).setScale(look.scale).setOrigin(0.5, unitOriginY(look.run));
          sprite.setFlipX(sign > 0 ? f.x > 0 : f.x < 0).setDepth(at.y).setData('replay', view.id);
          playRandom(sprite, key);
          fighters[offset(view, s) + x.i] = { sprite, side: s, unit: x.unitId, ranged, front, start, back, inFront: isFront, dead: false };
          if (courtyard) this.walk(sprite, isFront ? start : back, 1.6); // down from the courtyard to the gate
        });
      }
    });
    } catch (e) {
      // A replay that cannot be built leaves nothing behind (the soldiers made so far are deleted) and the battle shows as a cloud.
      for (const f of fighters) if (f?.sprite.active) { this.scene.tweens.killTweensOf(f.sprite); f.sprite.destroy(); }
      this.played.delete(view.id);
      trace('battle-replay-failed', view.id, String(e));
      reportError('battle-replay', e, { source: `building battle ${view.id}` });
      return;
    }
    sfx.play('battleStart');
    this.replays.set(view.id, { view, fighters, hit: 0, death: 0, advance: 0, heal: 0, gate: toWorld(view.at), ended: false });
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
    const k = Math.min(1, Math.max(0, t / APPROACH_SECONDS));
    for (const f of r.fighters) {
      if (!f || f.dead || !f.sprite.active || f.ranged || !f.inFront || this.scene.tweens.isTweening(f.sprite)) continue;
      f.sprite.setPosition(f.start.x + (f.front.x - f.start.x) * k, f.start.y + (f.front.y - f.start.y) * k).setDepth(f.sprite.y);
      if (k >= 1 && f.sprite.anims.isPlaying && f.sprite.anims.currentAnim?.key.endsWith('-run')) f.sprite.anims.stop();
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

    if (now >= v.startedAt + v.fightSeconds) this.end(id, r);
  }

  /** Only fights the player can see are heard: full volume in view, nothing outside it (a battle elsewhere would just be noise). */
  private loudness(x: number, y: number): number {
    const view = this.scene.cameras.main.worldView;
    return view.contains(x, y) ? 1 : 0;
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
    sfx.play(a.unit === 'mancinik' ? 'castleHit' : a.ranged ? 'arrow' : look.attack ? 'sword' : 'shield', this.loudness(a.sprite.x, a.sprite.y));
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
      const arrow = this.scene.add.image(a.sprite.x, a.sprite.y - (stone ? 60 : 30), stone ? 'stone-shot' : 'arrow').setScale(stone ? 1 : 0.6).setDepth(20_000);
      if (!stone) arrow.setRotation(Math.atan2(b.sprite.y - 24 - arrow.y, b.sprite.x - arrow.x));
      this.scene.tweens.add({
        targets: arrow, x: b.sprite.x, y: b.sprite.y - 24, duration: (stone ? 520 : 280) / speed,
        onUpdate: () => this.fx.trail(arrow.x, arrow.y),
        onComplete: () => arrow.destroy(),
      });
    }
    if (b && b.sprite.active) this.fx.hit(b.sprite.x, b.sprite.y - 22, a.ranged ? 'arrow' : look.attack ? 'melee' : 'shield');
    if (b && !b.dead && b.sprite.active) {
      b.sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(70, () => { if (!b.dead && b.sprite.active) b.sprite.clearTint(); });
    }
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
  return s === 0 ? 0 : view.sides[0].soldiers.length;
}

function normalise(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
}

