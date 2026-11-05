import Phaser from 'phaser';
import type { BuildingType, PlayerColor } from '../types';
import type { Chimneys } from './Chimneys';
import type { Foot } from './Blocks';
import { SITES, type Point } from './layout';
import { placePart } from './parts';

/**
 * One building of a castle at a level, drawn the way our own and a spectator's castles are: the pack's houses, with what the layout put around it.
 * Returns the sprites and the feet of the building (in the castle's own coordinates), where nobody may stand: whatever the layout put there (sheep,
 * bushes) steps aside. `off`: where the castle's corner is; `keyOf`: another colour's sheets have other keys.
 */
export function drawBuilding(scene: Phaser.Scene, type: BuildingType, level: number, _color: PlayerColor, off: Point,
  keyOf: (key: string) => string, _chimneys: Chimneys, _chimneyId: string): { sprites: Phaser.GameObjects.Sprite[]; feet: Foot[] } {
  const feet: Foot[] = [];
  const all = SITES[type].parts(level);
  const houses = (key: string) => /^(house|tower|barracks|archery)/.test(key);
  for (const p of all) {
    if (!houses(p.key)) continue;
    const w = scene.textures.getFrame(keyOf(p.key)).realWidth * (p.scale ?? 1);
    feet.push({ l: p.x - w * 0.34, r: p.x + w * 0.34, t: p.y - 24, b: p.y + 3 });
  }
  return { sprites: all.map((p) => placePart(scene, p, off, keyOf)), feet };
}
