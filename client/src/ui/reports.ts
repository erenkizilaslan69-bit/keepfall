import { COLOR_CSS, botMark, esc } from '../format';
import type { BattleReportView, LetterView, ScoutReportView } from '../types';
import { dot, reportHtml, resultWord } from './report-html';
import { scoutReportHtml } from './scout-report';

// Battle reports as small tags in the bottom-left corner; a click opens the whole report in the middle of the screen. A new
// report is never opened for you, its tag just flashes and fades away after eight seconds, so the fight you are watching
// is not covered; the small "Raporlar" button keeps all of them (the latest eight) one click away. Scout reports are not tags: each rival's last one is summarised in the top bar, and this window
// shows one in full (from there or from the "scout is back" ribbon).

const MAX_TAGS = 4;
/** How long a new report's tag stays on the screen before it fades away (ms), and how long the fading takes. */
const TAG_MS = 8000, FADE_MS = 800;
const ALL_TAGS = 8;

type Item = { key: string; at: number; battle: BattleReportView };

export class ReportTags {
  private readonly tags: HTMLElement;
  private readonly modal: HTMLElement;
  private items: Item[] = [];
  private now = 0;
  private seen: Set<string> | null = null;
  /** Until when (performance.now ms) each new report's tag stays up. */
  private readonly until = new Map<string, number>();
  private pinned = false;
  private readonly toggle: HTMLButtonElement;
  private sig = '';

