// Signs on the map (building names, the castle's health, army sizes): HTML over the canvas, so the text is
// sharp at every zoom. The scene says where each one belongs in scene pixels; `layout` moves them with the
// camera once per frame, shrinks them as the view zooms out and hides the ones that would only clutter.

export interface LabelSpec {
  /** Scene pixels. */
  x: number;
  y: number;
  html: string;
  cls?: string;
  /** Which point of the sign sits at (x, y). */
  anchor?: 'top' | 'bottom' | 'center';
  /** Hidden when the camera is zoomed out further than this. */
  minZoom?: number;
}

interface Item extends Required<Omit<LabelSpec, 'x' | 'y' | 'html' | 'cls'>> {
  el: HTMLElement;
  html: string;
  cls: string;
  x: number;
  y: number;
  placed: string;
}

const TRANSLATE = { top: '-50%, 0', bottom: '-50%, -100%', center: '-50%, -50%' };

export class WorldLabels {
  readonly layer: HTMLElement;
  private readonly items = new Map<string, Item>();

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'world-labels';
    root.appendChild(this.layer);
  }

  /** Add the sign or change it; cheap to call every frame. */
  set(key: string, spec: LabelSpec): void {
    let it = this.items.get(key);
    if (!it) {
      const el = document.createElement('div');
      el.style.display = 'none';
      this.layer.appendChild(el);
      it = { el, html: '', cls: '', x: 0, y: 0, anchor: 'bottom', minZoom: 0, placed: 'none' };
      this.items.set(key, it);
    }
    const cls = `wl ${spec.cls ?? ''}`;
    if (it.cls !== cls) { it.el.className = cls; it.cls = cls; }
    if (it.html !== spec.html) { it.el.innerHTML = spec.html; it.html = spec.html; }
    it.x = spec.x;
    it.y = spec.y;
    it.anchor = spec.anchor ?? 'bottom';
    it.minZoom = spec.minZoom ?? 0;
  }

  remove(key: string): void {
    this.items.get(key)?.el.remove();
    this.items.delete(key);
  }

  /** Put every sign where the camera now sees its spot. */
  layout(screenOf: (p: { x: number; y: number }) => { x: number; y: number }, zoom: number): void {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = Math.round(Math.min(1.1, Math.max(0.7, zoom * 1.1)) * 20) / 20;
    for (const it of this.items.values()) {
      const p = screenOf(it);
      const hidden = zoom < it.minZoom || p.x < -240 || p.x > w + 240 || p.y < -160 || p.y > h + 160;
      const placed = hidden ? 'none' : `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) scale(${scale}) translate(${TRANSLATE[it.anchor]})`;
      if (placed === it.placed) continue;
      it.placed = placed;
      if (hidden) it.el.style.display = 'none';
      else { it.el.style.display = ''; it.el.style.transform = placed; }
    }
  }

  destroy(): void {
    this.layer.remove();
    this.items.clear();
  }
}
