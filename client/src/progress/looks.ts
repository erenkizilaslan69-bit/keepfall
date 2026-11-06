import { clothCanvas } from '../scene/Banners';

// How a player's cosmetics look in the HTML screens (lobby, end screen, progress screen).

const FRAME_IDS = ['bronze', 'silver', 'gold'];

/** The css class of an avatar frame (empty for none or an unknown id: whatever the server sent is checked here as well). */
export const frameClass = (frame: string | null | undefined): string => (frame && FRAME_IDS.includes(frame) ? ` frame-${frame}` : '');

const cache = new Map<string, string>();

/** The cloth of a banner design as a picture address (null for an unknown kingdom or design). */
export function bannerUrl(kingdom: string | null | undefined, design: string | null | undefined): string | null {
  if (!kingdom || !design) return null;
  const key = `${kingdom}:${design}`;
  let url = cache.get(key);
  if (url === undefined) {
    try { url = clothCanvas(kingdom, design)?.toDataURL() ?? ''; } catch { url = ''; }
    cache.set(key, url);
  }
  return url || null;
}
