// A private game stack for the Steam media tools (screenshots, trailer clips): a published Development server on port 5083 with a temporary balance copy
// (config/balance.json with only the start stores raised so scenes can be staged quickly; the real file is untouched) and its own Vite client on 5176.
// It never touches 5080/5081/5090/5174, which other sessions or the user may be using.
//   import { startStack } from './steam-media-stack.mjs'; const stack = await startStack(); ... stack.url ... stack.stop();
//   or: node tools/steam-media-stack.mjs   (starts it and keeps it up until Ctrl+C, handy for manual checks)
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startStack({ serverPort = 5083, clientPort = 5176 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kf-media-'));
  const exeDir = join(dir, 'server');
  const pub = spawnSync('dotnet', ['publish', join(root, 'src', 'Keepfall.Server'), '-c', 'Release', '-o', exeDir, '-v', 'q', '--nologo'], { encoding: 'utf8' });
  if (pub.status !== 0 || !existsSync(join(exeDir, 'Keepfall.Server.exe'))) throw new Error('dotnet publish failed:\n' + pub.stdout + pub.stderr);
  const text = readFileSync(join(root, 'config', 'balance.json'), 'utf8').replace(/^\uFEFF/, '');
  const stores = /("startingResources":\s*\{\s*"food":\s*)30(,\s*"wood":\s*)40(,\s*"iron":\s*)20/;
  if (!stores.test(text)) throw new Error('config/balance.json: startingResources changed, update tools/steam-media-stack.mjs');
  const configPath = join(dir, 'balance.json');
  writeFileSync(configPath, text.replace(stores, '$1400$21500$31000'), 'utf8');
  writeFileSync(join(dir, 'challenges.json'), readFileSync(join(root, 'config', 'challenges.json')));
  const server = spawn(join(exeDir, 'Keepfall.Server.exe'), ['--urls', `http://localhost:${serverPort}`], {
    cwd: exeDir, stdio: ['ignore', openSync(join(dir, 'server.log'), 'a'), openSync(join(dir, 'server.log'), 'a')], // server.log in the temp dir helps when a hub call fails
   
    env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development', Keepfall__BalancePath: configPath, Keepfall__AllowSpeedControl: 'true', Keepfall__AllowSoloStart: 'true', Keepfall__MaxRooms: '80' },
  });
  const vite = spawn('node', [join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js')], {
    cwd: join(root, 'client'), stdio: 'ignore', env: { ...process.env, KEEPFALL_CLIENT_PORT: String(clientPort), KEEPFALL_SERVER: `http://localhost:${serverPort}` },
  });
  const stop = () => { for (const p of [server, vite]) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://localhost:${serverPort}/health`)).ok && (await fetch(`http://localhost:${clientPort}/`)).ok) return { url: `http://localhost:${clientPort}/`, serverUrl: `http://localhost:${serverPort}`, stop }; } catch { /* not up yet */ }
    await sleep(500);
  }
  stop();
  throw new Error('the media stack did not come up');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await startStack();
  console.log('up:', s.url, '(Ctrl+C to stop)');
  await new Promise(() => {});
}
