import Phaser from 'phaser';
import { reducedEffects } from '../prefs';

// Battle and castle effects: sparks where a blow lands, dust where soldiers fall or a gate is hit, arrow trails, smoke and fire on a damaged
// castle, the collapse of a fallen one, camera shake. Cosmetic only: nothing here reads or changes the game, and every effect is skipped
// when it is off screen or when too many are alive (the cap keeps a crowded battle at the same frame rate).
//
// Switched off with ?fx=0 (development, for frame-rate tests) and quieter for people who asked their system for less motion
// (no camera shake).

const SPARK_KEY = 'kf-spark', TRAIL_KEY = 'kf-trail', PUFF_KEY = 'kf-fxpuff';
const DEPTH_FX = 20_000;
const MAX_SPRITES = 28; // dust, explosions and flames alive at once
const BURSTS_PER_SECOND = 40; // sparks and trail dots: a crowded battle asks for hundreds a second, this is plenty

export class Effects {
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly trails: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly puffs: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly burning = new Map<string, Phaser.GameObjects.Sprite[]>();
  private alive = 0;
  private bucket = BURSTS_PER_SECOND;
  private lastRefill = 0;
  private shakeStrength = 0;
  private readonly enabled: boolean;

  constructor(private readonly scene: Phaser.Scene) {
    this.enabled = new URLSearchParams(location.search).get('fx') !== '0';
    if (!this.enabled) return;
    makeTextures(scene);
    this.sparks = scene.add.particles(0, 0, SPARK_KEY, {
      emitting: false, lifespan: { min: 220, max: 480 }, speed: { min: 60, max: 190 }, angle: { min: 0, max: 360 }, gravityY: 320,
      scale: { start: 1.1, end: 0.2 }, alpha: { start: 1, end: 0 }, tint: [0xfff2b0, 0xffd04a, 0xff9a3c], blendMode: 'ADD',
    }).setDepth(DEPTH_FX);
    this.trails = scene.add.particles(0, 0, TRAIL_KEY, {
      emitting: false, lifespan: 260, speed: 0, scale: { start: 1, end: 0.3 }, alpha: { start: 0.55, end: 0 },
    }).setDepth(DEPTH_FX - 1);
    this.puffs = scene.add.particles(0, 0, PUFF_KEY, {
      emitting: false, lifespan: { min: 600, max: 900 }, speedY: { min: -14, max: -4 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.5, end: 1.4 }, alpha: { start: 0.65, end: 0 }, rotate: { min: -30, max: 30 },
    }).setDepth(DEPTH_FX - 2);
  }

