// Screenshots round our castle wall (centre, west, east, north, south) at game scale; usage: node tools/shot-walls.mjs <out-prefix> [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'march', URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1280,720', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text) : r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(4000);
await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Test'; btn('Oda kur').click(); await w(1500);
[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Kolay')[0].click(); await w(800);
btn('Hazırım').click(); await w(800); btn('Maçı başlat').click(); await w(500);
for(let i=0;i<120;i++){ if(window.keepfallScene?.ready) break; await w(300); } await w(3500); document.getElementById('kingdom-decree')?.remove(); return 1;})()`);
const cam = (dx, dy, z) => evalJs(`(()=>{const s=window.keepfallScene; s.apply=()=>{}; s.centerOnCastle(); const c=s.cameras.main; c.setZoom(${z}); c.scrollX += ${dx}; c.scrollY += ${dy}; return 1;})()`);
const spots = [['c', 0, 0, 1], ['w', -420, 0, 1], ['e', 420, 0, 1], ['n', 0, -330, 1], ['s', 0, 330, 1]];
for (const [name, dx, dy, z] of spots) {
  await cam(dx, dy, z); await sleep(900);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.result.data, 'base64'));
}
ws.close(); chrome.kill(); process.exit(0);
