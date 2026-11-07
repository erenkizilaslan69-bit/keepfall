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
export type SteamStatus = 'menu' | 'prep' | 'war' | 'challenge_prep' | 'challenge_war' | 'spectating' | 'ended';
const TOKEN: Record<SteamStatus, string> = {
  menu: '#Status_Menu', prep: '#Status_Prep', war: '#Status_War', challenge_prep: '#Status_ChallengePrep', challenge_war: '#Status_ChallengeWar',
  spectating: '#Status_Spectating', ended: '#Status_Ended',
};
let lastStatus: SteamStatus | null = null;
export function steamStatus(status: SteamStatus): void {
  if (!bridge || status === lastStatus) return;
  lastStatus = status;
  void bridge.presence('steam_display', TOKEN[status]).catch(() => { /* */ });
}
