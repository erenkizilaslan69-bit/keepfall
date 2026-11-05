import Phaser from 'phaser';
import { emblemCanvas } from '../ui/tiny-ui';

// Our own kingdom's banner, hung by our castle's gate: a pole with a crossbar and a cream cloth carrying the kingdom's emblem. Drawn in code at load time.
// Only our own castle has one: the kingdom is secret, a rival's castle never shows it.

/** The texture key of a kingdom's banner (made once), or null for an unknown kingdom. */
export function kingdomBanner(scene: Phaser.Scene, id: string): string | null {
  const key = `kf-banner-${id}`;
  if (scene.textures.exists(key)) return key;
  const emblem = emblemCanvas(id, 2);
  if (!emblem) return null;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 84;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const O = '#241a14';
  g.fillStyle = O; g.fillRect(21, 2, 6, 82); g.fillRect(4, 2, 40, 6);
  g.fillStyle = '#8a5a34'; g.fillRect(22, 4, 4, 80); g.fillRect(5, 3, 38, 4);
  g.fillStyle = O; g.fillRect(8, 8, 32, 52);                       // the cloth's outline
  g.fillStyle = '#ecdfbd'; g.fillRect(10, 8, 28, 50);
  g.fillStyle = '#d4c49a'; g.fillRect(10, 52, 28, 6);              // a shade at the foot
  g.fillStyle = O; g.fillRect(8, 56, 8, 8); g.fillRect(32, 56, 8, 8); // the swallow-tail
  g.fillStyle = '#ecdfbd'; g.fillRect(10, 56, 4, 4); g.fillRect(34, 56, 4, 4);
  g.drawImage(emblem, 12, 14);
  scene.textures.addCanvas(key, c);
  return key;
}
