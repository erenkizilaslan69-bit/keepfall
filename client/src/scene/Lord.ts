import Phaser from 'phaser';
import { unitOriginY, unitScale } from './assets';
import { GATE, type Point } from './layout';
import { NO_OFFSET } from './parts';

// The lord of a castle: Tiny Swords Warfare's King, in the owner's colour, stands at the gate. He is only a picture (no rule, no server data): he
// breathes while the castle is quiet, swings his mace while the castle is under siege, and when the castle falls he topples over and stays down.

const SPOT = { x: GATE.x + 52, y: GATE.y + 16 };

export class Lord {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private fallen = false;
  private fighting = false;

  /** <paramref name="off"/>: where this castle's corner is; <paramref name="k"/> gives the sheet key in the owner's colour. */
  constructor(private readonly scene: Phaser.Scene, off: Point = NO_OFFSET, private readonly k: (key: string) => string = (key) => key) {
    const idle = this.k('lord-idle');
    this.sprite = scene.add.sprite(SPOT.x + off.x, SPOT.y + off.y, idle)
      .setScale(unitScale('lord')).setOrigin(0.5, unitOriginY('lord')).setDepth(SPOT.y + off.y).setFlipX(true);
    this.sprite.play({ key: idle, startFrame: Phaser.Math.Between(0, 5) });
  }

  /** The castle is under siege (true) or the siege is over (false): he fights or goes back to standing. */
  fight(on: boolean): void {
    if (this.fallen || on === this.fighting || !this.sprite.active) return;
    this.fighting = on;
    this.sprite.play(this.k(on ? 'lord-attack' : 'lord-idle'));
  }

  /** The castle fell: he topples over (`animated`), or, when we first look at a castle that is already down, simply lies there. */
  setFallen(fallen: boolean, animated: boolean): void {
    if (fallen === this.fallen || !this.sprite.active) return;
    this.fallen = fallen;
    if (!fallen) { this.sprite.setAngle(0).clearTint().setAlpha(1); this.sprite.play(this.k('lord-idle')); return; }
    this.sprite.anims.stop();
    this.sprite.setTint(0x8a8a8a);
    const to = { angle: 86, alpha: 0.7 };
    if (!animated) { this.sprite.setAngle(to.angle).setAlpha(to.alpha); return; }
    this.scene.tweens.add({ targets: this.sprite, ...to, duration: 700, ease: 'Bounce.easeOut' });
  }

  debugSprite(): Phaser.GameObjects.Sprite { return this.sprite; }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
