import type { GameConnection } from '../net';
import type { BuildingType, CastleView, RoomView } from '../types';

// The contextual windows on the map. One is open at a time, next to the thing it is about: a
// building, our castle, an enemy castle, one of our armies or scouts, the forest. Clicking another
// thing moves the window to it; Esc, a click on empty ground or the cross closes it.

export type Target =
  | { kind: 'building'; type: BuildingType }
  | { kind: 'castle' }
  | { kind: 'enemy'; seat: number }
  | { kind: 'army'; id: string }
  | { kind: 'scout'; id: string }
  | { kind: 'forest'; id: string };

export const sameTarget = (a: Target | null, b: Target | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Where a target is on the screen (CSS px) and about how far it reaches to the side. */
export interface Anchor { x: number; y: number; reach: number }

export interface WinContext {
  net: GameConnection;
  /** Show a message for something that did not work. */
  say: (message: string) => void;
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

  protected constructor(protected readonly ctx: WinContext, ribbon: string) {
    this.el = document.createElement('div');
    this.el.className = 'win paper hit';
    this.el.innerHTML = `
      <button class="btn-round btn-red win-close" data-close title="Kapat (Esc)"><i class="ico ico-close"></i></button>
      <div class="win-title ribbon ribbon-sm ribbon-${ribbon}"></div>
      <div class="win-body"></div>`;
    this.title = this.el.querySelector('.win-title')!;
    this.body = this.el.querySelector('.win-body')!;
    this.el.querySelector('[data-close]')!.addEventListener('click', () => ctx.close());
  }

  protected setTitle(html: string): void {
    if (this.title.innerHTML !== html) this.title.innerHTML = html;
  }

  /** New state from the server (about once a second). Update in place; never rebuild what the player is using. */
  abstract update(data: WinData): void;

  /** The target is gone (an army that came home): close the window. */
  gone(): boolean { return false; }
}

const MARGIN = 8;

export class WindowManager {
  private win: Win | null = null;
  private target: Target | null = null;
  private anchor: (() => Anchor | null) | null = null;

  constructor(private readonly root: HTMLElement, private readonly topBottom: () => number) {}

  get current(): Target | null { return this.target; }
  get isOpen(): boolean { return this.win !== null; }

  open(target: Target, win: Win, anchor: () => Anchor | null): void {
    this.close();
    this.target = target;
    this.win = win;
    this.anchor = anchor;
    win.el.style.visibility = 'hidden';
    this.root.appendChild(win.el);
    this.reposition();
  }

  close(): void {
    this.win?.el.remove();
    this.win = null;
    this.target = null;
    this.anchor = null;
  }

  update(data: WinData): void {
    if (!this.win) return;
    if (this.win.gone()) { this.close(); return; }
    this.win.update(data);
  }

  /** Called every frame: the window follows its target over the map and stays on screen. */
  reposition(): void {
    const win = this.win;
    if (!win) return;
    const el = win.el;
    const vw = window.innerWidth, vh = window.innerHeight;
    const a = this.anchor?.();
    el.style.maxHeight = '';
    const top = this.topBottom() + MARGIN;
    const w = el.offsetWidth, h = Math.min(el.offsetHeight, vh - top - MARGIN);
    let x: number, y: number;
    if (vw < 760 || !a) {
      // A narrow window: a sheet at the bottom of the screen.
      x = (vw - w) / 2;
      y = vh - h - MARGIN;
    } else {
      // To the right of the target if it fits, else to the left; vertically centred on it.
      x = a.x + a.reach + MARGIN;
      if (x + w > vw - MARGIN) x = a.x - a.reach - MARGIN - w;
      x = Math.max(MARGIN, Math.min(vw - w - MARGIN, x));
      y = Math.max(top, Math.min(vh - h - MARGIN, a.y - h / 2));
    }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.setProperty('--win-max', `${Math.max(120, vh - top - MARGIN)}px`);
    el.style.visibility = '';
  }
}
