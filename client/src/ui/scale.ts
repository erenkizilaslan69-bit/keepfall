// UI scale: the pack's art is drawn at about half size on a normal screen, and grows on big screens so
// the interface does not shrink to nothing on 1440p / 4K. Set as --u on <html>; every size in ui.css
// is `calc(N px * var(--u))`.

export function uiScaleFor(width: number, height: number): number {
  const base = Math.min(width / 1280, height / 720); // 1 at 720p-ish and above, smaller below
  if (base >= 2.6) return 2;
  if (base >= 1.9) return 1.5;
  if (base >= 1.35) return 1.25;
  // A phone held sideways is only 360-430 px tall: there the interface may shrink further (touch targets keep their 44 px, see touch.css).
  const phone = height < 500 && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  return Math.max(phone ? 0.78 : 0.85, Math.min(1, base));
}

import { uiScalePref } from '../prefs';

export function watchUiScale(): void {
  // (the player's own factor from the settings multiplies what the screen gives; rounded to keep the pixel art on whole steps)
  const apply = () => document.documentElement.style.setProperty('--u', String(Math.round(uiScaleFor(window.innerWidth, window.innerHeight) * uiScalePref() * 100) / 100));
  apply();
  window.addEventListener('resize', apply);
}
