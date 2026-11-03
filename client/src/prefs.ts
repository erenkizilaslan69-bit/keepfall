// Small settings of the player that are not about sound (sound keeps its own in audio.ts). Kept in localStorage when it works.

const KEY = 'keepfall.prefs';

interface Prefs { reduceEffects: boolean; showFps: boolean; lowGraphics: boolean }

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return { reduceEffects: p.reduceEffects === true, showFps: p.showFps === true, lowGraphics: p.lowGraphics === true };
  } catch {
    return { reduceEffects: false, showFps: false, lowGraphics: false };
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

function save(next: Prefs): void {
  prefs = next;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* the choice lasts until the page is closed */ }
}

export function setReduceEffects(on: boolean): void {
  save({ ...prefs, reduceEffects: on });
}

/** "FPS göster": a small counter in the corner (frames a second and the round trip to the server). */
export function showsFps(): boolean {
  return prefs.showFps;
}

export function setShowFps(on: boolean): void {
  save({ ...prefs, showFps: on });
  for (const f of fpsListeners) f();
}
const fpsListeners = new Set<() => void>();
export function onShowFpsChange(f: () => void): void { fpsListeners.add(f); }

/**
 * "Düşük grafik": no particles (dust, sparks, smoke, embers), no chimney smoke, a third of the map's ornaments, and the fog without its smooth rim,
 * redrawn less often. The particles stop at once; the ornaments and the fog are built when the map is, so the page is loaded again to change them.
 */
export function lowGraphics(): boolean {
  return prefs.lowGraphics || new URLSearchParams(location.search).get('low') === '1';
}

export function setLowGraphics(on: boolean): void {
  save({ ...prefs, lowGraphics: on });
}
