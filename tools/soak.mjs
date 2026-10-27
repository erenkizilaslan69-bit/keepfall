// Soak test: plays whole matches in headless Chrome against bots with the debug layer (development builds) on, and prints its faults, frame rate and sprite counts.
// Needs the dev server and the Vite dev client running. Usage: node tools/soak.mjs [matches=3] [speed=5] [bots=3] [client url]
// Needs the dev server and the Vite dev client running (see README). Usage: node tools/army-check.mjs [http://localhost:5174/] [minutes-of-real-time]
// Headless Chrome via CDP: a room with a Medium bot at x20; we raise soldiers, march on the bot and note every doubled column ("mover-audit" problems)
// and every battle: when the server announced it, when the replay began, whether a "Savaş" cloud stood where a replay should have been.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MATCHES = Number(process.argv[2] ?? 3), SPEED = Number(process.argv[3] ?? 5), BOTS = Number(process.argv[4] ?? 3);
const URL = process.argv[5] ?? 'http://localhost:5174/';
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


const results = [];
for (let m = 1; m <= MATCHES; m++) {
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
   document.querySelector('input').value='Soak'; btn('Oda kur').click(); await w(1500);
   const levels=['Orta','Zor','Orta','Kolay'];
   for(let i=0;i<${BOTS};i++){ [...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===levels[i])[0]?.click(); await w(500); }
   await window.keepfallNet.setDeck(['kilicli','kalkanli','okcu','mizrakci']); await w(300);
   btn('Hazırım').click(); await w(600); btn('Maçı başlat').click(); await w(500); return 1;})()`);
  await evalJs(`(async()=>{for(let i=0;i<150;i++){ if(window.keepfallScene?.ready) return 1; await new Promise(r=>setTimeout(r,300)); } return 0;})()`);
  await evalJs(`window.keepfallNet.setSpeed(${SPEED})`);
  const t0 = Date.now();
  let ended = false, tick = 0, last = '';
  while (!ended && Date.now() - t0 < 12 * 60_000) {
    last = await evalJs(`(async()=>{
      const s=window.keepfallScene, n=window.keepfallNet; const c=s?.state; if(!c) return JSON.stringify({ended:!!document.querySelector('.screen.end')});
      const out={phase:c.phase,t:Math.round(c.elapsedSeconds),elim:c.eliminated};
      if(document.querySelector('.screen.end')||c.phase==='ended') out.ended=true;
      if(c.eliminated||c.phase==='ended') return JSON.stringify(out);
      const unit=(id)=>c.units.find(x=>x.id===id); const idle=c.jobs.find(j=>j.job==='idle')?.count??0;
      if(!window.__init){ window.__init=1; for(const j of ['blacksmith','miner','lumberjack','farmer']) await n.moveWorkers('idle',j,j==='farmer'?3:2); }
      if(c.phase==='preparation'||c.phase==='war'){
        for(const id of ['kilicli','okcu','mizrakci','kalkanli']){ const u=unit(id); if(u&&c.queue.length<3&&c.resources.iron>=u.iron&&c.resources.wood>=u.wood) { await n.queueWeapon(id,1); break; } }
        for(const id of ['kilicli','okcu','mizrakci','kalkanli']){ const u=unit(id); if(u&&u.weapons>0&&c.elapsedSeconds>120){ const from=idle>0?'idle':'lumberjack'; await n.armWorkers(id,Math.min(u.weapons,idle>0?idle:2),from); } }
      }
      if(c.phase==='war'){
        const home=Object.fromEntries(c.units.filter(u=>u.soldiers>0).map(u=>[u.id,u.soldiers])); const total=Object.values(home).reduce((a,b)=>a+b,0);
        const seats=s.layout.regions.map(r=>r.seat).filter(x=>x&&x!==n.seat);
        if(total>=6&&c.war.armies.length<3&&Math.random()<0.5){ await n.sendArmy(seats[Math.floor(Math.random()*seats.length)],home,{},null,'attack'); out.sent=1; }
        for(const a of c.war.armies){ if(a.fighting) continue; const r=Math.random(); if(r<0.04) await n.recallArmy(a.id); else if(r<0.08) await n.redirectArmy(a.id,seats[Math.floor(Math.random()*seats.length)],null); }
      }
      return JSON.stringify(out);})()`);
    try { ended = JSON.parse(last).ended === true; } catch { /* keep going */ }
    if (++tick % 20 === 0) console.log(`  [match ${m}] ${last}`);
    await sleep(1500);
  }
  await sleep(1500);
  const rep = await evalJs(`JSON.stringify(window.keepfallDebug?.report?.() ?? null)`);
  const vio = await evalJs(`JSON.stringify((window.keepfallDebug?.violations ?? []).map(v=>({kind:v.kind,id:v.id,game:v.game,message:v.message,trace:v.trace.slice(-14).map(e=>e.gameAt+' '+e.kind+' '+e.id+(e.detail?' ('+e.detail+')':''))})))`);
  console.log(`MATCH ${m}: ${rep}`);
  const list = JSON.parse(vio || '[]');
  const seen = new Set();
  for (const v of list) { const k = v.kind; if ((seen.has(k) ? 1 : 0) >= 1) continue; seen.add(k); console.log(`  first ${v.kind} ${v.id} @${v.game}: ${v.message}`); for (const e of v.trace) console.log('    ' + e); }
  results.push({ rep: JSON.parse(rep || 'null'), n: list.length });
}
console.log('SUMMARY', JSON.stringify(results.map((r) => ({ faults: r.rep?.violations, byKind: r.rep?.byKind, fps: r.rep?.fps, maxUnits: r.rep?.maxUnits, maxChildren: r.rep?.maxChildren, maxTweens: r.rep?.maxTweens, worstLagReal: r.rep?.worstLagReal }))));
console.log(logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
