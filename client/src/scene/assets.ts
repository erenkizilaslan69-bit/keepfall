import Phaser from 'phaser';
import type { PlayerColor } from '../types';
import { asset } from '../env';

// Tiny Swords (Free Pack) by Pixel Frog — not in the repo, see README. Units and buildings are
// loaded in the player's own colour; terrain and props are shared.

const ROOT = asset('/assets/tiny-swords/Tiny Swords (Free Pack)/');
/** Tiny Swords Warfare (also not in the repo): a path starting with "@wf/" is looked up here instead. Every unit comes in all five colours. */
const WF_ROOT = asset('/assets/Warfare_001/Warfare/');
const url = (path: string) => encodeURI(path.startsWith('@wf/') ? WF_ROOT + path.slice(4) : ROOT + path);

/** Folder name of each player colour in the pack (Black stays spare). */
const COLOR_FOLDER: Record<PlayerColor, string> = { blue: 'Blue', red: 'Red', yellow: 'Yellow', purple: 'Purple', black: 'Black' };

/** The foot soldiers (archer, spearman, monk, shield bearer) are drawn at this scale so they stay in proportion (the Lancer's frame is just bigger, not its body). */
export const UNIT_SCALE = 0.55;
/**
 * The scale of each unit. The five foot soldiers stand at the same height: Warfare's Swordsman has a bigger body in a 320 px frame, so he is drawn
 * smaller; the horseman is a little larger than they are, the catapult about one and a half to two foot soldiers.
 */
const UNIT_SCALES: Record<string, number> = { kilicli: 0.46, suvari: 0.5, mancinik: 0.48, lord: 0.55 };
export const unitScale = (unitId: string): number => UNIT_SCALES[unitId] ?? UNIT_SCALE;

interface SheetDef { key: string; path: string; frame: number; frameHeight?: number }

const units = (color: string): SheetDef[] => {
  const u = `Units/${color} Units/`;
  const pawn = (name: string, frames: string) => ({ key: `pawn-${frames}`, path: `${u}Pawn/Pawn_${name}.png`, frame: 192 });
  return [
    pawn('Idle', 'idle'),
    pawn('Run', 'run'),
    pawn('Idle Axe', 'idle-axe'),
    pawn('Idle Knife', 'idle-knife'),
    pawn('Idle Pickaxe', 'idle-pickaxe'),
    pawn('Idle Hammer', 'idle-hammer'),
    pawn('Run Axe', 'run-axe'),
    pawn('Run Knife', 'run-knife'),
    pawn('Run Pickaxe', 'run-pickaxe'),
    pawn('Run Hammer', 'run-hammer'),
    pawn('Run Wood', 'run-wood'),
    pawn('Run Meat', 'run-meat'),
    pawn('Run Gold', 'run-gold'),
    pawn('Interact Axe', 'work-axe'),
    pawn('Interact Knife', 'work-knife'),
    pawn('Interact Pickaxe', 'work-pickaxe'),
    pawn('Interact Hammer', 'work-hammer'),
    { key: 'warrior-idle', path: `${u}Warrior/Warrior_Idle.png`, frame: 192 },
    { key: 'warrior-guard', path: `${u}Warrior/Warrior_Guard.png`, frame: 192 },
    { key: 'archer-idle', path: `${u}Archer/Archer_Idle.png`, frame: 192 },
    { key: 'lancer-idle', path: `${u}Lancer/Lancer_Idle.png`, frame: 320 },
    { key: 'warrior-run', path: `${u}Warrior/Warrior_Run.png`, frame: 192 },
    { key: 'archer-run', path: `${u}Archer/Archer_Run.png`, frame: 192 },
    { key: 'lancer-run', path: `${u}Lancer/Lancer_Run.png`, frame: 320 },
    { key: 'warrior-attack', path: `${u}Warrior/Warrior_Attack1.png`, frame: 192 },
    { key: 'archer-shoot', path: `${u}Archer/Archer_Shoot.png`, frame: 192 },
    { key: 'lancer-attack', path: `${u}Lancer/Lancer_Right_Attack.png`, frame: 320 },
    { key: 'monk-idle', path: `${u}Monk/Idle.png`, frame: 192 },
    { key: 'monk-run', path: `${u}Monk/Run.png`, frame: 192 },
    { key: 'monk-heal', path: `${u}Monk/Heal.png`, frame: 192 },
    { key: 'monk-heal-fx', path: `${u}Monk/Heal_Effect.png`, frame: 192 },
    ...warfare(color),
  ];
};

