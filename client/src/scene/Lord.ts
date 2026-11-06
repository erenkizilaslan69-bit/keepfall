import Phaser from 'phaser';
import { unitOriginY, unitScale } from './assets';
import { GATE, type Point } from './layout';
import { NO_OFFSET } from './parts';
import { reducedEffects } from '../prefs';

// The lord of a castle: Tiny Swords Warfare's King, in the owner's colour. He is only a picture (no rule, no server data). While the castle is quiet he
// makes his rounds: slowly from building to building (farm, mine, forge, woodcutter), stopping a while by the workers as if looking over their work, and
// then back to the gate. Under siege he hurries back to the gate and swings his mace; when the castle falls he topples over where he stands and stays
// down. With "reduce effects" he just stands at the gate.

const SPOT = { x: GATE.x + 52, y: GATE.y + 16 };
const WALK = 24; // px/s: a slow stroll
const HURRY = 70;

/** The rounds: each stop is a way (waypoints on free ground, from the square before the gate) and where he stands to look over the work. */
const ROUNDS: { way: Point[]; look: Point }[] = [
  { way: [{ x: 420, y: 504 }, { x: 292, y: 490 }, { x: 270, y: 424 }], look: { x: 270, y: 352 } },       // farm
  { way: [{ x: 420, y: 504 }, { x: 350, y: 548 }], look: { x: 318, y: 598 } },                           // mine
  { way: [{ x: 620, y: 506 }, { x: 716, y: 540 }], look: { x: 770, y: 626 } },                           // forge
  { way: [{ x: 624, y: 504 }, { x: 736, y: 488 }, { x: 764, y: 420 }], look: { x: 772, y: 350 } },       // woodcutter
];
const HOME: Point = { x: GATE.x + 20, y: GATE.y + 28 };

type Mode = 'stand' | 'walk' | 'hurry' | 'fight';

export class Lord {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private fallen = false;
  private besieged = false;
  private mode: Mode = 'stand';
  /** Where he is walking to (castle-local px), in order. */
  private path: Point[] = [];
  private pos: Point = { ...SPOT };
  private waitUntil = 0;
  private next = 0;
  private lookingAround = false;
  private readonly onUpdate: (time: number, delta: number) => void;

  /** <paramref name="off"/>: where this castle's corner is; <paramref name="k"/> gives the sheet key in the owner's colour. */
  constructor(private readonly scene: Phaser.Scene, private readonly off: Point = NO_OFFSET, private readonly k: (key: string) => string = (key) => key) {
    const idle = this.k('lord-idle');
    this.sprite = scene.add.sprite(SPOT.x + off.x, SPOT.y + off.y, idle)
      .setScale(unitScale('lord')).setOrigin(0.5, unitOriginY('lord')).setDepth(SPOT.y + off.y).setFlipX(true);
    this.sprite.play({ key: idle, startFrame: Phaser.Math.Between(0, 5) });
    this.waitUntil = scene.time.now + 3000 + Math.random() * 4000;
    this.onUpdate = (time, delta) => this.update(time, delta);
    scene.events.on('update', this.onUpdate);
  }

  /** The castle is under siege (true) or the siege is over (false): he goes back to the gate and fights, or goes back to his rounds. */
  fight(on: boolean): void {
    if (this.fallen || on === this.besieged || !this.sprite.active) return;
    this.besieged = on;
    if (on) { this.path = this.wayTo(SPOT); this.setMode(this.path.length ? 'hurry' : 'fight'); }
    else { this.setMode('stand'); this.waitUntil = this.scene.time.now + 2500; }
  }

