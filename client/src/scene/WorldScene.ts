import Phaser from 'phaser';
import type { ArmyView, Rect, ScoutReportView, SpectatorCastleView, SpectatorStateView, BattleStartedView, BuildingType, BuildingView, CastleView, MapLayoutView, MapStateView, PlayerColor, RegionView, RoomView, Vec } from '../types';
import { guarded, reportError } from '../error-report';
import type { Minimap } from '../minimap';
import type { Anchor, Target } from '../ui/windows';
import type { WorldLabels } from '../ui/world-labels';
import { COLOR_CSS, esc } from '../format';
import { makeCampfire, newUnitArtJobs } from './NewUnits';
import { createAnimations, loadSpectatorAssets, preloadAssets } from './assets';
import { CAMP, CASTLE, SITES, TILE, WORLD_HEIGHT, WORLD_WIDTH } from './layout';
import { distanceToSegment, seeded, setWorldOrigin, toTiles, toWorld } from './world';
import { buildingSign, placePart, setShadeHook, sign } from './parts';
import { RegionDisplay } from './RegionDisplay';
import { SiteLayer } from './Sites';
import { scoutSignHtml } from '../ui/scout-report';
import { BattlePlayer } from './BattlePlayer';
import { Effects } from './Effects';
import { Fog } from './Fog';
import { Movers } from './Movers';
import { Soldiers } from './Soldiers';
import { Terrain } from './Terrain';
import { bakeRoads, placeSignposts } from './Roads';
import { WallRing } from './Walls';
import { Workers } from './Workers';

const MAX_ZOOM = 1.5;
/** Open water all round the map (tiles), so the camera can centre a castle that sits in a corner. Roads and coordinates are untouched. */
const WATER_PAD = 14;
const PAN_SPEED = 900; // px per second at zoom 1 (keyboard)
// Things stand in front of each other by their y; parts of the map lie at negative y, so the ground
// layers sit far below anything that can stand on them.
/** Trees this close (tiles) to a battle turn see-through so the fighting stays visible. */
const BATTLE_CLEARING = 4;
const TREE_FADED_ALPHA = 0.3;
const DEPTH_WATER = -100_000, DEPTH_GROUND = -90_000, DEPTH_ROAD = -80_000;

// Tilemap_color1: the flat grass island is the 3×3 block in the top-left of the sheet (9 tiles per row).
const GRASS = { tl: 0, t: 1, tr: 2, l: 9, c: 10, r: 11, bl: 18, b: 19, br: 20 };

/** Where the castle's health sign hangs: just inside the top edge of the world. */
const WALL_SIGN_Y = 8;

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
  dust: Phaser.GameObjects.Sprite;
}


/**
 * The shared map with our own corner in full detail: everything here is cosmetic, driven by the
 * latest state from the server. Our region keeps the old castle scene's coordinates (see world.ts);
 * the other corners only show their castle, since that is all anyone knows about them.
 */
export class WorldScene extends Phaser.Scene {
  /** Set by main.ts: the player clicked something on the map (a window opens for it). */
  onSelect: (target: Target) => void = () => {};
  /** Set by main.ts: the player clicked empty ground. */
  onDeselect: () => void = () => {};
  /** Set by main.ts: once per frame, so the open window can follow its target. */
  onFrame: () => void = () => {};
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
  private terrain!: Terrain;
  /** The roads, baked into textures once (see drawRoads). */
  private battles!: BattlePlayer;
  /** Called once the map is built (the screen is still under the clouds until then). */
  onReady?: () => void;
  private pendingBattles: BattleStartedView[] = [];
  /** Battles we can see but are not in: just a cloud of dust and crossed swords where they are. */
  private markers = new Map<string, Phaser.GameObjects.GameObject[]>();
  /** The signs over the map (HTML, set by the UI when it takes the scene). */
  labels!: WorldLabels;
  private trees: { sprite: Phaser.GameObjects.Sprite; tile: Vec }[] = [];
  /** The server's clock at the last castle state, and when that arrived (to run it on between ticks). */
  private clock = { elapsed: 0, at: performance.now(), speed: 1 };
  private otherCastles = new Map<number, { image: Phaser.GameObjects.Image; name: string; color: PlayerColor; fallen?: boolean }>();
  /** The latest scout report per rival (by seat), for the sign under their castle. */
  private reports = new Map<number, ScoutReportView>();
  private reportClock = 0;
  /** A fallen player sees every castle's inside, a fixed delay behind the game (see setSpectator). */
  private spectating = false;
  private pendingSpectator: SpectatorStateView | null = null;
  private regions = new Map<number, RegionDisplay>();
  private spectatorAssets: 'none' | 'loading' | 'ready' = 'none';
  /** The places of the forest we have found. */
  sites!: SiteLayer;
  private castleSprite!: Phaser.GameObjects.Image;
  /** The walls round the regions, by seat. */
  private walls = new Map<number, WallRing>();
  /** Our own castle: has it fallen (null: not seen yet, so a castle already down is shown as a ruin without the show)? */
  private ownFallen: boolean | null = null;
  private lastPhase: string | null = null;
  private fx!: Effects;