/** The Warfare pack's units (swordsman, cavalry, catapult, the lord) in one colour. Sheet keys keep the names the rest of the map code uses. */
const warfare = (color: string): SheetDef[] => {
  const w = (dir: string, name: string, file: string, frame: number): SheetDef => ({ key: name, path: `@wf/${dir}/${dir} Animations/${dir}_${color}/${file}_${color}.png`, frame });
  return [
    w('Swordsman', 'swordsman-idle', 'Swordsman_Idle', 320),
    w('Swordsman', 'swordsman-run', 'Swordsman_Run', 320),
    w('Swordsman', 'swordsman-attack', 'Swordsman_Attack', 320),
    w('Horseman', 'suvari-idle', 'Horseman_Idle', 320),
    w('Horseman', 'suvari-run', 'Horseman_Run', 320),
    w('Horseman', 'suvari-attack', 'Horseman_Attack', 320),
    w('Catapult', 'mancinik-idle', 'Catapult_Idle', 256),
    w('Catapult', 'mancinik-run', 'Catapult_Move', 256),
    w('Catapult', 'mancinik-fire', 'Catapult_FireStone', 256),
    w('King', 'lord-idle', 'King_Idle', 192),
    w('King', 'lord-attack', 'King_Attack', 192),
  ];
};

/** Colour-independent sheets; unit sheets come from the player's colour folder. */
const SHARED_SHEETS: SheetDef[] = [
  { key: 'tree1', path: 'Terrain/Resources/Wood/Trees/Tree1.png', frame: 192, frameHeight: 256 },
  { key: 'tree2', path: 'Terrain/Resources/Wood/Trees/Tree2.png', frame: 192, frameHeight: 256 },
  { key: 'tree3', path: 'Terrain/Resources/Wood/Trees/Tree3.png', frame: 192 },
  { key: 'tree4', path: 'Terrain/Resources/Wood/Trees/Tree4.png', frame: 192 },
  { key: 'bush1', path: 'Terrain/Decorations/Bushes/Bushe1.png', frame: 128 },
  { key: 'bush2', path: 'Terrain/Decorations/Bushes/Bushe2.png', frame: 128 },
  { key: 'sheep-grass', path: 'Terrain/Resources/Meat/Sheep/Sheep_Grass.png', frame: 128 },
  { key: 'sheep-idle', path: 'Terrain/Resources/Meat/Sheep/Sheep_Idle.png', frame: 128 },
  { key: 'dust', path: 'Particle FX/Dust_01.png', frame: 64 },
  { key: 'explosion', path: 'Particle FX/Explosion_01.png', frame: 192 },
  { key: 'fire', path: 'Particle FX/Fire_01.png', frame: 64 },
  { key: 'tiles', path: 'Terrain/Tileset/Tilemap_color1.png', frame: 64 },
  { key: 'foam', path: 'Terrain/Tileset/Water Foam.png', frame: 192 },
  ...[1, 2, 3, 4].map((i) => ({ key: `wrock${i}`, path: `Terrain/Decorations/Rocks in the Water/Water Rocks_0${i}.png`, frame: 64 })),
  { key: 'bush3', path: 'Terrain/Decorations/Bushes/Bushe3.png', frame: 128 },
  { key: 'bush4', path: 'Terrain/Decorations/Bushes/Bushe4.png', frame: 128 },
];

const sheets = (color: PlayerColor): SheetDef[] => [...units(COLOR_FOLDER[color]), ...SHARED_SHEETS];

const buildingImages = (color: PlayerColor): Record<string, string> => {
  const b = `Buildings/${COLOR_FOLDER[color]} Buildings/`;
  return {
    castle: `${b}Castle.png`,
    house1: `${b}House1.png`,
    house2: `${b}House2.png`,
    house3: `${b}House3.png`,
    tower: `${b}Tower.png`,
    barracks: `${b}Barracks.png`,
    archery: `${b}Archery.png`,
  };
};

const IMAGES: Record<string, string> = {
  water: 'Terrain/Tileset/Water Background color.png',
  arrow: 'Units/Blue Units/Archer/Arrow.png',
  'stone-shot': '@wf/Catapult/Stone Projectile/Stone_Idle.png',
  stump1: 'Terrain/Resources/Wood/Trees/Stump 1.png',
  stump2: 'Terrain/Resources/Wood/Trees/Stump 2.png',
  'wood-pile': 'Terrain/Resources/Wood/Wood Resource/Wood Resource.png',
  rock1: 'Terrain/Decorations/Rocks/Rock1.png',
  rock2: 'Terrain/Decorations/Rocks/Rock2.png',
  rock3: 'Terrain/Decorations/Rocks/Rock3.png',
  rock4: 'Terrain/Decorations/Rocks/Rock4.png',
  'gold-pile': 'Terrain/Resources/Gold/Gold Resource/Gold_Resource.png',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`stone${i}`, `Terrain/Resources/Gold/Gold Stones/Gold Stone ${i}.png`])),
};

