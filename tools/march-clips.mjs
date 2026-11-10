// Before/after clips of a marching column on five kinds of road (straight, a sharp corner, a narrow forest path, a junction, a 40-man army):
// tools/clip.mjs with tools/march-scene.js, one after the other. Needs the dev server (5081) and Vite (5174).
// Usage: node tools/march-clips.mjs <prefix> [http://localhost:5174/]   (KINDS=corner,forest-x,big-corner to choose; ZOOM=2 for the camera) →art/shots/march/<prefix>-<kind>.mp4 (not in git: the pictures hold the Free Pack)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [PREFIX = 'march', BASE = 'http://localhost:5174/'] = process.argv.slice(2);
const scene = readFileSync(join(here, 'march-scene.js'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'kf-march-'));
for (const kind of (process.env.KINDS ?? 'straight,corner,forest,junction,big').split(',')) {
  const setup = join(tmp, `${kind}.js`);
  writeFileSync(setup, `(globalThis.__marchKind = ${JSON.stringify(kind)}, globalThis.__marchZoom = ${process.env.ZOOM ? Number(process.env.ZOOM) : 'undefined'},\n${scene}\n)`);
  const out = resolve(here, '..', 'art', 'shots', 'march', `${PREFIX}-${kind}.mp4`);
  const r = spawnSync('node', [join(here, 'clip.mjs'), out, setup, BASE], { stdio: 'inherit', env: { SECONDS: '7', FPS: '10', WARMUP: '1500', ...process.env } });
  if (r.status !== 0) console.log('failed:', kind);
}
