import { reducedEffects } from '../prefs';

// Short colour washes over the whole screen at the big moments (our castle falls, the view turns to a spectator's, the match ends): cosmetic, never
// in the way of a click, and skipped for people who asked for less motion.

function wash(color: string, from: number, peak: number, inMs: number, outMs: number): void {
  if (reducedEffects()) return;
  const el = document.createElement('div');
  el.className = 'kf-wash';
  el.style.background = color;
  el.style.opacity = String(from);
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = `opacity ${inMs}ms ease-out`;
    el.style.opacity = String(peak);
    window.setTimeout(() => {
      el.style.transition = `opacity ${outMs}ms ease-in`;
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), outMs + 80);
    }, inMs);
  }));
  window.setTimeout(() => el.remove(), inMs + outMs + 1500); // whatever happens, it does not stay
}

/** The screen starts covered by <paramref name="color"/> and clears over <paramref name="ms"/> (a scene change). */
export function fadeFrom(color: string, ms: number, opacity = 1): void {
  wash(color, opacity, opacity, 0, ms);
}

/** A flash that swells and fades: our castle has fallen. */
export function pulse(color: string, peak: number, inMs: number, outMs: number): void {
  wash(color, 0, peak, inMs, outMs);
}
