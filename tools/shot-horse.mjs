// The cavalry's frames enlarged, in all five colours, next to the old/new comparison pieces; usage: node tools/shot-horse.mjs <out.png> [url]
// (dev client running). Draws horsemanFrame() with the pack's Lancer sheets straight on a page.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'horse.png', URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1500,1000', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(3000);
const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async()=>{
  const { horsemanFrame, loadHorse } = await import('/src/scene/HorseArt.ts');
  await loadHorse();
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const base = '/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/Units/';
  const cv = document.createElement('canvas'); cv.width = 1480; cv.height = 900; const g = cv.getContext('2d'); g.fillStyle = '#5f8f4a'; g.fillRect(0,0,cv.width,cv.height); g.imageSmoothingEnabled = false;
  const colors = ['Blue','Red','Yellow','Purple','Black'];
  let row = 0;
  for (const C of colors) {
    const sheets = { idle: await load(base + C + '%20Units/Lancer/Lancer_Idle.png'), run: await load(base + C + '%20Units/Lancer/Lancer_Run.png'), attack: await load(base + C + '%20Units/Lancer/Lancer_Right_Attack.png') };
    const frames = [['idle',0],['idle',6],['run',0],['run',1],['run',2],['run',3],['attack',0],['attack',1],['attack',2]];
    if (${process.env.ZOOM ? 1 : 0}) { [['idle',0],['run',1],['run',3],['attack',0]].forEach(([m,f], i) => { const c = horsemanFrame(sheets, C.toLowerCase(), m, f); g.drawImage(c, 36, 20, 170, 126, 4 + i * 366, 4, 360, 267); }); break; }
    frames.forEach(([m,f], i) => { const c = horsemanFrame(sheets, C.toLowerCase(), m, f); g.drawImage(c, 30, 4, 170, 142, 4 + i * 163, 4 + row * 170 * 0.9 * 1, 163, 136); });
    row++;
    if (row >= 5) break;
  }
  document.body.innerHTML = ''; document.body.style.margin = 0; document.body.appendChild(cv); return 1; })()` });
console.log(JSON.stringify(r.result).slice(0, 300));
await sleep(500);
const s = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(s.result.data, 'base64'));
ws.close(); chrome.kill(); process.exit(0);
