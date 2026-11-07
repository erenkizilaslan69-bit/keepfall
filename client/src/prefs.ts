// Small settings of the player that are not about sound (sound keeps its own in audio.ts). Kept in localStorage when it works.

const KEY = 'keepfall.prefs';

interface Prefs { reduceEffects: boolean; showFps: boolean; lowGraphics: boolean; showMessages: boolean; showHints: boolean; fullRules: boolean }

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    // A touch device (a phone) starts with low graphics until the player chooses otherwise.
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return { reduceEffects: p.reduceEffects === true, showFps: p.showFps === true, lowGraphics: typeof p.lowGraphics === 'boolean' ? p.lowGraphics : touch, showMessages: p.showMessages !== false, showHints: p.showHints !== false, fullRules: p.fullRules === true };
  } catch {
    return { reduceEffects: false, showFps: false, lowGraphics: false, showMessages: true, showHints: true, fullRules: false };
  }
}

let prefs = load();

/** "Efektleri azalt": no camera shake, no sparks and arrow trails. Also on when the system asks for less motion. */
// (Asked many times a frame: the media query is made once, a MediaQueryList always holds the current answer.)
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
export function reducedEffects(): boolean {
  return prefs.reduceEffects || (reducedMotion?.matches ?? false);
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
  document.documentElement.classList.toggle('kf-calm', reducedEffects() || lowGraphics());
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

const lowByUrl = new URLSearchParams(location.search).get('low') === '1'; // (read once: it is asked every frame)
/**
 * "Düşük grafik": no particles (dust, sparks, smoke, embers), no chimney smoke, a third of the map's ornaments, and the fog without its smooth rim,
 * redrawn less often. The particles stop at once; the ornaments and the fog are built when the map is, so the page is loaded again to change them.
 */
export function lowGraphics(): boolean {
  return prefs.lowGraphics || lowByUrl;
}

export function setLowGraphics(on: boolean): void {
  save({ ...prefs, lowGraphics: on });
}

// Messages in envoys (a decree from one player to another): the player can switch them off, and the site (CrazyGames) can switch chat off for everybody.
// Off means no message is shown and the envoy window has no box to write one; goods still travel.
const siteChat = { off: false };
export function setSiteChatOff(off: boolean): void { siteChat.off = off; }
export function messagesOn(): boolean { return prefs.showMessages && !siteChat.off; }
export function userShowsMessages(): boolean { return prefs.showMessages; }
export function setShowMessages(on: boolean): void { save({ ...prefs, showMessages: on }); }

/** "İpuçlarını göster": the short contextual tips (idle workers, low food, an army on its way ...). On by default. */
export function showsHints(): boolean { return prefs.showHints; }
export function setShowHints(on: boolean): void { save({ ...prefs, showHints: on }); }
/** "Tam kurallarla oyna": the first matches and the first challenge cards play by the starter rules (no kingdom abilities, fixed rows) unless this is on. */
export function playsFullRules(): boolean { return prefs.fullRules; }
export function setFullRules(on: boolean): void { save({ ...prefs, fullRules: on }); }

// ---- how many matches this browser has started (a new player's first three matches have easy bots) ------------------------------------------------------
const MATCHES_KEY = 'keepfall.matches';
export const matchesStarted = (): number => { try { return Number(localStorage.getItem(MATCHES_KEY)) || 0; } catch { return 0; } };
export function countMatch(): void { try { localStorage.setItem(MATCHES_KEY, String(matchesStarted() + 1)); } catch { /* not counted */ } }
export const newPlayer = (): boolean => matchesStarted() < 3;
