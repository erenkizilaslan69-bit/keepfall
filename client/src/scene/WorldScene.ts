import Phaser from 'phaser';
import type { BattleStartedView, BuildingType, BuildingView, CastleView, MapLayoutView, MapStateView, PlayerColor, RegionView, RoomView, Vec } from '../types';
import type { Minimap } from '../minimap';
import { createAnimations, preloadAssets } from './assets';
import { CASTLE, COURTYARD, SITES, TILE, WORLD_HEIGHT, WORLD_WIDTH, type Part } from './layout';
import { distanceToSegment, seeded, setWorldOrigin, toTiles, toWorld } from './world';
import { BattlePlayer } from './BattlePlayer';
import { Fog } from './Fog';
import { Movers } from './Movers';
import { Soldiers } from './Soldiers';
import { Workers } from './Workers';

const MAX_ZOOM = 1.5;
const PAN_SPEED = 900; // px per second at zoom 1 (keyboard)
const ROAD_COLOR = 0xd8b779, ROAD_EDGE = 0xa98b57;
// Things stand in front of each other by their y; parts of the map lie at negative y, so the ground
// layers sit far below anything that can stand on them.
/** Trees this close (tiles) to a battle turn see-through so the fighting stays visible. */
const BATTLE_CLEARING = 4;
const TREE_FADED_ALPHA = 0.3;
const DEPTH_WATER = -100_000, DEPTH_GROUND = -90_000, DEPTH_ROAD = -80_000;

// Tilemap_color1: the flat grass island is the 3×3 block in the top-left of the sheet (9 tiles per row).
const GRASS = { tl: 0, t: 1, tr: 2, l: 9, c: 10, r: 11, bl: 18, b: 19, br: 20 };

/** Castle HP bar: kept inside the top edge of the world, tall enough for its label. */
const WALL_BAR = { w: 200, h: 20, y: 8 };

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '15px',
  color: '#fff8e6',
  stroke: '#1d1b18',
  strokeThickness: 4,
  align: 'center',
};

interface BuildingSlot {
  level: number;
  sprites: Phaser.GameObjects.Sprite[];
  label: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  dust: Phaser.GameObjects.Sprite;
}

/**
 * The shared map with our own corner in full detail: everything here is cosmetic, driven by the
 * latest state from the server. Our region keeps the old castle scene's coordinates (see world.ts);
 * the other corners only show their castle, since that is all anyone knows about them.
 */
export class WorldScene extends Phaser.Scene {
  /** Set by main.ts: called when the player clicks a building. */
  onBuildingClick: (type: BuildingType) => void = () => {};
  /** Set by main.ts: the minimap is drawn from the scene's own frame loop. */
  minimap: Minimap | null = null;
  private dragged = false;
  private map: MapStateView | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  private state: CastleView | null = null;
  private ready = false;
  private loadFailed = false;
  private buildings = new Map<BuildingType, BuildingSlot>();
  private workers!: Workers;
  private soldiers!: Soldiers;
  private movers!: Movers;
  private fog!: Fog;
  private battles!: BattlePlayer;
  private pendingBattles: BattleStartedView[] = [];
  /** Battles we can see but are not in: just a cloud of dust and crossed swords where they are. */
  private markers = new Map<string, Phaser.GameObjects.GameObject[]>();
  private trees: { sprite: Phaser.GameObjects.Sprite; tile: Vec }[] = [];
  /** The server's clock at the last castle state, and when that arrived (to run it on between ticks). */
  private clock = { elapsed: 0, at: performance.now(), speed: 1 };
  private otherCastles = new Map<number, { image: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; name: string }>();
  private castleSprite!: Phaser.GameObjects.Image;
  private wallBar!: Phaser.GameObjects.Graphics;
  private wallText!: Phaser.GameObjects.Text;
  private lastWallHp: number | null = null;

  /** <paramref name="color"/>: the player's colour; units and buildings are drawn in it. */
  constructor(private readonly color: PlayerColor, private readonly layout: MapLayoutView, private readonly mySeat: number) {
    super('world');
    setWorldOrigin(this.ownRegion.origin);
  }

  private get ownRegion(): RegionView {
    return this.layout.regions.find((r) => r.seat === this.mySeat) ?? this.layout.regions[0];
  }

