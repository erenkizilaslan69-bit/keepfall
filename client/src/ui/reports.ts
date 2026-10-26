import { COLOR_CSS, botMark, esc } from '../format';
import type { BattleReportView, LetterView, ScoutReportView } from '../types';
import { dot, reportHtml, resultWord } from './report-html';
import { scoutReportHtml } from './scout-report';

// Battle reports as small tags in the bottom-left corner (the four latest); a click opens the whole report in the
// middle of the screen. A new report is never opened for you, its tag just flashes, so the fight you are watching
// is not covered. Scout reports are not tags: each rival's last one is summarised in the top bar, and this window
// shows one in full (from there or from the "scout is back" ribbon).

const MAX_TAGS = 4;

type Item = { key: string; at: number; battle: BattleReportView };

export class ReportTags {
  private readonly tags: HTMLElement;
  private readonly modal: HTMLElement;
  private items: Item[] = [];
  private now = 0;
  private key = '';
  private seen: Set<string> | null = null;

  constructor(parent: HTMLElement) {
    this.tags = document.createElement('div');
    this.tags.className = 'report-tags';
    this.modal = document.createElement('div');
    this.modal.className = 'modal-shade hidden hit';
    parent.append(this.tags, this.modal);
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
    const shown = this.items.slice(0, MAX_TAGS);
    const key = shown.map((i) => i.key).join(',');
    if (key === this.key && fresh.size === 0) return;
    this.key = key;
    this.tags.innerHTML = shown.map((i) => {
      const f = fresh.has(i.key) ? 'fresh' : '';
      const b = i.battle;
      return `<button class="report-tag paper hit ${b.winner === 'draw' ? 'draw' : b.youWon ? 'won' : 'lost'} ${f}" data-report="${i.key}" title="Savaş raporunu aç">
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
