import { t } from '../i18n';

// Touch devices (phones, tablets): a "rotate your device" screen in portrait, long press for the tips that a mouse shows on hover, and a window that
// stays above the on-screen keyboard. Nothing here changes how a mouse and keyboard behave.

export const isTouch = (): boolean => window.matchMedia?.('(pointer: coarse)').matches ?? false;

const LONG_PRESS_MS = 600;

export function installTouch(): void {
  const root = document.documentElement;
  if (isTouch()) root.classList.add('touch');

  // Portrait: the game is made for a wide screen. The overlay is shown by CSS (touch.css) only on a touch screen held upright.
  const rotate = document.createElement('div');
  rotate.id = 'rotate-screen';
  rotate.innerHTML = `<div class="rotate-card"><i class="rotate-phone" aria-hidden="true"></i><p>${t('Cihazını yatay çevir')}</p><small>${t('Keepfall yatay ekranda oynanır.')}</small></div>`;
  document.body.appendChild(rotate);

  // The on-screen keyboard shrinks the visual viewport: the page's height variable follows it (windows use it to stay above the keyboard).
  const vv = window.visualViewport;
  if (vv) {
    const apply = () => root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    apply();
    vv.addEventListener('resize', apply);
  }
  // A field that gets the focus is brought into view once the keyboard is up.
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement | null;
    if (!el || !isTouch() || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  });

  // A menu page that scrolls: the three round buttons (fixed at the top right) step aside while the page is scrolled down, so that a card or button passing under them is
  // never covered by one; they come back as soon as the page scrolls up (or is at the top).
  if (isTouch()) {
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > 40 && y > lastY) root.classList.add('fab-away'); else if (y < lastY || y <= 40) root.classList.remove('fab-away');
      lastY = y;
    }, { passive: true });
  }

  installLongPress();
  // The keyboard goes away when a button is pressed (sending a message from an envoy form, for instance): the form is what the player wants to see.
  document.addEventListener('click', (e) => {
    if (!isTouch() || !(e.target as HTMLElement | null)?.closest?.('button')) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur();
  }, true);
}

/** A finger cannot hover: pressing and holding something that has a `title` shows that text for a moment (and the press does not count as a tap). */
function installLongPress(): void {
  let timer: number | undefined;
  let tip: HTMLElement | null = null;
  let hideTimer: number | undefined;
  let swallowUntil = 0;
  let start = { x: 0, y: 0 };

  const hide = () => { tip?.remove(); tip = null; window.clearTimeout(hideTimer); };
  const show = (target: HTMLElement, text: string) => {
    hide();
    tip = document.createElement('div');
    tip.className = 'kf-tip';
    tip.textContent = text;
    document.body.appendChild(tip);
    const r = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
    const top = r.top - h - 8 >= 6 ? r.top - h - 8 : Math.min(window.innerHeight - h - 6, r.bottom + 8);
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    hideTimer = window.setTimeout(hide, 3500);
  };

  document.addEventListener('pointerdown', (e) => {
    hide();
    window.clearTimeout(timer);
    if (e.pointerType !== 'touch') return;
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[title]');
    const text = el?.getAttribute('title');
    if (!el || !text) return;
    start = { x: e.clientX, y: e.clientY };
    timer = window.setTimeout(() => { swallowUntil = Date.now() + 1500; show(el, text); }, LONG_PRESS_MS);
  }, true);
  const cancel = () => window.clearTimeout(timer);
  document.addEventListener('pointerup', cancel, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); }, true);
  // The release of a long press must not press the button underneath.
  document.addEventListener('click', (e) => {
    if (Date.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); swallowUntil = 0; }
  }, true);
}
