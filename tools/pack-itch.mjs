// Builds the client for itch.io (relative paths, talks to the hosted game server) and zips it as keepfall-itchio.zip in the repo root;
// with --crazy the CrazyGames build (the SDK switched on, client/.env.crazy) as keepfall-crazygames.zip.
//   node tools/pack-itch.mjs https://my-keepfall.onrender.com [--crazy]     (the address replaces VITE_SERVER_URL of the env file)
// The zip has index.html at its root. It holds the Tiny Swords files: upload it to the site, never commit it.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const client = join(root, 'client');
const crazy = process.argv.includes('--crazy');
const envFile = readFileSync(join(client, crazy ? '.env.crazy' : '.env.itch'), 'utf8');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const server = (arg ?? /^VITE_SERVER_URL=(.*)$/m.exec(envFile)?.[1] ?? '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[^/\s]+$/.test(server)) { console.error(`The game server address must be https://host (got "${server}")`); process.exit(1); }
console.log('Game server:', server);

execSync(crazy ? 'npm run build:crazy' : 'npm run build:itch', { cwd: client, stdio: 'inherit', env: { ...process.env, VITE_SERVER_URL: server } });
const dist = join(client, crazy ? 'dist-crazy' : 'dist-itch');
if (!existsSync(join(dist, 'index.html'))) { console.error(`${dist}/index.html missing`); process.exit(1); }
const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (/(?:src|href)="\/[^/]/.test(html)) { console.error('index.html still has absolute paths'); process.exit(1); }

// CrazyGames: no address of another site stays in the package (the credits show the artist's name only; the licence file keeps no link either)
if (crazy) {
  const scrub = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (e.isDirectory()) { scrub(f); continue; }
      if (!/\.(js|html|css|json|txt)$/.test(e.name)) continue;
      const text = readFileSync(f, 'utf8');
      const clean = text.replace(/ ?\(pixelfrog-assets\.itch\.io\/tiny-swords\)/g, '').replace(/,? ?https:\/\/pixelfrog-assets\.itch\.io\/tiny-swords/g, '');
      if (clean !== text) writeFileSync(f, clean);
    }
  };
  scrub(dist);
}

const zip = join(root, crazy ? 'keepfall-crazygames.zip' : 'keepfall-itchio.zip');
rmSync(zip, { force: true });
// (entries named without a leading './', which some zip readers keep)
// Windows' own bsdtar writes a zip with forward-slash names and index.html at the root (Git Bash's GNU tar cannot; PowerShell's Compress-Archive writes backslashes)
if (process.platform === 'win32') execSync(`"C:/Windows/System32/tar.exe" -a -c -f "${zip}" -C "${dist}" ${readdirSync(dist).map((f) => `"${f}"`).join(' ')}`, { stdio: 'inherit' });
else execSync(`zip -qr "${zip}" .`, { cwd: dist, stdio: 'inherit' });
let files = 0;
(function count(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? count(p) : files++; } })(dist);
// CrazyGames' upload can take a folder as well as an archive: the same files, index.html at the folder's root, next to the repository (never inside it)
if (crazy) {
  const folder = join(root, '..', 'keepfall-crazygames-build');
  rmSync(folder, { recursive: true, force: true });
  cpSync(dist, folder, { recursive: true });
  console.log(`folder: ${folder}`);
}
console.log(`${crazy ? 'keepfall-crazygames.zip' : 'keepfall-itchio.zip'}: ${files} files, ${(statSync(zip).size / 1048576).toFixed(1)} MB`);
if (files > 1000) console.log('WARNING: itch.io accepts at most 1000 files in an HTML5 zip');
