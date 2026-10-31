import { asset } from '../env';
// The icons of the Tiny Swords pack (meat, wood, coin, hammer, sword, shield, close…) handed to CSS as custom properties (--ico-…).
// Panels, buttons, ribbons and signs are drawn by theme.css and need no art. If the pack is missing (it is not in the repository, see the
// README) the icons are simply empty.

const ROOT = asset('/assets/tiny-swords/Tiny Swords (Free Pack)/UI Elements/UI Elements/');
const url = (path: string) => encodeURI(ROOT + path);

/** Resolves once the icons are applied (or immediately if they cannot be loaded). */
export async function loadUiArt(): Promise<boolean> {
  try {
    const root = document.documentElement.style;
    for (const [name, file] of [['coin', '03'], ['wood', '02'], ['meat', '04'], ['hammer', '01'], ['sword', '05'], ['shield', '06'],
      ['back', '08'], ['close', '09'], ['gear', '10'], ['info', '11'], ['play', '07']] as const)
      root.setProperty(`--ico-${name}`, `url("${url(`Icons/Icon_${file}.png`)}")`);
    return true;
  } catch (e) {
    console.warn('Tiny Swords simgeleri yüklenemedi.', e);
    return false;
  }
}
