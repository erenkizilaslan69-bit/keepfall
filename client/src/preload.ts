import type { PlayerColor } from './types';
import { assetUrls } from './scene/assets';

// While the lobby is open the browser fetches what the map will need, a few files at a time, so the match starts without a long wait.
// A file that fails is simply loaded again by the map itself.

const asked = new Set<string>();
const queue: string[] = [];
let running = 0;
const PARALLEL = 4;

function pump(): void {
  while (running < PARALLEL && queue.length > 0) {
    const url = queue.shift()!;
    running++;
    fetch(url).then((r) => r.blob()).catch(() => undefined).finally(() => { running--; pump(); });
  }
}

/** Starts fetching the files for our colour and the colours of the others in the room (what was asked before is not asked again). */
export function warmUp(own: PlayerColor, others: PlayerColor[]): void {
  for (const url of assetUrls(own, others.filter((c) => c !== own))) {
    if (asked.has(url)) continue;
    asked.add(url);
    queue.push(url);
  }
  pump();
}
