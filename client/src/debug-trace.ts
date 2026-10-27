// The event trail the debug layer (F9, development only) reads when it finds a fault: what happened to an army or a battle, in order.
// A ring buffer; nothing is kept (or recorded) outside development.

export interface TraceEvent { at: number; gameAt: number; kind: string; id: string; detail?: string }

const MAX = 600;
const events: TraceEvent[] = [];
let clock: () => number = () => 0;

export function setTraceClock(gameNow: () => number): void { clock = gameNow; }

/** Notes that something happened to <paramref name="id"/> (an army, a battle…). */
export function trace(kind: string, id: string | number, detail?: string): void {
  if (!import.meta.env.DEV) return;
  events.push({ at: Math.round(performance.now()), gameAt: Math.round(clock() * 10) / 10, kind, id: String(id), detail });
  if (events.length > MAX) events.shift();
}

/** The last events about <paramref name="id"/> (and, with `all`, the newest ones of anything). */
export function traceOf(id: string, count = 25, all = 0): TraceEvent[] {
  const mine = events.filter((e) => e.id === id).slice(-count);
  return all > 0 ? [...mine, ...events.slice(-all)].sort((a, b) => a.at - b.at) : mine;
}
