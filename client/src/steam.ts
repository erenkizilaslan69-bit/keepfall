// The Steam build's door to Steamworks, through the desktop shell's bridge (tools/steam/shell). In every other build, and in the Steam build while
// no app id / SDK is there, `window.keepfallSteam` says "not available" (or does not exist) and every function here does nothing.
import { LocalProgressStore, progressStore, setProgressStore } from './progress/store';
import { SteamProgressStore, type SteamBridge } from './progress/steam-store';

export const STEAM: boolean = import.meta.env.VITE_PLATFORM === 'steam';

let bridge: SteamBridge | null = null;

/** Before anything reads progress: when Steam is really running, progress goes through the Steam store (achievements, cloud). Never throws. */
export async function initSteam(): Promise<boolean> {
  if (!STEAM) return false;
  try {
    const b = (window as unknown as { keepfallSteam?: SteamBridge }).keepfallSteam;
    if (!b || !(await b.status()).available) return false;
    const store = new SteamProgressStore(progressStore() instanceof LocalProgressStore ? progressStore() : new LocalProgressStore(), b);
    setProgressStore(store);
    bridge = b;
    await Promise.race([store.syncFromCloud(), new Promise((r) => setTimeout(r, 3000))]); // a slow Steam must not hold the menu back
    return true;
  } catch { bridge = null; return false; }
}

/**
 * What the player is doing, for the Steam friends list ("Rich Presence"). The values are tokens of the localisation file
 * tools/steam/rich_presence_loc.vdf (Steam shows them in the friend's language: Turkish and English). Sent only when it changes.
 */
export type SteamStatus = 'menu' | 'lobby' | 'prep' | 'war' | 'challenge_prep' | 'challenge_war' | 'spectating' | 'ended';
const TOKEN: Record<SteamStatus, string> = {
  menu: '#Status_Menu', lobby: '#Status_Lobby', prep: '#Status_Prep', war: '#Status_War', challenge_prep: '#Status_ChallengePrep', challenge_war: '#Status_ChallengeWar',
  spectating: '#Status_Spectating', ended: '#Status_Ended',
};
let lastStatus: SteamStatus | null = null;
let lastPlayers = '';
let lastMode = '';
/** `players`: "2/4" in a lobby with friends (the lobby line shows it; friends see the group as one party). */
export function steamStatus(status: SteamStatus, players = '', group = '', mode = ''): void {
  if (!bridge || (status === lastStatus && players === lastPlayers && mode === lastMode)) return;
  lastStatus = status; lastPlayers = players; lastMode = mode;
  const b = bridge;
  void (async () => {
    await b.presence('players', players || null);
    await b.presence('mode', mode || null); // "5+10": preparation + war minutes of the match mode
    await b.presence('steam_player_group', group || null);
    await b.presence('steam_player_group_size', group ? players.split('/')[0] : null);
    await b.presence('steam_display', TOKEN[status]);
  })().catch(() => { /* a nicety */ });
}
