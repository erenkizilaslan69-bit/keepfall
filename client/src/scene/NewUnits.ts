import Phaser from 'phaser';
import type { PlayerColor } from '../types';
import { catapultCanvas, flameCanvas, horsemanCanvas, type TeamName } from './PixelArt';

// The textures and animations of the cavalry and the catapult, made at load time in every player colour that is on the map:
//   suvari-run (4 gallop frames), suvari-idle, suvari-attack (the Lancer's thrust over the horse),
//   mancinik-idle (loaded) and mancinik-fire (the throw).
// A colour other than our own gets the usual "<colour>-" prefix. The Lancer riding the horse comes from the loaded Lancer sheet.

export const HORSE_FRAME = { w: 240, h: 150 };
export const CATAPULT_FRAME = { w: 180, h: 130 };

const key = (color: PlayerColor, own: PlayerColor, name: string) => (color === own ? name : `${color}-${name}`);

function addStrip(scene: Phaser.Scene, name: string, frames: HTMLCanvasElement[], w: number, h: number, rate: number, repeat: number): void {
  if (scene.textures.exists(name)) return;
  const strip = document.createElement('canvas');
  strip.width = w * frames.length; strip.height = h;
  const g = strip.getContext('2d')!;
  frames.forEach((f, i) => g.drawImage(f, i * w, 0));
  const tex = scene.textures.addCanvas(name, strip)!;
  frames.forEach((_, i) => tex.add(i, 0, i * w, 0, w, h));
  scene.anims.create({
    key: name,
    frames: frames.map((_, i) => ({ key: name, frame: i })),
    frameRate: rate,
    repeat,
  });
}

/** The camp fire's flame: six frames, 48×64, in a strip texture and an animation named "campfire". */
export const FLAME_FRAME = { w: 48, h: 64 };
export function makeCampfire(scene: Phaser.Scene): void {
  addStrip(scene, 'campfire', [0, 1, 2, 3, 4, 5].map((f) => flameCanvas(f, 6)), FLAME_FRAME.w, FLAME_FRAME.h, 9, -1);
}

/** A small grey stone for the catapult's throw. */
function makeStone(scene: Phaser.Scene): void {
  if (scene.textures.exists('stone-shot')) return;
  const c = document.createElement('canvas');
  c.width = c.height = 14;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b2a3d'; g.beginPath(); g.arc(7, 7, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9aa3ac'; g.beginPath(); g.arc(7, 7, 5.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9d0d6'; g.beginPath(); g.arc(5, 5, 2, 0, Math.PI * 2); g.fill();
  scene.textures.addCanvas('stone-shot', c);
}

/**
 * The art for each colour whose Lancer sheet is loaded, as small jobs (a strip each; a colour already done is skipped). Drawing it all takes
 * a couple of seconds, so the map runs the jobs one per frame after it is up instead of making the player wait.
 */
export function newUnitArtJobs(scene: Phaser.Scene, own: PlayerColor, colors: PlayerColor[]): (() => void)[] {
  const jobs: (() => void)[] = [() => makeStone(scene)];
  for (const color of new Set([own, ...colors])) {
    const lancer = key(color, own, 'lancer-attack');
    if (!scene.textures.exists(lancer)) continue;
    const img = scene.textures.get(lancer).getSourceImage() as HTMLImageElement;
    const team = color as TeamName;
    const { w, h } = HORSE_FRAME;
    jobs.push(
      () => addStrip(scene, key(color, own, 'suvari-run'), [0, 1, 2, 3].map((p) => horsemanCanvas(img, team, p, 0)), w, h, 10, -1),
      () => addStrip(scene, key(color, own, 'suvari-idle'), [horsemanCanvas(img, team, 1, 0)], w, h, 1, -1),
      () => addStrip(scene, key(color, own, 'suvari-attack'), [0, 1, 2].map((f) => horsemanCanvas(img, team, 2, f)), w, h, 8, 0),
      () => addStrip(scene, key(color, own, 'mancinik-idle'), [catapultCanvas(team, false, 0)], CATAPULT_FRAME.w, CATAPULT_FRAME.h, 1, -1),
      () => addStrip(scene, key(color, own, 'mancinik-fire'), [catapultCanvas(team, true, 0.3), catapultCanvas(team, true, 0.6), catapultCanvas(team, false, 0.9)],
        CATAPULT_FRAME.w, CATAPULT_FRAME.h, 4, 0),
    );
  }
  return jobs;
}

/** All of it at once (a spectator's late load, or a map that has to show cavalry right away). */
export function makeNewUnitArt(scene: Phaser.Scene, own: PlayerColor, colors: PlayerColor[]): void {
  for (const job of newUnitArtJobs(scene, own, colors)) job();
}
