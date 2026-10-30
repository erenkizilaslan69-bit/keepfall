import Phaser from 'phaser';
import type { BuildingType, PlayerColor } from '../types';
import { resolveOut, type Foot } from './Blocks';
import type { Chimneys } from './Chimneys';
import { kingdomBuildingParts } from './KingdomSprites';
import { SITES, type Point } from './layout';
import { placeKingdomPart, placePart } from './parts';

/**
 * One building of a castle at a level, drawn the way our own and a spectator's castles are: the kingdom's picture (when the castle has a look) or the
 * pack's plain houses, with what the layout put around it. Returns the sprites and the feet of the building (in the castle's own coordinates), where
 * nobody may stand: whatever the layout put there (sheep, bushes) steps aside.
 * `off`: where the castle's corner is; `keyOf`: another colour's sheets have other keys; `chimneyId`: the id of the building's smoke.
 */
export function drawBuilding(scene: Phaser.Scene, type: BuildingType, level: number, look: string | null, color: PlayerColor, off: Point,
  keyOf: (key: string) => string, chimneys: Chimneys, chimneyId: string): { sprites: Phaser.GameObjects.Sprite[]; feet: Foot[] } {
  const site = SITES[type];
  const feet: Foot[] = [];
  const baseY = site.center.y + site.area.h * 0.22;
  const kparts = look ? kingdomBuildingParts(scene, look, type, level, color, site.center.x + (type === 'lumberCamp' ? -84 : 0), baseY) : [];
  const main = kparts[0];
  if (main) {
    const tex = scene.textures.get(main.key).getSourceImage() as HTMLCanvasElement, w = tex.width * main.scale, h = tex.height * main.scale;
    feet.push({ l: main.x - w * 0.4, r: main.x + w * 0.4, t: main.y - h * 0.24, b: main.y + 4 });
  }
  const all = site.parts(level);
  const houses = (key: string) => /^(house|tower|barracks|archery)/.test(key);
  if (!main) {
    for (const p of all) {
      if (!houses(p.key)) continue;
      const w = scene.textures.getFrame(keyOf(p.key)).realWidth * (p.scale ?? 1);
      feet.push({ l: p.x - w * 0.34, r: p.x + w * 0.34, t: p.y - 24, b: p.y + 3 });
    }
  }
  const plain = (look ? all.filter((p) => !houses(p.key)) : all).map((p) => (main ? { ...p, ...resolveOut(p, feet, 14) } : p));
  const sprites = plain.map((p) => placePart(scene, p, off, keyOf));
  for (const kp of kparts) {
    const moved = { ...kp, x: kp.x + off.x, y: kp.y + off.y, depthY: kp.depthY + off.y };
    sprites.push(placeKingdomPart(scene, moved));
    if (kp.chimney) chimneys.set(chimneyId, kp.chimney.x + off.x, kp.chimney.y + off.y, look!);
  }
  return { sprites, feet };
}
