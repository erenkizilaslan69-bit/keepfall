// The long half of the CrazyGames regression: movers-stall, guided match in real time (tutorial-check, 25 min limit inside), one Quick Match to the end screen, desktop ui-audit.
// Own servers: dev server 5081 and Vite 5174 (crazy platform, flags off). Usage: PW_DIR=<playwright> node tools/run-regression2.mjs
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const run = (title, args, env = {}, limit = 27 * 60_000) => { console.log('\n=== ' + title); const r = spawnSync('node', args, { cwd: root, stdio: 'inherit', timeout: limit, env: { ...process.env, ...env } }); results.push([title, r.status === 0]); };
const server = spawn('dotnet', ['run', '--project', 'src/Keepfall.Server', '-c', 'Release', '--no-build', '--urls', 'http://localhost:5081'], { cwd: root, shell: true, stdio: 'ignore', env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Keepfall__MaxRooms: '0' } });
const vite = spawn('npx', ['vite', '--port', '5174'], { cwd: root + '/client', shell: true, stdio: 'ignore', env: { ...process.env, VITE_PLATFORM: 'crazygames', VITE_FEATURE_PRIVATE_ROOM: '0', VITE_FEATURE_CRAZY_INVITE: '0', KEEPFALL_SERVER: 'http://localhost:5081', KEEPFALL_CLIENT_PORT: '5174' } });
try {
  await sleep(10000);
  if (!process.argv.includes('--quick-only')) {
  run('movers-stall-check', ['tools/movers-stall-check.mjs'], {}, 5 * 60_000);
  run('guided match x1, real time', ['tools/tutorial-check.mjs', 'art/shots/reg-tut', 'http://localhost:5174/'], { REALTIME: '1', SIZE: '1280,720', KFLANG: 'en' });
  }
  run('quick match x1 to the end screen', ['tools/quickmatch-end-check.mjs', 'http://localhost:5174/'], {}, 27 * 60_000);
} finally { for (const p of [server, vite]) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { shell: true }); }
console.log('\n' + results.map(([t, ok]) => `${ok ? 'ok  ' : 'FAIL'} ${t}`).join('\n'));
