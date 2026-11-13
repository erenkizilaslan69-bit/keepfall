// Readability floor: the body text of the panels (windows, the kingdom panel, settings, reports, the About / Privacy window) is never smaller than 14 px on the screen.
// The sizes come from many em-based rules (.85em of .9em ...); instead of raising them one by one, text that ends up under the floor is set to the floor here.
// Only text that is too small is touched (bigger text keeps its size); a resize (the interface scale changes) lifts the floor first and measures again.

const MIN = 14;
const PANELS = '.win, .kingdom-panel, .settings, .info-win, .report-win, .scout-report, .tut-card';
/** The HUD and signs (resource rates, deck card tags, the "0/4" of a building sign): a floor of 12 px. */
const HUD = '.topbar, .world-labels, .ucard, .rank-chart, .xp-block';
const HUD_MIN = 12;

function floorIn(root: Element, min = MIN): void {
  const els = [root, ...root.querySelectorAll('*')];
  for (const el of els) {
    if (!(el instanceof HTMLElement) || el.dataset.floor === '1') continue;
    if (!el.childNodes.length) continue;
    let own = false;
    for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) { own = true; break; }
    if (!own) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < min - 0.05) { el.style.fontSize = `${min}px`; el.dataset.floor = '1'; }
  }
}

function floorAll(): void { document.querySelectorAll(PANELS).forEach((p) => floorIn(p)); document.querySelectorAll(HUD).forEach((p) => floorIn(p, HUD_MIN)); }

function liftAll(): void {
  document.querySelectorAll<HTMLElement>('[data-floor="1"]').forEach((el) => { el.style.removeProperty('font-size'); delete el.dataset.floor; });
}

export function watchMinText(): void {
  let queued = false;
  const run = (): void => { if (queued) return; queued = true; window.setTimeout(() => { queued = false; floorAll(); }, 120); };
  new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target instanceof Element ? m.target : m.target.parentElement;
      const both = `${PANELS}, ${HUD}`;
      if (t?.closest(both) || [...m.addedNodes].some((n) => n instanceof Element && (n.matches(both) || !!n.querySelector(both)))) { run(); return; }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', () => { liftAll(); run(); });
}
