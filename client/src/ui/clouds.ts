import { assetUrl } from '../scene/assets';

// The curtain of clouds between the lobby and the map: the clouds close over the screen when the match begins and part when the map is ready.

const CLOUDS = 8;

export class CloudCurtain {
  private el: HTMLElement | null = null;
  private failsafe = 0;

  /** Clouds sweep in from both sides until the screen is covered. */
  cover(): void {
    this.remove();
    const el = document.createElement('div');
    el.className = 'cloud-curtain closing';
    const rows = 5, perRow = 4;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < perRow; c++) {
        const left = c < perRow / 2;
        const img = document.createElement('img');
        img.src = assetUrl(`Terrain/Decorations/Clouds/Clouds_0${1 + ((r * perRow + c) % CLOUDS)}.png`);
        img.alt = '';
        img.className = `cloud ${left ? 'from-left' : 'from-right'}`;
        img.style.top = `${(r / (rows - 1)) * 82 - 8}%`;
        img.style.left = `${(c / (perRow - 1)) * 80 - 12}%`;
        img.style.animationDelay = `${(r * 0.07 + c * 0.05).toFixed(2)}s`;
        img.style.setProperty('--size', `${360 + ((r * 7 + c * 3) % 4) * 60}px`);
        el.appendChild(img);
      }
    document.body.appendChild(el);
    this.el = el;
    // Whatever goes wrong, the screen is not left covered.
    this.failsafe = window.setTimeout(() => this.open(), 20_000);
  }

  /** The clouds part to both sides and the map shows. */
  open(): void {
    window.clearTimeout(this.failsafe);
    const el = this.el;
    if (!el) return;
    el.classList.remove('closing');
    el.classList.add('opening');
    window.setTimeout(() => { if (this.el === el) this.remove(); }, 1500);
  }

  remove(): void {
    window.clearTimeout(this.failsafe);
    this.el?.remove();
    this.el = null;
  }
}
