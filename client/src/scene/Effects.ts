import Phaser from 'phaser';
import { lowGraphics, reducedEffects } from '../prefs';

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
  private lastStop = -10_000;
  private slowed = false;
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
  private get still(): boolean { return reducedEffects() || lowGraphics(); }

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
    if (!this.enabled || (lowGraphics() && key === 'dust') || this.alive >= MAX_SPRITES || !this.seen(x, y, 200) || !this.scene.anims.exists(key)) return;
    this.alive++;
    const s = this.scene.add.sprite(x, y, key).setScale(scale).setDepth(DEPTH_FX + 1).setTint(tint).setAlpha(alpha);
    let gone = false;
    const done = () => { if (gone) return; gone = true; s.destroy(); this.alive--; };
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, done);
    s.play({ key, repeat: 0 }); // (the animation itself loops, for the building dust: this one plays once and is gone)
    // A puff that never got to finish (the animation was swapped, the sprite was restarted) must not stay on the map as a blotch.
    this.scene.time.delayedCall(2500, done);
  }

  /**
   * A very short freeze of the animations when a heavy blow lands (the weight of a hit). At most one every 0.7 s, none for people who asked for less motion
   * or on low graphics; the battle's own clock is the server's, so nothing is lost by it.
   */
  hitStop(ms = 50): void {
    if (!this.enabled || this.still) return;
    const now = this.scene.time.now;
    if (now - this.lastStop < 700) return;
    this.lastStop = now;
    this.scene.anims.pauseAll();
    window.setTimeout(() => { try { this.scene.anims.resumeAll(); } catch { /* the scene is gone */ } }, ms);
  }

  /** The picture slows for a moment (a castle falls): tweens and animations at <paramref name="factor"/> speed for <paramref name="ms"/> of real time. */
  slowMo(ms = 1300, factor = 0.35): void {
    if (!this.enabled || this.still || this.slowed) return;
    this.slowed = true;
    this.scene.tweens.timeScale = factor;
    this.scene.anims.globalTimeScale = factor;
    window.setTimeout(() => {
      this.slowed = false;
      try { this.scene.tweens.timeScale = 1; this.scene.anims.globalTimeScale = 1; } catch { /* the scene is gone */ }
    }, ms);
  }

  /** A stone from a catapult lands: a ring of dust, a small fireball, a thump of the camera (only when it is in view). */
  stoneLanding(x: number, y: number): void {
    if (!this.enabled || this.still || !this.seen(x, y)) return;
    this.dust(x - 10, y, 1.1, 0xb8a888);
    this.dust(x + 12, y + 4, 0.9, 0xb8a888);
    this.explosion(x, y - 6, 0.45);
    this.sparks?.explode(6, x, y - 8);
    this.shake(110, 0.0012);
  }

  /** Gold sparkles and a puff (a building has grown, a worker has become a soldier). */
  sparkle(x: number, y: number, big = false): void {
    if (!this.enabled || this.still || !this.seen(x, y)) return;
    this.sparks?.explode(big ? 16 : 9, x, y);
    this.flash(x, y, 0xffe27a);
    if (big) this.dust(x, y + 8, 1.2, 0xe6d6a8);
  }

  /** One ring that swells and fades (an army is coming: the caller repeats it). */
  pulse(x: number, y: number, tint = 0xe0392b, radius = 120): void {
    if (!this.enabled || reducedEffects() || !this.seen(x, y, 300)) return;
    const ring = this.scene.add.circle(x, y, 10).setStrokeStyle(5, tint, 0.9).setDepth(DEPTH_FX + 3).setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: radius / 10, alpha: 0, duration: 1100, ease: 'Sine.out', onComplete: () => ring.destroy() });
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
    const smoke = (dx: number, dy: number, scale: number) => list.push(this.smokePuff(x + dx, y + dy, scale * 0.8, 0.6));
    const flame = (dx: number, dy: number, scale: number) => {
      const s = this.scene.add.sprite(x + dx, y + dy, 'fire').setScale(scale).setDepth(DEPTH_FX).setOrigin(0.5, 0.85);
      s.play({ key: 'fire', repeat: -1, startFrame: Phaser.Math.Between(0, 5) });
      list.push(s);
    };
    if (stage >= 1) smoke(-105, -190, 4);
    if (stage >= 2) { flame(95, -150, 2.6); flame(-30, -195, 2.2); smoke(100, -215, 4.2); smoke(-35, -245, 3.6); }
    if (stage === 3) { list.forEach((s) => s.setAlpha(0.4).setData('alpha', 0.35)); smoke(0, -140, 4.6); list[list.length - 1].setData('alpha', 0.4); }
    this.burning.set(id, list);
  }

  /**
   * One column of smoke over a burning castle or wall: the Tiny Swords dust puff, light grey and see-through, rising and fading over and over
   * (a dark, still one looked like a black hole close up). The sprite's 'alpha' data is how opaque it gets at most.
   */
  private smokePuff(x: number, y: number, scale: number, alpha: number): Phaser.GameObjects.Sprite {
    const s = this.scene.add.sprite(x, y, 'dust').setScale(scale).setDepth(DEPTH_FX).setTint(0xb4aea6).setAlpha(0).setData('alpha', alpha);
    s.play({ key: 'dust', repeat: -1, startFrame: Phaser.Math.Between(0, 7) });
    s.once('destroy', () => this.scene.tweens.killTweensOf(s));
    const rise = () => {
      if (!s.active) return;
      s.setPosition(x + Phaser.Math.Between(-8, 8), y).setScale(scale * 0.85);
      this.scene.tweens.add({
        targets: s, y: y - 34 * scale / 4, scale: scale * 1.15, duration: 2600, ease: 'Sine.easeOut',
        onUpdate: (tw) => s.setAlpha((s.getData('alpha') as number) * Math.sin(Math.PI * tw.progress)),
        onComplete: rise,
      });
    };
    this.scene.time.delayedCall(Phaser.Math.Between(0, 1200), rise);
    return s;
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
    const smoke = (dy: number, scale: number) => list.push(this.smokePuff(x, y + dy, scale * 0.8, 0.55));
    const flame = (dy: number, scale: number) => {
      const s = this.scene.add.sprite(x, y + dy, 'fire').setScale(scale).setDepth(DEPTH_FX).setOrigin(0.5, 0.85);
      s.play({ key: 'fire', repeat: -1, startFrame: Phaser.Math.Between(0, 5) });
      list.push(s);
    };
    if (stage >= 1) smoke(-70, 2.6);
    if (stage >= 2) { flame(-30, 1.8); flame(70, 1.6); }
    if (stage === 3) { list.forEach((s) => s.setAlpha(0.4).setData('alpha', 0.35)); smoke(40, 3); }
    this.burning.set(id, list);
  }

  /** The smoke and flames of a castle under attack go (the fight was lost by the attacker). */
  clearDamage(id: string): void {
    this.burning.get(id)?.forEach((s) => s.destroy());
    this.burning.delete(id);
  }

  /** The castle falls: fireballs along its walls, dust, a hard shake, and the stone sinks and goes dark. */
  collapse(image: Phaser.GameObjects.Image, x: number, y: number, restScale: number, own = false): void {
    const blasts: [number, number, number][] = [[-120, -100, 1.3], [110, -130, 1.5], [0, -190, 1.7], [-50, -60, 1.2], [70, -50, 1.4]];
    blasts.forEach(([dx, dy, sc], i) => this.scene.time.delayedCall(i * 170, () => {
      this.explosion(x + dx, y + dy, sc);
      this.dust(x + dx, y + dy + 20, sc * 1.4, 0x8a7a66);
      this.sparks?.explode(10, x + dx, y + dy);
    }));
    if (own) this.shake(1000, 0.014);
    else if (this.seen(x, y, 200)) this.shake(500, 0.005); // a neighbour's castle in view: a smaller tremor; far away, none
    this.scene.tweens.add({
      targets: image, scaleY: restScale * 0.8, duration: 1100, ease: 'Cubic.easeIn',
      onUpdate: (tw) => { const v = 255 - Math.round(tw.progress * 120); image.setTint(Phaser.Display.Color.GetColor(v, v, v)); },
      onComplete: () => { if (image.active) this.ruin(image, restScale); },
    });
  }

  /**
   * A fallen castle is a RUIN, solid as the stone it was: the same picture with its upper part broken off along a jagged line, a few fallen blocks
   * and scorch marks, darkened (never see-through: a half-transparent castle reads as "not there", a ruin reads as "it fell"). Made from whatever
   * picture the castle wears (plain or a kingdom's), in memory only. Also the castle that was already down when we first saw it: no show, just the ruin.
   */
  ruin(image: Phaser.GameObjects.Image, restScale: number): void {
    const key = ruinTexture(this.scene, image);
    if (key) image.setTexture(key).clearTint().setScale(image.scaleX, restScale).setAlpha(1);
    else image.setScale(image.scaleX, restScale * 0.8).setTint(0x777777).setAlpha(1); // (no canvas to cut the picture on: at least solid and dark)
    this.ruined.add(image);
    // The castle's look can change after it fell (a scout's report shows the kingdom's own castle): the ruin is cut again from the new picture.
    this.ruinWatch ??= this.scene.time.addEvent({ delay: 600, loop: true, callback: () => {
      for (const im of this.ruined) {
        if (!im.active) { this.ruined.delete(im); continue; }
        if (!im.texture.key.endsWith(RUIN_SUFFIX)) { const k = ruinTexture(this.scene, im); if (k) im.setTexture(k).clearTint().setAlpha(1); }
      }
    } });
  }
  private readonly ruined = new Set<Phaser.GameObjects.Image>();
  private ruinWatch: Phaser.Time.TimerEvent | null = null;

  destroy(): void {
    for (const list of this.burning.values()) list.forEach((s) => s.destroy());
    this.burning.clear();
    this.sparks?.destroy();
    this.trails?.destroy();
    this.puffs?.destroy();
  }
}

