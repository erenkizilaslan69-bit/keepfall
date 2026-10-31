// Road screenshots in headless Chrome: starts a bot match and saves pictures of the roads (the way out of our castle, a junction, the road
// in the forest and, with ?sur=3, the paved ground before the gate). Needs the dev server and the Vite dev client;
// usage: node tools/shot-roads.mjs <output folder> <tag> [client url]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'hud';
const BASE = process.argv[4] ?? 'http://localhost:5174/';
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
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 720, deviceScaleFactor: 1, mobile: false });
const URL = `${BASE}?sur=3`;
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); sessionStorage.clear(); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
// where to look, in scene pixels: the road out of our gate, the first junction, a road in the forest
const spots = JSON.parse(await run(`(() => {
  const s = window.keepfallScene, lay = s.layout, own = lay.regions.find((r) => r.seat === s.mySeat);
  const w = (p) => ({ x: (p.x - own.origin.x) * 64, y: (p.y - own.origin.y) * 64 });
  const count = new Map(); const key = (p) => p.x.toFixed(2) + ',' + p.y.toFixed(2);
  for (const r of lay.roads) for (const p of [r.points[0], r.points[r.points.length - 1]]) count.set(key(p), (count.get(key(p)) ?? 0) + 1);
  const junction = lay.roads.flatMap((r) => [r.points[0], r.points[r.points.length - 1]]).find((p) => count.get(key(p)) >= 3);
  const hub = lay.features.find((f) => f.kind === 'forest').center;
  const toHub = lay.roads.find((r) => r.points.some((p) => p.x === hub.x && p.y === hub.y) && r.points.length === 2);
  const a = toHub.points[0], b = toHub.points[1], forest = { x: a.x + (b.x - a.x) * 0.6, y: a.y + (b.y - a.y) * 0.6 };
  const gate = own.gate;
  const east = lay.roads.some((r) => r.points[0].x === gate.x && r.points[0].y === gate.y && r.points[1].x > gate.x);
  return JSON.stringify({ gate: w({ x: gate.x + (east ? 5.5 : -5.5), y: gate.y }), junction: w(junction), forest: w(forest), hub: w(hub) });
})()`));
for (const [name, p] of Object.entries(spots)) {
  await run(`(() => { const s = window.keepfallScene, c = s.cameras.main; c.setZoom(1.15); c.centerOn(${p.x}, ${p.y}); document.querySelectorAll('.topbar, .cam-btns, .kf-minimap, .notes').forEach(e => e.style.visibility = 'hidden'); return 1; })()`);
  await sleep(900);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${tag}-${name}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log('saved', name);
}
console.log('roads painted in', await run('window.keepfallRoadMs'), 'ms');
ws.close();
chrome.kill();
process.exit(0);
