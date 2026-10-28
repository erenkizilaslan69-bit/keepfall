// An army with cavalry, a warrior, an archer and a catapult marching on the map at game scale; usage: node tools/shot-march.mjs <out-prefix> [url]
// (server + Vite dev client running). The army is injected into the scene (the real server updates are switched off), so it needs no match to play out.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'march', URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1280,720', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text) : r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(4000);
await evalJs(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
document.querySelector('input').value='Test'; btn('Oda kur').click(); await w(1500);
[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Kolay')[0].click(); await w(800);
btn('Hazırım').click(); await w(800); btn('Maçı başlat').click(); await w(500);
for(let i=0;i<120;i++){ if(window.keepfallScene?.ready) break; await w(300); } await w(3500); document.getElementById('kingdom-decree')?.remove(); return 1;})()`);
console.log(await evalJs(`(async()=>{
  const { toWorld } = await import('/src/scene/world.ts');
  const s = window.keepfallScene; s.apply = () => {};
  const o = toWorld({ x: 0, y: 0 });
  const c = { x: (s.castleSprite.x - o.x) / 64, y: (s.castleSprite.y - o.y) / 64 + ${Number(process.env.DY ?? 3)} };
  const units = [['suvari',3],['kalkanli',2],['kilicli',3],['okcu',2],['mancinik',1]].map(([unitId,count]) => ({ unitId, name: unitId, count }));
  const route = [{ x: c.x - 6, y: c.y }, { x: c.x + 40, y: c.y }];
  const state = { ...s.state, own: [{ id: 'fake1', kind: 'army', targetSeat: 1, returning: false, position: { x: c.x, y: c.y }, velocity: { x: 1.2, y: 0 }, units, route, travelled: 6, speed: 1.2, visionRadius: 8, fighting: false, missionKind: null, quarter: null, siteId: null }], seen: [] };
  s.movers.sync(state); s.movers.sync = () => {}; s.cameras.main.setZoom(${Number(process.env.Z ?? 1.5)}); s.lookAt({ x: c.x + 2.2, y: c.y }); return JSON.stringify(c); })()`));
for (const [i, ms] of [[0, 2500], [1, 700]]) {
  await sleep(ms);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${i}.png`, Buffer.from(r.result.data, 'base64'));
}
ws.close(); chrome.kill(); process.exit(0);
