import Phaser from 'phaser';

// A kingdom's sign on its workers: a small headpiece drawn in code and put on the pawn's head in every frame of every animation (the pack's pawn
// sheets are not touched). Where the head is comes from the frame itself: the first row from the top whose middle is wide enough to be a head
// (a raised axe or pickaxe is thinner), measured once per frame and kept.
//   golge: dark purple hood · tuccar: red fez with a gold tassel · kahin: white cap with a small purple crystal · entrikaci: half face mask

const OUT = '#1a1424';
const HEAD_ROW_MIN = 16; // opaque pixels (of the middle 64) that make a row "the head"
export const HAT_LOOKS = ['golge', 'tuccar', 'kahin', 'entrikaci'] as const;

interface HatArt { canvas: HTMLCanvasElement; /** where the pawn's head-top centre goes in the picture */ ax: number; ay: number }

function draw(w: number, h: number, fn: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  fn(g);
  return c;
}
const rect = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

const ART: Record<string, () => HatArt> = {
  golge: () => ({
    ax: 20, ay: 19, canvas: draw(40, 30, (g) => {
      // a cowl: rounded top, dropping at the sides, with a lighter fold and a purple trim
      rect(g, OUT, 7, 6, 26, 22); rect(g, OUT, 10, 3, 20, 4); rect(g, OUT, 13, 1, 14, 3); rect(g, OUT, 3, 14, 6, 14); rect(g, OUT, 31, 14, 6, 14);
      rect(g, '#3a2a5a', 9, 7, 22, 19); rect(g, '#3a2a5a', 12, 4, 16, 4); rect(g, '#3a2a5a', 14, 2, 12, 2); rect(g, '#3a2a5a', 4, 15, 4, 12); rect(g, '#3a2a5a', 32, 15, 4, 12);
      rect(g, '#2a1d44', 9, 20, 22, 6); rect(g, '#5a3f8a', 13, 5, 6, 2); rect(g, '#7a5cc0', 9, 24, 22, 2);
    }),
  }),
  tuccar: () => ({
    ax: 20, ay: 17, canvas: draw(40, 36, (g) => {
      // a red fez with a gold band and a tassel
      rect(g, OUT, 9, 6, 22, 20); rect(g, OUT, 12, 3, 16, 4);
      rect(g, '#c4382c', 11, 7, 18, 16); rect(g, '#c4382c', 13, 4, 14, 4); rect(g, '#e0574a', 13, 8, 5, 10); rect(g, '#8f241c', 11, 17, 18, 6);
      rect(g, '#e0b73a', 11, 21, 18, 3); rect(g, '#f6dc7c', 11, 21, 18, 1);
      rect(g, OUT, 26, 2, 12, 3); rect(g, '#e0b73a', 27, 3, 10, 1); rect(g, OUT, 35, 4, 5, 14); rect(g, '#e0b73a', 36, 5, 3, 11); rect(g, '#f6dc7c', 36, 5, 1, 11); rect(g, OUT, 34, 17, 7, 5); rect(g, '#e0b73a', 35, 18, 5, 3);
    }),
  }),
  kahin: () => ({
    ax: 20, ay: 20, canvas: draw(40, 40, (g) => {
      // a white cap with a purple crystal on top
      rect(g, OUT, 8, 14, 24, 14); rect(g, OUT, 11, 11, 18, 4); rect(g, '#f4f4fc', 10, 15, 20, 11); rect(g, '#f4f4fc', 13, 12, 14, 4); rect(g, '#cfd2e6', 10, 22, 20, 4); rect(g, '#ffffff', 14, 13, 6, 3);
      rect(g, OUT, 16, 0, 8, 12); rect(g, OUT, 14, 3, 12, 6); rect(g, '#9a58c8', 17, 1, 6, 10); rect(g, '#9a58c8', 15, 4, 10, 4); rect(g, '#c590ea', 17, 2, 2, 8); rect(g, '#ffffff', 18, 3, 1, 3); rect(g, '#683a8e', 21, 6, 2, 4);
    }),
  }),
  // The mask sits on the face (its anchor is the head top; the face is about 14 px lower): eye holes, a pale half-face with a red edge.
  entrikaci: () => ({
    ax: 20, ay: 0, canvas: draw(40, 16, (g) => {
      rect(g, OUT, 6, 0, 28, 14); rect(g, OUT, 9, 14, 22, 2);
      rect(g, '#f0e6d0', 8, 1, 24, 11); rect(g, '#d8caa8', 8, 9, 24, 3); rect(g, '#b24a4a', 8, 1, 24, 2);
      rect(g, OUT, 11, 4, 6, 4); rect(g, OUT, 23, 4, 6, 4); rect(g, '#f4d24a', 13, 5, 2, 2); rect(g, '#f4d24a', 25, 5, 2, 2);
      rect(g, '#3f7a4a', 18, 2, 4, 3);
    }),
  }),
};

