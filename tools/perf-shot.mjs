// Before/after pictures for drawing optimisations: starts a match (dev server + Vite dev client) and photographs fixed views (castle, camp fire at 1x/3x, idle pen).
// Usage: SIZE=1280x720 node tools/perf-shot.mjs <prefix> [client url]  -> art/shots/perf/<prefix>-*.png (not in git)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = process.argv[2] ?? 'shot', URL = process.argv[3] ?? 'http://localhost:5174/';
const [W, H] = (process.env.SIZE ?? '1280x720').split('x').map(Number);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'art', 'shots', 'perf'); mkdirSync(out, { recursive: true });
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-shot-'))}`,
  `--window-size=${W},${H}`, '--no-first-run', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text) : r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen','true'); localStorage.setItem('keepfall_lang','tr'); 1`);
await send('Page.navigate', { url: URL + '?nodebug=1' }); await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Shot'); await n.addBot('easy'); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 200; i++) { if (window.keepfallScene?.ready) return 1; await new Promise(r => setTimeout(r, 300)); } return 0; })()`);
await sleep(4000); // the clouds part, the first frames
await run(`document.querySelectorAll('[data-close], .decree button').forEach((b) => b.click()); 1`); await sleep(500);
const shot = async (name) => { await sleep(700); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${PREFIX}-${name}.png`), Buffer.from(r.result.data, 'base64')); console.log('wrote', `${PREFIX}-${name}.png`); };
const view = (x, y, z) => run(`(async () => { const L = await import('/src/scene/layout.ts'); const s = window.keepfallScene; const c = s.cameras.main; await s.centerOnCastle(); const mid = c.midPoint; const fire = s.children.list.filter((o) => o.texture?.key === 'campfire').sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y))[0]; const off = { x: fire.x - L.CAMP.x, y: fire.y - L.CAMP.y }; const p = (${x}); c.setZoom(${z}); c.centerOn(p.x, p.y); return 1; })()`);
await run(`window.keepfallScene.centerOnCastle(); 1`); await shot('castle');
await view(`({ x: L.CAMP.x + off.x, y: L.CAMP.y + off.y })`, 0, 1); await shot('camp-1x');
await view(`({ x: L.CAMP.x + off.x, y: L.CAMP.y + off.y })`, 0, 3); await shot('camp-3x');
await view(`({ x: (L.IDLE_AREA.left + L.IDLE_AREA.right) / 2 + off.x, y: (L.IDLE_AREA.top + L.IDLE_AREA.bottom) / 2 + off.y })`, 0, 2.5); await shot('pen-2.5x');
ws.close(); chrome.kill(); process.exit(0);
