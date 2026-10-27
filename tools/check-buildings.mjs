// Checks that no building of any level (1-4) lies over the wall of the region, whichever side the gate is on. Usage: node tools/check-buildings.mjs [client url]
// Needs the dev server and the Vite dev client running (see README). Usage: node tools/army-check.mjs [http://localhost:5174/] [minutes-of-real-time]
// Headless Chrome via CDP: a room with a Medium bot at x20; we raise soldiers, march on the bot and note every doubled column ("mover-audit" problems)
// and every battle: when the server announced it, when the replay began, whether a "Savaş" cloud stood where a replay should have been.
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


console.log(await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Eren'; btn('Oda kur').click(); await w(1500);
[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Kolay')[0].click(); await w(500);
btn('Hazırım').click(); await w(600); btn('Maçı başlat').click(); await w(500);
for(let i=0;i<120;i++){ if(window.keepfallScene?.ready) break; await w(300); }
const { SITES } = await import('/src/scene/layout.ts'); const { placePart } = await import('/src/scene/parts.ts');
const s=window.keepfallScene; const out=[]; const cache=new Map();
const opaque=(sp)=>{ const f=sp.frame; const key=sp.texture.key+'|'+f.name; let bb=cache.get(key); if(!bb){ const c=document.createElement('canvas'); c.width=f.cutWidth; c.height=f.cutHeight; const g=c.getContext('2d'); g.drawImage(f.source.image,f.cutX,f.cutY,f.cutWidth,f.cutHeight,0,0,f.cutWidth,f.cutHeight); const d=g.getImageData(0,0,c.width,c.height).data; let x0=1e9,y0=1e9,x1=-1,y1=-1; for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){ if(d[(y*c.width+x)*4+3]>40){ x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);} } bb=x1<0?null:[x0,y0,x1+1,y1+1]; cache.set(key,bb);} if(!bb) return null; const w=f.cutWidth, h=f.cutHeight; const ox=sp.originX*w, oy=sp.originY*h; return {left: sp.x+(bb[0]-ox)*sp.scaleX, right: sp.x+(bb[2]-ox)*sp.scaleX, top: sp.y+(bb[1]-oy)*sp.scaleY, bottom: sp.y+(bb[3]-oy)*sp.scaleY}; };
// Wall zones in region-local px, for a gate on the east (west castles) and on the west (east castles): the solid side wall, the gate-side wall (set in by 40 px) with its towers, the north and south walls.
const zones = { east: [['west wall',0,0,40,768],['east wall',940,0,1024,768],['north wall',0,0,1024,60],['south wall',0,708,1024,768]], west: [['west wall',0,0,104,768],['east wall',980,0,1024,768],['north wall',0,0,1024,60],['south wall',0,708,1024,768]] };
for (const type of Object.keys(SITES)) for (let level=1; level<=4; level++) {
  for (const p of SITES[type].parts(level)) {
    const sp = placePart(s, p); const b = opaque(sp); sp.destroy(); if (!b) continue;
    for (const gate of ['east','west']) for (const [name,x0,y0,x1,y1] of zones[gate]) {
      if (/^(sheep|bush|stump|rock|wood-pile|tree)/.test(p.key)) { if (!/^(tree|house|tower)/.test(p.key)) continue; }
      const ox = Math.min(b.right,x1)-Math.max(b.left,x0), oy = Math.min(b.bottom,y1)-Math.max(b.top,y0);
      // gate-side towers only stand beside the gate: the zones are only the thin wall away from them, so a small overlap is the wall itself
      if (/^tree/.test(p.key) && /north|south/.test(name)) continue; // a tree crown may rise behind the north wall
      if (ox > 4 && oy > 4) out.push(type+' Sv'+level+' '+p.key+' ('+p.x+','+p.y+') over '+name+' [gate '+gate+'] by '+Math.round(ox)+'x'+Math.round(oy));
    }
  }
}
return out.length+' overlaps | '+out.join(' | ');})()`));
ws.close(); chrome.kill(); process.exit(0);
