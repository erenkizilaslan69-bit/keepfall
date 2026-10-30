import Phaser from 'phaser';
import { UNIT_SCALE, playRandom, unitOriginY } from './assets';
import { GATE, type Point } from './layout';
import { NO_OFFSET } from './parts';

// The castle's gate guards: swordsmen in the castle's colour who stand either side of the gate (the server says how many are standing; a fallen one
// is gone for a minute). Cosmetic: they are no soldiers and never walk anywhere.

const SPOTS: Point[] = [{ x: -78, y: 462 }, { x: 78, y: 462 }, { x: -52, y: 474 }, { x: 52, y: 474 }, { x: -104, y: 474 }, { x: 104, y: 474 }];

export class Guards {
  private sprites: Phaser.GameObjects.Sprite[] = [];

  /** `off`: where the castle's corner is; `k`: another colour's sheets have other keys. */
  constructor(private readonly scene: Phaser.Scene, private readonly off: Point = NO_OFFSET, private readonly k: (key: string) => string = (key) => key) {}

  sync(count: number): void {
    const want = Math.max(0, Math.min(count, SPOTS.length));
    while (this.sprites.length > want) this.sprites.pop()!.destroy();
    while (this.sprites.length < want) {
      const i = this.sprites.length, spot = SPOTS[i];
      const y = spot.y + this.off.y;
      const s = this.scene.add.sprite(GATE.x + spot.x + this.off.x, y, this.k('warrior-idle'))
        .setScale(UNIT_SCALE).setOrigin(0.5, unitOriginY('warrior')).setDepth(y).setFlipX(spot.x < 0).setAlpha(0);
      playRandom(s, this.k('warrior-idle'), 5);
      this.scene.tweens.add({ targets: s, alpha: 1, duration: 500 });
      this.sprites.push(s);
    }
  }

  debugSprites(): Phaser.GameObjects.Sprite[] { return this.sprites; }

  destroy(): void {
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
  }
}
