// CrazyGames SDK (v3), for the build made for that site only (VITE_PLATFORM=crazygames, `npm run build:crazy`). Everywhere else (the server's own page,
// itch.io, localhost) nothing is loaded and every function here does nothing, so the game is the same as ever. All SDK calls are wrapped: a failing
// SDK must never stop the game.

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
export const CRAZY: boolean = import.meta.env.VITE_PLATFORM === 'crazygames';
if (CRAZY) document.documentElement.classList.add('crazy');

interface GameApi {
  gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void;
  updateRoom(data: { roomId?: string; isJoinable?: boolean; inviteParams?: Record<string, string | number> }): void;
  leftRoom(): void;
  inviteLink(params: Record<string, string | number>): string;
  getInviteParam(name: string): string | null;
  isInstantMultiplayer?: boolean;
  settings?: { disableChat?: boolean; muteAudio?: boolean };
  addJoinRoomListener?(listener: (params: Record<string, string>) => void): void;
  addSettingsChangeListener?(listener: (settings: { disableChat?: boolean; muteAudio?: boolean }) => void): void;
}
interface UserApi { getUser(): Promise<{ username?: string } | null>; isUserAccountAvailable?: boolean }
interface Sdk { init(): Promise<void>; environment: 'local' | 'crazygames' | 'disabled'; game: GameApi; user: UserApi }

let sdk: Sdk | null = null;
const guard = <T>(f: () => T): T | undefined => { try { return f(); } catch (e) { console.warn('CrazyGames SDK:', e); return undefined; } };

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(false), 6000);
  });
}

/** Loads and starts the SDK (on CrazyGames or the local test mode only). True when it is there to use. */
export async function initCrazy(): Promise<boolean> {
  if (!CRAZY) return false;
  const w = window as unknown as { CrazyGames?: { SDK?: Sdk } };
  if (!w.CrazyGames?.SDK && !(await loadScript())) return false;
  const s = w.CrazyGames?.SDK;
  if (!s) return false;
  try {
    await s.init();
    if (s.environment === 'disabled') return false; // any other site: the SDK refuses every call
    sdk = s;
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
  const code = sdk ? guard(() => sdk!.game.getInviteParam('room')) : null;
  return code && /^[A-Za-z]{4}$/.test(code) ? code.toUpperCase() : null;
}

/** A friend joins while we are playing: the callback gets the room code. */
export function onCrazyJoin(callback: (code: string) => void): void {
  guard(() => sdk?.game.addJoinRoomListener?.((p) => { const c = p?.room; if (c && /^[A-Za-z]{4}$/.test(c)) callback(c.toUpperCase()); }));
}

/** The link a player can send (it opens the game on the site and joins the room). */
export function crazyInviteLink(code: string): string | null {
  return sdk ? guard(() => sdk!.game.inviteLink({ room: code })) ?? null : null;
}

let lastRoom = '';
/** Tells the site which room we are in and whether friends can still join (the lobby: yes; a running match: no). */
export function crazyRoom(code: string | null, joinable: boolean): void {
  if (!sdk) return;
  const key = `${code}:${joinable}`;
  if (key === lastRoom) return;
  lastRoom = key;
  guard(() => {
    if (code === null) sdk!.game.leftRoom();
    else sdk!.game.updateRoom({ roomId: code, isJoinable: joinable, inviteParams: { room: code } });
  });
}

let playing = false;
/** gameplayStart while a match is being played, gameplayStop in menus and on the end screen. */
export function crazyGameplay(on: boolean): void {
  if (!sdk || on === playing) return;
  playing = on;
  guard(() => (on ? sdk!.game.gameplayStart() : sdk!.game.gameplayStop()));
}

/** The loading screen is over (the home screen or a joined room is up). */
export function crazyLoaded(): void {
  guard(() => sdk?.game.loadingStop());
}

/** The site's own settings: chat off (our envoy messages) and audio muted. The callback runs now and whenever they change. */
export function watchCrazySettings(callback: (s: { disableChat: boolean; muteAudio: boolean }) => void): void {
  if (!sdk) return;
  const read = () => ({ disableChat: sdk!.game.settings?.disableChat === true, muteAudio: sdk!.game.settings?.muteAudio === true });
  guard(() => callback(read()));
  guard(() => sdk!.game.addSettingsChangeListener?.(() => callback(read())));
}