  preload(): void {
    this.load.on('loaderror', () => { this.loadFailed = true; });
    preloadAssets(this, this.color, this.otherColors);
  }

  create(): void {
    if (this.loadFailed) {
      this.add.text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2,
        'Görseller bulunamadı.\nTiny Swords Free Pack\'i client/public/assets/tiny-swords/ içine aç (README).',
        { ...LABEL_STYLE, fontSize: '22px' }).setOrigin(0.5);
      return;
    }
    createAnimations(this, this.color, this.otherColors);
    this.drawGround();
    this.drawRoads();
    this.drawForest();
    this.drawOtherCastles();
    this.castleSprite = this.add.image(CASTLE.x, CASTLE.y, 'castle').setOrigin(0.5, 1).setScale(CASTLE.scale).setDepth(CASTLE.y);
    this.wallBar = this.add.graphics().setDepth(10_002);
    this.wallText = this.add.text(CASTLE.x, WALL_BAR.y + WALL_BAR.h / 2, '', { ...LABEL_STYLE, fontSize: '13px' })
      .setOrigin(0.5).setDepth(10_003);
    for (const type of Object.keys(SITES) as BuildingType[]) this.createSite(type);
    this.workers = new Workers(this);
    this.soldiers = new Soldiers(this);
    this.movers = new Movers(this, this.color);
    this.fog = new Fog(this, this.layout.size);
    this.battles = new BattlePlayer(this, this.color, () => this.gameNow(), (seat) => this.courtyardOf(seat));
    for (const b of this.pendingBattles) this.battles.start(b);
    this.pendingBattles = [];
    this.setupCamera();
    this.ready = true;
    if (this.state) this.apply(this.state);
    if (this.map) this.setMap(this.map);
  }

  /** What we see on the map this tick. */
  setMap(state: MapStateView): void {
    this.map = state;
    if (!this.ready) return;
    this.movers.sync(state);
    this.syncMarkers(state);
  }

  private syncMarkers(state: MapStateView): void {
    const replaying = new Set(this.battles.active.map((b) => b.id));
    const shown = new Set(state.battles.filter((b) => !replaying.has(b.id)).map((b) => b.id));
    for (const [id, parts] of this.markers) {
      if (shown.has(id)) continue;
      parts.forEach((p) => p.destroy());
      this.markers.delete(id);
    }
    for (const b of state.battles) {
      if (!shown.has(b.id) || this.markers.has(b.id)) continue;
      const p = toWorld(b.at);
      const dust = this.add.sprite(p.x, p.y, 'dust').setScale(3).setDepth(p.y).setAlpha(0.9);
      dust.play('dust');
      const label = this.add.text(p.x, p.y - 46, '⚔ Savaş', { ...LABEL_STYLE, fontSize: '16px' }).setOrigin(0.5, 1).setDepth(10_000);
      this.tweens.add({ targets: label, scale: 1.12, duration: 500, yoyo: true, repeat: -1 });
      this.markers.set(b.id, [dust, label]);
    }
  }

  /** A battle we fight in: replayed on the map from its record. */
  playBattle(battle: BattleStartedView): void {
    if (this.ready) this.battles.start(battle);
    else this.pendingBattles.push(battle);
  }

  /** The server's game time right now, run on from the last castle state at the game speed. */
  private gameNow(): { now: number; speed: number } {
    const { elapsed, at, speed } = this.clock;
    return { now: elapsed + Math.min(((performance.now() - at) / 1000) * speed, 1.5 * speed), speed };
  }

  /** Where a player's soldiers stand at home (scene pixels). */
  private courtyardOf(seat: number): { x: number; y: number } | null {
    const region = this.layout.regions.find((r) => r.seat === seat);
    if (!region) return null;
    const o = toWorld(region.origin);
    return { x: o.x + (COURTYARD.left + COURTYARD.right) / 2, y: o.y + (COURTYARD.top + COURTYARD.bottom) / 2 };
  }

  /** Players who fell: their castle greys out. */
  setRoom(room: RoomView): void {
    for (const p of room.players) {
      const c = this.otherCastles.get(p.seat);
      if (!c) continue;
      c.image.setAlpha(p.eliminated ? 0.45 : 1);
      c.label.setText(p.eliminated ? `${c.name} (düştü)` : c.name);
    }
  }

  /** Point the camera at a spot on the map (minimap clicks). */
  lookAt(tile: Vec): void {
    const p = toWorld(tile);
    this.cameras.main.centerOn(p.x, p.y);
  }

  private get otherColors(): PlayerColor[] {
    return this.layout.regions.map((r) => r.color).filter((c): c is PlayerColor => !!c && c !== this.color);
  }

  /** Back to our own castle (button and space bar). */
  centerOnCastle(): void {
    const cam = this.cameras.main;
    // The whole castle (a region and a little margin) fits on screen.
    cam.setZoom(Phaser.Math.Clamp(Math.min(cam.width / 1100, cam.height / 830), this.minZoom(), MAX_ZOOM));
    cam.centerOn(CASTLE.x, CASTLE.y - 120);
  }

  /** The map always fills the view: never zoom out further than this. */
  private minZoom(): number {
    const cam = this.cameras.main, size = this.layout.size * TILE;
    return Math.max(cam.width / size, cam.height / size);
  }

  setState(state: CastleView): void {
    this.state = state;
    if (this.ready) this.apply(state);
  }

  update(_time: number, delta: number): void {
    if (!this.ready) return;
    const dt = Math.min(delta, 100) / 1000;
    this.workers.update(dt);
    this.movers.update(dt);
    this.battles.update();
    this.clearTreesAroundBattles(dt);
    this.panWithKeys(dt);
    if (this.map) {
      // The castle's circle comes from the server; the walking circles follow the drawn armies and scouts.
      const fixed = this.map.vision.slice(0, 1);
      const moving = this.movers.ownVision();
      this.fog.draw(fixed, moving);
      const view = this.cameras.main.worldView;
      const tl = toTiles({ x: view.x, y: view.y });
      const battles = [...this.map.battles.map((b) => b.at), ...this.battles.active.map((b) => b.at)];
      this.minimap?.draw([...fixed, ...moving], this.movers.all(), { x: tl.x, y: tl.y, w: view.width / TILE, h: view.height / TILE }, battles);
    }
  }

  private apply(s: CastleView): void {
    for (const b of s.buildings) this.updateBuilding(b, s);
    this.workers.sync(s.jobs);
    this.soldiers.sync(s.units);
    this.movers.setGameSpeed(s.speed);
    this.clock = { elapsed: s.elapsedSeconds, at: performance.now(), speed: s.speed };
    this.updateWall(s);
  }

  /** Castle HP bar above the towers, label inside it; the castle flashes red when it takes damage. */
  private updateWall(s: CastleView): void {
    const { wallHp, maxWallHp } = s.war;
    const { w, h, y } = WALL_BAR, x = CASTLE.x - w / 2;
    const p = Math.max(0, wallHp / maxWallHp);
    this.wallBar.clear();
    this.wallBar.fillStyle(0x1d1b18, 0.85).fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 4);
    this.wallBar.fillStyle(p < 0.35 ? 0xc2453a : 0x6fae4a).fillRoundedRect(x, y, w * p, h, 3);
    this.wallText.setText(s.eliminated ? 'Kale düştü' : `Kale ${Math.ceil(wallHp)} / ${maxWallHp}`);
    if (this.lastWallHp !== null && wallHp < this.lastWallHp - 1e-6) {
      this.castleSprite.setTint(0xff6b5e);
      this.cameras.main.shake(250, 0.004);
      this.time.delayedCall(400, () => this.castleSprite.clearTint());
    }
    this.lastWallHp = wallHp;
    this.castleSprite.setAlpha(s.eliminated ? 0.55 : 1);
  }

  // ---- ground ------------------------------------------------------------------------------

  /** The whole map: one grass island inside a one-tile water border. */
  private drawGround(): void {
    const topLeft = toWorld({ x: 0, y: 0 });
    const cols = this.layout.size, rows = this.layout.size;
    this.add.tileSprite(topLeft.x, topLeft.y, cols * TILE, rows * TILE, 'water').setOrigin(0).setDepth(DEPTH_WATER);
    const data = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return -1;
      const top = y === 1, bottom = y === rows - 2, left = x === 1, right = x === cols - 2;
      if (top) return left ? GRASS.tl : right ? GRASS.tr : GRASS.t;
      if (bottom) return left ? GRASS.bl : right ? GRASS.br : GRASS.b;
      return left ? GRASS.l : right ? GRASS.r : GRASS.c;
    }));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    map.createLayer(0, tiles, topLeft.x, topLeft.y)!.setDepth(DEPTH_GROUND);
  }

  /** Dirt roads between the gates, round the forest and through it. */
  private drawRoads(): void {
    const g = this.add.graphics().setDepth(DEPTH_ROAD);
    for (const [width, color] of [[54, ROAD_EDGE], [42, ROAD_COLOR]] as const) {
      g.lineStyle(width, color, 1);
      for (const road of this.layout.roads) {
        const pts = road.points.map(toWorld);
        g.strokePoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), false, false);
        g.fillStyle(color, 1);
        for (const p of pts) g.fillCircle(p.x, p.y, width / 2); // round corners
      }
    }
  }

  /** Trees fill the forest, leaving the roads through it clear. Seeded, so everyone sees the same forest. */
  private drawForest(): void {
    const rnd = seeded(7);
    for (const forest of this.layout.features.filter((f) => f.kind === 'forest')) {
      const count = Math.round(forest.radius * forest.radius * 1.7);
      for (let i = 0, placed = 0; i < count * 4 && placed < count; i++) {
        const angle = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * forest.radius;
        const p = { x: forest.center.x + Math.cos(angle) * r, y: forest.center.y + Math.sin(angle) * r };
        const clearOfRoads = this.layout.roads.every((road) =>
          road.points.slice(1).every((b, j) => distanceToSegment(p, road.points[j], b) > 1.1));
        if (!clearOfRoads) continue;
        placed++;
        const w = toWorld(p);
        const key = rnd() < 0.5 ? 'tree1' : 'tree2';
        const sprite = this.add.sprite(w.x, w.y, key).setOrigin(0.5, 0.9).setScale(0.75 + rnd() * 0.25).setDepth(w.y);
        sprite.play({ key, startFrame: Math.floor(rnd() * 4) });
        this.trees.push({ sprite, tile: p });
      }
    }
  }

  /** Trees near any battle we can see fade out, and come back when it is over. */
  private clearTreesAroundBattles(dt: number): void {
    const spots = [...(this.map?.battles.map((b) => b.at) ?? []), ...this.battles.active.map((b) => b.at)];
    const k = Math.min(1, dt * 8);
    for (const t of this.trees) {
      const near = spots.some((s) => Math.hypot(t.tile.x - s.x, t.tile.y - s.y) < BATTLE_CLEARING);
      const goal = near ? TREE_FADED_ALPHA : 1;
      if (Math.abs(t.sprite.alpha - goal) > 0.01) t.sprite.setAlpha(t.sprite.alpha + (goal - t.sprite.alpha) * k);
    }
  }

  /** The other players' castles in their colour: where they are is public, what is inside is not. */
  private drawOtherCastles(): void {
    for (const r of this.layout.regions) {
      if (r.seat === null || r.seat === this.mySeat || !r.color) continue;
      const base = toWorld(r.origin);
      const x = base.x + CASTLE.x, y = base.y + CASTLE.y;
      const image = this.add.image(x, y, `castle-${r.color}`).setOrigin(0.5, 1).setScale(CASTLE.scale).setDepth(y);
      const label = this.add.text(x, y + 16, r.name ?? '', LABEL_STYLE).setOrigin(0.5, 0).setDepth(10_000);
      this.otherCastles.set(r.seat, { image, label, name: r.name ?? '' });
    }
  }

  // ---- camera ------------------------------------------------------------------------------

  /** Drag (or WASD / arrows) to look around, wheel to zoom; starts on our own castle. */
  private setupCamera(): void {
    const cam = this.cameras.main;
    const topLeft = toWorld({ x: 0, y: 0 });
    const size = this.layout.size * TILE;
    cam.setBounds(topLeft.x, topLeft.y, size, size);
    this.centerOnCastle();
    // The canvas is the whole window: when it changes size, keep the map filling it.
    this.scale.on('resize', () => cam.setZoom(Math.max(cam.zoom, this.minZoom())));

    let drag: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      drag = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!drag || !p.isDown) return;
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (!this.dragged && Math.hypot(dx, dy) < 6) return; // a click, not a drag
      this.dragged = true;
      cam.setScroll(drag.scrollX - dx / cam.zoom, drag.scrollY - dy / cam.zoom);
    });
    this.input.on('pointerup', () => { drag = null; });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), this.minZoom(), MAX_ZOOM));
      cam.preRender(); // update the view matrix before measuring again
      const after = cam.getWorldPoint(p.x, p.y);
      cam.setScroll(cam.scrollX + before.x - after.x, cam.scrollY + before.y - after.y);
    });

    // No key capture: the panel's inputs keep their keys.
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown-SPACE', () => { if (!typingInPanel()) this.centerOnCastle(); });
    }
  }

  private panWithKeys(dt: number): void {
    if (typingInPanel()) return;
    const k = this.keys;
    const x = (k.D?.isDown || k.RIGHT?.isDown ? 1 : 0) - (k.A?.isDown || k.LEFT?.isDown ? 1 : 0);
    const y = (k.S?.isDown || k.DOWN?.isDown ? 1 : 0) - (k.W?.isDown || k.UP?.isDown ? 1 : 0);
    if (x === 0 && y === 0) return;
    const cam = this.cameras.main;
    cam.setScroll(cam.scrollX + (x * PAN_SPEED * dt) / cam.zoom, cam.scrollY + (y * PAN_SPEED * dt) / cam.zoom);
  }

  // ---- buildings ---------------------------------------------------------------------------

  private createSite(type: BuildingType): void {
    const site = SITES[type];
    const { x, y } = site.center;
    const zone = this.add.zone(x, y, site.area.w, site.area.h).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => { if (!this.dragged) this.onBuildingClick(type); });
    const label = this.add.text(x, y + site.area.h / 2 - 10, '', LABEL_STYLE).setOrigin(0.5, 1).setDepth(10_000);
    const bar = this.add.graphics().setDepth(10_001);
    const dust = this.add.sprite(x, y, 'dust').setScale(2).setDepth(9_000).setVisible(false);
    this.buildings.set(type, { level: 0, sprites: [], label, bar, dust });
  }

  private updateBuilding(b: BuildingView, s: CastleView): void {
    const slot = this.buildings.get(b.type)!;
    const site = SITES[b.type];
    if (slot.level !== b.level) {
      for (const sprite of slot.sprites) sprite.destroy();
      slot.sprites = site.parts(b.level).map((p) => this.placePart(p));
      slot.level = b.level;
    }

    const workers = s.jobs.find((j) => j.job === b.worker)?.count ?? 0;
    slot.label.setText(`${b.name} · Sv ${b.level}   ${workers}/${b.capacity}`);

    slot.bar.clear();
    const upgrading = b.upgradeRemaining !== null;
    slot.dust.setVisible(upgrading);
    if (upgrading) {
      if (!slot.dust.anims.isPlaying) slot.dust.play('dust');
      const w = 140, x = site.center.x - w / 2, y = site.center.y - site.area.h / 2 + 4;
      const p = 1 - b.upgradeRemaining! / b.upgradeTotal;
      slot.bar.fillStyle(0x1d1b18, 0.85).fillRoundedRect(x - 2, y - 2, w + 4, 12, 4);
      slot.bar.fillStyle(0xffd84a).fillRoundedRect(x, y, w * p, 8, 3);
    }
  }

  private placePart(p: Part): Phaser.GameObjects.Sprite {
    const flat = /^(sheep|stone|rock|wood-pile|bush|stump)/.test(p.key);
    const sprite = this.add.sprite(p.x, p.y, p.key)
      .setOrigin(0.5, flat ? 0.7 : 0.9)
      .setScale(p.scale ?? 1)
      .setFlipX(!!p.flip)
      .setDepth(p.y);
    if (p.grey) sprite.preFX?.addColorMatrix().grayscale(0.9).brightness(1.05, true);
    if (p.anim) sprite.play({ key: p.key, startFrame: Phaser.Math.Between(0, 3) });
    return sprite;
  }
}

/** True while the player types in the side panel (keys then belong to the input, not the camera). */
function typingInPanel(): boolean {
  const el = document.activeElement;
  return !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
}
