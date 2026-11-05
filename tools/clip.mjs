// A short mp4 of the game in headless Chrome (for before/after of moving things: effects, armies, battles). Starts a match against bots on the Vite dev client,
// runs a setup script (JS, an expression that may return a promise; it may start its own timers), then takes pictures of the page for a few seconds and
// makes them an mp4 with ffmpeg (winget install Gyan.FFmpeg).
// Usage: node tools/clip.mjs <out.mp4> <setup.js> [http://localhost:5174/]
// Env: SECONDS=6 FPS=8 SIZE=1280,720 BOTS=easy  WARMUP=800 (ms between the setup and the first picture)  QUERY=?fx=0
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const [OUT, SETUP, BASE = 'http://localhost:5174/'] = process.argv.slice(2);
if (!OUT || !SETUP) { console.log('usage: node tools/clip.mjs <out.mp4> <setup.js> [url]'); process.exit(2); }
const SECONDS = Number(process.env.SECONDS ?? 6), FPS = Number(process.env.FPS ?? 8);
const [W, H] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const BOTS = (process.env.BOTS ?? 'easy').split(',');
const URL = BASE + (process.env.QUERY ?? '');
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-clip-'));
const frames = join(dir, 'frames'); mkdirSync(frames);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`, `--window-size=${W},${H}`,
  '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); localStorage.setItem('keepfall_lang', '${process.env.KFLANG ?? 'tr'}'); 1`);
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ${JSON.stringify(BOTS)}) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.ready) break; await new Promise(r => setTimeout(r, 400)); } await new Promise(r => setTimeout(r, 2500)); document.getElementById('kingdom-decree')?.remove(); return 1; })()`);
const setup = await run(readFileSync(SETUP, 'utf8'));
if (typeof setup === 'string' && setup.startsWith('ERR')) console.log('setup:', setup.slice(0, 300));
await sleep(Number(process.env.WARMUP ?? 800));
const total = Math.round(SECONDS * FPS), t0 = Date.now();
for (let i = 0; i < total; i++) {
  const due = t0 + (i * 1000) / FPS;
  if (Date.now() < due) await sleep(due - Date.now());
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
}
ws.close(); chrome.kill();
mkdirSync(dirname(OUT), { recursive: true });
const made = Math.round(((Date.now() - t0) / 1000) * 10) / 10;
const rate = Math.max(2, Math.round(total / Math.max(made, 1)));
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(rate), '-i', join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', OUT], { stdio: 'inherit' });
console.log(r.status === 0 ? `saved ${OUT} (${total} pictures in ${made} s, played at ${rate} fps)` : 'ffmpeg failed (is it installed?)');
rmSync(dir, { recursive: true, force: true });
process.exit(r.status === 0 ? 0 : 1);
