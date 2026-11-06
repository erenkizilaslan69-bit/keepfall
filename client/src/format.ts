import { t, tr } from './i18n';
import type { Row } from './types';

// Small display helpers shared by the panels.

export const fmt = (n: number) => Math.floor(n + 1e-6).toString();

export const rate = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1);

export const clock = (seconds: number) => {
  const t = Math.ceil(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('"').join('&quot;').split("'").join('&#39;');

/** Seats taken by bots in the current room (public: the lobby shows it too). */
let botSeats = new Set<number>();
export const setBotSeats = (players: { seat: number; isBot?: boolean }[]) => { botSeats = new Set(players.filter((p) => p.isBot).map((p) => p.seat)); };
export const isBotSeat = (seat: number) => botSeats.has(seat);
/** A small robot head next to a bot's name (nothing for a human or the bandits). */
export const botMark = (seat: number) => (botSeats.has(seat) ? `<i class="bot-ico" title="${t('Bot')}"></i>` : '');

export const COLOR_NAMES: Record<string, string> = { blue: t('Mavi'), red: t('Kırmızı'), yellow: t('Sarı'), purple: t('Mor'), black: t('Siyah') };
/** Units that shoot from the back and have a target to pick (the monk only heals), and units that stand at the back by default. */
export const SHOOTERS = ['okcu', 'mancinik'];
export const BACK_LINE = ['okcu', 'mancinik', 'kesis'];

export const ROWS: Row[] = ['first', 'second', 'third', 'fourth'];
/** The default formation (as the server lays it out): the fighters first, then the ones that stay behind, one row each. */
export function defaultRows(ids: string[]): Record<string, Row> {
  const sorted = [...ids].sort((a, b) => Number(BACK_LINE.includes(a)) - Number(BACK_LINE.includes(b)));
  return Object.fromEntries(sorted.map((id, i) => [id, ROWS[Math.min(i, 3)]]));
}
/** A row picker: "1. row" to "4. row". Pair it with <see cref="bindRowSwap"/> so that two types never share a row. */
export function rowSelect(attr: string, id: string, def: Row): string {
  return `<select ${attr}="${id}" data-prev="${def}" aria-label="${esc(t('Sıra'))}">${ROWS.map((r, i) => `<option value="${r}"${r === def ? ' selected' : ''}>${t('{0}. sıra', i + 1)}</option>`).join('')}</select>`;
}
/** Choosing a row that another type stands in swaps the two: one unit type to a row. */
export function bindRowSwap(root: HTMLElement, attr: string): void {
  root.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement;
    if (!sel.matches?.(`select[${attr}]`)) return;
    const prev = sel.dataset.prev as Row | undefined;
    for (const other of root.querySelectorAll<HTMLSelectElement>(`select[${attr}]`)) {
      if (other !== sel && other.value === sel.value && prev) { other.value = prev; other.dataset.prev = prev; }
    }
    sel.dataset.prev = sel.value;
  });
}

export const COLOR_CSS: Record<string, string> = { blue: '#4a8fd9', red: '#d9534a', yellow: '#e2b93b', purple: '#9b6bd1', black: '#3a3a44' };

/** The colour's name in small type beside a player's name, unless the name already says it (a bot called "Bot Mor" in purple). */
export function colorNote(name: string | null | undefined, color: string | null | undefined): string {
  const word = COLOR_NAMES[color ?? ''] ?? '';
  return !word || tr(name ?? '').toLocaleLowerCase().includes(word.toLocaleLowerCase()) ? '' : ` <small>${word}</small>`;
}
