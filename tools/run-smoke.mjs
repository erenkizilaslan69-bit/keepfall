// Runs the smoke test against a development server of its own (port 5081) whose match is longer than the real one: usage `node tools/run-smoke.mjs`.
// The second round of the test besieges a castle for most of the war; with the real 5 minutes of war the fall comes too close to the end to be
// checked reliably. A temporary copy of config/balance.json (nothing else changed, the real file is not touched) gives the war 15 minutes.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// KF_SMOKE_PORT: another port (when 5081 is taken by someone else's dev server). KF_SMOKE_EXE: a published Keepfall.Server.exe to run instead of `dotnet run`
// (a running Debug server locks the Debug build, so a second session publishes to a scratch folder).
const port = Number(process.env.KF_SMOKE_PORT ?? 5081);
const text = readFileSync(join(root, 'config', 'balance.json'), 'utf8').replace(/^﻿/, '');
if (!/"shortModeMinutes":\s*15\b/.test(text)) throw new Error('config/balance.json: shortModeMinutes is no longer 15, update tools/run-smoke.mjs');
const dir = mkdtempSync(join(tmpdir(), 'kf-smoke-'));
const configPath = join(dir, 'balance.json');
writeFileSync(configPath, text.replace(/("shortModeMinutes":\s*)15\b/, '$127').replace(/("shortModePrepMinutes":\s*)5\b/, '$112')
  // the test was written for a plain 12-minute preparation: no faster preparation economy, the old last-minute scouting ban
  .replace(/("prepSpeed":\s*)1\.6/, '$11').replace(/("noScoutLastPrepSeconds":\s*)37\.5/, '$160')
  // the start stores are doubled too: weapons cost twice what they did when the test was written
  .replace(/("startingResources":\s*\{\s*"food":\s*30,\s*"wood":\s*)40(,\s*"iron":\s*)20/, '$180$240'), 'utf8'); // 12 minutes of preparation (the last minute has no scouting) + 15 of war

// the challenge definitions sit beside the balance file (the server looks there), so the temporary copy needs them too
writeFileSync(join(dir, 'challenges.json'), readFileSync(join(root, 'config', 'challenges.json')));

const server = process.env.KF_SMOKE_EXE
  ? spawn(process.env.KF_SMOKE_EXE, ['--urls', `http://localhost:${port}`], {
    cwd: dirname(process.env.KF_SMOKE_EXE), stdio: 'ignore', env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Keepfall__BalancePath: configPath, Keepfall__DirectorKey: '', Keepfall__AllowSpeedControl: 'true', Keepfall__AllowSoloStart: 'true' },
  })
  : spawn('dotnet', ['run', '--project', join(root, 'src', 'Keepfall.Server'), '--no-launch-profile', '--urls', `http://localhost:${port}`], {
    cwd: root, stdio: 'ignore', env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Keepfall__BalancePath: configPath, Keepfall__DirectorKey: '' },
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
