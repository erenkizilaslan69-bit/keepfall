// Frame rate of the map in headless Chrome (software GL, so the numbers only mean something next to each other): the same 4-player match
// measured idle and with three crowded battles. Needs the dev server and the Vite dev client; usage: node tools/fps.mjs [client url] [seconds]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';
const SECONDS = Number(process.argv[3] ?? 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-fps-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,720', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', 'about:blank',
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
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);

await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);

const measure = (label) => run(`(async () => {
  const g = window.keepfallScene.sys.game; const f0 = g.getFrame(); const t0 = performance.now();
  const samples = []; let last = performance.now();
  await new Promise((resolve) => { const tick = () => { const now = performance.now(); samples.push(now - last); last = now; if (now - t0 < ${SECONDS * 1000}) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
  const dt = (performance.now() - t0) / 1000; const sorted = [...samples].sort((a, b) => a - b);
  return JSON.stringify({ label: ${JSON.stringify('LABEL')}, fps: +((g.getFrame() - f0) / dt).toFixed(1), worstFrameMs: Math.round(sorted.at(-1)), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * .95)]) });
})()`).then((s) => console.log(label, s));

await measure('idle');
// three battles of 24 soldiers a side at once, near our castle, replayed for the whole measurement
await run(`(async () => {
  const s = window.keepfallScene; const now = s.gameNow().now;
  const side = (seat, color, n, unit) => ({ seat, color, name: 'x', soldiers: Array.from({ length: n }, (_, i) => ({ unitId: ['kilicli', 'okcu', 'mizrakci', 'kalkanli'][i % 4], row: i % 4 === 1 ? 'back' : 'front' })) });
  const at = [{ x: 10, y: 8 }, { x: 16, y: 10 }, { x: 12, y: 14 }];
  at.forEach((p, i) => s.playBattle({ id: 'fps' + i, kind: 'field', at: p, facing: { x: 1, y: 0 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 400, fightSeconds: 200,
    sides: [side(1, 'blue', 24), side(2, 'red', 24)],
    hits: Array.from({ length: 300 }, (_, k) => [k * 0.4, k % 24, 24 + (k * 7) % 24]).flat(), deaths: [], advances: [], winner: 'defender' }));
  return 1; })()`);
await sleep(1500);
await measure('crowded');
ws.close();
chrome.kill();
process.exit(0);
