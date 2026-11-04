// The CrazyGames-build regression in one go (desktop + Quick Match). Needs nothing running: it starts and stops its own dev server (5081) and Vite (5175, crazy platform, flags off).
// Usage: node tools/run-regression.mjs [--long]     (--long adds the real-time guided match, ~13 min)
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shell = process.platform === 'win32';
const run = (title, cmd, args, env = {}) => {
  console.log(`\n=== ${title}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell, env: { ...process.env, ...env } });
  const pass = r.status === 0;
  results.push([title, pass]);
  return pass;
};
const results = [];

run('dotnet test', 'dotnet', ['test', '-c', 'Release', '--nologo', '-v', 'q']);
run('smoke (hidden information)', 'node', ['tools/run-smoke.mjs']);
run('client build (tsc + vite)', 'npm', ['--prefix', 'client', 'run', 'build:crazy']);

const server = spawn('dotnet', ['run', '--project', 'src/Keepfall.Server', '-c', 'Release', '--no-build', '--urls', 'http://localhost:5081'],
  { cwd: root, shell, stdio: 'ignore', env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Keepfall__MaxRooms: '0' } });
const vite = spawn('npx', ['vite', '--port', '5174'], {
  cwd: root + '/client', shell, stdio: 'ignore',
  env: { ...process.env, VITE_PLATFORM: 'crazygames', VITE_FEATURE_PRIVATE_ROOM: '0', VITE_FEATURE_CRAZY_INVITE: '0', KEEPFALL_SERVER: 'http://localhost:5081', KEEPFALL_CLIENT_PORT: '5174' } });
try {
  await sleep(9000);
  run('cors-check', 'node', ['tools/cors-check.mjs']);
  run('crazy-sdk-check (flags off, with SDK mock + without SDK)', 'node', ['tools/crazy-sdk-check.mjs', 'http://localhost:5174'], { FLAGS: 'off' });
  run('movers-stall-check', 'node', ['tools/movers-stall-check.mjs']);
  if (process.argv.includes('--long')) run('desktop guided match, real time', 'node', ['tools/tutorial-check.mjs', 'art/shots/reg-tut', 'http://localhost:5174/'], { REALTIME: '1', SIZE: '1280,720', KFLANG: 'en' });
} finally {
  for (const p of [server, vite]) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { shell });
}
console.log('\n' + results.map(([t, ok]) => `${ok ? 'ok  ' : 'FAIL'} ${t}`).join('\n'));
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
