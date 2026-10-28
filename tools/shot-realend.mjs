// A real match to its real end (dev server, x20 speed, one Easy bot): does the end screen get its summary? usage: node tools/shot-realend.mjs <out.png> [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'realend.png', URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1280,800', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
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
for(let i=0;i<120;i++){ if(window.keepfallScene?.ready) break; await w(300); } await w(2000); document.getElementById('kingdom-decree')?.remove();
const x20=[...document.querySelectorAll('button')].find(b=>/20/.test(b.textContent)&&b.textContent.length<6); x20?.click(); return x20?'x20':'no x20 button';})()`).then((r) => console.log(r));
let ended = false;
for (let i = 0; i < 90 && !ended; i++) {
  await sleep(3000);
  ended = await evalJs(`!!document.querySelector('#end-title')?.textContent && !!document.querySelector('#ranking li')`);
}
console.log('ended', ended);
await sleep(2500);
console.log(await evalJs(`JSON.stringify({ title: document.querySelector('#end-title')?.textContent, summary: document.querySelector('#summary')?.textContent.slice(0, 160), others: document.querySelectorAll('.other-summary').length })`));
const s = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(s.result.data, 'base64'));
ws.close(); chrome.kill(); process.exit(0);
