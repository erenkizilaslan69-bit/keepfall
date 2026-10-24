import type { GameConnection } from '../net';
import type { CastleView, RoomView } from '../types';
import { Notifications, type NoteKind } from './notifications';
import { ReportTags } from './reports';
import { TopBar } from './topbar';

// Everything drawn over the map: the top bar, ribbons, report tags (and, step by step, the windows).
// One instance per game screen; `update` takes every castle state the server sends.

export class GameUi {
  private readonly top: HTMLElement;
  private readonly bar: TopBar;
  private readonly notes: Notifications;
  private readonly reports: ReportTags;
  private phase: CastleView['phase'] | null = null;
  private eliminated = false;
  private readonly onKey = (e: KeyboardEvent) => this.keydown(e);

  constructor(root: HTMLElement, net: GameConnection, seat: number) {
    root.innerHTML = '';
    this.top = document.createElement('div');
    this.top.className = 'ui-top';
    root.appendChild(this.top);
    this.bar = new TopBar(this.top, {
      speed: (n) => void net.setSpeed(n).then((r) => { if (!r.ok) this.error(r.error ?? 'Hız değişmedi.'); }),
      player: () => {},
    });
    this.bar.setSeat(seat);
    this.notes = new Notifications(this.top);
    this.reports = new ReportTags(root);
    window.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
  }

  update(s: CastleView): void {
    this.bar.update(s);
    this.reports.update(s.war.battles);
    this.notes.setIncoming(s.eliminated ? [] : s.war.incoming, s.speed);
    this.notes.setSticky('hunger', s.starving && !s.eliminated, 'Açlık! Yemek bitti, tüm üretim yarıya indi.');
    this.notes.setSticky('out', s.eliminated, 'Kalen düştü — elendin. Artık sadece izleyicisin.', 'info');
    if (this.phase === 'preparation' && s.phase === 'war') this.notes.push('Savaş başladı! Orduların yola çıkabilir.', 'battle', 6000);
    if (!this.eliminated && s.eliminated) this.notes.push('Kalen düştü!', 'danger', 6000);
    this.phase = s.phase;
    this.eliminated = s.eliminated;
  }

  setRoom(room: RoomView): void {
    this.bar.setRoom(room);
  }

  /** Something that happened to us (a server notification). */
  notify(text: string): void {
    // The ribbon with the countdown already says an army is coming.
    if (text.includes('yaklaşıyor')) return;
    const kind: NoteKind = /düştü|elendi/.test(text) ? 'danger' : /saldır|çarpış|yendin|yenildin|püskürt|savaş/i.test(text) ? 'battle' : 'info';
    this.notes.push(text, kind, 6000);
  }

  /** A command that did not work, or something else the player must know. */
  error(text: string): void {
    this.notes.push(text, 'danger', 3500);
  }

  setStatus(text: string, ok: boolean): void {
    this.notes.setSticky('connection', !ok, text);
  }

  private keydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (this.reports.isOpen) this.reports.close();
  }
}
