// Screenshots of a made-up battle with the new units (monk, catapult, cavalry); usage: node tools/shot-newunits.mjs <out.png> [http://localhost:5174/]
// (based on the replay freeze check): needs the server and the Vite dev client running (see README); usage: node tools/replay-check.mjs [http://localhost:5174/]
// Headless Chrome via CDP: start a room with a bot on the Vite dev client, inject a fake battle, report errors and whether the frame loop survives.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'newunits.png';
const URL = process.argv[3] ?? 'http://localhost:5174/';
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
const fs = await import('node:fs');
await evalJs(`(async()=>{
 const w=ms=>new Promise(r=>setTimeout(r,ms)); const s=window.keepfallScene; const now=s.gameNow().now;
 const side=(seat,color,list)=>({seat,color,name:'x',soldiers:list.flatMap(([u,n,row])=>Array.from({length:n},()=>({unitId:u,row})))});
 const A=side(1,'blue',[['kalkanli',3,'front'],['suvari',3,'front'],['kesis',2,'back'],['mancinik',2,'back'],['okcu',2,'back']]);
 const B=side(2,'red',[['kilicli',4,'front'],['mizrakci',3,'front'],['okcu',3,'back'],['mancinik',1,'back'],['kesis',1,'back']]);
 const nA=A.soldiers.length;
 const hits=[]; for(let k=0;k<40;k++){ hits.push(2+k, k%nA, nA+((k*3)%B.soldiers.length)); }
 const heals=[]; for(let k=0;k<10;k++){ heals.push(6+k*3, 6+(k%2), (k*2)%6); }
 const v={id:'nu1',kind:'field',at:{x:20,y:20},facing:{x:1,y:0},startedAt:now,playback:1,tickSeconds:0.5,ticks:60,fightSeconds:40,
  sides:[A,B],hits,deaths:[30,nA+1,34,nA+2],advances:[],heals,winner:'attacker'};
 document.getElementById('kingdom-decree')?.remove(); s.lookAt({x:20,y:20}); s.cameras.main.setZoom(1.6); s.playBattle(v); return 1;})()`);
for (const [i, ms] of (process.env.DIAG ? [[0,3000],[1,1000],[2,1000],[3,1000],[4,1000],[5,1000],[6,1000],[7,1000],[8,1000],[9,1000],[10,1000],[11,1000]] : [[0, 4500], [1, 5500]])) {
  await sleep(ms);
  if (process.env.DIAG) console.log('diag', await evalJs(`(()=>{const s=window.keepfallScene; const out=[]; const walk=(l)=>{for(const o of l){ const k=o.texture?.key; if(k==='__MISSING'||k==='__DEFAULT'||(o.frame&&o.frame.name==='__BASE'&&o.texture.frameTotal>2)) out.push([o.constructor.name,o.anims&&o.anims.currentAnim&&o.anims.currentAnim.key,o.name,JSON.stringify(o.data&&o.data.values),k,o.frame?.name,Math.round(o.x),Math.round(o.y),o.depth,o.visible,o.alpha]); if(o.list) walk(o.list);} }; walk(s.children.list); const big=s.children.list.filter(o=>o.displayWidth>60&&o.blendMode===1).map(o=>[o.constructor.name,o.texture?.key,Math.round(o.x),Math.round(o.y),Math.round(o.displayWidth),o.alpha]); const keys=['warrior-guard','warrior-run','lancer-run','archer-run','monk-run','mancinik-run','suvari-run','mancinik-fire','suvari-attack','lancer-attack','warrior-attack','archer-shoot']; const ex={}; for(const c of ['','red-']) for(const k of keys) if(!s.textures.exists(c+k)) ex[c+k]=0; const fills=s.children.list.filter(o=>o.tintFill).map(o=>[o.texture&&o.texture.key,Math.round(o.x),Math.round(o.y)]); const fxs=s.children.list.filter(o=>o.texture&&['dust','explosion','monk-heal-fx'].includes(o.texture.key)).map(o=>[o.texture.key,Math.round(o.x),Math.round(o.y),o.alpha]); return JSON.stringify({fills,fxs,noTexture:ex,missing:out.slice(0,20),n:out.length,additive:big.slice(0,10)}); })()`));
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT.replace('.png', `-${i}.png`), Buffer.from(r.result.data, 'base64'));
}
console.log(logs.join(' / ') || 'no exceptions');
ws.close();
chrome.kill();
process.exit(0);
