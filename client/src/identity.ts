// Who this tab is in a room. The server hands out a secret token on joining; we keep it so that a
// refresh or a dropped connection gets the same seat (and castle) back.
//
// - sessionStorage: per tab, so several tabs in one browser are different players. A token found
//   here is "this tab's" and always rejoins its seat.
// - localStorage: the last token used for a room, so reopening the link in a new tab can return to
//   the seat. The server only accepts it while nobody else (another tab) is using that seat.
// - Dev only: ?oyuncu=N picks a fixed test identity N per room, e.g. /oda/ABCD?oyuncu=2.

export interface StoredIdentity { token: string | null; remembered: boolean }

const tabKey = (code: string) => `keepfall.token.${code}`;
const lastKey = (code: string) => `keepfall.last.${code}`;
const devKey = (code: string, n: string) => `keepfall.dev.${code}.${n}`;
const NAME_KEY = 'keepfall.name';

function get(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}

function set(storage: () => Storage, key: string, value: string): void {
  try { storage().setItem(key, value); } catch { /* storage blocked: identity just won't survive a reload */ }
}

const session = () => window.sessionStorage;
const local = () => window.localStorage;

function devSlot(): string | null {
  if (!import.meta.env.DEV) return null;
  const n = new URLSearchParams(location.search).get('oyuncu');
  return n && /^\d{1,2}$/.test(n) ? n : null;
}

export function loadIdentity(code: string): StoredIdentity {
  const dev = devSlot();
  if (dev) return { token: get(local, devKey(code, dev)), remembered: false };
  const mine = get(session, tabKey(code));
  if (mine) return { token: mine, remembered: false };
  return { token: get(local, lastKey(code)), remembered: true };
}

export function saveIdentity(code: string, token: string): void {
  const dev = devSlot();
  if (dev) { set(local, devKey(code, dev), token); return; }
  set(session, tabKey(code), token);
  set(local, lastKey(code), token);
}

export function loadName(): string {
  const dev = devSlot();
  return get(local, NAME_KEY) ?? (dev ? `Test ${dev}` : '');
}

export function saveName(name: string): void {
  if (!devSlot()) set(local, NAME_KEY, name);
}
