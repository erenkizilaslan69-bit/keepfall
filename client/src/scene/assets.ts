import Phaser from 'phaser';

// Tiny Swords (Free Pack) by Pixel Frog — not in the repo, see README. Player colour is blue;
// other colours stay for opponents later.

const ROOT = '/assets/tiny-swords/Tiny Swords (Free Pack)/';
const url = (path: string) => encodeURI(ROOT + path);

export const PLAYER_COLOR = 'Blue';

/** Every unit is drawn at this scale so they stay in proportion (the Lancer's frame is just bigger, not its body). */
export const UNIT_SCALE = 0.36;
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
  ];
};

const SHEETS: SheetDef[] = [
  ...units(PLAYER_COLOR),
  { key: 'tree1', path: 'Terrain/Resources/Wood/Trees/Tree1.png', frame: 192, frameHeight: 256 },
  { key: 'tree2', path: 'Terrain/Resources/Wood/Trees/Tree2.png', frame: 192, frameHeight: 256 },
  { key: 'tree3', path: 'Terrain/Resources/Wood/Trees/Tree3.png', frame: 192 },
  { key: 'tree4', path: 'Terrain/Resources/Wood/Trees/Tree4.png', frame: 192 },
  { key: 'bush1', path: 'Terrain/Decorations/Bushes/Bushe1.png', frame: 128 },
  { key: 'bush2', path: 'Terrain/Decorations/Bushes/Bushe2.png', frame: 128 },
  { key: 'sheep-grass', path: 'Terrain/Resources/Meat/Sheep/Sheep_Grass.png', frame: 128 },
  { key: 'sheep-idle', path: 'Terrain/Resources/Meat/Sheep/Sheep_Idle.png', frame: 128 },
  { key: 'dust', path: 'Particle FX/Dust_01.png', frame: 64 },
  { key: 'tiles', path: 'Terrain/Tileset/Tilemap_color1.png', frame: 64 },
];

const IMAGES: Record<string, string> = {
  castle: `Buildings/${PLAYER_COLOR} Buildings/Castle.png`,
  house1: `Buildings/${PLAYER_COLOR} Buildings/House1.png`,
  house2: `Buildings/${PLAYER_COLOR} Buildings/House2.png`,
  house3: `Buildings/${PLAYER_COLOR} Buildings/House3.png`,
  tower: `Buildings/${PLAYER_COLOR} Buildings/Tower.png`,
  barracks: `Buildings/${PLAYER_COLOR} Buildings/Barracks.png`,
  archery: `Buildings/${PLAYER_COLOR} Buildings/Archery.png`,
  water: 'Terrain/Tileset/Water Background color.png',
  stump1: 'Terrain/Resources/Wood/Trees/Stump 1.png',
  stump2: 'Terrain/Resources/Wood/Trees/Stump 2.png',
  'wood-pile': 'Terrain/Resources/Wood/Wood Resource/Wood Resource.png',
  rock1: 'Terrain/Decorations/Rocks/Rock1.png',
  rock2: 'Terrain/Decorations/Rocks/Rock2.png',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`stone${i}`, `Terrain/Resources/Gold/Gold Stones/Gold Stone ${i}.png`])),
};

export function preloadAssets(scene: Phaser.Scene): void {
  for (const s of SHEETS)
    scene.load.spritesheet(s.key, url(s.path), { frameWidth: s.frame, frameHeight: s.frameHeight ?? s.frame });
  for (const [key, path] of Object.entries(IMAGES)) scene.load.image(key, url(path));
}

/** Looping animation per sheet, named after the sheet key. */
export function createAnimations(scene: Phaser.Scene): void {
  const rates: Record<string, number> = { 'pawn-run': 12, dust: 14 };
  for (const s of SHEETS) {
    if (s.key === 'tiles') continue;
    const texture = scene.textures.get(s.key);
    const frames = texture.frameTotal - 1; // minus the __BASE frame
    scene.anims.create({
      key: s.key,
      frames: scene.anims.generateFrameNumbers(s.key, { start: 0, end: frames - 1 }),
      frameRate: rates[s.key] ?? (s.key.startsWith('pawn-run') || s.key.startsWith('pawn-work') ? 10 : 8),
      repeat: -1,
    });
  }
}

/** Where a unit's feet are inside its frame (the Lancer's frame is taller). */
export function unitOriginY(textureKey: string): number {
  return textureKey.startsWith('lancer') ? 0.6 : 0.65;
}
