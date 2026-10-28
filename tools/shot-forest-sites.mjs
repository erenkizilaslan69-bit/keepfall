// Screenshots of the forest places, full and emptied: usage node tools/shot-forest-sites.mjs <folder> <tag> [url]; the older forest views: (dense trees, roads, trails and the places a scout has found) near and far, with and without the fog, in headless Chrome.
// Needs the dev server and the Vite dev client running; usage: node tools/shot-forest.mjs <output folder> <tag> [client url]
// e.g. node tools/shot-forest.mjs docs/gorsel-harita once http://localhost:5174/  → once-forest-near.png, once-forest-far-fog.png …
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'shot';
const URL = process.argv[4] ?? 'http://localhost:5174/';
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-shot-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,800', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const shot = async (name) => {
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${tag}-${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); sessionStorage.clear(); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
// Tour the own quarter at ×20 so places are found (and the scout's trail lights the fog), then slow down.
console.log('explore', await run(`(async () => {
  const n = window.keepfallNet, ui = window.keepfallUi; await n.setSpeed(20);
  const own = ui.castle.scouting.quarters.find((q) => q.seat === ui.mySeat);
  await n.sendExplore(own.corner, 'idle');
  for (let i = 0; i < 240; i++) { await new Promise(r => setTimeout(r, 500)); const q = ui.castle.scouting.quarters.find((x) => x.seat === ui.mySeat); if (q.explored) break; }
  await n.setSpeed(1);
  return JSON.stringify(ui.sites.map((s) => [s.kind, s.position.x, s.position.y]));
})()`));
await run(`document.getElementById('kingdom-decree')?.remove(); document.querySelectorAll('.ui-root, .kingdom-fab, .kingdom-panel, .cam-btns, .kf-minimap').forEach((e) => { e.style.visibility = 'hidden'; }); 1`);
// Each view: where (tile), zoom, fog on/off
const sites = JSON.parse(await run(`JSON.stringify(window.keepfallUi.sites.map((s) => ({ kind: s.kind, x: s.position.x, y: s.position.y })))`));
const pick = (kind) => sites.find((s) => s.kind === kind) ?? sites[0];
const views = [];
for (const kind of ['village', 'camp', 'bigCamp', 'chest']) for (const gone of [false, true]) views.push([`${kind}-${gone ? 'empty' : 'full'}`, pick(kind), 1.2, gone]);
for (const [name, at, zoom, gone] of views) {
  await run(`(async () => { const s = window.keepfallScene, ui = window.keepfallUi; s.fog.setVisible(false); s.setMap = () => {};
    const list = ui.sites.map((x) => ({ ...x, gone: ${gone} && x.kind === ${JSON.stringify(name.split('-')[0])} ? true : x.gone })); s.sites.sync(list, s.state.elapsedSeconds + 1);
    s.cameras.main.setZoom(${zoom}); s.lookAt({ x: ${at.x}, y: ${at.y} }); await new Promise(r => setTimeout(r, 900)); return 1; })()`);
  await shot(name);
}
ws.close();
chrome.kill();
process.exit(0);
