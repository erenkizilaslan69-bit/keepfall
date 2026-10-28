// Cleans the kingdom pictures in art/inbox (kale-*.jpg: a castle; binalar-*.jpg: farm, lumber camp, mine, forge in a 2×2 sheet) into sprites on their pixel
// grid in client/public/art/kingdoms/: usage `node tools/art-clean.mjs`. Needs Chrome (does the pixel work in a page: tools/art-clean.page.js).
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inbox = join(root, 'art', 'inbox'), out = join(root, 'client', 'public', 'art', 'kingdoms');
mkdirSync(out, { recursive: true });
const outHalf = join(root, 'client', 'public', 'art', 'kingdoms-half');
mkdirSync(outHalf, { recursive: true });
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=800,600', '--no-first-run', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 280000 });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await evalJs(readFileSync(join(root, 'tools', 'art-clean.page.js'), 'utf8'));

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').toLowerCase();
const report = [];
for (const file of readdirSync(inbox).filter((f) => f.endsWith('.jpg'))) {
  const m = /^(kale|binalar)-(.+)\.jpg$/.exec(file);
  if (!m) continue;
  const kingdom = slug(m[2]);
  const url = 'data:image/jpeg;base64,' + readFileSync(join(inbox, file)).toString('base64');
  const half = 1024;
  const cells = m[1] === 'kale' ? [{ name: 'castle', x: 0, y: 0, w: 2048, h: 2048 }]
    : [{ name: 'farm', x: 0, y: 0, w: half, h: half }, { name: 'lumberCamp', x: half, y: 0, w: half, h: half },
      { name: 'mine', x: 0, y: half, w: half, h: half }, { name: 'forge', x: half, y: half, w: half, h: half }];
  const results = await evalJs(`window.artClean(${JSON.stringify(url)}, { cells: ${JSON.stringify(cells)}, colors: 28 })`);
  for (const r of results) {
    writeFileSync(join(out, `${kingdom}-${r.name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    writeFileSync(join(outHalf, `${kingdom}-${r.name}.png`), Buffer.from(r.pngHalf.split(',')[1], 'base64'));
    report.push(`${kingdom}-${r.name}: ${r.w}x${r.h} cells (half ${r.wHalf}x${r.hHalf}), period ${r.period}px (confidence ${r.ratio}), source ${r.source.join('x')}`);
    console.log(report.at(-1));
  }
}
writeFileSync(join(out, 'REPORT.txt'), report.join('\n') + '\n');
ws.close(); chrome.kill(); process.exit(0);
