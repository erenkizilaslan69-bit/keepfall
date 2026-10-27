// Screenshots of the camp fire with soldiers round it; usage: node tools/shot-camp.mjs <out.png> [http://localhost:5174/]
// Needs the dev server and the Vite dev client running (see README). Usage: node tools/army-check.mjs [http://localhost:5174/] [minutes-of-real-time]
// Headless Chrome via CDP: a room with a Medium bot at x20; we raise soldiers, march on the bot and note every doubled column ("mover-audit" problems)
// and every battle: when the server announced it, when the replay began, whether a "Savaş" cloud stood where a replay should have been.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[3] ?? 'http://localhost:5174/';
const MINUTES = Number(process.argv[3] ?? 4);
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,800', '--no-first-run', '--disable-gpu', 'about:blank',
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
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(4000);


import { writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'camp.png';
await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Test'; btn('Oda kur').click(); await w(1500);
[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Kolay')[0].click(); await w(800);
btn('Hazırım').click(); await w(800); btn('Maçı başlat').click(); await w(500);
for(let i=0;i<120;i++){ if(window.keepfallScene?.ready) break; await w(300); } await w(2500);
const s=window.keepfallScene; const u=(id,name,n,a=0)=>({id,name,soldiers:n,arming:a,weapons:0,wood:0,iron:0,buildSeconds:0,price:0,hired:0});
const orig=s.soldiers.sync.bind(s.soldiers); s.soldiers.sync=()=>{}; orig([u('okcu','Okçu',8),u('kesis','Keşiş',3),u('mizrakci','Mızrakçı',6),u('kilicli','Kılıçlı',9),u('kalkanli','Kalkanlı',4,2)]);
s.cameras.main.setZoom(1.0); s.cameras.main.centerOn(512,600); return 1;})()`);
await sleep(2500);
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(r.result.data, 'base64'));
console.log(logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
