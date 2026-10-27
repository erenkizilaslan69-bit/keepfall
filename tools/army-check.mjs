// Regression check: one army, one drawing — and every battle we fight in is replayed the moment it starts (castle gates and roads alike).
// Needs the dev server and the Vite dev client running (see README). Usage: node tools/army-check.mjs [http://localhost:5174/] [minutes-of-real-time]
// Headless Chrome via CDP: a room with a Medium bot at x20; we raise soldiers, march on the bot and note every doubled column ("mover-audit" problems)
// and every battle: when the server announced it, when the replay began, whether a "Savaş" cloud stood where a replay should have been.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';
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

console.log('create', await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Test'; btn('Oda kur').click(); await w(1500);
[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Orta')[0].click(); await w(800);
await window.keepfallNet.setDeck(['kilicli','kalkanli','okcu','mizrakci']); await w(300);
btn('Hazırım').click(); await w(800); btn('Maçı başlat').click(); await w(2000); return location.href;})()`));
console.log('scene ready', await evalJs(`(async()=>{for(let i=0;i<120;i++){ if(window.keepfallScene?.battles) return i; await new Promise(r=>setTimeout(r,500)); } return 'never';})()`));

// Instrumentation: battle starts as the replay sees them, audit problems, clouds without a replay.
await evalJs(`(()=>{
 const s=window.keepfallScene; const log=window.__log=[]; const t0=performance.now(); const T=()=>((performance.now()-t0)/1000).toFixed(1);
 const start=s.battles.start.bind(s.battles);
 s.battles.start=(v)=>{ log.push(T()+' replay-start '+v.kind+' '+v.id+' fight='+v.fightSeconds.toFixed(1)+' startedAt='+v.startedAt.toFixed(1)+' now='+s.gameNow().now.toFixed(1)); return start(v); };
 const end=s.battles.end.bind(s.battles);
 s.battles.end=(i,r)=>{ log.push(T()+' replay-end '+r.view.kind+' '+i+' now='+s.gameNow().now.toFixed(1)); return end(i,r); };
 window.__audit=new Set(); setInterval(()=>{ for(const p of s.movers.audit()) { if(!window.__audit.has(p)){ window.__audit.add(p); log.push(T()+' AUDIT '+p); } } }, 300);
 const clouds=new Set(); setInterval(()=>{ const act=new Set(s.battles.active.map(b=>b.id)); for(const b of (s.map?.battles??[])) if(!act.has(b.id)&&!clouds.has(b.id)){ clouds.add(b.id); log.push(T()+' CLOUD-WITHOUT-REPLAY '+b.id); } }, 300);
})()`);

const deadline = Date.now() + MINUTES * 60_000;
let sent = 0, tick = 0;
while (Date.now() < deadline) {
  const r = await evalJs(`(async()=>{
   const s=window.keepfallScene, c=s.state, n=window.keepfallNet, out=[];
   if(!c) return 'no state';
   if(!window.__speed){ window.__speed=1; await n.setSpeed(20); for(const j of ['blacksmith','miner','lumberjack','farmer']) await n.moveWorkers('idle',j,j==='farmer'?3:2); }
   const u=c.units.find(x=>x.id==='kilicli'); const idle=c.jobs.find(j=>j.job==='idle')?.count??0;
   if(c.phase==='preparation'){ if(c.resources.iron>=1&&c.resources.wood>=1&&c.queue.length<3) await n.queueWeapon('kilicli',1); if(u.weapons>0&&c.elapsedSeconds>150){ const from=idle>0?'idle':'lumberjack'; await n.armWorkers('kilicli',Math.min(u.weapons,idle>0?idle:2),from); } }
   if(c.phase==='war'){ const home=u.soldiers; if(home>=4&&c.war.armies.length<2&&c.elapsedSeconds>c.prepSeconds){ const seat=(s.layout.regions.find(r=>r.seat&&r.seat!==n.seat)||{}).seat; const res=await n.sendArmy(seat,{kilicli:home},{},null); out.push('send '+home+' '+JSON.stringify(res)); } }
   return JSON.stringify({phase:c.phase,t:c.elapsedSeconds.toFixed(0),sold:u.soldiers,weap:u.weapons,q:c.queue.length,res:JSON.stringify(c.resources),idle,jobs:c.jobs.map(j=>j.job+j.count).join(','),armies:c.war.armies.length,out});})()`.replace('${\'$\'}', '$'));
  if (typeof r === 'string' && r.includes('send')) { sent++; console.log(r); } else if (++tick % 6 === 0) console.log(r);
  await sleep(1500);
}
console.log('--- log');
console.log(await evalJs(`window.__log.join('\\n')`));
console.log('sends', sent, '·', logs.join('\n') || 'no exceptions');
ws.close();
chrome.kill();
process.exit(0);