  /** Dust kicked up behind a marching column (a lot more behind horses); sandy on the roads, kept thin. */
  march(x: number, y: number, horses: boolean): void {
    if (!this.puffs || this.still || !this.seen(x, y) || !this.budget()) return;
    this.puffs.setParticleTint(horses ? 0xd8c394 : 0xcdbb94);
    this.puffs.explode(horses ? 3 : 2, x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-3, 6));
  }

  /** Is the point on screen (a little beyond)? Nothing off screen is worth drawing. */
  private seen(x: number, y: number, margin = 120): boolean {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  /** The player asked for less (settings), or the system did: no shake, sparks or trails. */
  private get still(): boolean { return reducedEffects(); }

  /** One of the limited bursts a second. */
  private budget(): boolean {
    const now = this.scene.time.now;
    this.bucket = Math.min(BURSTS_PER_SECOND, this.bucket + ((now - this.lastRefill) / 1000) * BURSTS_PER_SECOND);
    this.lastRefill = now;
    if (this.bucket < 1) return false;
    this.bucket--;
    return true;
  }

  /** A blow lands: sparks (steel on steel), or a small puff where an arrow hits. */
  hit(x: number, y: number, kind: 'melee' | 'arrow' | 'shield'): void {
    if (!this.sparks || this.still || !this.seen(x, y) || !this.budget()) return;
    if (kind === 'arrow') { this.sparks.explode(2, x, y); return; }
    this.sparks.explode(kind === 'shield' ? 7 : 5, x, y);
    this.flash(x, y, kind === 'shield' ? 0xcfe6ff : 0xfff2c0);
  }

  /** The instant a blow lands: a bright disc that swells and fades in a tenth of a second (steel on steel is warm, a shield bash cool). */
  flash(x: number, y: number, tint = 0xfff2c0): void {
    if (!this.enabled || this.still || this.alive >= MAX_SPRITES || !this.seen(x, y)) return;
    this.alive++;
    const s = this.scene.add.image(x, y, SPARK_KEY).setScale(3).setTint(tint).setAlpha(0.95).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_FX + 2);
    this.scene.tweens.add({ targets: s, scale: 9, alpha: 0, duration: 110, ease: 'Quad.out', onComplete: () => { s.destroy(); this.alive--; } });
  }

  /** An arrow lands: it stays stuck where it hit for a moment and fades with a small puff (a stone breaks into dust). */
  stick(arrow: Phaser.GameObjects.Image, stone: boolean): void {
    if (!this.enabled || this.still || !this.seen(arrow.x, arrow.y) || this.alive >= MAX_SPRITES) { arrow.destroy(); return; }
    if (stone) { arrow.destroy(); this.dust(arrow.x, arrow.y + 14, 0.8, 0xb8a888); return; }
    this.alive++;
    arrow.setDepth(DEPTH_FX - 3);
    this.scene.tweens.add({ targets: arrow, alpha: 0, delay: 500, duration: 400, onComplete: () => { arrow.destroy(); this.alive--; } });
    this.puffs?.setParticleTint(0xcdbb94);
    this.puffs?.explode(1, arrow.x, arrow.y + 6);
  }

  /** A short fading streak behind a flying arrow. */
  trail(x: number, y: number): void {
    if (!this.trails || this.still || !this.seen(x, y) || !this.budget()) return;
    this.trails.explode(1, x, y);
  }

  /** A puff of dust (a soldier falls, a gate is hit); played once and gone. */
  dust(x: number, y: number, scale = 1, tint = 0xffffff): void {
    this.once('dust', x, y, scale * 1.4, tint, 0.8);
  }

  /** A fireball: a castle gives way. */
  explosion(x: number, y: number, scale = 1): void {
    this.once('explosion', x, y, scale, 0xffffff, 1);
  }

  private once(key: 'dust' | 'explosion', x: number, y: number, scale: number, tint: number, alpha: number): void {
    if (!this.enabled || this.alive >= MAX_SPRITES || !this.seen(x, y, 200) || !this.scene.anims.exists(key)) return;
    this.alive++;
    const s = this.scene.add.sprite(x, y, key).setScale(scale).setDepth(DEPTH_FX + 1).setTint(tint).setAlpha(alpha);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { s.destroy(); this.alive--; });
    s.play({ key, repeat: 0 }); // (the animation itself loops, for the building dust: this one plays once and is gone)
  }

  /** Shake the picture; the stronger one wins while it lasts, and nothing moves for people who asked for less motion. */
  shake(duration: number, intensity: number): void {
    if (!this.enabled || this.still) return;
    const cam = this.scene.cameras.main;
    if (cam.shakeEffect.isRunning && intensity <= this.shakeStrength) return;
    this.shakeStrength = intensity;
    cam.shake(duration, intensity);
    this.scene.time.delayedCall(duration, () => { this.shakeStrength = 0; });
  }

  /**
   * Smoke on a castle that has lost a third of its walls, flames as well below a third. `ratio` is wallHp / maxWallHp; the spots are
   * where the towers and roof stand, relative to the castle's foot (x, y). Called on every picture: it only changes anything when the stage changes.
   */
  damage(id: string, x: number, y: number, ratio: number, fallen: boolean): void {
    if (!this.enabled) return;
    const stage = fallen ? 3 : ratio < 0.34 ? 2 : ratio < 0.67 ? 1 : 0;
    const have = this.burning.get(id);
    if ((have?.length ?? 0) === [0, 1, 4, 5][stage]) return;
    have?.forEach((s) => s.destroy());
    const list: Phaser.GameObjects.Sprite[] = [];
    const smoke = (dx: number, dy: number, scale: number) => {
      const s = this.scene.add.sprite(x + dx, y + dy, 'dust').setScale(scale).setDepth(DEPTH_FX).setTint(0x3a3a3a).setAlpha(0.9);
      s.play({ key: 'dust', repeat: -1, startFrame: Phaser.Math.Between(0, 7) });
      list.push(s);
    };
    const flame = (dx: number, dy: number, scale: number) => {
      const s = this.scene.add.sprite(x + dx, y + dy, 'fire').setScale(scale).setDepth(DEPTH_FX).setOrigin(0.5, 0.85);
      s.play({ key: 'fire', repeat: -1, startFrame: Phaser.Math.Between(0, 5) });
      list.push(s);
    };
    if (stage >= 1) smoke(-105, -190, 4);
    if (stage >= 2) { flame(95, -150, 2.6); flame(-30, -195, 2.2); smoke(100, -215, 4.2); smoke(-35, -245, 3.6); }
    if (stage === 3) { list.forEach((s) => s.setAlpha(0.4)); smoke(0, -140, 4.6); }
    this.burning.set(id, list);
  }

  /**
   * The wall at the gate (where a siege is fought): smoke when it has lost a third of its hit points, flames below a third.
   * `ratio` is wallHp / maxWallHp; the spots are along the wall either side of (x, y). Like <see cref="damage"/>, it changes nothing between stages.
   */
  wallDamage(id: string, x: number, y: number, ratio: number, fallen: boolean): void {
    if (!this.enabled) return;
    const stage = fallen ? 3 : ratio < 0.34 ? 2 : ratio < 0.67 ? 1 : 0;
    const have = this.burning.get(id);
    if ((have?.length ?? 0) === [0, 1, 3, 4][stage]) return;
    have?.forEach((s) => s.destroy());
    const list: Phaser.GameObjects.Sprite[] = [];
    const smoke = (dy: number, scale: number) => {
      const s = this.scene.add.sprite(x, y + dy, 'dust').setScale(scale).setDepth(DEPTH_FX).setTint(0x3a3a3a).setAlpha(0.85);
      s.play({ key: 'dust', repeat: -1, startFrame: Phaser.Math.Between(0, 7) });
      list.push(s);
    };
    const flame = (dy: number, scale: number) => {
      const s = this.scene.add.sprite(x, y + dy, 'fire').setScale(scale).setDepth(DEPTH_FX).setOrigin(0.5, 0.85);
      s.play({ key: 'fire', repeat: -1, startFrame: Phaser.Math.Between(0, 5) });
      list.push(s);
    };
    if (stage >= 1) smoke(-70, 2.6);
    if (stage >= 2) { flame(-30, 1.8); flame(70, 1.6); }
    if (stage === 3) { list.forEach((s) => s.setAlpha(0.4)); smoke(40, 3); }
    this.burning.set(id, list);
  }

  /** The smoke and flames of a castle under attack go (the fight was lost by the attacker). */
  clearDamage(id: string): void {
    this.burning.get(id)?.forEach((s) => s.destroy());
    this.burning.delete(id);
  }

  /** The castle falls: fireballs along its walls, dust, a hard shake, and the stone sinks and goes dark. */
  collapse(image: Phaser.GameObjects.Image, x: number, y: number, restScale: number): void {
    const blasts: [number, number, number][] = [[-120, -100, 1.3], [110, -130, 1.5], [0, -190, 1.7], [-50, -60, 1.2], [70, -50, 1.4]];
    blasts.forEach(([dx, dy, sc], i) => this.scene.time.delayedCall(i * 170, () => {
      this.explosion(x + dx, y + dy, sc);
      this.dust(x + dx, y + dy + 20, sc * 1.4, 0x8a7a66);
      this.sparks?.explode(10, x + dx, y + dy);
    }));
    this.shake(900, 0.012);
    this.scene.tweens.add({
      targets: image, scaleY: restScale * 0.8, duration: 1100, ease: 'Cubic.easeIn',
      onUpdate: (tw) => { const v = 255 - Math.round(tw.progress * 120); image.setTint(Phaser.Display.Color.GetColor(v, v, v)); },
    });
  }

  /** A castle that was already down when we first saw it: no show, just the ruin. */
  ruin(image: Phaser.GameObjects.Image, restScale: number): void {
    image.setScale(image.scaleX, restScale * 0.8).setTint(0x888888);
  }

  destroy(): void {
    for (const list of this.burning.values()) list.forEach((s) => s.destroy());
    this.burning.clear();
    this.sparks?.destroy();
    this.trails?.destroy();
    this.puffs?.destroy();
  }
}

/** The two small particle textures, drawn once. */
function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(SPARK_KEY)) return;
  const spark = scene.textures.createCanvas(SPARK_KEY, 4, 4)!;
  spark.context.fillStyle = '#ffffff';
  spark.context.fillRect(0, 0, 4, 4);
  spark.refresh();
  const puff = scene.textures.createCanvas(PUFF_KEY, 16, 16)!; // a round blotch of a few blocky pixels
  puff.context.fillStyle = 'rgba(255,255,255,0.55)';
  puff.context.fillRect(4, 2, 8, 12); puff.context.fillRect(2, 4, 12, 8);
  puff.context.fillStyle = 'rgba(255,255,255,0.9)';
  puff.context.fillRect(5, 4, 6, 8);
  puff.refresh();
  const trail = scene.textures.createCanvas(TRAIL_KEY, 3, 3)!;
  trail.context.fillStyle = '#f4f0e4';
  trail.context.fillRect(0, 0, 3, 3);
  trail.refresh();
}
