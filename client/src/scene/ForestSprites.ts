import Phaser from 'phaser';

// The places of the forest are built in Sites.ts from Tiny Swords pieces: the black buildings (houses, tower, castle) and the pack's fire. The pack
// has no chest, so it is drawn here from a character grid (o outline, l light, m mid, d dark wood, b iron band, g gold, z the dark inside), with
// its lid shut (full) or open and empty (opened). Pure picture, no Free Pack pixel is copied.

const PIXELS: Record<string, string[]> = {
  'kf-chest': ['.oooooooooo.', 'ollllllllllo', 'olmmmmmmmmdo', 'obbbbbbbbbbo', 'olmmmggmmmdo', 'olmmmggmmmdo', 'olmmmmmmmmdo', 'oddddddddddo', '.oooooooooo.'],
  'kf-chest-open': ['.oooooooooo.', 'ollllllllllo', 'olmmmmmmmmdo', 'oooooooooooo', 'ozzzzzzzzzzo', 'ozzzzzzzzzzo', 'olmmmmmmmmdo', 'oddddddddddo', '.oooooooooo.'],
};
const COLORS: Record<string, string> = { o: '#241a14', l: '#c58f56', m: '#9d6a3b', d: '#744827', b: '#7d8896', g: '#ffd34a', z: '#1a1424' };
const CELL = 5;

/** The chest textures ("kf-chest", "kf-chest-open"), made once. */
export function makeChestTextures(scene: Phaser.Scene): void {
  for (const [key, rows] of Object.entries(PIXELS)) {
    if (scene.textures.exists(key)) continue;
    const c = document.createElement('canvas');
    c.width = rows[0].length * CELL; c.height = rows.length * CELL;
    const g = c.getContext('2d')!;
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { g.fillStyle = COLORS[ch]; g.fillRect(i * CELL, j * CELL, CELL, CELL); } }));
    scene.textures.addCanvas(key, c);
  }
}