const hatCache = new Map<string, string>();
export function hatTexture(scene: Phaser.Scene, look: string): { key: string; ax: number; ay: number; below: number } | null {
  const make = ART[look];
  if (!make) return null;
  const art = make();
  const key = `hat:${look}`;
  if (!hatCache.has(key) || !scene.textures.exists(key)) { scene.textures.addCanvas(key, art.canvas); hatCache.set(key, key); }
  return { key, ax: art.ax, ay: art.ay, below: look === 'entrikaci' ? 18 : 0 };
}

const heads = new Map<string, { x: number; y: number } | null>();
let scratch: HTMLCanvasElement | null = null;

/** The head of the pawn in its current frame, in the frame's own pixels (null when nothing is drawn in the frame). */
export function headOf(sprite: Phaser.GameObjects.Sprite): { x: number; y: number } | null {
  const frame = sprite.frame;
  const key = `${sprite.texture.key}#${frame.name}`;
  if (heads.has(key)) return heads.get(key)!;
  const w = frame.cutWidth, h = frame.cutHeight;
  scratch ??= document.createElement('canvas');
  scratch.width = w; scratch.height = h;
  const g = scratch.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, w, h);
  g.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
  const found = scanHead(g.getImageData(0, 0, w, h).data, w, h);
  heads.set(key, found);
  return found;
}

/** The head's top in the pixels of a frame: the first row from the top whose middle is wide enough. */
export function scanHead(d: Uint8ClampedArray, w: number, h: number): { x: number; y: number } | null {
  const mid = w >> 1;
  for (let y = 0; y < h; y++) {
    let count = 0, sum = 0;
    for (let x = mid - 32; x < mid + 32; x++) if (x >= 0 && x < w && d[(y * w + x) * 4 + 3] > 60) { count++; sum += x; }
    if (count >= HEAD_ROW_MIN) return { x: sum / count, y };
  }
  return null;
}

/** The hat's picture and where the head goes on it (for pictures that are not drawn by Phaser, e.g. the comparison page). */
export function hatArt(look: string): { canvas: HTMLCanvasElement; ax: number; ay: number; below: number } | null {
  const make = ART[look];
  if (!make) return null;
  const a = make();
  return { ...a, below: look === 'entrikaci' ? 18 : 0 };
}

/** Puts the hat on the pawn (position, mirroring, depth and fading follow the pawn). */
export function placeHat(hat: Phaser.GameObjects.Image, sprite: Phaser.GameObjects.Sprite, art: { ax: number; ay: number; below: number }): void {
  const head = headOf(sprite);
  if (!head) { hat.setVisible(false); return; }
  const k = sprite.scaleX, dir = sprite.flipX ? -1 : 1;
  const fx = head.x - sprite.width / 2, fy = head.y - sprite.height * sprite.originY;
  hat.setVisible(sprite.visible)
    .setOrigin(art.ax / hat.width, art.ay / hat.height)
    .setScale(k)
    .setFlipX(sprite.flipX)
    .setPosition(sprite.x + fx * k * dir, sprite.y + (fy + art.below) * k)
    .setDepth(sprite.depth + 0.5)
    .setAlpha(sprite.alpha);
}
