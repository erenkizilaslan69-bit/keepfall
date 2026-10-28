// Cleans the interface pictures of art/inbox (icons, frames, cards) with the same pipeline as art-clean.mjs: usage `node tools/art-ui.mjs [job ...]`
// (jobs: icons minimap panel cards logo; none = all). Output: client/public/art/ui/ (full and half-resolution variants for the frames).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const inbox = join(root, 'art', 'inbox'), out = join(root, 'client', 'public', 'art', 'ui');
mkdirSync(join(out, 'icons'), { recursive: true });
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=800,600', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
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
const dataUrl = (file) => 'data:image/jpeg;base64,' + readFileSync(join(inbox, file)).toString('base64');
const clean = (file, cells, colors = 32) => evalJs(`window.artClean(${JSON.stringify(dataUrl(file))}, { cells: ${JSON.stringify(cells)}, colors: ${colors} })`);
const size = (file) => evalJs(`window.artSize(${JSON.stringify(dataUrl(file))})`);
const save = (name, r, both = true) => {
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
  if (both) writeFileSync(join(out, `${name}-half.png`), Buffer.from(r.pngHalf.split(',')[1], 'base64'));
  console.log(`${name}: ${r.w}x${r.h} cells (half ${r.wHalf}x${r.hHalf}), period ${r.period}px (confidence ${r.ratio})`);
};
const jobs = process.argv.slice(2);
const want = (j) => jobs.length === 0 || jobs.includes(j);

if (want('icons')) {
  const [w, h] = await size('ikonlar.jpg');
  const names = ['meat', 'wood', 'iron', 'gold', 'people', 'swords', 'hourglass', 'heart', 'scout', 'envoy', 'shield', 'hammer', 'skull', 'chest', 'crown', 'gear'];
  const cw = w / 4, ch = h / 4;
  const cells = names.map((name, i) => ({ name, x: Math.round((i % 4) * cw), y: Math.round(Math.floor(i / 4) * ch), w: Math.round(cw), h: Math.round(ch), fill: name === 'hourglass' ? [239, 227, 192] : undefined }));
  for (const r of await clean('ikonlar.jpg', cells, 20)) save(`icons/${r.name}`, r, false);
}
if (want('minimap')) {
  const [r] = await clean('minimap-cerceve.jpg', [{ name: 'minimap', x: 0, y: 0, w: 2048, h: 2048, largest: true }], 40);
  save('minimap-frame', r);
}
if (want('panel')) {
  const [r] = await clean('panel-cerceve.jpg', [{ name: 'panel', x: 0, y: 0, w: 2048, h: 2048 }], 40);
  save('panel-frame', r);
}
if (want('cards')) {
  const [fw, fh] = await size('kart-cerceve.jpg');
  const [a] = await clean('kart-cerceve.jpg', [{ name: 'front', x: 0, y: 0, w: fw, h: fh }], 40);
  save('card-front', a);
  const [bw, bh] = await size('kart-arka.jpg');
  const [b] = await clean('kart-arka.jpg', [{ name: 'back', x: 0, y: 0, w: bw, h: bh }], 40);
  save('card-back', b);
}
if (want('logo')) {
  const [w, h] = await size('logo.jpg');
  const [r] = await clean('logo.jpg', [{ name: 'logo', x: 0, y: 0, w, h }], 40);
  save('logo', r);
}
ws.close(); chrome.kill(); process.exit(0);
