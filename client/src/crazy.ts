// CrazyGames SDK (v3), for the build made for that site only (VITE_PLATFORM=crazygames, `npm run build:crazy`). The <script> for it is put into that
// build's index.html by vite.config.ts; everywhere else (the server's own page, itch.io, localhost) it is not there, `window.CrazyGames` does not exist and
// every function here does nothing, so the game is the same as ever. All SDK calls are wrapped: a failing SDK must never stop the game.

export const CRAZY: boolean = import.meta.env.VITE_PLATFORM === 'crazygames';
if (CRAZY) document.documentElement.classList.add('crazy');

interface GameApi {
  gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void;
  updateRoom(data: { roomId?: string; isJoinable?: boolean; inviteParams?: Record<string, string | number> }): void;
  leftRoom(): void;
  inviteLink(params: Record<string, string | number>): string;
  getInviteParam(name: string): string | null;
  inviteParams?: Record<string, string> | null;
  showInviteButton?(params: Record<string, string | number>): string;
  hideInviteButton?(): void;
  isInstantMultiplayer?: boolean;
  settings?: { disableChat?: boolean; muteAudio?: boolean };
  addJoinRoomListener?(listener: (params: Record<string, string>) => void): void;
  addSettingsChangeListener?(listener: (settings: { disableChat?: boolean; muteAudio?: boolean }) => void): void;
}
interface UserApi { getUser(): Promise<{ username?: string } | null>; isUserAccountAvailable?: boolean }
interface Sdk { init(): Promise<void>; environment: 'local' | 'crazygames' | 'disabled'; game: GameApi; user: UserApi }

let sdk: Sdk | null = null;
/** Each state is announced once: loadingStart/Stop and gameplayStart/Stop are never sent twice in a row. */
let loading = false;
let wanted = false; // a match is being played (what the game wants), `playing` is what the site was told
const guard = <T>(f: () => T): T | undefined => { try { return f(); } catch (e) { console.warn('CrazyGames SDK:', e); return undefined; } };

/** Starts the SDK (on CrazyGames or the local test mode only). True when it is there to use; without `window.CrazyGames` it is a silent no-op. */
export async function initCrazy(): Promise<boolean> {
  if (!CRAZY) return false;
  const s = (window as unknown as { CrazyGames?: { SDK?: Sdk } }).CrazyGames?.SDK;
  if (!s) return false;
  try {
    await s.init();
    if (s.environment === 'disabled') return false; // any other site: the SDK refuses every call
    sdk = s;
    loading = true;
    guard(() => s.game.loadingStart());
    return true;
  } catch (e) {
    console.warn('CrazyGames SDK did not start:', e);
    return false;
  }
}

export const crazyActive = (): boolean => sdk !== null;

/** The player's CrazyGames name (6-20 characters), or null when they are not signed in. */
export async function crazyUsername(): Promise<string | null> {
  if (!sdk) return null;
  try { return (await sdk.user.getUser())?.username ?? null; } catch { return null; }
}

/** The page was started by the site's "play with friends" button: land in a joinable room of our own at once. */
export const crazyInstant = (): boolean => !!sdk && sdk.game.isInstantMultiplayer === true;

/** The room code of the invitation this page was opened from, if any. */
export function crazyInviteRoom(): string | null {
  // getInviteParam('room'); `inviteParams` is the same thing as an object (the docs say to look at it when the game starts)
  const code = sdk ? guard(() => sdk!.game.getInviteParam('room') ?? sdk!.game.inviteParams?.room ?? null) : null;
  return code && /^[A-Za-z]{6}$/.test(code) ? code.toUpperCase() : null;
}

/** A friend joins while we are playing: the callback gets the room code. */
export function onCrazyJoin(callback: (code: string) => void): void {
  guard(() => sdk?.game.addJoinRoomListener?.((p) => { const c = p?.room; if (c && /^[A-Za-z]{6}$/.test(c)) callback(c.toUpperCase()); }));
}

/** The link a player can send (it opens the game on the site and joins the room). */
export function crazyInviteLink(code: string): string | null {
  return sdk ? guard(() => sdk!.game.inviteLink({ room: code })) ?? null : null;
}

let lastRoom = '';
/**
 * Tells the site which room we are in and whether friends can still join (a private room's lobby: yes; a running match: no): the room data
 * (updateRoom / leftRoom) and the invite button (shown while friends can join, hidden when they cannot or when we leave).
 */
export function crazyRoom(code: string | null, joinable: boolean): void {
  if (!sdk) return;
  const key = `${code}:${joinable}`;
  if (key === lastRoom) return;
  lastRoom = key;
  guard(() => {
    if (code === null) { sdk!.game.hideInviteButton?.(); sdk!.game.leftRoom(); return; }
    sdk!.game.updateRoom({ roomId: code, isJoinable: joinable, inviteParams: { room: code } });
    if (joinable) sdk!.game.showInviteButton?.({ room: code }); else sdk!.game.hideInviteButton?.();
  });
}

let playing = false;
const syncGameplay = (): void => {
  const on = wanted && !document.hidden;
  if (!sdk || on === playing) return;
  playing = on;
  guard(() => (on ? sdk!.game.gameplayStart() : sdk!.game.gameplayStop()));
};
/** gameplayStart while a match is being played, gameplayStop in menus, on the end screen and after elimination (and while the tab is hidden or closing). */
export function crazyGameplay(on: boolean): void {
  wanted = on;
  syncGameplay();
}
if (CRAZY) {
  document.addEventListener('visibilitychange', syncGameplay);
  window.addEventListener('pagehide', () => { wanted = false; syncGameplay(); });
}

/** The loading screen is over (the home screen or a joined room is up). */
export function crazyLoaded(): void {
  if (!loading) return;
  loading = false;
  guard(() => sdk?.game.loadingStop());
}

/** The site's own settings: chat off (our envoy messages) and audio muted. The callback runs now and whenever they change. */
export function watchCrazySettings(callback: (s: { disableChat: boolean; muteAudio: boolean }) => void): void {
  if (!sdk) return;
  const read = () => ({ disableChat: sdk!.game.settings?.disableChat === true, muteAudio: sdk!.game.settings?.muteAudio === true });
  guard(() => callback(read()));
  guard(() => sdk!.game.addSettingsChangeListener?.(() => callback(read())));
}
