import { sfx } from '../audio';
import type { GameConnection } from '../net';
import type { ArmyView, BuildingType, CastleView, RoomView, SiteView } from '../types';

// The contextual windows on the map. One is open at a time, next to the thing it is about: a
// building, our castle, an enemy castle, one of our armies or scouts, the forest. Clicking another
// thing moves the window to it; Esc, a click on empty ground or the cross closes it.

export type Target =
  | { kind: 'building'; type: BuildingType }
  | { kind: 'castle' }
  | { kind: 'enemy'; seat: number }
  | { kind: 'army'; id: string }
  | { kind: 'scout'; id: string }
  /** One quarter of the forest (`id` is its corner). */
  | { kind: 'forest'; id: string }
  /** A place of the forest we have found. */
  | { kind: 'site'; id: string };

export const sameTarget = (a: Target | null, b: Target | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Where a target is on the screen (CSS px) and about how far it reaches to the side. */
export interface Anchor { x: number; y: number; reach: number }

export interface WinContext {
  net: GameConnection;
  /** Show a message for something that did not work (a red ribbon). */
  say: (message: string) => void;
  /** Show a message for something that worked (a blue ribbon). */
  info: (message: string) => void;
  /** Our seat in the room. */
  seat: number;
  /** The places of the forest we have found, as we last saw them. */
  sites?: () => SiteView[];
  /** One of our armies by the id the map gave it (null once it is gone). */
  army?: (publicId: string) => ArmyView | undefined;
  /** Open a window for another target (e.g. from a button). */
  open: (target: Target) => void;
  close: () => void;
}

/** What a window needs to know on each state: our castle, the room and the time. */
export interface WinData { castle: CastleView; room: RoomView | null }

export abstract class Win {
  readonly el: HTMLElement;
  protected readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly more: HTMLElement;

  protected constructor(protected readonly ctx: WinContext, ribbon: string) {
    this.el = document.createElement('div');
    this.el.className = 'win paper hit';
    this.el.innerHTML = `
      <button class="btn-round btn-red win-close" data-close title="Kapat (Esc)"><i class="ico ico-close"></i></button>
      <div class="win-title ribbon ribbon-sm ribbon-${ribbon}"></div>
      <div class="win-body"></div>
      <div class="win-more" aria-hidden="true"><i class="up"></i><i class="down"></i></div>`;
    this.title = this.el.querySelector('.win-title')!;
    this.body = this.el.querySelector('.win-body')!;
    this.more = this.el.querySelector('.win-more')!;
    this.body.addEventListener('scroll', () => this.refreshMore(), { passive: true });
    this.el.querySelector('[data-close]')!.addEventListener('click', () => ctx.close());
  }

  protected setTitle(html: string): void {
    if (this.title.innerHTML !== html) this.title.innerHTML = html;
  }

  /** A body that scrolls says so (touch-windows.css draws a fade and a small arrow at the edge that has more): called every frame by the window manager. */
  refreshMore(): void {
    const b = this.body, below = b.scrollHeight - b.clientHeight - b.scrollTop > 6, above = b.scrollTop > 6;
    // The main button / the tabs stick to the edge only when the body is tall enough to show real content as well; in a short window they stay in the flow (they would cover it).
    const stuck = b.querySelector<HTMLElement>('.upgrade-box, [data-f="attack"] > .row:last-child');
    const tabs = b.querySelector<HTMLElement>('.win-tabs');
    const stickFoot = !!stuck && b.clientHeight >= stuck.offsetHeight * 2.5, stickHead = !!tabs && b.clientHeight >= tabs.offsetHeight * 2.5;
    this.el.classList.toggle('no-stick-foot', !!stuck && !stickFoot);
    this.el.classList.toggle('no-stick-head', !!tabs && !stickHead);
    b.style.scrollPaddingBottom = stickFoot ? `${stuck!.offsetHeight}px` : '';
    b.style.scrollPaddingTop = stickHead ? `${tabs!.offsetHeight}px` : '';
    this.el.classList.toggle('more-down', below);
    this.el.classList.toggle('more-up', above);
    if (!below && !above) return;
    // (a main button that sticks to the foot is above the fade, so the fade stops where it begins)
    this.more.style.setProperty('--foot', `${stickFoot ? stuck!.offsetHeight : 0}px`);
    this.more.style.setProperty('--head', `${stickHead ? tabs!.offsetHeight : 0}px`);
    const wr = this.el.getBoundingClientRect(), br = b.getBoundingClientRect();
    Object.assign(this.more.style, { left: `${Math.round(br.left - wr.left - this.el.clientLeft)}px`, top: `${Math.round(br.top - wr.top - this.el.clientTop)}px`, width: `${Math.round(br.width)}px`, height: `${Math.round(br.height)}px` });
  }

  /** New state from the server (about once a second). Update in place; never rebuild what the player is using. */
  abstract update(data: WinData): void;

  /** The target is gone (an army that came home): close the window. */
  gone(): boolean { return false; }
}

const MARGIN = 8;
/** A window is at most this share of the screen's height. */
const WIN_MAX_SHARE = 0.8;
/** The close cross hangs this far (px) outside the window's right edge. */
const CLOSE_OVERHANG = 34;
/** The close cross of a window on a touch screen hangs this far out of its corner (see touch.css). */
const CLOSE_OVERHANG_TOUCH = 0;

export class WindowManager {
  private win: Win | null = null;
  private target: Target | null = null;
  private anchor: (() => Anchor | null) | null = null;
  /** Re-places the window when its content grows or shrinks (the map's frame callback alone is too slow to catch that). */
  private watch: ResizeObserver | null = null;

  /** <paramref name="avoid"/>: parts of the screen a window should not cover (the minimap, the home button and the report tags). */
  constructor(private readonly root: HTMLElement, private readonly topBottom: () => number,
    private readonly avoid: () => DOMRect[] = () => []) {}

  get current(): Target | null { return this.target; }
  get isOpen(): boolean { return this.win !== null; }
  /** The open window's element (null: none). */
  get element(): HTMLElement | null { return this.win?.el ?? null; }

  open(target: Target, win: Win, anchor: () => Anchor | null): void {
    if (this.win === null) sfx.play('uiOpen'); // moving from one window to another is not an opening
    this.close(true);
    this.target = target;
    this.win = win;
    this.anchor = anchor;
    win.el.style.visibility = 'hidden';
    this.root.appendChild(win.el);
    this.reposition();
    this.watch = new ResizeObserver(() => this.reposition());
    this.watch.observe(win.el);
  }

  close(silent = false): void {
    if (this.win && !silent) sfx.play('uiClose');
    this.watch?.disconnect();
    this.watch = null;
    this.win?.el.remove();
    this.win = null;
    this.target = null;
    this.anchor = null;
  }

  update(data: WinData): void {
    if (!this.win) return;
    this.win.update(data);
    if (this.win.gone()) this.close();
  }

  /** Called every frame: the window follows its target over the map and stays on screen. */
  reposition(): void {
    const win = this.win;
    if (!win) return;
    const el = win.el;
    win.refreshMore();
    // The interface layer may be inset from the screen (a notch, rounded corners: touch.css), so everything is worked out inside its own box.
    const rr = this.root.getBoundingClientRect(), ox = rr.left, oy = rr.top;
    const vw = rr.width, vh = Math.min(rr.height, (window.visualViewport?.height ?? Infinity) - oy); // (above the on-screen keyboard)
    const a0 = this.anchor?.();
    const a = a0 ? { ...a0, x: a0.x - ox, y: a0.y - oy } : a0;
    el.style.maxHeight = '';
    const top = this.topBottom() - oy + MARGIN;
    // At most 80% of the screen (and never more than fits under the top bar); a long body scrolls inside the window. Set before measuring.
    let maxH = Math.max(120, Math.min(vh * WIN_MAX_SHARE, vh - top - MARGIN));
    el.style.setProperty('--win-max', `${Math.round(maxH)}px`);
    // The title, the frame and the foot add to the body's height: the window as a whole must fit, so what is over is taken off the body's share.
    const room = vh - top - MARGIN;
    if (el.offsetHeight > room) {
      maxH = Math.max(100, maxH - (el.offsetHeight - room));
      el.style.setProperty('--win-max', `${Math.round(maxH)}px`);
    }
    const w = el.offsetWidth, h = el.offsetHeight;
    let x: number, y: number;
    if (vw < 760 || !a) {
      // A narrow window: a sheet at the bottom of the screen.
      x = (vw - w) / 2;
      y = vh - h - MARGIN;
    } else {
      // To the right of the target if it fits, else to the left; vertically centred on it.
      x = a.x + a.reach + MARGIN;
      if (x + w > vw - MARGIN - CLOSE_OVERHANG) x = a.x - a.reach - MARGIN - w;
      x = Math.max(MARGIN, Math.min(vw - w - MARGIN - CLOSE_OVERHANG, x));
      y = Math.max(top, Math.min(vh - h - MARGIN, a.y - h / 2));
    }
    // Stay off the minimap and the home button: above them if there is room, else beside them.
    if (vw >= 760) {
      for (const r0 of this.avoid()) {
        const r = { left: r0.left - ox, right: r0.right - ox, top: r0.top - oy, bottom: r0.bottom - oy };
        if (x + w <= r.left || x >= r.right || y + h <= r.top || y >= r.bottom) continue;
        if (r.top - h - MARGIN >= top) y = r.top - h - MARGIN;
        else if (r.left - w - MARGIN >= MARGIN) x = r.left - w - MARGIN;
        else x = Math.min(vw - w - MARGIN - CLOSE_OVERHANG, r.right + MARGIN);
      }
    }
    // Whatever the rules above decided, the window is wholly inside the interface layer (so inside the safe area): on a phone held sideways it is a sheet in the
    // middle of the free space, otherwise it is only pushed back from the edges.
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const over = touch ? CLOSE_OVERHANG_TOUCH : CLOSE_OVERHANG;
    if (touch && vh < 520) {
      x = (vw - w) / 2;
      y = top + (vh - top - MARGIN - h) / 2;
    }
    x = Math.max(MARGIN, Math.min(vw - w - MARGIN - over, x));
    y = Math.max(top, Math.min(vh - h - MARGIN, y));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = '';
  }
}
