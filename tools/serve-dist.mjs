// A static server that is strict about letter case, like Linux hosts and itch.io: "Kale.png" does not answer for "kale.png" (Windows would).
// It mounts a folder under a sub-path, the way itch.io puts a game in html-classic.itch.zone/html/<id>/.
//   node tools/serve-dist.mjs [dir=client/dist-itch] [port=8099] [mount=/html/12345/]
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(process.argv[2] ?? fileURLToPath(new URL('../client/dist-itch', import.meta.url)));
const port = Number(process.argv[3] ?? 8099);
const mount = process.argv[4] ?? '/html/12345/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };

/** The file for a request path, only when every segment matches the real name exactly. */
function find(parts) {
  let cur = dir;
  for (const part of parts) {
    if (!readdirSync(cur).includes(part)) return null;
    cur = join(cur, part);
  }
  return statSync(cur).isFile() ? cur : null;
}

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!path.startsWith(mount)) { res.writeHead(404).end('outside the mount'); return; }
  const rel = path.slice(mount.length);
  const file = find((rel === '' ? 'index.html' : rel).split('/').filter(Boolean));
  if (!file) { console.log('404', path); res.writeHead(404).end('not found (case-sensitive)'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(port, () => console.log(`http://localhost:${port}${mount} → ${dir}`));
