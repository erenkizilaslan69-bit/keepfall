import { esc } from '../format';
import type { BattleReportView } from '../types';
import { dot, reportHtml, resultWord } from './report-html';

// Battle reports as small tags in the bottom-left corner (the three latest); a click opens the whole
// report in the middle of the screen. A new report is never opened for you, its tag just flashes, so
// the fight you are watching is not covered.

const MAX_TAGS = 3;

export class ReportTags {
  private readonly tags: HTMLElement;
  private readonly modal: HTMLElement;
  private reports: BattleReportView[] = [];
  private key = '';
  private seen: Set<number> | null = null;

  constructor(parent: HTMLElement) {
    this.tags = document.createElement('div');
    this.tags.className = 'report-tags';
    this.modal = document.createElement('div');
    this.modal.className = 'modal-shade hidden hit';
    parent.append(this.tags, this.modal);
    this.tags.addEventListener('click', (e) => {
      const id = Number((e.target as HTMLElement).closest<HTMLElement>('[data-report]')?.dataset.report);
      const report = this.reports.find((r) => r.id === id);
      if (report) this.open(report);
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal || (e.target as HTMLElement).closest('[data-close]')) this.close();
    });
  }

  get isOpen(): boolean { return !this.modal.classList.contains('hidden'); }

  close(): void {
    this.modal.classList.add('hidden');
  }

  /** The latest reports, newest first (as the server sends them). */
  update(reports: BattleReportView[]): void {
    this.reports = reports;
    const ids = new Set(reports.map((r) => r.id));
    const fresh = this.seen === null ? new Set<number>() : new Set([...ids].filter((id) => !this.seen!.has(id)));
    this.seen = new Set([...(this.seen ?? []), ...ids]);
    const key = reports.slice(0, MAX_TAGS).map((r) => r.id).join(',');
    if (key === this.key && fresh.size === 0) return;
    this.key = key;
    this.tags.innerHTML = reports.slice(0, MAX_TAGS).map((b) => `
      <button class="report-tag paper hit ${b.winner === 'draw' ? 'draw' : b.youWon ? 'won' : 'lost'} ${fresh.has(b.id) ? 'fresh' : ''}" data-report="${b.id}"
        title="Savaş raporunu aç">
        <i class="ico ico-sword"></i>
        <span>${dot(b.opponentColor)}${esc(b.opponentName)} · <b>${resultWord(b)}</b></span>
      </button>`).join('');
  }

  private open(b: BattleReportView): void {
    this.modal.innerHTML = `
      <div class="win paper-dark report-win">
        <button class="btn-round btn-red win-close" data-close title="Kapat (Esc)"><i class="ico ico-close"></i></button>
        ${reportHtml(b)}
        <div class="win-foot"><button class="btn" data-close>Tamam</button></div>
      </div>`;
    this.modal.classList.remove('hidden');
  }
}