  /** The castle fell: he topples over (`animated`), or, when we first look at a castle that is already down, simply lies there. */
  setFallen(fallen: boolean, animated: boolean): void {
    if (fallen === this.fallen || !this.sprite.active) return;
    this.fallen = fallen;
    if (!fallen) { this.sprite.setAngle(0).clearTint().setAlpha(1); this.setMode('stand'); return; }
    this.path = [];
    this.sprite.anims.stop();
    this.sprite.setTint(0x8a8a8a);
    const to = { angle: 86, alpha: 0.7 };
    if (!animated) { this.sprite.setAngle(to.angle).setAlpha(to.alpha); return; }
    this.scene.tweens.add({ targets: this.sprite, ...to, duration: 700, ease: 'Bounce.easeOut' });
  }

  debugSprite(): Phaser.GameObjects.Sprite { return this.sprite; }

  destroy(): void {
    this.scene.events.off('update', this.onUpdate);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    if (!this.sprite.active) return;
    const key = mode === 'fight' ? 'lord-attack' : mode === 'stand' ? 'lord-idle' : 'lord-run';
    this.sprite.play(this.k(key));
    this.sprite.anims.timeScale = mode === 'walk' ? 0.55 : 1;
  }

  /** The way from where he is to a place on the rounds' ground (via the square before the gate when he is not already near it). */
  private wayTo(to: Point): Point[] {
    const stop = ROUNDS.find((r) => Math.hypot(r.look.x - this.pos.x, r.look.y - this.pos.y) < 30);
    const back = stop ? [...stop.way].reverse() : [];
    return [...back, { x: HOME.x, y: HOME.y + 8 }, to];
  }

  private update(time: number, delta: number): void {
    if (this.fallen || !this.sprite.active) return;
    if (reducedEffects() && !this.besieged) {
      // no rounds: he stays by the gate
      if (this.mode !== 'stand' || Math.hypot(this.pos.x - SPOT.x, this.pos.y - SPOT.y) > 2) {
        this.pos = { ...SPOT }; this.path = []; this.setMode('stand'); this.place(false);
      }
      return;
    }
    if (this.mode === 'fight') return;
    if (this.mode === 'stand') {
      if (this.besieged || time < this.waitUntil) return;
      // set off on the next stop of the rounds, or home to the gate
      const round = ROUNDS[this.next % ROUNDS.length];
      this.lookingAround = true;
      this.path = [...this.wayFromHere(), ...round.way, round.look];
      this.next++;
      this.setMode('walk');
      return;
    }
    // walking
    const speed = this.mode === 'hurry' ? HURRY : WALK;
    let step = (speed * delta) / 1000;
    while (step > 0 && this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.pos.x, dy = t.y - this.pos.y, d = Math.hypot(dx, dy);
      if (d <= step) { this.pos = { ...t }; this.path.shift(); step -= d; continue; }
      this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
      this.sprite.setFlipX(dx > 0 ? false : dx < 0 ? true : this.sprite.flipX);
      step = 0;
    }
    this.place(true);
    if (!this.path.length) {
      if (this.mode === 'hurry') { this.pos = { ...SPOT }; this.place(false); this.sprite.setFlipX(true); this.setMode('fight'); return; }
      // arrived: at a building he stands and looks over the work for a while; at the gate he rests longer
      const atGate = Math.hypot(this.pos.x - HOME.x, this.pos.y - HOME.y) < 24;
      this.sprite.setFlipX(this.pos.x > 512 ? true : false);
      this.setMode('stand');
      this.waitUntil = time + (atGate ? 5000 : 3200) + Math.random() * 2200;
      if (!atGate && this.lookingAround) this.lookingAround = false;
    }
  }

  /** From where he stands now to the square before the gate (the rounds start and end there). */
  private wayFromHere(): Point[] {
    const stop = ROUNDS.find((r) => Math.hypot(r.look.x - this.pos.x, r.look.y - this.pos.y) < 30);
    return stop ? [...stop.way].reverse() : Math.hypot(this.pos.x - SPOT.x, this.pos.y - SPOT.y) < 2 ? [HOME] : [];
  }

  private place(moving: boolean): void {
    this.sprite.setPosition(this.pos.x + this.off.x, this.pos.y + this.off.y).setDepth(this.pos.y + this.off.y + (moving ? 0 : 0));
  }
}
