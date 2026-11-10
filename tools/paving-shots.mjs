// Close-ups of every castle's way from its door to the gap in its wall (zoom 2), our own castle at building levels 1–4 as well: tools/clip.mjs with
// tools/paving-scene.js, one picture each. Needs the dev server (5081) and Vite (5174), a 4-player match (3 bots).
// Usage: node tools/paving-shots.mjs <prefix> [http://localhost:5174/]   → art/shots/paving/<prefix>-<castle>.png (not in git: the pictures hold the Free Pack)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [PREFIX = 'paving', BASE = 'http://localhost:5174/'] = process.argv.slice(2);
const scene = readFileSync(join(here, 'paving-scene.js'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'kf-paving-'));
const outDir = resolve(here, '..', 'art', 'shots', 'paving');
mkdirSync(outDir, { recursive: true });
const shots = [[0, null], [1, null], [2, null], [3, null], ...[1, 2, 3, 4].map((l) => ['own', l])];
for (const [region, level] of shots) {
  const name = region === 'own' ? `own-L${level}` : `castle${region}`;
  const setup = join(tmp, `${name}.js`);
  const pre = region === 'own'
    ? `globalThis.__pvRegion = window.keepfallScene.layout.regions.filter((r) => r.seat !== null && r.color).findIndex((r) => r.seat === window.keepfallUi.mySeat), globalThis.__pvLevel = ${level}`
    : `globalThis.__pvRegion = ${region}, globalThis.__pvLevel = undefined`;
  writeFileSync(setup, `(${pre},\n${scene}\n)`);
  const mp4 = join(tmp, `${name}.mp4`);
  spawnSync('node', [join(here, 'clip.mjs'), mp4, setup, BASE], { stdio: 'inherit', env: { SECONDS: '0.5', FPS: '2', WARMUP: '2500', SIZE: '1920,1080', BOTS: 'easy,easy,easy', GPU: '1', ...process.env } });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-frames:v', '1', join(outDir, `${PREFIX}-${name}.png`)], { stdio: 'inherit' });
}
rmSync(tmp, { recursive: true, force: true });
console.log('saved in', outDir);
