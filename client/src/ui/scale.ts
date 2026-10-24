// UI scale: the pack's art is drawn at about half size on a normal screen, and grows on big screens so
// the interface does not shrink to nothing on 1440p / 4K. Set as --u on <html>; every size in ui.css
// is `calc(N px * var(--u))`.

export function uiScaleFor(width: number, height: number): number {
  const base = Math.min(width / 1280, height / 720); // 1 at 720p-ish and above, smaller below
  if (base >= 2.6) return 2;
  if (base >= 1.9) return 1.5;
  if (base >= 1.35) return 1.25;
  return Math.max(0.85, Math.min(1, base));
}

export function watchUiScale(): void {
  const apply = () => document.documentElement.style.setProperty('--u', String(uiScaleFor(window.innerWidth, window.innerHeight)));
  apply();
  window.addEventListener('resize', apply);
}
