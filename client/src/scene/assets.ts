import Phaser from 'phaser';
import type { PlayerColor } from '../types';

// Tiny Swords (Free Pack) by Pixel Frog — not in the repo, see README. Units and buildings are
// loaded in the player's own colour; terrain and props are shared.

const ROOT = '/assets/tiny-swords/Tiny Swords (Free Pack)/';
const url = (path: string) => encodeURI(ROOT + path);

/** Folder name of each player colour in the pack (Black stays spare). */
const COLOR_FOLDER: Record<PlayerColor, string> = { blue: 'Blue', red: 'Red', yellow: 'Yellow', purple: 'Purple' };

/** Every unit is drawn at this scale so they stay in proportion (the Lancer's frame is just bigger, not its body). */
export const UNIT_SCALE = 0.55;
/** Shield bearers stand a little larger so they read differently from swordsmen at a glance. */
export const SHIELD_SCALE = UNIT_SCALE * 1.18;

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
  { key: 'tiles', path: 'Terrain/Tileset/Tilemap_color1.png', frame: 64 },
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
  stump1: 'Terrain/Resources/Wood/Trees/Stump 1.png',
  stump2: 'Terrain/Resources/Wood/Trees/Stump 2.png',
  'wood-pile': 'Terrain/Resources/Wood/Wood Resource/Wood Resource.png',
  rock1: 'Terrain/Decorations/Rocks/Rock1.png',
  rock2: 'Terrain/Decorations/Rocks/Rock2.png',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`stone${i}`, `Terrain/Resources/Gold/Gold Stones/Gold Stone ${i}.png`])),
};

/** Sheets other players' armies and scouts need on the map, loaded in their colours as "<colour>-<key>". */
const MOVER_KEYS = ['pawn-run', 'warrior-run', 'archer-run', 'lancer-run', 'warrior-guard', 'warrior-attack', 'archer-shoot', 'lancer-attack'];
const moverSheets = (others: PlayerColor[]): SheetDef[] =>
  others.flatMap((c) => units(COLOR_FOLDER[c]).filter((s) => MOVER_KEYS.includes(s.key)).map((s) => ({ ...s, key: `${c}-${s.key}` })));

/** The key of a sheet in <paramref name="color"/>: our own colour's sheets have plain keys. */
export function colorKey(color: PlayerColor, own: PlayerColor, key: string): string {
  return color === own ? key : `${color}-${key}`;
}

/** Loads the pack in the player's colour (units and buildings) and the others' marching units; terrain is shared. */
export function preloadAssets(scene: Phaser.Scene, color: PlayerColor, others: PlayerColor[] = []): void {
  for (const s of [...sheets(color), ...moverSheets(others)])
    scene.load.spritesheet(s.key, url(s.path), { frameWidth: s.frame, frameHeight: s.frameHeight ?? s.frame });
  for (const [key, path] of Object.entries({ ...buildingImages(color), ...IMAGES })) scene.load.image(key, url(path));
  // Everyone's castle, for the other corners of the map.
  for (const [c, folder] of Object.entries(COLOR_FOLDER)) scene.load.image(`castle-${c}`, url(`Buildings/${folder} Buildings/Castle.png`));
}

/** Looping animation per sheet, named after the sheet key. */
export function createAnimations(scene: Phaser.Scene, color: PlayerColor, others: PlayerColor[] = []): void {
  const rates: Record<string, number> = { 'pawn-run': 12, dust: 14, explosion: 14 };
  for (const s of [...sheets(color), ...moverSheets(others)]) {
    if (scene.anims.exists(s.key)) continue;
    if (s.key === 'tiles') continue;
    const texture = scene.textures.get(s.key);
    const frames = texture.frameTotal - 1; // minus the __BASE frame
    scene.anims.create({
      key: s.key,
      frames: scene.anims.generateFrameNumbers(s.key, { start: 0, end: frames - 1 }),
      frameRate: rates[s.key] ?? (/(^|-)pawn-(run|work)/.test(s.key) ? 10 : 8),
      repeat: -1,
    });
  }
}

/** Where a unit's feet are inside its frame (the Lancer's frame is taller). */
export function unitOriginY(textureKey: string): number {
  return textureKey.startsWith('lancer') ? 0.6 : 0.65;
}
