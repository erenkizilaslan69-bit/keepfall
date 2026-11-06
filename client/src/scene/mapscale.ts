// The map-scale experiment (off by default): every distance of the map is drawn MAP_SCALE times as long (castle yards, roads, forest, vision, fog) while the
// sprites keep their size, so castles are roomier. The rules are unchanged: the server counts in tiles, and positions are only turned into pixels here
// (TILE px per tile), so a journey takes exactly as long as before (the ETA is the route's length in tiles over the same speed).
//   - the build: `VITE_MAP_SCALE=1.3 npm run build` (or client/.env.*), or for one visit `?mapscale=1.3` in the address (any build);
//   - between 0.8 and 2; anything else (or nothing) is 1: the game as it was.

function read(): number {
  let raw = '';
  try { raw = new URLSearchParams(location.search).get('mapscale') ?? ''; } catch { /* no address */ }
  if (!raw) raw = String(import.meta.env.VITE_MAP_SCALE ?? '');
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0.8 && n <= 2 ? n : 1;
}

export const MAP_SCALE: number = read();
