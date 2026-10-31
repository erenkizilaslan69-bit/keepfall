// Runs the smoke test against a development server of its own (port 5081) whose match is longer than the real one: usage `node tools/run-smoke.mjs`.
// The second round of the test besieges a castle for most of the war; with the real 5 minutes of war the fall comes too close to the end to be
// checked reliably. A temporary copy of config/balance.json (nothing else changed, the real file is not touched) gives the war 15 minutes.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 5081;
const text = readFileSync(join(root, 'config', 'balance.json'), 'utf8').replace(/^﻿/, '');
if (!/"shortModeMinutes":\s*18\b/.test(text)) throw new Error('config/balance.json: shortModeMinutes is no longer 18, update tools/run-smoke.mjs');
const dir = mkdtempSync(join(tmpdir(), 'kf-smoke-'));
const configPath = join(dir, 'balance.json');
writeFileSync(configPath, text.replace(/("shortModeMinutes":\s*)18\b/, '$127').replace(/("shortModePrepMinutes":\s*)8\b/, '$112')
  // the start stores are doubled too: weapons cost twice what they did when the test was written
  .replace(/("startingResources":\s*\{\s*"food":\s*30,\s*"wood":\s*)40(,\s*"iron":\s*)20/, '$180$240'), 'utf8'); // 12 minutes of preparation (the last minute has no scouting) + 15 of war

const server = spawn('dotnet', ['run', '--project', join(root, 'src', 'Keepfall.Server'), '--no-launch-profile', '--urls', `http://localhost:${port}`], {
  cwd: root, stdio: 'ignore', env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Keepfall__BalancePath: configPath },
});
const stop = () => { spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

let up = false;
for (let i = 0; i < 90 && !up; i++) {
  try { up = (await fetch(`http://localhost:${port}/health`)).ok; } catch { /* not up yet */ }
  if (!up) await new Promise((r) => setTimeout(r, 2000));
}
if (!up) { stop(); throw new Error('the test server did not start'); }

const result = spawnSync('node', [join(root, 'tools', 'smoke-test.mjs'), `http://localhost:${port}`], { stdio: 'inherit' });
stop();
process.exit(result.status ?? 1);
