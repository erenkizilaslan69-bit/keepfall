import { emptyProgress, KINGDOM_IDS, sanitize, type ProgressData, type ProgressStore } from './store';

// Progress for the Steam build (Phase F, docs/steam-paketleme.md). Everything stays switched off until the desktop shell says Steam is running
// (`window.keepfallSteam.status().available`, which needs an app id in steam.json AND the SDK): without that, `installSteamProgress` does nothing and the
// browser's local store stays in charge, so no build other than the Steam one is touched.
//
// How it works: the local store stays the working copy (load() is synchronous, the whole game reads progress that way). On top of it
//  - every save pushes the new achievements to Steam (the achievement API names ARE the ids of docs/basarimlar.md) and the data to Steam Cloud
//    (one file, "progress.json");
//  - once at start the cloud copy is merged in (counters take the larger value, achievements the union), so a second computer or a reinstall
//    brings the progress back, and achievements earned while Steam was off are handed over now.

/** What the desktop shell offers the page (tools/steam/shell/preload.js). Every call may fail or answer false/null; none may throw into the game. */
export interface SteamBridge {
  status(): Promise<{ available: boolean; appId: number }>;
  unlock(id: string): Promise<boolean>;
  cloudRead(name: string): Promise<string | null>;
  cloudWrite(name: string, text: string): Promise<boolean>;
  presence(key: string, value: string | null): Promise<boolean>;
}

export const CLOUD_FILE = 'progress.json';

/** Two copies of one player's progress made one. Counters: the larger; achievements: the union with the earlier time; picks: the local choice wins when it is set. */
export function mergeProgress(local: ProgressData, remote: ProgressData): ProgressData {
  const out = emptyProgress();
  out.matches = Math.max(local.matches, remote.matches);
  out.wins = Math.min(out.matches, Math.max(local.wins, remote.wins));
  for (const k of KINGDOM_IDS) {
    const played = Math.max(local.kingdoms[k].played, remote.kingdoms[k].played);
    out.kingdoms[k] = { played, won: Math.min(played, Math.max(local.kingdoms[k].won, remote.kingdoms[k].won)) };
  }
  for (const src of [remote, local]) {
    for (const [id, at] of Object.entries(src.achievements)) {
      const have = out.achievements[id];
      out.achievements[id] = have === undefined ? at : Math.min(have, at);
    }
  }
  out.picks.frame = local.picks.frame ?? remote.picks.frame;
  out.picks.banners = { ...remote.picks.banners, ...local.picks.banners };
  return out;
}

const same = (a: ProgressData, b: ProgressData): boolean => JSON.stringify(a) === JSON.stringify(b);

export class SteamProgressStore implements ProgressStore {
  private known: Set<string>;

  constructor(private readonly local: ProgressStore, private readonly bridge: SteamBridge) {
    this.known = new Set(Object.keys(local.load().achievements));
  }

  load(): ProgressData { return this.local.load(); }

  save(data: ProgressData): void {
    this.local.save(data);
    this.push(data);
  }

  /** Hands Steam what is new since the last save: new achievements once each, and the whole data as the cloud file. */
  private push(data: ProgressData): void {
    for (const id of Object.keys(data.achievements)) {
      if (this.known.has(id)) continue;
      this.known.add(id);
      void this.bridge.unlock(id).catch(() => { /* Steam stays silent: the local copy has it */ });
    }
    void this.bridge.cloudWrite(CLOUD_FILE, JSON.stringify(data)).catch(() => { /* retried at the next save */ });
  }

  /** Once at start: merges the cloud copy into the local one and (re)unlocks every achievement (Steam ignores those it already has). */
  async syncFromCloud(): Promise<void> {
    let remote = emptyProgress();
    try {
      const text = await this.bridge.cloudRead(CLOUD_FILE);
      if (text) remote = sanitize(JSON.parse(text));
    } catch { /* an unreadable cloud file is as good as none */ }
    const local = this.local.load();
    const merged = mergeProgress(local, remote);
    if (!same(merged, local)) this.local.save(merged);
    for (const id of Object.keys(merged.achievements)) { this.known.add(id); void this.bridge.unlock(id).catch(() => { /* */ }); }
    if (!same(merged, remote)) void this.bridge.cloudWrite(CLOUD_FILE, JSON.stringify(merged)).catch(() => { /* */ });
  }
}
