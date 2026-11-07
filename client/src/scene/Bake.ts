import Phaser from 'phaser';

/**
 * Phaser replays every command of a Graphics object (and triangulates its fills) on EVERY frame. Pictures that never change (the camp fire's stones and
 * logs, the idle pen) are therefore painted once into a render texture instead: <paramref name="draw"/> paints in scene coordinates, <paramref name="box"/>
 * is the rectangle they cover. The texture is <paramref name="res"/> times larger and drawn scaled down with smoothing, so it stays as sharp as the vector
 * picture was when the camera zooms in (the zoom stays below 3 in the game).
 */
export function bakeGraphics(scene: Phaser.Scene, box: { x: number; y: number; w: number; h: number }, draw: (g: Phaser.GameObjects.Graphics) => void, depth: number, res = 4): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(box.x, box.y, Math.ceil(box.w * res), Math.ceil(box.h * res)).setOrigin(0).setScale(1 / res).setDepth(depth);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.setScale(res).setPosition(-box.x * res, -box.y * res);
  draw(g);
  rt.draw(g); // (no x, y: the graphics object keeps its own position and scale)
  g.destroy();
  rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return rt;
}