/** Sheets other players' armies and scouts need on the map, loaded in their colours as "<colour>-<key>". */
const MOVER_KEYS = ['pawn-run', 'archer-run', 'lancer-run', 'warrior-guard', 'archer-shoot', 'lancer-attack',
  'warrior-idle', 'archer-idle', 'lancer-idle', 'pawn-idle', 'monk-idle', 'monk-run', 'monk-heal', 'monk-heal-fx',
  'swordsman-idle', 'swordsman-run', 'swordsman-attack', 'suvari-idle', 'suvari-run', 'suvari-attack', 'mancinik-idle', 'mancinik-run', 'mancinik-fire',
  'lord-idle', 'lord-attack'];
const moverSheets = (others: PlayerColor[]): SheetDef[] =>
  others.flatMap((c) => units(COLOR_FOLDER[c]).filter((s) => MOVER_KEYS.includes(s.key)).map((s) => ({ ...s, key: `${c}-${s.key}` })));

/** The key of a sheet in <paramref name="color"/>: our own colour's sheets have plain keys. */
export function colorKey(color: PlayerColor, own: PlayerColor, key: string): string {
  return color === own ? key : `${color}-${key}`;
}

/**
 * Plays <paramref name="key"/> on a sprite from the frame <paramref name="wanted"/>, or the nearest one the animation has. A start frame past the
 * last frame makes Phaser throw ("duration of undefined"), and the catapult's idle animation has ONE frame: a column or a battle replay that held a
 * catapult died half-built (its soldiers drawn so far were never deleted and the replay never began).
 */
export function playFrom(sprite: Phaser.GameObjects.Sprite, key: string, wanted: number, extra: { repeat?: number } = {}): void {
  const frames = sprite.scene.anims.get(key)?.frames.length ?? 1;
  sprite.play({ key, startFrame: Math.max(0, Math.min(Math.floor(wanted), frames - 1)), ...extra });
}
/** The same from a random frame up to <paramref name="max"/>. */
export function playRandom(sprite: Phaser.GameObjects.Sprite, key: string, max = 3, extra: { repeat?: number } = {}): void {
  playFrom(sprite, key, Phaser.Math.Between(0, max), extra);
}

/** The URL of a file of the pack (for the lobby scenery and the warm-up, which draw outside Phaser too). */
export const assetUrl = url;

/**
 * Every file the map will ask for in these colours, so the lobby can fetch them ahead of time (the browser keeps them: the map
 * then starts from the cache instead of loading for seconds after the match begins).
 */
export function assetUrls(color: PlayerColor, others: PlayerColor[] = []): string[] {
  const list = [...sheets(color), ...moverSheets(others)].map((s) => url(s.path));
  list.push(...Object.values({ ...buildingImages(color), ...IMAGES }).map(url));
  for (const name of COLORED_IMAGES) list.push(url(buildingImages('black')[name]));
  list.push(asset('/cc0/Tilemap_Elevation.png'), asset('/cc0/Signpost.png'));
  for (const c of others) if (c !== 'black') list.push(url(buildingImages(c).tower));
  for (const folder of Object.values(COLOR_FOLDER)) list.push(url(`Buildings/${folder} Buildings/Castle.png`));
  return [...new Set(list)];
}

/** Loads the pack in the player's colour (units and buildings) and the others' marching units; terrain is shared. */
export function preloadAssets(scene: Phaser.Scene, color: PlayerColor, others: PlayerColor[] = []): void {
  for (const s of [...sheets(color), ...moverSheets(others)])
    scene.load.spritesheet(s.key, url(s.path), { frameWidth: s.frame, frameHeight: s.frameHeight ?? s.frame });
  for (const [key, path] of Object.entries({ ...buildingImages(color), ...IMAGES })) scene.load.image(key, url(path));
  // The bandits' camps and the villages of the forest are black buildings.
  for (const name of COLORED_IMAGES) scene.load.image(`black-${name}`, url(buildingImages('black')[name]));
  // The wall of every region: the stone sheet is CC0 (public/cc0, in the repo), and the towers come in everybody's colour.
  scene.load.image('wall-elev', asset('/cc0/Tilemap_Elevation.png'));
  scene.load.image('signpost', asset('/cc0/Signpost.png'));
  for (const c of others) if (c !== 'black') scene.load.image(`${c}-tower`, url(buildingImages(c).tower));
  // Everyone's castle, for the other corners of the map.
  for (const [c, folder] of Object.entries(COLOR_FOLDER)) scene.load.image(`castle-${c}`, url(`Buildings/${folder} Buildings/Castle.png`));
}