  constructor(parent: HTMLElement) {
    this.tags = document.createElement('div');
    this.tags.className = 'report-tags';
    this.toggle = document.createElement('button');
    this.toggle.className = 'report-toggle hit hidden';
    this.toggle.title = 'Savaş raporlarının hepsini göster / gizle';
    this.toggle.addEventListener('click', () => { this.pinned = !this.pinned; this.render(); });
    window.setInterval(() => this.render(), 400);
    this.modal = document.createElement('div');
    this.modal.className = 'modal-shade hidden hit';
    parent.append(this.tags, this.toggle, this.modal);
    this.tags.addEventListener('click', (e) => {
      const key = (e.target as HTMLElement).closest<HTMLElement>('[data-report]')?.dataset.report;
      const item = this.items.find((i) => i.key === key);
      if (item) this.open(reportHtml(item.battle));
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal || (e.target as HTMLElement).closest('[data-close]')) this.close();
    });
  }

  get isOpen(): boolean { return !this.modal.classList.contains('hidden'); }

  close(): void {
    this.modal.classList.add('hidden');
  }

  /** The latest battle reports (newest first, as the server sends them); <paramref name="now"/> ages the scout report shown by <see cref="showScout"/>. */
  update(battles: BattleReportView[], now = 0): void {
    this.now = now;
    this.items = battles.map((b): Item => ({ key: `b${b.id}`, at: b.at, battle: b })).sort((a, b) => b.at - a.at);
    const keys = new Set(this.items.map((i) => i.key));
    const fresh = this.seen === null ? new Set<string>() : new Set([...keys].filter((k) => !this.seen!.has(k)));
    this.seen = new Set([...(this.seen ?? []), ...keys]);
    const t = performance.now();
    for (const k of fresh) this.until.set(k, t + TAG_MS);
    this.render();
  }

  /** Draws the tags that are up: the new ones until their time is over (fading at the end), all of them while the button is pressed. */
  private render(): void {
    const now = performance.now();
    const list = this.pinned ? this.items.slice(0, ALL_TAGS)
      : this.items.slice(0, MAX_TAGS).filter((i) => (this.until.get(i.key) ?? 0) > now);
    this.toggle.classList.toggle('hidden', this.items.length === 0);
    this.toggle.classList.toggle('on', this.pinned);
    const count = Math.min(this.items.length, ALL_TAGS);
    const toggleText = `<i class="ico ico-sword"></i><span>Raporlar</span><b>${count}</b>`;
    if (this.toggle.innerHTML !== toggleText) this.toggle.innerHTML = toggleText;
    const sig = list.map((i) => `${i.key}${!this.pinned && (this.until.get(i.key) ?? 0) - now < FADE_MS ? 'o' : ''}${this.until.get(i.key) && (this.until.get(i.key)! - now) > TAG_MS - 1500 ? 'f' : ''}`).join(',') + (this.pinned ? 'P' : '');
    if (sig === this.sig) return;
    this.sig = sig;
    this.tags.innerHTML = list.map((i) => {
      const left = (this.until.get(i.key) ?? 0) - now;
      const f = !this.pinned && left > TAG_MS - 1500 ? 'fresh' : '';
      const out = !this.pinned && left < FADE_MS ? 'leaving' : '';
      const b = i.battle;
      return `<button class="report-tag paper hit ${b.winner === 'draw' ? 'draw' : b.youWon ? 'won' : 'lost'} ${f} ${out}" data-report="${i.key}" title="Savaş raporunu aç">
        <i class="ico ico-sword"></i>
        <span>${dot(b.opponentColor)}${botMark(b.opponentSeat)}${esc(b.opponentName)} · <b>${resultWord(b)}</b></span>
      </button>`;
    }).join('');
  }

  /** A scout's report in the middle of the screen (from the top bar, or from the "scout is back" ribbon). */
  showScout(r: ScoutReportView): void {
    this.open(scoutReportHtml(r, this.now));
  }

  /**
   * What an envoy left at our castle, as a decree: who from, the goods and the message. Built with DOM nodes and textContent
   * so the message (written by another player) is always shown as plain text, never as markup.
   */
  showLetter(l: LetterView): void {
    const win = document.createElement('div');
    win.className = 'win paper-dark report-win letter-win';
    const close = document.createElement('button');
    close.className = 'btn-round btn-red win-close';
    close.dataset.close = '';
    close.title = 'Kapat (Esc)';
    close.innerHTML = '<i class="ico ico-close"></i>';
    const title = document.createElement('div');
    title.className = 'rep-title ribbon ribbon-yellow';
    title.textContent = 'Ulak geldi';
    const from = document.createElement('p');
    from.className = 'letter-from';
    const dotEl = document.createElement('i');
    dotEl.className = 'dot';
    dotEl.style.background = COLOR_CSS[l.fromColor] ?? '#888';
    const who = document.createElement('b');
    who.textContent = l.fromName;
    from.append('Kimden: ', dotEl, ' ', who);
    const goods = document.createElement('div');
    goods.className = 'letter-goods';
    const parts: [string, number][] = [['ico-meat', l.food], ['ico-wood', l.wood], ['ico-iron', l.iron], ['ico-coin', l.gold]];
    for (const [icon, n] of parts) {
      if (n <= 0) continue;
      const span = document.createElement('span');
      span.className = 'cost';
      span.innerHTML = `<i class="ico ${icon}"></i>`;
      const num = document.createElement('b');
      num.textContent = String(n);
      span.append(num);
      goods.append(span);
    }
    if (!goods.children.length) goods.textContent = 'Yük yok, yalnız mesaj.';
    win.append(close, title, from, goods);
    if (l.message) {
      const quote = document.createElement('blockquote');
      quote.className = 'letter-text';
      quote.textContent = l.message; // plain text, whatever it contains
      win.append(quote);
    }
    const foot = document.createElement('div');
    foot.className = 'win-foot';
    const ok = document.createElement('button');
    ok.className = 'btn';
    ok.dataset.close = '';
    ok.textContent = 'Tamam';
    foot.append(ok);
    win.append(foot);
    this.modal.replaceChildren(win);
    this.modal.classList.remove('hidden');
  }

  private open(content: string): void {
    this.modal.innerHTML = `
      <div class="win paper-dark report-win">
        <button class="btn-round btn-red win-close" data-close title="Kapat (Esc)"><i class="ico ico-close"></i></button>
        ${content}
        <div class="win-foot"><button class="btn" data-close>Tamam</button></div>
      </div>`;
    this.modal.classList.remove('hidden');
  }
}
