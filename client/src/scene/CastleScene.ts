import Phaser from 'phaser';
import type { BuildingType, BuildingView, CastleView, PlayerColor } from '../types';
import { createAnimations, preloadAssets } from './assets';
import { CASTLE, SITES, TILE, WORLD_HEIGHT, WORLD_WIDTH, type Part } from './layout';
import { Armies } from './Armies';
import { Scouts } from './Scouts';
import { Soldiers } from './Soldiers';
import { Workers } from './Workers';

export const SCENE_WIDTH = WORLD_WIDTH;
export const SCENE_HEIGHT = WORLD_HEIGHT;

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

/** Castle view: everything here is cosmetic, driven by the latest state from the server. */
export class CastleScene extends Phaser.Scene {
  /** Set by main.ts: called when the player clicks a building. */
  onBuildingClick: (type: BuildingType) => void = () => {};

  private state: CastleView | null = null;
  private ready = false;
  private loadFailed = false;
  private buildings = new Map<BuildingType, BuildingSlot>();
  private workers!: Workers;
  private soldiers!: Soldiers;
  private scouts!: Scouts;
  private armies!: Armies;
  private castleSprite!: Phaser.GameObjects.Image;
  private wallBar!: Phaser.GameObjects.Graphics;
  private wallText!: Phaser.GameObjects.Text;
  private lastWallHp: number | null = null;

  /** <paramref name="color"/>: the player's colour; units and buildings are drawn in it. */
  constructor(private readonly color: PlayerColor) {
    super('castle');
  }

  preload(): void {
    this.load.on('loaderror', () => { this.loadFailed = true; });
    preloadAssets(this, this.color);
  }

  create(): void {
    if (this.loadFailed) {
      this.add.text(WORLD_WIDTH / 2, WORLD_HEIGHT / 2,
        'Görseller bulunamadı.\nTiny Swords Free Pack\'i client/public/assets/tiny-swords/ içine aç (README).',
        { ...LABEL_STYLE, fontSize: '22px' }).setOrigin(0.5);
      return;
    }
    createAnimations(this, this.color);
    this.drawGround();
    this.castleSprite = this.add.image(CASTLE.x, CASTLE.y, 'castle').setOrigin(0.5, 1).setScale(CASTLE.scale).setDepth(CASTLE.y);
    this.wallBar = this.add.graphics().setDepth(10_002);
    this.wallText = this.add.text(CASTLE.x, WALL_BAR.y + WALL_BAR.h / 2, '', { ...LABEL_STYLE, fontSize: '13px' })
      .setOrigin(0.5).setDepth(10_003);
    for (const type of Object.keys(SITES) as BuildingType[]) this.createSite(type);
    this.workers = new Workers(this);
    this.soldiers = new Soldiers(this);
    this.scouts = new Scouts(this);
    this.armies = new Armies(this);
    this.ready = true;
    if (this.state) this.apply(this.state);
  }

  setState(state: CastleView): void {
    this.state = state;
    if (this.ready) this.apply(state);
  }

  update(_time: number, delta: number): void {
    if (this.ready) this.workers.update(Math.min(delta, 100) / 1000);
  }

  private apply(s: CastleView): void {
    for (const b of s.buildings) this.updateBuilding(b, s);
    this.workers.sync(s.jobs);
    this.soldiers.sync(s.units);
    this.scouts.sync(s.scouting);
    this.armies.sync(s.war.armies, s.scouting.targets.map((t) => t.seat));
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

  private drawGround(): void {
    this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'water').setOrigin(0).setDepth(-20);
    const cols = WORLD_WIDTH / TILE, rows = WORLD_HEIGHT / TILE;
    // A one-tile water border around a single grass island.
    const data = Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => {
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return -1;
      const top = y === 1, bottom = y === rows - 2, left = x === 1, right = x === cols - 2;
      if (top) return left ? GRASS.tl : right ? GRASS.tr : GRASS.t;
      if (bottom) return left ? GRASS.bl : right ? GRASS.br : GRASS.b;
      return left ? GRASS.l : right ? GRASS.r : GRASS.c;
    }));
    const map = this.make.tilemap({ data, tileWidth: TILE, tileHeight: TILE });
    const tiles = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    map.createLayer(0, tiles, 0, 0)!.setDepth(-10);
  }

  // ---- buildings ---------------------------------------------------------------------------

  private createSite(type: BuildingType): void {
    const site = SITES[type];
    const { x, y } = site.center;
    const zone = this.add.zone(x, y, site.area.w, site.area.h).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.onBuildingClick(type));
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
