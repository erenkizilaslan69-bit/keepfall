// Screenshots of the four kingdoms (castle, buildings at level 1 and 4, hatted worker, each in another player colour) next to the catapult, a warrior and an archer at game scale; usage: node tools/shot-compare.mjs <out> [url] <out-prefix> [http://localhost:5174/]
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
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1700,1000', '--no-first-run', '--disable-gpu', 'about:blank',
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
const OUT = process.argv[2] ?? 'compare';
await evalJs(`document.body.style.margin='0'; document.body.innerHTML='<canvas id="cmp" width="1700" height="990"></canvas>'; 1`);
const info = await evalJs(`(async()=>{
  const K = await import('/src/scene/KingdomSprites.ts'), A = await import('/src/scene/CatapultArt.ts');
  for (let i=0;i<50 && !A.catapultReady();i++) await new Promise(r=>setTimeout(r,100));
  const load = (p)=>new Promise((res,rej)=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=p;});
  const asCanvas = (i)=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;c.getContext('2d').drawImage(i,0,0);return c;};
  const TS='/assets/tiny-swords/Tiny Swords (Free Pack)/';
  const c = document.getElementById('cmp'), g = c.getContext('2d'); g.imageSmoothingEnabled=false;
  g.fillStyle='#6fa83c'; g.fillRect(0,0,1700,990);
  const looks=['golge','tuccar','kahin','entrikaci'], colors=['blue','red','yellow','purple'], folders={blue:'Blue',red:'Red',yellow:'Yellow',purple:'Purple'};
  const Z=0.62; // everything at 62% of the game's own scale
  g.fillStyle='#000'; g.font='bold 16px sans-serif';
  const section=async(dir,cell,bcell,label,y0)=>{
    g.fillStyle='#fff'; g.fillText(label,10,y0-240);
    let x=10;
    for (let r=0;r<4;r++){ const look=looks[r], col=colors[r];
      const castle=K.recolor(asCanvas(await load('/art/'+dir+'/'+look+'-castle.png')),col); const k=cell*Z;
      g.drawImage(castle,x,y0-castle.height*k,castle.width*k,castle.height*k); x+=castle.width*k+14; }
    // a warrior, an archer and the catapult for the pixel size
    const war=await load(TS+'Units/Blue Units/Warrior/Warrior_Idle.png'), arc=await load(TS+'Units/Blue Units/Archer/Archer_Idle.png');
    const S=0.55*Z*1.0; g.drawImage(war,0,0,192,192,x,y0-192*S*0.65-10,192*S,192*S); g.drawImage(arc,0,0,192,192,x+70,y0-192*S*0.65-10,192*S,192*S);
    const cat=A.catapultFrame('blue',{}); g.drawImage(cat,0,0,cat.width,cat.height,x+150,y0-cat.height*0.88*S-10,cat.width*S,cat.height*S);
    // the buildings of two kingdoms at level 1
    let bx=10; const by=y0+125;
    for (const look of looks) for (const type of ['farm','forge']) { const col=colors[looks.indexOf(look)];
      const rc=K.recolor(asCanvas(await load('/art/'+dir+'/'+look+'-'+type+'.png')),col); const s=bcell*Z; g.drawImage(rc,bx,by-rc.height*s,rc.width*s,rc.height*s); bx+=rc.width*s+8; }
  };
  await section('kingdoms',2.2,1.9,'ÖNCE: tam çözünürlük (hücre başına 1 piksel)',265);
  await section('kingdoms-half',4.4,3.8,'SONRA: yarı çözünürlük, 2 kat büyük çizilir',690);
  return 1; })()`);
await sleep(500);
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}.png`, Buffer.from(r.result.data, 'base64'));
console.log(info, logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