/** Building images that come in the owner colour (our own have plain keys, the others get "<colour>-<key>"). */
export const COLORED_IMAGES = ['house1', 'house2', 'house3', 'tower', 'barracks', 'archery'];

/**
 * A spectator sees every castle inside, so the other colours buildings and every unit sheet are needed too
 * ("<colour>-<key>"). Loaded only when a player falls; `done` runs when they are there.
 */
export function loadSpectatorAssets(scene: Phaser.Scene, others: PlayerColor[], done: () => void): void {
  const missing: SheetDef[] = [];
  for (const c of others) {
    for (const s of units(COLOR_FOLDER[c])) {
      const key = `${c}-${s.key}`;
      if (!scene.textures.exists(key)) missing.push({ ...s, key });
    }
    const b = buildingImages(c);
    for (const name of COLORED_IMAGES) scene.load.image(`${c}-${name}`, url(b[name]));
  }
  for (const s of missing) scene.load.spritesheet(s.key, url(s.path), { frameWidth: s.frame, frameHeight: s.frameHeight ?? s.frame });
  scene.load.once('complete', () => {
    createSheetAnimations(scene, missing);
    done();
  });
  scene.load.start();
}

/** Looping animation per sheet, named after the sheet key. */
export function createAnimations(scene: Phaser.Scene, color: PlayerColor, others: PlayerColor[] = []): void {
  createSheetAnimations(scene, [...sheets(color), ...moverSheets(others)]);
}

/**
 * The miners carry grey ore, not gold: the pack's gold-carrying pawn gets its yellow turned to stone grey (a new sheet "...pawn-run-ore" with its
 * animation). Gold is what the forest gives, the mine gives iron.
 */
function oreSheet(scene: Phaser.Scene, goldKey: string): void {
  const key = goldKey.replace('pawn-run-gold', 'pawn-run-ore');
  if (scene.textures.exists(key) || !scene.textures.exists(goldKey)) return;
  const img = scene.textures.get(goldKey).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height), d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gr = d[i + 1], b = d[i + 2];
    const max = Math.max(r, gr, b), min = Math.min(r, gr, b);
    if (!d[i + 3] || max < 90 || (max - min) / max < 0.42 || b > gr || r < gr * 0.9) continue; // only the yellow-orange of the gold
    const l = 0.299 * r + 0.587 * gr + 0.114 * b;
    d[i] = Math.min(255, l * 0.86 + 6); d[i + 1] = Math.min(255, l * 0.92 + 8); d[i + 2] = Math.min(255, l * 1.02 + 18);
  }
  g.putImageData(data, 0, 0);
  const tex = scene.textures.addCanvas(key, c)!;
  const frames = Math.floor(c.width / 192);
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * 192, 0, 192, c.height);
  scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: frames - 1 }), frameRate: 10, repeat: -1 });
}

function createSheetAnimations(scene: Phaser.Scene, list: SheetDef[]): void {
  const rates: Record<string, number> = { 'pawn-run': 12, dust: 14, explosion: 14, 'suvari-run': 12, 'suvari-attack': 14, 'mancinik-run': 6, 'mancinik-fire': 12,
    'swordsman-attack': 16, 'lord-attack': 12 };
  for (const s of list) if (/pawn-run-gold$/.test(s.key)) oreSheet(scene, s.key);
  for (const s of list) {
    if (scene.anims.exists(s.key)) continue;
    if (s.key === 'tiles') continue;
    const texture = scene.textures.get(s.key);
    const frames = texture.frameTotal - 1; // minus the __BASE frame
    const once = /(heal(-fx)?|suvari-attack|mancinik-fire)$/.test(s.key); // the monk's heal and its sparkle, a lance thrust and a throw play once each time
    scene.anims.create({
      key: s.key,
      frames: scene.anims.generateFrameNumbers(s.key, { start: 0, end: frames - 1 }),
      frameRate: rates[s.key] ?? (once ? 14 : /(^|-)(pawn|swordsman)-(run|work)/.test(s.key) ? 10 : 8),
      repeat: once ? 0 : -1,
    });
  }
}

/** Where a unit's feet are inside its frame (the Lancer's and Warfare's frames are taller). */
export function unitOriginY(textureKey: string): number {
  if (textureKey.includes('suvari')) return 0.65;
  if (textureKey.includes('mancinik')) return 0.74;
  if (textureKey.includes('swordsman')) return 0.6;
  if (textureKey.includes('lord')) return 0.65;
  return textureKey.startsWith('lancer') ? 0.6 : 0.65;
}
