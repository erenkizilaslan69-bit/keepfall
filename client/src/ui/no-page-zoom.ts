// iOS Safari ignores `user-scalable=no`: two quick taps (on +1, a tab, a player chip...) zoom the whole page, and two fingers on the interface zoom it too. The canvas then
// sits in the top half of the screen and the interface looks huge. Four layers, so that nothing slips through (touch screens only; the map's own pinch is separate):
//   1. CSS `touch-action: manipulation` (touch.css) turns double-tap zoom off for everything but the map (`none`);
//   2. gesture events and `dblclick` are cancelled;
//   3. a second `touchend` within 300 ms is cancelled (that is what makes iOS zoom) and the press it stood for is delivered by hand, so that quick taps still count;
//   4. should the page ever end up zoomed anyway, the viewport is reset (the layout follows the new size).

const QUICK_MS = 300;
const PRESSABLE = 'button, a[href], label, summary, [role="button"], [data-act], [data-a], [data-tab], [data-cam], [data-seat], [data-step], .chip, .tab';

export function installNoPageZoom(): void {
  const doc = document;
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  doc.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  let lastEnd = 0;
  doc.addEventListener('touchend', (e) => {
    const now = Date.now();
    const quick = now - lastEnd < QUICK_MS;
    lastEnd = now;
    if (!quick || !e.cancelable || e.touches.length > 0) return;
    const target = e.target as HTMLElement | null;
    // The map takes its touches itself (touch-action: none); a text field needs the tap for its focus.
    if (!target || target.closest('#stage, canvas, input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    const press = target.closest<HTMLElement>(PRESSABLE);
    if (press && !(press as HTMLButtonElement).disabled && press.getAttribute('aria-disabled') !== 'true') press.click();
  }, { passive: false });

  // Safety net: a zoomed page is put right again (the interface and the canvas are measured again at once).
  const vv = window.visualViewport;
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!vv || !meta) return;
  const original = meta.content;
  let fixing = false;
  const reset = (): void => {
    if (fixing || Math.abs(vv.scale - 1) < 0.01) return;
    fixing = true;
    meta.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    window.scrollTo(0, 0);
    window.setTimeout(() => {
      meta.content = original;
      window.dispatchEvent(new Event('resize'));
      fixing = false;
      if (Math.abs(vv.scale - 1) >= 0.01) window.setTimeout(reset, 250);
    }, 120);
  };
  vv.addEventListener('resize', reset);
  vv.addEventListener('scroll', () => { if (Math.abs(vv.scale - 1) >= 0.01) reset(); });
}
