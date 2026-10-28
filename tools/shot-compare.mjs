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
await evalJs(`document.body.style.margin='0'; document.body.innerHTML='<canvas id="cmp" width="1700" height="870"></canvas>'; 1`);
const info = await evalJs(`(async()=>{
  const K = await import('/src/scene/KingdomSprites.ts'), A = await import('/src/scene/CatapultArt.ts'), H = await import('/src/scene/WorkerHats.ts');
  for (let i=0;i<50 && !A.catapultReady();i++) await new Promise(r=>setTimeout(r,100));
  const load = (p)=>new Promise((res,rej)=>{const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=p;});
  const TS='/assets/tiny-swords/Tiny Swords (Free Pack)/';
  const c = document.getElementById('cmp'), g = c.getContext('2d'); g.imageSmoothingEnabled=false;
  g.fillStyle='#6fa83c'; g.fillRect(0,0,1700,870);
  const looks=['golge','tuccar','kahin','entrikaci'], colors=['blue','red','yellow','purple'], folders={blue:'Blue',red:'Red',yellow:'Yellow',purple:'Purple'};
  const rowH=214;
  for (let r=0;r<4;r++) {
    const look=looks[r], col=colors[r], y0=r*rowH+rowH-20;
    g.fillStyle='rgba(0,0,0,.18)'; g.fillRect(0,r*rowH,1700,2);
    const castle = K.recolor(await load('/art/kingdoms/'+look+'-castle.png').then(i=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;c.getContext('2d').drawImage(i,0,0);return c;}), col);
    const k=K.CASTLE_CELL*0.62; g.drawImage(castle, 20, y0-castle.height*k, castle.width*k, castle.height*k);
    let x=20+castle.width*k+10;
    for (const type of ['farm','lumberCamp','mine','forge']) {
      const img = await load('/art/kingdoms/'+look+'-'+type+'.png'); const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; cv.getContext('2d').drawImage(img,0,0);
      const rc=K.recolor(cv,col); const s=K.BUILD_CELL*0.62;
      g.drawImage(rc,x,y0-rc.height*s,rc.width*s,rc.height*s);
      // the same building at level 4 with its additions, right beside it, a little larger
      const s4=s*K.LEVEL_SCALE[3]; const x4=x+rc.width*s+6; g.drawImage(rc,x4,y0-rc.height*s4,rc.width*s4,rc.height*s4);
      for (const a of K.ADDITIONS) { const ex=K.recolor(K.drawExtra(look,a.kind),col); g.drawImage(ex, x4+rc.width*s4/2+a.x*rc.width*s4-ex.width*s/2, y0-a.y*rc.height*s4-ex.height*s, ex.width*s, ex.height*s); }
      x = x4+rc.width*s4+14;
    }
    // a worker with the headpiece, a warrior, an archer (the same colour as the row)
    const pawn=await load(TS+'Units/'+folders[col]+' Units/Pawn/Pawn_Idle.png'), war=await load(TS+'Units/'+folders[col]+' Units/Warrior/Warrior_Idle.png'), arc=await load(TS+'Units/'+folders[col]+' Units/Archer/Archer_Idle.png');
    const S=0.55*1.0*1.6; const unit=(img,ux)=>{ g.drawImage(img,0,0,192,192,ux-96*S,y0-192*S*0.65-30,192*S,192*S); };
    // pawn + hat
    { const t=document.createElement('canvas'); t.width=192;t.height=192; const tg=t.getContext('2d'); tg.drawImage(pawn,0,0,192,192,0,0,192,192);
      const head=H.scanHead(tg.getImageData(0,0,192,192).data,192,192); unit(pawn,x+30);
      const ha=H.hatArt(look); if (head && ha) { const hx=x+30-96*S+head.x*S, hy=y0-192*S*0.65-30+head.y*S + ha.below*S; g.drawImage(ha.canvas,hx-ha.ax*S,hy-ha.ay*S,ha.canvas.width*S,ha.canvas.height*S); } }
    unit(war,x+110); unit(arc,x+190);
    const cat=A.catapultFrame(col,{}); const cs=0.55*1.6; g.drawImage(cat,0,0,cat.width,cat.height,x+230,y0-cat.height*0.88*cs-30,cat.width*cs,cat.height*cs);
  }
  return 1; })()`);
await sleep(500);
const r = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}.png`, Buffer.from(r.result.data, 'base64'));
console.log(info, logs.join(' / ') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
