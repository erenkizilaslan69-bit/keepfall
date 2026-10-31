// A match against bots in headless Chrome, then a list of (JS snippet → screenshot) steps; used by the polish round to take before/after pictures.
// Usage: node tools/cila-shot.mjs <out-prefix> <steps.json> [url]   steps.json: [{ "name": "castle", "js": "...", "wait": 1200, "clip": [x,y,w,h]? }]
// Env: SIZE=1280,720  BOTS=easy,medium  KINGDOM=golge|tuccar|kahin|entrikaci (own kingdom, via the scene's setOwnKingdom)  QUERY=?kv=half
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'cila';
const STEPS = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const URL = (process.argv[4] ?? 'http://localhost:5174/') + (process.env.QUERY ?? '');
const [W, H] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const BOTS = (process.env.BOTS ?? 'easy').split(',');
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-cila-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const logs = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(process.env.FIRSTTIME ? 'localStorage.clear(); 1' : "localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); 1"); // FIRSTTIME=1: the first-time guide opens
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ${JSON.stringify(BOTS)}) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.ready) break; await new Promise(r => setTimeout(r, 400)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
if (process.env.KINGDOM) await run(`window.keepfallScene.setOwnKingdom(${JSON.stringify(process.env.KINGDOM)}); document.querySelector('#kingdom-decree [data-close]')?.click(); 1`);
await run(`document.querySelectorAll('.modal-back,#kingdom-decree,.decree').forEach(e => e.querySelector('[data-close]')?.click()); 1`);
for (const step of STEPS) {
  if (step.js) { const r = await run(step.js); if (typeof r === 'string' && r.startsWith('ERR')) console.log(step.name, r); else if (r !== undefined && step.print) console.log(step.name, r); }
  await sleep(step.wait ?? 1000);
  const shot = await send('Page.captureScreenshot', { format: 'png', ...(step.clip ? { clip: { x: step.clip[0], y: step.clip[1], width: step.clip[2], height: step.clip[3], scale: step.scale ?? 1 } } : {}) });
  writeFileSync(`${OUT}-${step.name}.png`, Buffer.from(shot.result.data, 'base64'));
}
console.log(logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
