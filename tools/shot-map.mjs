// Screenshots of the MAP (castle, coast, forest, a road, a far corner) in headless Chrome, for before/after comparisons of the terrain.
// Needs the dev server and the Vite dev client running (see README); usage: node tools/shot.mjs <output folder> <tag> [client url]
// e.g. node tools/shot.mjs docs/gorsel/once once http://localhost:5174/   → docs/gorsel/once-1280x720-home.png …
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'shot';
const URL = process.argv[4] ?? 'http://localhost:5174/';
const SIZES = [[1280, 720], [1920, 1080]];
// `extra` as a 5th argument takes the windows that need made-up data too (army, forest places, scout report, battle report, countdown, bot end) and the end screen.

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
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
const shot = async (size, name) => {
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${tag}-${size[0]}x${size[1]}-${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
};
const wait = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;
const click = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))?.click();`;

await send('Runtime.enable');
await send('Page.enable');
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run('localStorage.clear(); sessionStorage.clear(); 1');
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
  await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); document.querySelector('.ui-root').style.visibility = 'hidden'; return 1; })()`);
  for (const [name, tile, zoom] of [
    ['castle', null, 1], ['castle-fog', null, 1], ['wide-fog', { x: 28, y: 28 }, 0.5], ['coast-west', { x: 3, y: 12 }, 1], ['coast-north', { x: 16, y: 3 }, 1], ['corner', { x: 3, y: 3 }, 1], ['road', { x: 17, y: 14 }, 1],
    ['forest', { x: 28, y: 28 }, 1], ['forest-edge', { x: 20, y: 30 }, 1], ['wide', { x: 28, y: 28 }, 0.5],
  ]) {
    await run(`(async () => { const s = window.keepfallScene; s.fog.setVisible(${name === 'castle-fog' || name === 'wide-fog'}); s.cameras.main.setZoom(${zoom}); ${tile ? `s.lookAt({ x: ${tile.x}, y: ${tile.y} });` : 's.centerOnCastle();'} await new Promise(r => setTimeout(r, 900)); return 1; })()`);
    await shot(size, name);
  }
}
ws.close();
chrome.kill();
process.exit(0);
