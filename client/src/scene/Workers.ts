import Phaser from 'phaser';
import { reportError } from '../error-report';
import { t } from '../i18n';
import type { BuildingType, Job, JobView } from '../types';
import type { WorldLabels } from '../ui/world-labels';
import { UNIT_SCALE, playRandom, unitOriginY } from './assets';
import { GATE, IDLE_AREA, JOB_LOOK, SITES, type Point } from './layout';
import { NO_OFFSET } from './parts';
import { pathAround, resolveOut, type Foot } from './Blocks';

// Animated pawns. The server only sends how many people each job has; this keeps the same number
// of pawns per job and invents the walking around it. Nothing here affects the economy.

const SPEED = 75; // px per second
const JOBS: Job[] = ['farmer', 'lumberjack', 'miner', 'blacksmith', 'idle'];

/** Leave the castle sideways so nobody walks behind the castle sprite. */
const ROAD: Record<BuildingType, Point> = {
  farm: { x: 296, y: 452 },
  mine: { x: 312, y: 488 },
  lumberCamp: { x: 728, y: 452 },
  forge: { x: 712, y: 488 },
};

type State = 'walking' | 'working' | 'dropping' | 'waiting' | 'leaving';

interface Pawn {
  sprite: Phaser.GameObjects.Sprite;
  job: Job;
  slot: number;
  state: State;
  path: Point[];
  /** What happens when the path is done. */
  arrive: () => void;
  timer: number;
  carrying: boolean;
}

export class Workers {
  private pawns: Pawn[] = [];
  private placed = false;
  /** The feet of the buildings, by site: nobody stands in them or walks across them. */
  private readonly blocks = new Map<BuildingType, Foot[]>();

  /**
   * <paramref name="off"/>: where this castle's corner is (a spectator sees the other castles too);
   * <paramref name="warnIdle"/>: whether idle people get the "boşta" sign (only our own castle).
   */
  constructor(private readonly scene: Phaser.Scene, private readonly labels: WorldLabels,
    private readonly off: Point = NO_OFFSET, private readonly warnIdle = true,
    /** Another colour has sheets with other keys (see colorKey). */
    private readonly k: (key: string) => string = (key) => key) {
    this.drawPen();
  }

  private allBlocks(): Foot[] { return [...this.blocks.values()].flat(); }

  /** A building's feet changed (it was built, grew, or took another look): the people who stand in it move out, the paths go round it. */
  setBlocks(type: BuildingType, rects: Foot[]): void {
    this.blocks.set(type, rects);
    for (const pawn of this.pawns) {
      if (pawn.path.length > 0 || pawn.state === 'leaving') continue;
      const q = resolveOut({ x: pawn.sprite.x - this.off.x, y: pawn.sprite.y - this.off.y }, this.allBlocks());
      pawn.sprite.setPosition(q.x + this.off.x, q.y + this.off.y).setDepth(q.y + this.off.y);
    }
  }

  debugSprites(): Phaser.GameObjects.Sprite[] { return this.pawns.map((p) => p.sprite); }

  private pen: Phaser.GameObjects.Graphics | null = null;

