// Finds (and with --fix removes) stray thin leftovers in the cleaned kingdom pictures: connected groups of opaque pixels (8-neighbour) that are
// at most 2 pixels wide (or high) yet taller (wider) than 6, and not attached to a bigger group. Chrome does the pixel work.
// Usage: node tools/png-strays.mjs <png...> [--fix]   (paths from the repo root; the dev client on 5174 serves client/public)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIX = process.argv.includes('--fix');
const FILES = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
const analyse = `async (b64, fix) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), W = c.width, H = c.height;
  const seen = new Uint8Array(W * H), found = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || d.data[s * 4 + 3] < 40) continue;
    const stack = [s], cells = []; seen[s] = 1; let x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (stack.length) {
      const p = stack.pop(); cells.push(p); const x = p % W, y = (p / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx; if (!seen[q] && d.data[q * 4 + 3] >= 40) { seen[q] = 1; stack.push(q); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if ((w <= 2 && h > 6) || (h <= 2 && w > 6)) found.push({ x0, y0, w, h, n: cells.length, cells });
  }
  if (fix) for (const f of found) for (const p of f.cells) d.data[p * 4 + 3] = 0;
  if (fix && found.length) g.putImageData(d, 0, 0);
  return { size: [W, H], found: found.map(({ cells, ...r }) => r), png: fix && found.length ? c.toDataURL('image/png').split(',')[1] : null };
}`;
for (const f of FILES) {
  const r = await send('Runtime.evaluate', { expression: `(${analyse})(${JSON.stringify(readFileSync(f).toString('base64'))}, ${FIX})`, awaitPromise: true, returnByValue: true });
  const v = r.result?.result?.value;
  if (!v) { console.log(f, 'ERR', JSON.stringify(r.result?.exceptionDetails?.exception?.description ?? r.result)); continue; }
  console.log(f, v.size.join('x'), v.found.length ? JSON.stringify(v.found) : 'clean');
  if (v.png) { writeFileSync(f, Buffer.from(v.png, 'base64')); console.log('  fixed'); }
}
ws.close(); chrome.kill(); process.exit(0);
