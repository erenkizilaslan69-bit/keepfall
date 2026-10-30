// Small display helpers shared by the panels.

export const fmt = (n: number) => Math.floor(n + 1e-6).toString();

export const rate = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1);

export const clock = (seconds: number) => {
  const t = Math.ceil(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Seats taken by bots in the current room (public: the lobby shows it too). */
let botSeats = new Set<number>();
export const setBotSeats = (players: { seat: number; isBot?: boolean }[]) => { botSeats = new Set(players.filter((p) => p.isBot).map((p) => p.seat)); };
export const isBotSeat = (seat: number) => botSeats.has(seat);
/** A small robot head next to a bot's name (nothing for a human or the bandits). */
export const botMark = (seat: number) => (botSeats.has(seat) ? '<i class="bot-ico" title="Bot"></i>' : '');

export const COLOR_NAMES: Record<string, string> = { blue: 'Mavi', red: 'Kırmızı', yellow: 'Sarı', purple: 'Mor', black: 'Siyah' };
/** Units that shoot from the back and have a target to pick (the monk only heals), and units that stand at the back by default. */
export const SHOOTERS = ['okcu', 'mancinik'];
export const BACK_LINE = ['okcu', 'mancinik', 'kesis'];

export const COLOR_CSS: Record<string, string> = { blue: '#4a8fd9', red: '#d9534a', yellow: '#e2b93b', purple: '#9b6bd1', black: '#3a3a44' };

/** The colour's name in small type beside a player's name, unless the name already says it (a bot called "Bot Mor" in purple). */
export function colorNote(name: string | null | undefined, color: string | null | undefined): string {
  const word = COLOR_NAMES[color ?? ''] ?? '';
  return !word || (name ?? '').toLocaleLowerCase('tr').includes(word.toLocaleLowerCase('tr')) ? '' : ` <small>${word}</small>`;
}
