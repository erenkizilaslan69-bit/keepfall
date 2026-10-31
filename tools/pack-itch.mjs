// Builds the client for itch.io / CrazyGames (relative paths, talks to the hosted game server) and zips it as keepfall-itchio.zip in the repo root.
//   node tools/pack-itch.mjs https://my-keepfall.onrender.com     (the address replaces VITE_SERVER_URL of client/.env.itch)
// The zip has index.html at its root. It holds the Tiny Swords files: upload it to itch.io, never commit it.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const client = join(root, 'client');
const envFile = readFileSync(join(client, '.env.itch'), 'utf8');
const server = (process.argv[2] ?? /^VITE_SERVER_URL=(.*)$/m.exec(envFile)?.[1] ?? '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+$/.test(server)) { console.error(`The game server address must be https://host (got "${server}")`); process.exit(1); }
console.log('Game server:', server);

execSync('npm run build:itch', { cwd: client, stdio: 'inherit', env: { ...process.env, VITE_SERVER_URL: server } });
const dist = join(client, 'dist-itch');
if (!existsSync(join(dist, 'index.html'))) { console.error('dist-itch/index.html missing'); process.exit(1); }
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (/(?:src|href)="\/[^/]/.test(html)) { console.error('index.html still has absolute paths'); process.exit(1); }

const zip = join(root, 'keepfall-itchio.zip');
rmSync(zip, { force: true });
// (entries named without a leading './', which some zip readers keep)
// Windows' own bsdtar writes a zip with forward-slash names and index.html at the root (Git Bash's GNU tar cannot; PowerShell's Compress-Archive writes backslashes)
if (process.platform === 'win32') execSync(`"C:/Windows/System32/tar.exe" -a -c -f "${zip}" -C "${dist}" ${readdirSync(dist).map((f) => `"${f}"`).join(' ')}`, { stdio: 'inherit' });
else execSync(`zip -qr "${zip}" .`, { cwd: dist, stdio: 'inherit' });
let files = 0;
(function count(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? count(p) : files++; } })(dist);
console.log(`keepfall-itchio.zip: ${files} files, ${(statSync(zip).size / 1048576).toFixed(1)} MB`);
if (files > 1000) console.log('WARNING: itch.io accepts at most 1000 files in an HTML5 zip');