  /** The idle people's pen: trodden dirt with a low picket fence round it, so they are not standing on the road. */
  private drawPen(): void {
    const a = IDLE_AREA, o = this.off, pad = 22;
    const x0 = a.left - pad + o.x, x1 = a.right + pad + o.x, y0 = a.top - 40 + o.y, y1 = a.bottom + 14 + o.y;
    const g = this.scene.add.graphics().setDepth(-69_000);
    g.fillStyle(0x7d5e34, 0.55).fillRoundedRect(x0, y0, x1 - x0, y1 - y0, 18);
    g.fillStyle(0x9a7a48, 0.5).fillRoundedRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12, 14);
    g.lineStyle(3, 0x4a2f1b, 1).strokeRoundedRect(x0, y0, x1 - x0, y1 - y0, 18);
    for (let x = x0 + 8; x < x1 - 4; x += 22) { g.fillStyle(0x4a2f1b, 1).fillRect(x, y1 - 4, 6, 12); g.fillStyle(0x8a5a34, 1).fillRect(x + 1, y1 - 3, 4, 10); }
    this.pen = g;
  }

  destroy(): void {
    this.pen?.destroy();
    this.pen = null;
    for (const p of this.pawns) p.sprite.destroy();
    this.pawns = [];
    this.labels.remove('idle');
  }

  /** Match the number of pawns per job to the server's counts. */
  sync(jobs: JobView[]): void {
    const target = new Map(jobs.map((j) => [j.job, j.count]));
    const surplus: Pawn[] = [];
    for (const job of JOBS) {
      const mine = this.pawns.filter((p) => p.job === job && p.state !== 'leaving');
      // Release the most recently assigned first; their slots are the furthest from the door.
      mine.sort((a, b) => b.slot - a.slot);
      for (let i = 0; i < mine.length - (target.get(job) ?? 0); i++) surplus.push(mine[i]);
    }
    for (const job of JOBS) {
      let missing = (target.get(job) ?? 0) - this.pawns.filter((p) => p.job === job && p.state !== 'leaving' && !surplus.includes(p)).length;
      for (; missing > 0; missing--) {
        const pawn = surplus.pop() ?? this.spawn();
        this.assign(pawn, job, !this.placed);
      }
    }
    // Whoever is left became a soldier (or is otherwise gone): walk into the castle and vanish.
    for (const pawn of surplus) this.leave(pawn);
    this.placed = true;

    const idle = this.warnIdle ? target.get('idle') ?? 0 : 0;
    if (idle > 0)
      this.labels.set('idle', { x: (IDLE_AREA.left + IDLE_AREA.right) / 2, y: IDLE_AREA.top - 44, anchor: 'bottom', minZoom: 0.5, cls: 'wl-warn', html: `<div class="wl-sign"><b>${t('{0} kişi boşta!', idle)}</b></div>` });
    else this.labels.remove('idle');
  }

  update(dt: number): void {
    for (const pawn of [...this.pawns]) {
      if (!pawn.sprite.active) continue; // already gone (left the castle)
      try {
        if (pawn.path.length > 0) this.walk(pawn, dt);
        else if (pawn.state === 'working' || pawn.state === 'dropping') {
          pawn.timer -= dt;
          if (pawn.timer <= 0) this.nextStep(pawn);
        }
      } catch (e) {
        // This one pawn stands still; the rest go on (and the error is reported once).
        reportError('workers', e, { source: `pawn ${pawn.job}/${pawn.state}` });
        pawn.path = [];
        pawn.state = 'waiting';
      }
    }
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  private spawn(): Pawn {
    const sprite = this.scene.add.sprite(GATE.x + this.off.x, GATE.y + this.off.y, this.k('pawn-idle'))
      .setScale(UNIT_SCALE).setOrigin(0.5, unitOriginY('pawn')).setDepth(GATE.y + this.off.y);
    const pawn: Pawn = { sprite, job: 'idle', slot: -1, state: 'waiting', path: [], arrive: () => {}, timer: 0, carrying: false };
    this.pawns.push(pawn);
    return pawn;
  }

  private assign(pawn: Pawn, job: Job, instant: boolean): void {
    const from = this.siteOf(pawn);
    pawn.job = job;
    pawn.slot = this.freeSlot(job, pawn);
    pawn.carrying = false;
    const spot = this.spotOf(job, pawn.slot);
    const to = JOB_LOOK[job].building;

    if (instant) {
      pawn.sprite.setPosition(spot.x + this.off.x, spot.y + this.off.y).setDepth(spot.y + this.off.y);
      this.arriveAtSpot(pawn);
      // Spread the first carry trips so not everyone leaves at once.
      pawn.timer = Phaser.Math.FloatBetween(0.5, 7);
      return;
    }
    const path: Point[] = [];
    if (from) path.push(ROAD[from]);
    if (to && to !== from) path.push(ROAD[to]);
    path.push(spot);
    this.go(pawn, path, JOB_LOOK[job].run, () => this.arriveAtSpot(pawn));
  }

  private leave(pawn: Pawn): void {
    const from = this.siteOf(pawn);
    pawn.state = 'leaving';
    pawn.slot = -1;
    this.go(pawn, [...(from ? [ROAD[from]] : []), GATE], JOB_LOOK[pawn.job].run, () => {
      pawn.state = 'leaving';
      this.scene.tweens.add({
        targets: pawn.sprite, alpha: 0, duration: 300,
        onComplete: () => {
          pawn.sprite.destroy();
          this.pawns = this.pawns.filter((p) => p !== pawn);
        },
      });
    });
    pawn.state = 'leaving';
  }

  // ---- behaviour ---------------------------------------------------------------------------

  private arriveAtSpot(pawn: Pawn): void {
    const look = JOB_LOOK[pawn.job];
    const site = look.building ? SITES[look.building] : null;
    const spot = this.spotOf(pawn.job, pawn.slot);
    if (!site || !look.work) {
      pawn.state = 'waiting';
      pawn.sprite.setFlipX(Math.random() < 0.5);
      playRandom(pawn.sprite, this.k(look.idle), 5);
      return;
    }
    pawn.state = 'working';
    pawn.timer = Phaser.Math.FloatBetween(4, 7);
    pawn.sprite.setFlipX(site.faceLeft(spot));
    playRandom(pawn.sprite, this.k(look.work), 2);
  }

  /** After a work stint: carriers take the load home; blacksmiths keep hammering. */
  private nextStep(pawn: Pawn): void {
    const look = JOB_LOOK[pawn.job];
    if (pawn.state === 'dropping') {
      pawn.carrying = false;
      this.go(pawn, [ROAD[look.building!], this.spotOf(pawn.job, pawn.slot)], look.run, () => this.arriveAtSpot(pawn));
      return;
    }
    if (!look.carry) { pawn.timer = Phaser.Math.FloatBetween(4, 7); return; }
    pawn.carrying = true;
    const drop = { x: GATE.x + Phaser.Math.Between(-30, 30), y: GATE.y + Phaser.Math.Between(-4, 6) };
    this.go(pawn, [ROAD[look.building!], drop], look.carry, () => {
      pawn.state = 'dropping';
      pawn.timer = 0.6;
      pawn.sprite.play(this.k(look.idle));
    });
  }

  private go(pawn: Pawn, path: Point[], anim: string, arrive: () => void): void {
    if (pawn.state !== 'leaving') pawn.state = 'walking';
    const from = { x: pawn.sprite.x - this.off.x, y: pawn.sprite.y - this.off.y };
    pawn.path = pathAround(from, path, this.allBlocks()).map((p) => ({ x: p.x + this.off.x, y: p.y + this.off.y }));
    pawn.arrive = arrive;
    if (pawn.sprite.anims.currentAnim?.key !== this.k(anim)) pawn.sprite.play(this.k(anim));
  }

  private walk(pawn: Pawn, dt: number): void {
    const s = pawn.sprite, next = pawn.path[0];
    const dx = next.x - s.x, dy = next.y - s.y;
    const dist = Math.hypot(dx, dy), step = SPEED * dt;
    if (dist <= step) {
      s.setPosition(next.x, next.y);
      pawn.path.shift();
      if (pawn.path.length === 0) pawn.arrive();
    } else {
      s.setPosition(s.x + (dx / dist) * step, s.y + (dy / dist) * step);
      if (Math.abs(dx) > 1) s.setFlipX(dx < 0);
    }
    s.setDepth(s.y);
  }

  // ---- places ------------------------------------------------------------------------------

  /** The building the pawn is at (or heading to), or null when it is around the gate. */
  private siteOf(pawn: Pawn): BuildingType | null {
    if (pawn.slot < 0 || pawn.state === 'dropping' || (pawn.carrying && pawn.path.length === 0)) return null;
    return JOB_LOOK[pawn.job].building ?? null;
  }

  private freeSlot(job: Job, except: Pawn): number {
    const used = new Set(this.pawns.filter((p) => p !== except && p.job === job && p.state !== 'leaving').map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    return slot;
  }

  private spotOf(job: Job, slot: number): Point {
    const building = JOB_LOOK[job].building;
    if (building) {
      const spots = SITES[building].workSpots;
      const base = spots[slot % spots.length];
      // More people than spots (shouldn't happen with capacity ≤ 8): nudge them aside.
      return resolveOut(slot < spots.length ? base : { x: base.x + 14, y: base.y + 10 }, this.allBlocks());
    }
    // Idle people queue up in rows in front of the gate.
    const perRow = 5, gap = (IDLE_AREA.right - IDLE_AREA.left) / (perRow - 1);
    return {
      x: IDLE_AREA.left + (slot % perRow) * gap + (Math.floor(slot / perRow) % 2) * (gap / 2),
      y: IDLE_AREA.top + (Math.floor(slot / perRow) % 4) * 22 + Math.floor(slot / (perRow * 4)) * 6,
    };
  }
}
