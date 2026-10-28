// Puts before/after pictures side by side in one image: usage `node tools/collage.mjs <out.png> <spec.json>`; the spec is a list of
// { label, before, after, crop?: [x, y, w, h] } (file paths). Chrome does the drawing.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, specFile] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=800,600', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
const url = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const items = spec.map((s) => ({ ...s, before: url(s.before), after: url(s.after) }));
const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, timeout: 120000, expression: `(async()=>{
  const items=${JSON.stringify(items)}; const W=620, GAP=14, HEAD=26;
  const load=(u)=>new Promise((res)=>{const i=new Image(); i.onload=()=>res(i); i.src=u;});
  const rows=[]; let H=10;
  for (const it of items){ const a=await load(it.before), b=await load(it.after); const c=it.crop??[0,0,a.width,a.height]; const h=Math.round(W*c[3]/c[2]); rows.push({it,a,b,c,h,y:H}); H+=HEAD+h+GAP; }
  const cv=document.createElement('canvas'); cv.width=W*2+GAP*3; cv.height=H; const g=cv.getContext('2d'); g.imageSmoothingEnabled=false;
  g.fillStyle='#202428'; g.fillRect(0,0,cv.width,cv.height); g.font='bold 16px sans-serif';
  for (const r of rows){ g.fillStyle='#fff'; g.fillText(r.it.label+'  —  ÖNCE',GAP,r.y+18); g.fillText('SONRA',W+GAP*2,r.y+18);
    const c=r.c; g.drawImage(r.a,c[0],c[1],c[2],c[3],GAP,r.y+HEAD,W,r.h); g.drawImage(r.b,c[0],c[1],c[2],c[3],W+GAP*2,r.y+HEAD,W,r.h); }
  return cv.toDataURL('image/png'); })()` });
writeFileSync(out, Buffer.from(r.result.result.value.split(',')[1], 'base64'));
ws.close(); chrome.kill(); process.exit(0);
