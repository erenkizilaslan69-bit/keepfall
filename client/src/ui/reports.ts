import { botMark, esc } from '../format';
import type { BattleReportView, ScoutReportView } from '../types';
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
