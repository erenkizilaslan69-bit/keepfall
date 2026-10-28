// Screenshots of the catapult next to the pack's units at game scale; usage: node tools/shot-catapult.mjs <out-prefix> [http://localhost:5174/]
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
const OUT = process.argv[2] ?? 'catapult';
await evalJs(`document.body.innerHTML='<canvas id="cmp" width="1100" height="440"></canvas>'; 1`);
const info = await evalJs(`(async()=>{
  const A = await import('/src/scene/CatapultArt.ts');
  for (let i=0;i<50 && !A.catapultReady();i++) await new Promise(r=>setTimeout(r,100));
  const load = (p)=>new Promise(r=>{const i=new Image(); i.onload=()=>r(i); i.src='/assets/tiny-swords/Tiny Swords (Free Pack)/'+p;});
  const war = await load('Units/Blue Units/Warrior/Warrior_Idle.png'), arc = await load('Units/Blue Units/Archer/Archer_Idle.png'), lan = await load('Units/Blue Units/Lancer/Lancer_Idle.png');
  const c = document.getElementById('cmp'), g = c.getContext('2d'); g.imageSmoothingEnabled=false; g.fillStyle='#6fa83c'; g.fillRect(0,0,1100,440);
  const S = 0.55*3; // the game's unit scale, shown three times larger
  const unit=(img,fw,x,y)=>{ g.drawImage(img,0,0,fw,fw,x-fw*S/2,y-fw*S*0.65,fw*S,fw*S); };
  unit(war,192,90,170); unit(arc,192,230,170); unit(lan,320,380,170);
  const frame=(cv,x,y)=>g.drawImage(cv,0,0,cv.width,cv.height,x-cv.width*S/2,y-cv.height*S*0.88,cv.width*S,cv.height*S);
  const teams=['blue','red','yellow','purple','black'];
  const at=(cv,x,y,k)=>g.drawImage(cv,0,0,cv.width,cv.height,x,y,cv.width*k,cv.height*k);
  frame(A.catapultFrame('blue',{}),640,230);
  teams.forEach((t,i)=>at(A.catapultFrame(t,{}),20+i*215,250,1.15));
  A.FIRE_ARM.forEach((a,i)=>at(A.catapultFrame('blue',{arm:a}),740+i*90,20,0.5*2));
  A.RUN_POSE.forEach((p,i)=>at(A.catapultFrame('red',p),740+i*90,150,0.5*2));
  return 1; })()`);
await sleep(500);
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}-compare.png`, Buffer.from(r.result.data, 'base64'));
console.log(info, logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
