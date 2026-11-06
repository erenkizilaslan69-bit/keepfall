import Phaser from 'phaser';

// The places of the forest are built in Sites.ts from Tiny Swords pieces: the black buildings (houses, tower), the gold stones and the pack's fire. The
// pack has no palisade, so one fence section (two pointed posts and two rails) is drawn here in code. Pure picture, no Free Pack pixel is copied.

/** The fence section texture "kf-fence" (two posts, two rails), made once. */
export function makeFenceTexture(scene: Phaser.Scene): void {
  const key = 'kf-fence';
  if (scene.textures.exists(key)) return;
  const W = 44, H = 34;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const rect = (x: number, y: number, w: number, h: number, color: string): void => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  // rails first, the posts over them
  for (const y of [13, 22]) { rect(2, y, W - 4, 5, '#241a14'); rect(3, y + 1, W - 6, 3, '#9d6a3b'); rect(3, y + 1, W - 6, 1, '#c58f56'); }
  for (const x of [1, W - 10]) {
    rect(x + 3, 0, 3, 2, '#241a14');                       // the point
    rect(x + 1, 2, 7, H - 2, '#241a14');                   // outline
    rect(x + 2, 3, 5, H - 4, '#9d6a3b'); rect(x + 2, 3, 2, H - 4, '#c58f56'); rect(x + 6, 3, 1, H - 4, '#744827');
    rect(x + 3, 1, 3, 2, '#9d6a3b');
  }
  scene.textures.addCanvas(key, c);
}

/** The twinkle texture "kf-glint" (a small gold cross), made once. */
export function makeGlintTexture(scene: Phaser.Scene): string {
  const key = 'kf-glint';
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff6c0'; g.fillRect(4, 0, 1, 9); g.fillRect(0, 4, 9, 1); g.fillStyle = '#ffffff'; g.fillRect(3, 3, 3, 3); g.fillStyle = '#ffd34a'; g.fillRect(2, 2, 1, 1); g.fillRect(6, 2, 1, 1); g.fillRect(2, 6, 1, 1); g.fillRect(6, 6, 1, 1);
  scene.textures.addCanvas(key, c);
  return key;
}
