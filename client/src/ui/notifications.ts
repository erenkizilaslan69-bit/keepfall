import { esc } from '../format';
import { t, tr } from '../i18n';
import type { IncomingView } from '../types';
import { ABLATIVE } from './report-html';

// Ribbons under the top bar: messages that fade after a few seconds (at most three at once), and the
// ones that stay as long as they are true (an army coming with its countdown, hunger, a lost
// connection, being out of the match).

export type NoteKind = 'info' | 'battle' | 'danger';
const COLOR: Record<NoteKind, string> = { info: 'blue', battle: 'yellow', danger: 'red' };
const MAX_VISIBLE = 3;

export class Notifications {
  private readonly el: HTMLElement;
  private readonly sticky = new Map<string, HTMLElement>();
  private incoming: IncomingView[] = [];
  private incomingAt = 0;
  private speed = 1;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'notes';
    parent.appendChild(this.el);
    // The countdown runs between server ticks too.
    this.timer = window.setInterval(() => { this.renderIncoming(); this.avoidWindows(); }, 250);
  }

  /** The match screen is gone: stop the countdown (it kept running on a detached element for every earlier match). */
  destroy(): void {
    window.clearInterval(this.timer);
    window.clearInterval(this.holdTimer);
    this.el.remove();
  }

  /**
   * A window (docked at the left, the right or in the middle) must never lie under the notes, nor the notes over the window's cross: while one is open the notes stand in
   * the widest free strip beside it, under the top bar; with no room on either side they stay where they are (top centre). Phones have their own rule (touch.css).
   */
  private avoidWindows(): void {
    const s = this.el.style;
    const win = document.querySelector<HTMLElement>('.ui-root .win:not(.hidden), .ui-root .scroll-pop:not(.hidden)');
    if (!win || window.matchMedia('(pointer: coarse) and (max-height: 520px)').matches) { if (s.left) { s.left = s.top = s.right = s.width = s.maxWidth = s.transform = s.alignItems = ''; } return; }
    const r = win.getBoundingClientRect(), vw = window.innerWidth;
    const top = Math.max(document.querySelector<HTMLElement>('.topbar')?.getBoundingClientRect().bottom ?? 60, document.querySelector<HTMLElement>('.kingdom-fab:not(.hidden)')?.getBoundingClientRect().bottom ?? 0) + 10;
    const left = r.left - 24, right = vw - r.right - 24 - 240; // (the right edge keeps the rail of buttons and the minimap)
    if (Math.max(left, right) < 200) { if (s.left) { s.left = s.top = s.right = s.width = s.maxWidth = s.transform = s.alignItems = ''; } return; }
    const w = Math.min(340, Math.max(left, right));
    s.left = `${left >= right ? Math.max(12, r.left - 12 - w) : r.right + 12}px`;
    s.right = 'auto'; s.top = `${top}px`; s.width = `${w}px`; s.maxWidth = `${w}px`; s.transform = 'none'; s.alignItems = 'flex-start';
  }

  private readonly recent = new Map<string, number>();
  private readonly held: Array<() => void> = [];
  private holdTimer = 0;

  /** True while a modal (the spectator countdown, the guide, the settings, a report) is open: notes wait their turn instead of lying over its text. */
  private get modalOpen(): boolean {
    return !!document.querySelector('.spec-wait:not(.hidden), .modal-shade:not(.hidden), .guide-overlay, .settings-overlay');
  }

  /** A message that goes away by itself; <paramref name="onClick"/> makes it a button (and a click dismisses it). */
  push(text: string, kind: NoteKind = 'info', ms = 5000, onClick?: () => void): void {
    // The same words twice within ten seconds are one note.
    const now = performance.now();
    if (now - (this.recent.get(text) ?? -1e9) < 10_000) return;
    this.recent.set(text, now);
    if (this.modalOpen) {
      this.held.push(() => this.show(text, kind, ms, onClick));
      if (!this.holdTimer) this.holdTimer = window.setInterval(() => {
        if (this.modalOpen) return;
        window.clearInterval(this.holdTimer); this.holdTimer = 0;
        for (const f of this.held.splice(0, 2)) f(); // (at most two at a time, the rest is dropped: they were about moments that have passed)
      }, 400);
      return;
    }
    this.show(text, kind, ms, onClick);
  }

  private show(text: string, kind: NoteKind, ms: number, onClick?: () => void): void {
    const note = this.ribbon(text, COLOR[kind]);
    note.classList.add('fading');
    if (onClick) {
      note.classList.add('clickable', 'strong');
      note.title = t('Tıkla: raporu aç');
      note.addEventListener('click', () => { onClick(); note.remove(); });
    }
    this.el.appendChild(note);
    const timed = [...this.el.querySelectorAll('.fading')];
    while (timed.length > MAX_VISIBLE) timed.shift()!.remove();
    window.setTimeout(() => {
      note.classList.add('out');
      window.setTimeout(() => note.remove(), 400);
    }, ms);
  }

  /** A message that stays while <paramref name="on"/> is true. */
  setSticky(key: string, on: boolean, text = '', kind: NoteKind = 'danger'): void {
    const existing = this.sticky.get(key);
    if (!on) {
      existing?.remove();
      this.sticky.delete(key);
      return;
    }
    if (existing) {
      if (existing.dataset.text !== text) { existing.querySelector('span')!.textContent = text; existing.dataset.text = text; }
      return;
    }
    const note = this.ribbon(text, COLOR[kind]);
    note.dataset.text = text;
    this.sticky.set(key, note);
    this.el.prepend(note);
  }

  /** Armies coming for us: one red ribbon each with the seconds left. */
  setIncoming(list: IncomingView[], speed: number): void {
    this.incoming = list;
    this.incomingAt = performance.now();
    this.speed = speed;
    this.renderIncoming();
  }

  private renderIncoming(): void {
    const elapsed = ((performance.now() - this.incomingAt) / 1000) * this.speed;
    this.incoming.forEach((w, i) => {
      const left = Math.max(0, Math.ceil(w.arrivesInSeconds - elapsed));
      this.setSticky(`incoming:${i}`, true, t('⚠ {0} bir ordu yaklaşıyor! {1} sn', tr(ABLATIVE[w.fromColor] ?? 'Bir rakipten'), left));
    });
    for (const key of [...this.sticky.keys()])
      if (key.startsWith('incoming:') && Number(key.slice(9)) >= this.incoming.length) this.setSticky(key, false);
  }

  private ribbon(text: string, color: string): HTMLElement {
    const note = document.createElement('div');
    note.className = `ribbon ribbon-sm ribbon-${color} note hit`;
    note.innerHTML = `<span>${esc(tr(text))}</span>`;
    return note;
  }
}