const RUIN_SUFFIX = ':ruin';

/** The ruin of the picture an image shows, as a texture of its own (made once per picture); null if it cannot be made. */
function ruinTexture(scene: Phaser.Scene, image: Phaser.GameObjects.Image): string | null {
  const frame = image.frame, src = image.texture.key;
  if (src.endsWith(RUIN_SUFFIX)) return src;
  const key = `${src}/${frame.name}${RUIN_SUFFIX}`;
  if (scene.textures.exists(key)) return key;
  const w = frame.cutWidth, h = frame.cutHeight;
  if (!(w > 8 && h > 8)) return null;
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return null;
  const g = canvas.context;
  try {
    g.imageSmoothingEnabled = false;
    g.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
    // the picture's own box (the castle does not fill its frame): the break is measured on the stone, not on the empty margin
    const data = g.getImageData(0, 0, w, h).data;
    let top = h, left = w, right = 0, bottom = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[(y * w + x) * 4 + 3] > 40) { if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x; }
    if (top >= h || right <= left) { canvas.refresh(); return key; }
    const tall = bottom - top, wide = right - left;
    // a seeded jagged line: the left of the keep stands higher, the middle is broken lowest (a breach), blocky steps like the pixel art
    let seed = 0; for (let i = 0; i < src.length; i++) seed = (seed * 31 + src.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const STEP = Math.max(4, Math.round(wide / 22));
    const line: number[] = [];
    for (let x = left; x <= right; x += STEP) {
      const u = (x - left) / wide;
      const breach = Math.exp(-((u - 0.55) ** 2) / 0.03) * 0.22;          // the gap the attackers made
      const lean = 0.30 + 0.16 * Math.abs(u - 0.5) * (u < 0.5 ? -0.6 : 1); // one side lower than the other
      line.push(top + tall * (lean + breach + (rnd() - 0.5) * 0.12));
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    line.forEach((y, i) => g.fillRect(left + i * STEP - 1, 0, STEP + 2, Math.round(y / 2) * 2));
    // what is left: dark and sooty stone (only where there is stone)
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(30, 25, 24, 0.62)';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { // scorch marks, more of them near the break
      const x = left + rnd() * wide, y = top + tall * (0.3 + rnd() * rnd() * 0.6), s = 4 + Math.round(rnd() * 3) * 2;
      g.fillStyle = `rgba(14, 10, 10, ${0.25 + rnd() * 0.3})`;
      g.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, s * 2, s);
    }
    // fallen blocks at the foot (drawn over everything: they lie in front)
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 22; i++) {
      // small stones against the foot of the wall, a few larger ones; none below the stone's own bottom edge
      const x = left + wide * (0.05 + rnd() * 0.9), sw = 4 + Math.round(rnd() * rnd() * 5) * 2, sh = Math.max(4, sw - 2 - Math.round(rnd()) * 2);
      const y = Math.min(h - 1, bottom - 2 - Math.round(rnd() * tall * 0.07));
      g.fillStyle = '#1f1b1a'; g.fillRect(Math.round(x) - 1, y - sh, sw + 2, sh + 1);
      g.fillStyle = rnd() < 0.5 ? '#57524f' : '#48433f'; g.fillRect(Math.round(x), y - sh + 1, sw, sh - 1);
      g.fillStyle = '#6f6964'; g.fillRect(Math.round(x), y - sh + 1, sw - 2, 2);
    }
    canvas.refresh();
    return key;
  } catch { scene.textures.remove(key); return null; } // (a tainted or missing source picture)
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
