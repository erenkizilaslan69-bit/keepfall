// Small settings of the player that are not about sound (sound keeps its own in audio.ts). Kept in localStorage when it works.

const KEY = 'keepfall.prefs';

interface Prefs { reduceEffects: boolean }

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return { reduceEffects: p.reduceEffects === true };
  } catch {
    return { reduceEffects: false };
  }
}

let prefs = load();

/** "Efektleri azalt": no camera shake, no sparks and arrow trails. Also on when the system asks for less motion. */
export function reducedEffects(): boolean {
  return prefs.reduceEffects || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

export function userReducesEffects(): boolean {
  return prefs.reduceEffects;
}

export function setReduceEffects(on: boolean): void {
  prefs = { ...prefs, reduceEffects: on };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* the choice lasts until the page is closed */ }
}
