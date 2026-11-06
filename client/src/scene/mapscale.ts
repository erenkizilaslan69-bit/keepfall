// The map scale (1.3 by default, approved): every distance of the map is drawn MAP_SCALE times as long (castle yards, roads, forest, vision, fog) while the
// sprites keep their size, so castles are roomier. The rules are unchanged: the server counts in tiles, and positions are only turned into pixels here
// (TILE px per tile), so a journey takes exactly as long as before (the ETA is the route's length in tiles over the same speed).
//   - the build: `VITE_MAP_SCALE=1.3 npm run build` (or client/.env.*), or for one visit `?mapscale=1.3` in the address (any build);
//   - between 0.8 and 2; anything else (or nothing) is the default 1.3; `?mapscale=1` is the game as it was.

/** Approved by Eren after playing it (2026-11-06): 1.3. `?mapscale=1` (or VITE_MAP_SCALE=1) gives the old size back. */
const DEFAULT_SCALE = 1.3;

function read(): number {
  let raw = '';
  try { raw = new URLSearchParams(location.search).get('mapscale') ?? ''; } catch { /* no address */ }
  if (!raw) raw = String(import.meta.env.VITE_MAP_SCALE ?? '');
  if (!raw) return DEFAULT_SCALE;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0.8 && n <= 2 ? n : DEFAULT_SCALE;
}

export const MAP_SCALE: number = read();