  /** <paramref name="color"/>: the player's colour; units and buildings are drawn in it. */
  /** <paramref name="seed"/>: the room's (everybody in it draws the same decorations). */
  constructor(private readonly color: PlayerColor, private readonly layout: MapLayoutView, private readonly mySeat: number, private readonly seed = 1) {
    super('world');
    setWorldOrigin(this.ownRegion.origin);
  }

  private get ownRegion(): RegionView {
    return this.layout.regions.find((r) => r.seat === this.mySeat) ?? this.layout.regions[0];
  }

  preload(): void {
    this.load.on('loaderror', () => { this.loadFailed = true; });
    preloadAssets(this, this.color, [...this.otherColors, 'black']);
  }

  create(): void {
    if (this.loadFailed) {
      this.add.text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2,
        'Görseller bulunamadı.\nTiny Swords Free Pack\'i client/public/assets/tiny-swords/ içine aç (README).',
        { ...LABEL_STYLE, fontSize: '22px' }).setOrigin(0.5);
      return;
    }
    createAnimations(this, this.color, [...this.otherColors, 'black']);
    makeCampfire(this);
    const ground = this.drawGround();
    this.terrain = new Terrain(this, this.layout, this.seed, ground);
    setShadeHook((x, y, w, h) => this.terrain.shade(x, y, w, h));
    this.drawRoads();
    this.drawForest();
    this.drawOtherCastles();
    this.drawWalls();
    this.makeForestClickable();
    this.terrain.shade(CASTLE.x, CASTLE.y - 6, 470, 130);
    this.castleSprite = this.add.image(CASTLE.x, CASTLE.y, 'castle').setOrigin(0.5, 1).setScale(CASTLE.scale).setDepth(CASTLE.y);
    this.castleSprite.setInteractive({ useHandCursor: true }).on('pointerup', () => this.select({ kind: 'castle' }));
    for (const type of Object.keys(SITES) as BuildingType[]) this.createSite(type);
    this.workers = new Workers(this, this.labels);
    this.soldiers = new Soldiers(this, this.labels);
    this.movers = new Movers(this, this.color, this.labels);
    this.sites = new SiteLayer(this, this.labels, (id) => this.select({ kind: 'site', id }));
    this.movers.onSelect = (t) => this.select(t);
    this.movers.inReplay = (at) => this.battles?.active.some((b) => Math.hypot(b.at.x - at.x, b.at.y - at.y) < 2.5) ?? false;
    this.fog = new Fog(this, this.layout.size);
    this.fx = new Effects(this);
    this.battles = new BattlePlayer(this, this.color, () => this.gameNow(), (seat) => this.courtyardOf(seat), this.fx);
    for (const b of this.pendingBattles) this.battles.start(b);
    this.pendingBattles = [];
    this.setupCamera();
    this.ready = true;
    this.buildNewUnitArt();
    this.onReady?.(); // the clouds part and the camera is already on our castle
    if (this.state) this.apply(this.state);
    if (this.map) this.setMap(this.map);
    if (this.pendingSpectator) this.setSpectator(this.pendingSpectator);
  }

  /**
   * The cavalry and catapult art takes a couple of seconds to draw. At the start of a match nobody has any, so it is drawn one strip per
   * frame while the game begins; a map joined later (a reload mid-match) draws it at once, as soldiers may be using it already.
   */
  private buildNewUnitArt(): void {
    const colors = [...this.otherColors].filter((c) => c !== 'black');
    const jobs = newUnitArtJobs(this, this.color, colors);
    if ((this.state?.elapsedSeconds ?? 0) > 20) { for (const job of jobs) job(); return; }
    this.time.addEvent({ delay: 16, repeat: jobs.length - 1, callback: () => { jobs.shift()?.(); } });
  }

  /** What we see on the map this tick. */
  setMap(state: MapStateView): void {
    if (this.spectating) return; // the spectator pictures decide what is drawn
    this.map = state;
    if (!this.ready) return;
    this.movers.sync(state);
    this.syncMarkers(state);
    this.sites.sync(state.sites, state.elapsedSeconds);
  }

  private syncMarkers(state: MapStateView): void {
    const replaying = new Set(this.battles.active.map((b) => b.id));
    const shown = new Set(state.battles.filter((b) => !replaying.has(b.id)).map((b) => b.id));
    for (const [id, parts] of this.markers) {
      if (shown.has(id)) continue;
      parts.forEach((p) => p.destroy());
      this.labels.remove(`battle:${id}`);
      this.markers.delete(id);
    }
    for (const b of state.battles) {
      if (!shown.has(b.id) || this.markers.has(b.id)) continue;
      const p = toWorld(b.at);
      const dust = this.add.sprite(p.x, p.y, 'dust').setScale(3).setDepth(p.y).setAlpha(0.9);
      dust.play('dust');
      this.labels.set(`battle:${b.id}`, { x: p.x, y: p.y - 46, html: sign('<i class="ico ico-sword"></i><b>Savaş</b>', 'wl-fight') });
      this.markers.set(b.id, [dust]);
    }
  }

  /** A battle we fight in: replayed on the map from its record. */
  playBattle(battle: BattleStartedView): void {
    if (this.ready) this.battles.start(battle);
    else this.pendingBattles.push(battle);
  }

  private auditIn = 1;
  private auditReported = new Set<string>();

  /** Once a second: one army, one drawing. A doubled or stray column is reported once (and shows in the dev console). */
  private auditMovers(dt: number): void {
    this.auditIn -= dt;
    if (this.auditIn > 0) return;
    this.auditIn = 1;
    for (const p of this.movers.audit()) {
      if (this.auditReported.has(p)) continue;
      this.auditReported.add(p);
      reportError('mover-audit', new Error(p), { source: 'movers' });
    }
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
    return { x: o.x + CAMP.x, y: o.y + CAMP.y };
  }

  /** Players who fell: their castle greys out. */
  setRoom(room: RoomView): void {
    for (const p of room.players) {
      const c = this.otherCastles.get(p.seat);
      if (!c) continue;
      this.markFallen(p.seat, c, p.eliminated);
      this.setEnemySign(p.seat, c, p.eliminated);
    }
  }

  /** Another player's castle falls (everybody sees it: it is public): fireballs and a collapse; one already down when we first look is just a ruin. */
  private markFallen(seat: number, c: { image: Phaser.GameObjects.Image; fallen?: boolean }, fallen: boolean): void {
    const was = c.fallen;
    c.fallen = fallen;
    c.image.setAlpha(fallen ? 0.45 : 1);
    if (fallen) this.walls.get(seat)?.ruin(this.fx);
    if (fallen && was === false) this.fx.collapse(c.image, c.image.x, c.image.y, CASTLE.scale);
    else if (fallen && was === undefined) this.fx.ruin(c.image, CASTLE.scale);
  }

  /** The sign under another player's castle: their name, and the last scout report we have of it. */
  private setEnemySign(seat: number, c: { name: string; color: PlayerColor }, fallen: boolean): void {
    const region = this.layout.regions.find((r) => r.seat === seat)!;
    const base = toWorld(region.origin);
    const name = sign(`<i class="dot" style="background:${COLOR_CSS[c.color] ?? '#888'}"></i><b>${esc(c.name)}</b>${fallen ? ' <small>(düştü)</small>' : ''}`);
    // The last scout report stays under the castle: what we know of it, and how old that is. (A spectator sees all, so no report.)
    const report = this.spectating ? undefined : this.reports.get(seat);
    this.labels.set(`castle:${seat}`, {
      x: base.x + CASTLE.x, y: base.y + CASTLE.y + 16, anchor: 'top',
      html: `<div class="wl-stack">${name}${report ? scoutSignHtml(report, this.reportClock) : ''}</div>`,
    });
  }

  // ---- spectating ----------------------------------------------------------------------------

  /**
   * A picture of the whole world for a player whose castle has fallen (the server sends them a fixed time late):
   * no fog, every castle's inside, every army and scout. Our own castle goes on being drawn by the normal code,
   * fed from the picture instead of the live state.
   */
  setSpectator(frame: SpectatorStateView): void {
    if (!this.ready) { this.pendingSpectator = frame; return; }
    // The other colours sheets are loaded the first time (a moment); the newest picture waits for them.
    if (this.spectatorAssets !== 'ready') {
      this.pendingSpectator = frame;
      if (this.spectatorAssets === 'none') {
        this.spectatorAssets = 'loading';
        loadSpectatorAssets(this, this.otherColors, () => {
          this.spectatorAssets = 'ready';
          if (this.pendingSpectator) this.setSpectator(this.pendingSpectator);
        });
      }
      return;
    }
    this.pendingSpectator = null;
    if (!this.spectating) this.enterSpectator();
    for (const c of frame.castles) {
      if (c.seat === this.mySeat) this.applyOwnPicture(c, frame.elapsedSeconds);
      else this.applyOtherPicture(c);
    }
    // Armies, scouts and battles come as what others see of each other, but all of them; the clock is the picture's.
    const map: MapStateView = { elapsedSeconds: frame.elapsedSeconds, vision: [], own: [], seen: frame.movers, battles: frame.battles, trail: [], sites: frame.sites };
    this.map = map;
    this.movers.sync(map);
    this.syncMarkers(map);
    this.sites.sync(frame.sites, frame.elapsedSeconds);
    this.clock = { elapsed: frame.elapsedSeconds, at: performance.now(), speed: this.state?.speed ?? 1 };
  }

  private enterSpectator(): void {
    this.spectating = true;
    this.fog.setVisible(false);
    if (this.minimap) this.minimap.fogless = true;
    for (const r of this.layout.regions) {
      if (r.seat === null || r.seat === this.mySeat) continue;
      if (r.color) this.regions.set(r.seat, new RegionDisplay(this, this.labels, r.seat, toWorld(r.origin), r.color, this.color));
    }
  }

  private applyOwnPicture(c: SpectatorCastleView, elapsed: number): void {
    if (!this.state) return;
    this.apply({
      ...this.state, buildings: c.buildings, jobs: c.jobs, units: c.units, elapsedSeconds: elapsed, eliminated: c.eliminated,
    });
  }

  private applyOtherPicture(c: SpectatorCastleView): void {
    this.regions.get(c.seat)?.sync(c);
    const castle = this.otherCastles.get(c.seat);
    if (!castle) return;
    this.markFallen(c.seat, castle, c.eliminated);
    this.setEnemySign(c.seat, castle, c.eliminated);
  }

  /** Point the camera at a spot on the map (minimap clicks). */
  lookAt(tile: Vec): void {
    const p = toWorld(tile);
    this.cameras.main.centerOn(p.x, p.y);
  }

  /** Other players' corners (tiles): what the trail of our scouts does not open. */
  private get foreignRegions(): Rect[] {
    return this.layout.regions.filter((r) => r.seat !== null && r.seat !== this.mySeat)
      .map((r) => ({ x: r.origin.x, y: r.origin.y, w: r.width, h: r.height }));
  }

  private get otherColors(): PlayerColor[] {
    return this.layout.regions.map((r) => r.color).filter((c): c is PlayerColor => !!c && c !== this.color);
  }

  /** A click on a thing on the map (not the end of a drag). */
  private select(target: Target): void {
    if (!this.dragged && !this.spectating) this.onSelect(target);
  }

  /** Look at the castle a window is about (an enemy's is far away; ours is where the camera starts). */
  focus(target: Target): void {
    if (target.kind === 'castle') { this.centerOnCastle(); return; }
    if (target.kind !== 'enemy') return;
    const region = this.layout.regions.find((r) => r.seat === target.seat);
    if (!region) return;
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(Math.min(cam.width / 1100, cam.height / 830), this.minZoom(), MAX_ZOOM));
    this.lookAt({ x: region.origin.x + CASTLE.x / TILE, y: region.origin.y + (CASTLE.y - 120) / TILE });
  }

  /** The middle of the map: the forest with the big camp, far enough out to see most of it. */
  focusForest(): void {
    const cam = this.cameras.main, size = this.layout.size;
    cam.setZoom(Phaser.Math.Clamp(Math.min(cam.width, cam.height) / (size * TILE * 0.45), this.minZoom(), MAX_ZOOM));
    this.lookAt({ x: size / 2, y: size / 2 });
  }

  /** Where a point of the scene (px) is on the screen (CSS px). The canvas fills the window. */
  screenOf(p: { x: number; y: number }): { x: number; y: number } {
    const cam = this.cameras.main, v = cam.worldView;
    return { x: (p.x - v.x) * cam.zoom, y: (p.y - v.y) * cam.zoom };
  }

  /** The screen position (and rough half-width) of what a window is about; null if it has no place. */
  anchorOf(target: Target): Anchor | null {
    const zoom = this.cameras.main.zoom;
    const at = (x: number, y: number, reach: number): Anchor => ({ ...this.screenOf({ x, y }), reach: reach * zoom });
    switch (target.kind) {
      case 'building': {
        const site = SITES[target.type];
        return at(site.center.x, site.center.y, site.area.w / 2);
      }
      case 'castle': return at(CASTLE.x, CASTLE.y - 150, 190);
      case 'enemy': {
        const region = this.layout.regions.find((r) => r.seat === target.seat);
        if (!region) return null;
        const base = toWorld(region.origin);
        return at(base.x + CASTLE.x, base.y + CASTLE.y - 150, 190);
      }
      case 'forest': {
        // The middle of the quarter that was clicked.
        const forest = this.layout.features.find((f) => f.kind === 'forest');
        if (!forest) return null;
        const p = toWorld(forest.center), r = forest.radius * TILE * 0.5;
        const dx = target.id.endsWith('West') ? -1 : 1, dy = target.id.startsWith('north') ? -1 : 1;
        return at(p.x + dx * r, p.y + dy * r, 150);
      }
      case 'site': {
        const p = this.sites.positionOf(target.id);
        return p ? at(p.x, p.y - 30, 70) : null;
      }
      default: {
        // One of our armies or scouts on the road.
        const p = this.movers.worldPosition(target);
        return p ? at(p.x, p.y - 20, 50) : null;
      }
    }
  }

  /** Our army that a click on the map meant: the n-th army of the map state is the n-th of the castle state. */
  resolveArmy(publicId: string): ArmyView | undefined {
    const own = this.map?.own.filter((o) => o.kind === 'army') ?? [];
    const i = own.findIndex((o) => o.id === publicId);
    if (i < 0) return undefined;
    const army = this.state?.war.armies[i];
    return army && army.targetSeat === own[i].targetSeat && (army.state === 'returning') === own[i].returning ? army : undefined;
  }

  /**
   * The forest answers a click, below everything else that can be clicked: which quarter was clicked (by the corner
   * it belongs to) tells the window which tour to offer. The clickable area is the square the ring road makes.
   */
  private makeForestClickable(): void {
    for (const f of this.layout.features.filter((x) => x.kind === 'forest')) {
      const p = toWorld(f.center), half = (f.radius + 2) * TILE;
      const zone = this.add.zone(p.x, p.y, half * 2, half * 2).setDepth(-50_000).setInteractive({ useHandCursor: true });
      zone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const corner = `${pointer.worldY < p.y ? 'north' : 'south'}${pointer.worldX < p.x ? 'West' : 'East'}`;
        this.select({ kind: 'forest', id: corner });
      });
    }
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
    if (this.ready && this.lastPhase === 'preparation' && state.phase === 'war') this.cameras.main.flash(380, 255, 232, 180); // the war begins
    this.lastPhase = state.phase;
    this.state = state;
    if (this.ready && !this.spectating) {
      this.reports = new Map(state.scouting.reports.map((r) => [r.targetSeat, r]));
      this.reportClock = state.elapsedSeconds;
      for (const [seat, c] of this.otherCastles) this.setEnemySign(seat, c, !!c.fallen);
    }
    if (this.ready && !this.spectating) this.apply(state); // a spectator's castle is drawn from the delayed pictures
  }

  update(_time: number, delta: number): void {
    if (!this.ready) return;
    const dt = Math.min(delta, 100) / 1000;
    // The canvas is the whole window: follow it (Phaser does not always notice a window that shrinks).
    if (this.scale.gameSize.width !== window.innerWidth || this.scale.gameSize.height !== window.innerHeight)
      this.scale.resize(window.innerWidth, window.innerHeight);
    // Each part on its own: a failure in one must not end the frame loop (the whole picture would freeze).
    guarded('scene-update', () => this.terrain.update(dt, this.cameras.main.worldView), 'terrain');
    guarded('scene-update', () => this.workers.update(dt), 'workers');
    guarded('scene-update', () => { for (const r of this.regions.values()) r.update(dt); }, 'regions');
    guarded('scene-update', () => this.movers.update(dt), 'movers');
    guarded('scene-update', () => this.auditMovers(dt), 'audit');
    guarded('scene-update', () => this.battles.update(), 'battles');
    guarded('scene-update', () => this.onFrame(), 'onFrame');
    guarded('scene-update', () => this.clearTreesAroundBattles(dt), 'trees');
    guarded('scene-update', () => this.panWithKeys(dt), 'keys');
    if (this.map) {
      const map = this.map;
      // The castle's circle comes from the server; the walking circles follow the drawn armies and scouts.
      const fixed = map.vision.slice(0, 1);
      const moving = this.movers.ownVision();
      guarded('scene-update', () => { if (!this.spectating) this.fog.draw(fixed, moving, map.trail, this.foreignRegions); }, 'fog');
      guarded('scene-update', () => {
        const view = this.cameras.main.worldView;
        const tl = toTiles({ x: view.x, y: view.y });
        const battles = [...map.battles.map((b) => b.at), ...this.battles.active.map((b) => b.at)];
        this.minimap?.draw([...fixed, ...moving], this.movers.all(), { x: tl.x, y: tl.y, w: view.width / TILE, h: view.height / TILE }, battles, map.trail, this.foreignRegions,
          map.sites.map((s) => ({ position: s.position, kind: s.kind, gone: s.gone })));
      }, 'minimap');
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

  /** The sign above our castle; a fallen castle collapses (or, when we first look, is just a ruin). */
  private updateWall(s: CastleView): void {
    this.labels.set('castle:own', {
      x: CASTLE.x, y: WALL_SIGN_Y, anchor: 'top',
      html: `<div class="wl-stack">${sign(`<i class="ico ico-shield"></i><b>Kale</b>${s.eliminated ? ' <small>(düştü)</small>' : ''}`)}</div>`,
    });
    if (s.eliminated) this.walls.get(this.mySeat)?.ruin(this.fx);
    if (s.eliminated && this.ownFallen === false) this.fx.collapse(this.castleSprite, CASTLE.x, CASTLE.y, CASTLE.scale);
    else if (s.eliminated && this.ownFallen === null) this.fx.ruin(this.castleSprite, CASTLE.scale);
    this.ownFallen = s.eliminated;
    this.castleSprite.setAlpha(s.eliminated ? 0.55 : 1);
  }

  // ---- ground ------------------------------------------------------------------------------

  /** The whole map: one grass island inside a one-tile water border. */
  private drawGround(): Phaser.Tilemaps.TilemapLayer {
    const topLeft = toWorld({ x: 0, y: 0 });
    const cols = this.layout.size, rows = this.layout.size;
    this.add.tileSprite(topLeft.x - WATER_PAD * TILE, topLeft.y - WATER_PAD * TILE, (cols + 2 * WATER_PAD) * TILE, (rows + 2 * WATER_PAD) * TILE, 'water')
      .setOrigin(0).setDepth(DEPTH_WATER);
    const data = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return -1;
      const top = y === 1, bottom = y === rows - 2, left = x === 1, right = x === cols - 2;
      if (top) return left ? GRASS.tl : right ? GRASS.tr : GRASS.t;
      if (bottom) return left ? GRASS.bl : right ? GRASS.br : GRASS.b;
      return left ? GRASS.l : right ? GRASS.r : GRASS.c;
    }));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    return map.createLayer(0, tiles, topLeft.x, topLeft.y)!.setDepth(DEPTH_GROUND);
  }

  /**
   * Dirt roads between the gates, round the forest and through it. They never change, so they are drawn ONCE (a Graphics object that is not on
   * the display list) and baked into square textures, only those squares the roads touch: a frame then costs a few textured quads instead of
   * re-running hundreds of path commands.
   */
  private drawRoads(): void {
    const forest = this.layout.features.find((f) => f.kind === 'forest');
    const centre = forest ? toWorld(forest.center) : null;
    bakeRoads(this, this.layout.roads, this.layout.size, forest && centre ? { center: centre, radius: forest.radius * TILE } : null, DEPTH_ROAD);
    placeSignposts(this, this.layout.roads, this.seed);
    this.terrain.roadEdges(this.layout.roads, 28);
  }

  /** Trees fill the forest, leaving the roads through it clear. Seeded, so everyone sees the same forest. */
  private drawForest(): void {
    const rnd = seeded(7);
    for (const forest of this.layout.features.filter((f) => f.kind === 'forest')) {
      const count = Math.round(forest.radius * forest.radius * 1.7);
      this.undergrowth(forest.center, forest.radius, rnd);
      for (let i = 0, placed = 0; i < count * 4 && placed < count; i++) {
        const angle = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * forest.radius;
        const p = { x: forest.center.x + Math.cos(angle) * r, y: forest.center.y + Math.sin(angle) * r };
        const clearOfRoads = this.layout.roads.every((road) =>
          road.points.slice(1).every((b, j) => distanceToSegment(p, road.points[j], b) > 1.1));
        if (!clearOfRoads) continue;
        placed++;
        const w = toWorld(p);
        const key = rnd() < 0.5 ? 'tree1' : 'tree2';
        const scale = 0.75 + rnd() * 0.25;
        const sprite = this.add.sprite(w.x, w.y, key).setOrigin(0.5, 0.9).setScale(scale).setDepth(w.y);
        sprite.play({ key, startFrame: Math.floor(rnd() * 4) });
        // deeper into the forest the trees are darker (a multiply tint), and every tree stands in a soft shadow
        const deep = Math.max(0, 1 - r / forest.radius);
        sprite.setTint(Phaser.Display.Color.GetColor(255 - deep * 70, 255 - deep * 42, 255 - deep * 62));
        this.terrain.treeShadow(w.x, w.y, scale);
        this.trees.push({ sprite, tile: p });
      }
    }
  }

  /** Bushes between the trees (and clear of the roads through the forest). */
  private undergrowth(center: Vec, radius: number, rnd: () => number): void {
    for (let i = 0, placed = 0; i < 400 && placed < 34; i++) {
      const angle = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius * 0.92;
      const p = { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
      if (!this.layout.roads.every((road) => road.points.slice(1).every((b, j) => distanceToSegment(p, road.points[j], b) > 1.3))) continue;
      placed++;
      const w = toWorld(p), key = rnd() < 0.5 ? 'bush3' : 'bush4';
      this.add.sprite(w.x, w.y, key).setOrigin(0.5, 0.75).setScale(0.55 + rnd() * 0.25).setTint(0xa8c4a8).setDepth(w.y)
        .play({ key, startFrame: Math.floor(rnd() * 4) });
    }
  }

  /** Trees near any battle we can see fade out, and come back when it is over. */
  private clearTreesAroundBattles(dt: number): void {
    const spots = [...(this.map?.battles.map((b) => b.at) ?? []), ...this.battles.active.map((b) => b.at)];
    const k = Math.min(1, dt * 8);
    // The ground round a place we have found is cleared of trees (and trees near a battle turn see-through).
    const sites = this.sites?.tiles() ?? [];
    for (const t of this.trees) {
      const near = spots.some((s) => Math.hypot(t.tile.x - s.x, t.tile.y - s.y) < BATTLE_CLEARING);
      const cleared = sites.some((s) => Math.hypot(t.tile.x - s.position.x, t.tile.y - s.position.y) < (s.kind === 'bigCamp' ? 3.4 : s.kind === 'chest' ? 1.2 : 2.1));
      const goal = cleared ? 0 : near ? TREE_FADED_ALPHA : 1;
      if (Math.abs(t.sprite.alpha - goal) > 0.01) t.sprite.setAlpha(t.sprite.alpha + (goal - t.sprite.alpha) * k);
    }
  }

  /** The other players' castles in their colour: where they are is public, what is inside is not. */
  /** A wall round every castle's region; it always stands at its top level (a castle falls in one go, the wall has no health). */
  private drawWalls(): void {
    for (const r of this.layout.regions) {
      if (r.seat === null || !r.color) continue;
      const ring = new WallRing(this, toWorld(r.origin), r.corner, r.color, this.color);
      ring.setLevel(3);
      this.walls.set(r.seat, ring);
    }
  }

  private drawOtherCastles(): void {
    for (const r of this.layout.regions) {
      if (r.seat === null || r.seat === this.mySeat || !r.color) continue;
      const base = toWorld(r.origin);
      const x = base.x + CASTLE.x, y = base.y + CASTLE.y;
      this.terrain.shade(x, y - 6, 470, 130);
      const image = this.add.image(x, y, `castle-${r.color}`).setOrigin(0.5, 1).setScale(CASTLE.scale).setDepth(y);
      const seat = r.seat;
      image.setInteractive({ useHandCursor: true }).on('pointerup', () => this.select({ kind: 'enemy', seat }));
      const castle = { image, name: r.name ?? '', color: r.color };
      this.otherCastles.set(r.seat, castle);
      this.setEnemySign(r.seat, castle, false);
    }
  }

  // ---- camera ------------------------------------------------------------------------------

  /** Drag (or WASD / arrows) to look around, wheel to zoom; starts on our own castle. */
  private setupCamera(): void {
    const cam = this.cameras.main;
    const topLeft = toWorld({ x: 0, y: 0 });
    const size = this.layout.size * TILE;
    const pad = WATER_PAD * TILE;
    cam.setBounds(topLeft.x - pad, topLeft.y - pad, size + 2 * pad, size + 2 * pad);
    this.centerOnCastle();
    // The canvas is the whole window: when it changes size, keep the map filling it.
    this.scale.on('resize', () => cam.setZoom(Math.max(cam.zoom, this.minZoom())));

    // A click on empty ground (nothing under the pointer, not a drag) closes the open window.
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (!this.dragged && over.length === 0 && Math.hypot(p.x - p.downX, p.y - p.downY) < 6) this.onDeselect();
    });

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
    // A drag that is let go of over the UI never reaches the canvas: end it here.
    const endDrag = () => { drag = null; };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('blur', endDrag);
    this.events.once('shutdown', () => { window.removeEventListener('pointerup', endDrag); window.removeEventListener('blur', endDrag); });
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
    zone.on('pointerup', () => this.select({ kind: 'building', type }));
    const dust = this.add.sprite(x, y, 'dust').setScale(2).setDepth(9_000).setVisible(false);
    this.buildings.set(type, { level: 0, sprites: [], dust });
  }

  private updateBuilding(b: BuildingView, s: CastleView): void {
    const slot = this.buildings.get(b.type)!;
    const site = SITES[b.type];
    if (slot.level !== b.level) {
      for (const sprite of slot.sprites) sprite.destroy();
      slot.sprites = site.parts(b.level).map((p) => placePart(this, p));
      slot.level = b.level;
    }

    const workers = s.jobs.find((j) => j.job === b.worker)?.count ?? 0;
    const upgrading = b.upgradeRemaining !== null;
    slot.dust.setVisible(upgrading);
    if (upgrading && !slot.dust.anims.isPlaying) slot.dust.play('dust');
    this.labels.set(`building:${b.type}`, {
      x: site.center.x, y: site.center.y + site.area.h / 2 - 6, anchor: 'bottom', minZoom: 0.5, html: buildingSign(b, workers),
    });
  }

}

/** True while the player types in the side panel (keys then belong to the input, not the camera). */
function typingInPanel(): boolean {
  const el = document.activeElement;
  return !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
}
