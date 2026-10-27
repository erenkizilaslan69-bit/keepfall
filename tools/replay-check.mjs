// Regression check for the battle replay freeze: needs the server and the Vite dev client running (see README); usage: node tools/replay-check.mjs [http://localhost:5174/]
// Headless Chrome via CDP: start a room with a bot on the Vite dev client, inject a fake battle, report errors and whether the frame loop survives.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';
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

console.log('create', await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Test'; btn('Oda kur').click(); await w(1500);
[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Kolay')[0].click(); await w(800);
btn('Hazırım').click(); await w(800); btn('Maçı başlat').click(); await w(2000); return location.href;})()`));
console.log('scene ready', await evalJs(`(async()=>{for(let i=0;i<120;i++){ if(window.keepfallScene?.battles) return i; await new Promise(r=>setTimeout(r,500)); } return 'never';})()`));
console.log('battle', await evalJs(`(async()=>{
 const w=ms=>new Promise(r=>setTimeout(r,ms)); const s=window.keepfallScene; const g=s.sys.game; const now=s.gameNow().now;
 const side=(seat,color,n)=>({seat,color,name:'x',soldiers:Array.from({length:n},()=>({unitId:'kilicli',row:'front'}))});
 const v={id:'fake1',kind:'field',at:{x:20,y:20},facing:{x:1,y:0},startedAt:now,playback:1,tickSeconds:0.5,ticks:12,fightSeconds:6,
  sides:[side(1,'red',4),side(2,'blue',4)],hits:[2,0,4,2,4,0],deaths:[4,0,4,1,4,2,4,3],advances:[],winner:'defender'};
 s.playBattle(v); const f0=g.getFrame(); await w(12000); const f1=g.getFrame(); await w(1500);
 return JSON.stringify({running:g.loop.running, framesDuring: f1-f0, framesLast1500: g.getFrame()-f1, active:s.battles.active.length});})()`));
console.log(logs.join('\n') || 'no exceptions');
await evalJs(`setTimeout(()=>{throw new Error('probe-hata')},10); Promise.reject(new Error('probe-ret')); 1`); await sleep(1500);
ws.close();
chrome.kill();
process.exit(0);
