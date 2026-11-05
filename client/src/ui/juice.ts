import { lowGraphics, reducedEffects } from '../prefs';

// Small interface effects (the CSS is in juice.css): numbers that rise over a resource when it grows by a good amount, and confetti (a win) or ash (a defeat)
// over the end screen. Nothing here touches the game; "Efektleri azalt" and low graphics switch it all off.

const calm = (): boolean => reducedEffects() || lowGraphics();

/** Keeps the page's `kf-calm` class in step with the settings (called at start and when a setting changes). */
export function applyCalm(): void { document.documentElement.classList.toggle('kf-calm', calm()); }

/** A "+N" that rises from <paramref name="host"/> (a resource chip) and fades. */
export function floatNumber(host: HTMLElement, text: string, kind: string): void {
  if (calm()) return;
  const el = document.createElement('span');
  el.className = `float-num ${kind}`;
  el.textContent = text;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), 1300);
}

const COLORS = ['#f5c542', '#e0553f', '#3f7fd4', '#59b84a', '#a45bc8', '#ffffff'];
/** Confetti falls over <paramref name="parent"/> for a few seconds; on a defeat it is grey ash, slower and fewer. */
export function confetti(parent: HTMLElement, win: boolean): void {
  if (calm()) return;
  const box = document.createElement('div');
  box.className = win ? 'confetti' : 'confetti ash';
  const n = win ? 70 : 24;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const dur = win ? 2.4 + Math.random() * 2.2 : 4 + Math.random() * 3;
    p.style.cssText = `left:${Math.random() * 100}%;background:${COLORS[i % COLORS.length]};animation-duration:${dur}s;animation-delay:${Math.random() * (win ? 1.6 : 2.5)}s;--drift:${Math.round((Math.random() - 0.5) * 120)}px`;
    box.appendChild(p);
  }
  parent.appendChild(box);
  window.setTimeout(() => box.remove(), 9000);
}
