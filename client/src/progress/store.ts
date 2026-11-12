import { safeLocal } from '../ui/safe-storage';

// The player's progress: matches, wins per kingdom, the achievements earned and the cosmetics picked. It is kept behind the small
// ProgressStore interface so that the Steam build (Phase F) can swap the browser's storage for Steamworks (stats, achievements and
// cloud saves) without touching the game: it only has to load and save the same plain data.

export const KINGDOM_IDS = ['golge', 'tuccar', 'kahin', 'entrikaci'] as const;
export type KingdomId = (typeof KINGDOM_IDS)[number];

export interface KingdomRecord { played: number; won: number }

export interface ProgressData {
  /** Version of this shape (a newer, unknown one is ignored rather than guessed at). */
  v: 1;
  matches: number;
  wins: number;
  kingdoms: Record<KingdomId, KingdomRecord>;
  /** Achievement id → when it was earned (ms since 1970). */
  achievements: Record<string, number>;
  picks: { frame: string | null; banners: Partial<Record<KingdomId, string>>; /** title id (progress/level.ts) */ title?: string | null; /** banner pattern id */ pattern?: string | null };
  /** Experience points earned in all matches (the server pays them at the end of each match). */
  xp: number;
  /** How many matches held each moment (decoy, fake_report, felled … the ids of Keepfall.Core.Progress.Xp.Moments): the titles read them. */
  moments: Record<string, number>;
}

export interface ProgressStore {
  load(): ProgressData;
  save(data: ProgressData): void;
}

export const emptyProgress = (): ProgressData => ({
  v: 1, matches: 0, wins: 0,
  kingdoms: { golge: { played: 0, won: 0 }, tuccar: { played: 0, won: 0 }, kahin: { played: 0, won: 0 }, entrikaci: { played: 0, won: 0 } },
  achievements: {}, picks: { frame: null, banners: {}, title: null, pattern: null }, xp: 0, moments: {},
});

const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

/** Whatever was stored, turned into a valid ProgressData (anything unexpected is dropped). */
export function sanitize(raw: unknown): ProgressData {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return out;
  out.matches = count(r.matches);
  out.wins = count(r.wins);
  const k = (r.kingdoms ?? {}) as Record<string, Partial<KingdomRecord> | undefined>;
  for (const id of KINGDOM_IDS) {
    const played = count(k[id]?.played);
    out.kingdoms[id] = { played, won: Math.min(played, count(k[id]?.won)) };
  }
  const a = (r.achievements ?? {}) as Record<string, unknown>;
  for (const [id, at] of Object.entries(a)) if (/^[a-z][a-z0-9_]{0,40}$/.test(id) && typeof at === 'number') out.achievements[id] = at;
  const p = (r.picks ?? {}) as { frame?: unknown; banners?: Record<string, unknown> };
  out.picks.frame = typeof p.frame === 'string' ? p.frame : null;
  for (const id of KINGDOM_IDS) if (typeof p.banners?.[id] === 'string') out.picks.banners[id] = p.banners[id] as string;
  const pk = p as { title?: unknown; pattern?: unknown };
  out.picks.title = typeof pk.title === 'string' && /^[a-z_]{1,30}$/.test(pk.title) ? pk.title : null;
  out.picks.pattern = typeof pk.pattern === 'string' && /^[a-z_]{1,30}$/.test(pk.pattern) ? pk.pattern : null;
  out.xp = Math.min(count(r.xp), 10_000_000);
  const m = (r.moments ?? {}) as Record<string, unknown>;
  for (const [id, n] of Object.entries(m)) if (/^[a-z_]{1,30}$/.test(id)) out.moments[id] = Math.min(count(n), 100000);
  return out;
}

const KEY = 'keepfall_progress_v1';

/** The default store: this browser's local storage (memory only when the browser blocks it). */
export class LocalProgressStore implements ProgressStore {
  load(): ProgressData {
    const raw = safeLocal.get(KEY);
    try { return sanitize(JSON.parse(raw ?? 'null')); } catch {
      // A damaged save starts the player from nothing, but the damaged text is kept aside (it is overwritten by the next save otherwise), so it can be looked at or repaired by hand.
      if (raw) safeLocal.set(KEY + '_damaged', raw);
      return emptyProgress();
    }
  }
  save(data: ProgressData): void { safeLocal.set(KEY, JSON.stringify(data)); }
}

let store: ProgressStore = new LocalProgressStore();
/** The Steam build installs its own store here before anything reads progress. */
export function setProgressStore(next: ProgressStore): void { store = next; }
export const progressStore = (): ProgressStore => store;
