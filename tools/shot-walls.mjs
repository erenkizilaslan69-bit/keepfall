// Map screenshots in headless Chrome for the walls (and roads): starts a bot match, frames our whole region and saves a picture per wall level
// (?sur=1..3 previews a level before the server sends it). Needs the dev server and the Vite dev client;
// usage: node tools/shot-walls.mjs <output folder> <tag> [levels, e.g. 1,2,3] [client url]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'hud';
const LEVELS = (process.argv[4] ?? '1,2,3').split(',');
const BASE = process.argv[5] ?? 'http://localhost:5174/';
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
for (const level of LEVELS) {
  const URL = `${BASE}?sur=${level}${process.env.KF_OTHER ? '&other=1' : ''}`;
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run('localStorage.clear(); sessionStorage.clear(); 1');
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
  await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
  // frame the whole region (16x12 tiles): zoom out to fit
  await run(`(() => { const s = window.keepfallScene, c = s.cameras.main; c.setZoom(Math.min(window.innerWidth / 1060, window.innerHeight / 800)); const other = new URLSearchParams(window.location.search).get('other');
    const own = s.layout.regions.find((r) => r.seat === s.mySeat), rival = s.layout.regions.find((r) => r.seat !== null && r.seat !== s.mySeat);
    c.centerOn(512 + (other ? (rival.origin.x - own.origin.x) * 64 : 0), 384 + (other ? (rival.origin.y - own.origin.y) * 64 : 0)); document.querySelectorAll('.topbar, .cam-btns, .kf-minimap, .notes').forEach(e => e.style.visibility = 'hidden'); return 1; })()`);
  await sleep(1200);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${tag}-sur${level}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log('saved', level);
}
ws.close();
chrome.kill();
process.exit(0);
