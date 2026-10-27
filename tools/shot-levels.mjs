// Screenshots of the four regions with every building at one level (1-4): does anything lie over a wall? Usage: node tools/shot-levels.mjs <out-prefix> [level 1-4] [client url]
// Needs the dev server and the Vite dev client running (see README). Usage: node tools/army-check.mjs [http://localhost:5174/] [minutes-of-real-time]
// Headless Chrome via CDP: a room with a Medium bot at x20; we raise soldiers, march on the bot and note every doubled column ("mover-audit" problems)
// and every battle: when the server announced it, when the replay began, whether a "Savaş" cloud stood where a replay should have been.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[4] ?? 'http://localhost:5174/';
const LEVEL = Number(process.argv[3] ?? 4);
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
const OUT = process.argv[2] ?? 'levels';
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Eren'; btn('Oda kur').click(); await w(1500);
for(let i=0;i<3;i++){ [...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Kolay')[0]?.click(); await w(1000); }
btn('Hazırım').click(); await w(600); btn('Maçı başlat').click(); await w(500);
for(let i=0;i<120;i++){ if(window.keepfallScene?.ready) break; await w(300); } await w(1500);
const s=window.keepfallScene; const { RegionDisplay } = await import('/src/scene/RegionDisplay.ts'); const { toWorld } = await import('/src/scene/world.ts'); const A = await import('/src/scene/assets.ts');
await new Promise(r=>A.loadSpectatorAssets(s, s.otherColors, r)); await w(500);
s.setState({...s.state, buildings: s.state.buildings.map(b=>({...b, level:${LEVEL}, upgradeRemaining:null}))});
window.__rd=[]; 
for(const r of s.layout.regions){ if(r.seat===s.mySeat || r.seat===null) continue; const d=new RegionDisplay(s, s.labels, r.seat, toWorld(r.origin), r.color||'red', s.color); window.__rd.push([r,d]);
  const types=['farm','lumberCamp','mine','forge']; const b=(t)=>({type:t,level:${LEVEL},upgradeRemaining:null,worker:'idle'});
  d.sync({seat:r.seat,buildings:types.map(b),jobs:[],units:[],eliminated:false}); }
s.fog.setVisible(false); return 1;})()`);
const info = JSON.parse(await evalJs(`JSON.stringify(window.keepfallScene.layout.regions.map((r)=>({corner:r.corner,origin:r.origin})))`));
for (const r of info) {
  await evalJs(`(()=>{const s=window.keepfallScene; const c=s.cameras.main; const b=c.getBounds(); c.setZoom(0.8); c.centerOn(b.x+14*64+(${r.origin.x}+8)*64, b.y+14*64+(${r.origin.y}+6)*64);})()`);
  await sleep(800);
  await shot(`${r.corner}-L${LEVEL}`);
}
console.log(logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
