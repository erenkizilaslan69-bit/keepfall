// Builds the offline Steam demo for Windows in one command:   node tools/pack-steam.mjs [--skip-client] [--skip-server] [--out steam-build]
//   steam-build/Keepfall/Keepfall.exe            the Electron shell (tools/steam/shell: starts the server on a free local port, shows the client)
//   steam-build/Keepfall/resources/app/          main.js, preload.js (+ steamworks.js when installed)
//   steam-build/Keepfall/server/                 self-contained game server (no .NET install needed) + config/ + client/dist (the Steam build of the client)
//   steam-build/Keepfall/steam.json              { "appId": 0 }  placeholder; with 0 (or no SDK) Steam stays off
// The folder holds the Tiny Swords files and a 100 MB server: it is git-ignored (steam-build/), never commit it. Details: docs/steam-paketleme.md.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const outBase = join(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'steam-build');
const pkg = join(outBase, 'Keepfall');
const shellSrc = join(root, 'tools', 'steam', 'shell');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
function size(dir) { let n = 0; for (const e of readdirSync(dir, { withFileTypes: true })) { const f = join(dir, e.name); n += e.isDirectory() ? size(f) : statSync(f).size; } return n; }

if (process.platform !== 'win32') { console.error('This prototype packs for Windows (win-x64) only.'); process.exit(1); }

// 1. the Steam build of the client (private rooms off, no server address: the page comes from the bundled server)
if (!flag('--skip-client')) run('npm run build:steam', join(root, 'client'));
const dist = join(root, 'client', 'dist-steam');
if (!existsSync(join(dist, 'index.html'))) { console.error('client/dist-steam/index.html missing'); process.exit(1); }

// 2. the shell and the Electron runtime
if (!existsSync(join(shellSrc, 'node_modules', 'electron', 'dist'))) run('npm install --no-audit --no-fund', shellSrc);
const electronDist = join(shellSrc, 'node_modules', 'electron', 'dist');
if (!existsSync(electronDist)) { console.error('electron/dist missing (run: node node_modules/electron/install.js in tools/steam/shell)'); process.exit(1); }

const keepServer = flag('--skip-server') && existsSync(join(pkg, 'server', 'Keepfall.Server.exe'));
const keptServer = join(outBase, '.server-keep');
if (keepServer) { rmSync(keptServer, { recursive: true, force: true }); renameSync(join(pkg, 'server'), keptServer); }
rmSync(pkg, { recursive: true, force: true });
mkdirSync(pkg, { recursive: true });
cpSync(electronDist, pkg, { recursive: true });
renameSync(join(pkg, 'electron.exe'), join(pkg, 'Keepfall.exe'));
rmSync(join(pkg, 'resources', 'default_app.asar'), { force: true });
// only the two languages the game has (Chromium's other ~55 locale packs are ~45 MB)
for (const f of readdirSync(join(pkg, 'locales'))) if (!/^(en-US|tr)\.pak$/.test(f)) rmSync(join(pkg, 'locales', f));
const app = join(pkg, 'resources', 'app');
mkdirSync(app, { recursive: true });
for (const f of ['main.js', 'preload.js', 'mp.js', 'tunnel.js', 'gate.js']) cpSync(join(shellSrc, f), join(app, f));
writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'keepfall', version: '0.1.0', main: 'main.js' }, null, 2));
// the Steam SDK binding is optional: it is shipped only when it is installed (and used only when steam.json holds an app id)
if (existsSync(join(shellSrc, 'node_modules', 'steamworks.js'))) cpSync(join(shellSrc, 'node_modules', 'steamworks.js'), join(app, 'node_modules', 'steamworks.js'), { recursive: true });
writeFileSync(join(pkg, 'steam.json'), JSON.stringify({ appId: 0, note: 'Put the Steamworks app id here (a number above 0) to switch Steam on; 0 = off.' }, null, 2) + '\n');
// The build's name: host and guest of a friend-hosted game must match (the shell and the server's /version tell it).
let commit = 'nogit';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { /* not a checkout */ }
writeFileSync(join(pkg, 'build.json'), JSON.stringify({ version: `0.1.0+${commit}` }, null, 2) + '\n');

// 3. the game server, self-contained, with its rules and the client
const server = join(pkg, 'server');
if (keepServer) renameSync(keptServer, server);
else {
  run(`dotnet publish src/Keepfall.Server -c Release -r win-x64 --self-contained true -p:DebugType=none -p:DebugSymbols=false -o "${server}"`);
}
rmSync(join(server, 'logs'), { recursive: true, force: true });
rmSync(join(server, 'client'), { recursive: true, force: true });
rmSync(join(server, 'config'), { recursive: true, force: true });
mkdirSync(join(server, 'config'), { recursive: true });
for (const f of ['balance.json', 'challenges.json']) cpSync(join(root, 'config', f), join(server, 'config', f));
// (the server looks for ../client/dist next to config/)
cpSync(dist, join(server, 'client', 'dist'), { recursive: true });

// 4. credits / licences that must travel with the files
const licenses = join(root, 'client', 'licenses');
if (existsSync(licenses)) cpSync(licenses, join(pkg, 'licenses'), { recursive: true });
writeFileSync(join(pkg, 'README-demo.txt'), 'Keepfall demo (offline). Start Keepfall.exe. Nothing is sent over the internet; progress is stored on this computer.\n');

// Valve's test app id (480, Spacewar) is for development on one machine only: a package that carries it is refused.
const carries480 = (dir) => readdirSync(dir, { withFileTypes: true }).some((e) => {
  const f = join(dir, e.name);
  if (e.isDirectory()) return e.name !== 'node_modules' && e.name !== 'server' && e.name !== 'locales' && carries480(f);
  if (e.name === 'steam_appid.txt') return true;
  return e.name === 'steam.json' && Number(JSON.parse(readFileSync(f, 'utf8')).appId) === 480;
});
if (carries480(pkg)) { console.error('The package holds the test app id 480 (steam.json / steam_appid.txt): remove it.'); process.exit(1); }

console.log(`\n${pkg}\n  total ${mb(size(pkg))}  (server ${mb(size(server))}, client ${mb(size(join(server, 'client')))}, shell+Electron ${mb(size(pkg) - size(server))})`);
