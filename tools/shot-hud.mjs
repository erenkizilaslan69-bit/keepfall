// HUD layering check in headless Chrome at 1280x720 and 1920x1080: a big sign of the map is put right over the top bar, a camera button and the
// minimap; whatever is on top at those points must be the HUD, never the sign. Also saves a screenshot of each.
// Needs the dev server and the Vite dev client; usage: node tools/shot-hud.mjs <output folder> <tag> [client url]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'hud';
const URL = process.argv[4] ?? 'http://localhost:5174/';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-hud-'));
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
let bad = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok   ' : 'FAIL ', name, extra); if (!ok) bad++; };

await send('Runtime.enable');
await send('Page.enable');
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run('localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); sessionStorage.clear(); 1');
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
  await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
  const result = JSON.parse(await run(`(async () => {
    const s = window.keepfallScene, ui = window.keepfallUi, cam = s.cameras.main, out = [];
    const spots = {
      'top bar': document.querySelector('.topbar .tb-res'),
      'camera button': document.querySelector('.cam-btns button'),
      'minimap': document.querySelector('.kf-minimap'),
    };
    for (const [name, el] of Object.entries(spots)) {
      if (!el) { out.push({ name, ok: false, why: 'element not found' }); continue; }
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const world = cam.getWorldPoint(x, y);
      ui.labels.set('hud-test:' + name, { x: world.x, y: world.y, anchor: 'center', html: '<div class="wl-sign" style="width:' + Math.round(r.width + 80) + 'px;height:' + Math.round(r.height + 80) + 'px">SIGN</div>' });
    }
    // signs ignore the pointer, so elementsFromPoint would skip them: let them be hit for the test (paint order stays the same)
    const style = document.createElement('style');
    style.textContent = '.world-labels, .world-labels * { pointer-events: auto !important; }';
    document.head.appendChild(style);
    await new Promise((r) => setTimeout(r, 300));
    for (const [name, el] of Object.entries(spots)) {
      if (!el) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const stack = document.elementsFromPoint(x, y);
      const label = stack.findIndex((e) => e.closest('.world-labels'));
      const hud = stack.findIndex((e) => e.closest('.topbar, .cam-btns, .kf-minimap'));
      out.push({ name, ok: label >= 0 && hud >= 0 && hud < label, label, hud });
    }
    return JSON.stringify(out);
  })()`));
  for (const r of result) check(`${w}x${h}: the HUD (${r.name}) is above a sign`, r.ok, JSON.stringify(r));
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${tag}-${w}x${h}.png`), Buffer.from(shot.result.data, 'base64'));
}
ws.close();
chrome.kill();
console.log(bad === 0 ? 'All HUD checks passed.' : `${bad} check(s) failed.`);
process.exit(bad === 0 ? 0 : 1);
