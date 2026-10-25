import { esc } from '../format';
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

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'notes';
    parent.appendChild(this.el);
    // The countdown runs between server ticks too.
    window.setInterval(() => this.renderIncoming(), 250);
  }

  /** A message that goes away by itself; <paramref name="onClick"/> makes it a button (and a click dismisses it). */
  push(text: string, kind: NoteKind = 'info', ms = 5000, onClick?: () => void): void {
    const note = this.ribbon(text, COLOR[kind]);
    note.classList.add('fading');
    if (onClick) {
      note.classList.add('clickable', 'strong');
      note.title = 'Tıkla: raporu aç';
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
      this.setSticky(`incoming:${i}`, true, `⚠ ${ABLATIVE[w.fromColor] ?? 'Bir rakipten'} bir ordu yaklaşıyor! ${left} sn`);
    });
    for (const key of [...this.sticky.keys()])
      if (key.startsWith('incoming:') && Number(key.slice(9)) >= this.incoming.length) this.setSticky(key, false);
  }

  private ribbon(text: string, color: string): HTMLElement {
    const note = document.createElement('div');
    note.className = `ribbon ribbon-sm ribbon-${color} note hit`;
    note.innerHTML = `<span>${esc(text)}</span>`;
    return note;
  }
}
