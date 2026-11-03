// Plays the interactive tutorial in headless Chrome by following its glowing frame: clicks the middle of the frame, takes a picture of every new step and
// checks the whole list is passed. Needs the dev server and the Vite dev client. Usage:
//   SIZE=1280,720 KFLANG=en node tools/tutorial-check.mjs <out-prefix> [http://localhost:5174/]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'tut', URL = process.argv[3] ?? 'http://localhost:5174/';
const [W, H] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-tut-'))}`,
  `--window-size=${W},${H}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n')[0]);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => writeFileSync(`${OUT}-${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
const click = async (x, y) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('keepfall_lang','${process.env.KFLANG ?? 'en'}')` });
await send('Page.navigate', { url: URL });
await sleep(3500);
await js("document.querySelector('#quick').click(); 1");
for (let i = 0; i < 25; i++) { await sleep(1000); if (await js("document.documentElement.classList.contains('in-game')")) break; }
await sleep(2500);
// the kingdom decree first: close it
await js("document.querySelector('#kingdom-decree [data-close], #kingdom-decree button')?.click(); 1");
await sleep(1500);

const read = () => js(`(() => {
  const card = document.querySelector('.tut-card'), frame = document.querySelector('.tut-frame');
  if (!card) return null;
  const fr = frame && !frame.hidden ? frame.getBoundingClientRect() : null;
  return JSON.stringify({ text: card.querySelector('.tut-text').textContent, step: card.querySelector('.tut-step').textContent, hidden: card.hidden,
    frame: fr ? { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2, w: fr.width, h: fr.height } : null });
})()`);

const seen = new Set(); let n = 0, sped = false, last = '';
const t0 = Date.now();
while (Date.now() - t0 < 420_000) {
  const raw = await read();
  if (!raw) { console.log('tutorial element gone'); break; }
  const st = JSON.parse(raw);
  const countdown = /the war starts in|Savaşa/.test(st.text);
  if (!st.hidden && st.text !== last && !(countdown && /the war starts in|Savaşa/.test(last))) {
    last = st.text; n++;
    await sleep(700);
    const label = String(n).padStart(2, '0');
    await shot(label);
    console.log(`${label} [${st.step}] ${st.text}${st.frame ? '' : '  (no frame)'}`);
    seen.add(st.text);
    if (!/the war starts in/.test(st.text)) console.log('   state:', await js("(() => { const c = window.keepfallUi.castle; return JSON.stringify({ soldiers: c.soldiers, pop: c.population, jobs: c.jobs.map((j) => j.job + ':' + j.count).join(' '), phase: c.phase, armies: c.war.armies.length + ':' + c.war.armies.map((a) => a.state + a.units.map((u) => u.count).join('/')).join(','), notes: [...document.querySelectorAll('.notes .ribbon, .notes > *')].map((n) => n.textContent.trim()).join(' | ').slice(0, 160), win: window.keepfallUi.windows.current && window.keepfallUi.windows.current.kind, queue: c.queue.length, units: c.units.filter((u) => u.weapons + u.soldiers + u.arming > 0).map((u) => [u.id, u.weapons, u.soldiers, u.arming]) }); })()"));
  }
  if (countdown) last = st.text;
  if (/Nice work|Harika/.test(st.text)) break;
  // waiting for the war: speed the match up (development server) and drop back to x1 when about 45 s are left, so the attack step is played in real time
  const left = /the war starts in (\d+):(\d+)/.exec(st.text);
  if (left && !sped && Number(left[1]) * 60 + Number(left[2]) > 60) { sped = true; await js('window.keepfallNet.setSpeed(20); 1'); }
  if (sped && (!left || Number(left[1]) * 60 + Number(left[2]) <= 60)) { await js('window.keepfallNet.setSpeed(1); 1'); sped = false; }
  if (st.frame) await click(st.frame.x, st.frame.y);
  if (/First press|Önce/.test(st.text)) { for (let k = 0; k < 14; k++) { await sleep(150); const r2 = await read(); if (!r2) { console.log('   (gone)'); break; } const q = JSON.parse(r2); console.log('   dbg:', await js("(() => { const b = document.querySelector('.win [data-act=all]'); const r = b && b.getBoundingClientRect(); const f = document.querySelector('.tut-frame').getBoundingClientRect(); return JSON.stringify({ disabled: b && b.disabled, btn: r && [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)], frame: [Math.round(f.x + f.width / 2), Math.round(f.y + f.height / 2)], home: [...document.querySelectorAll('.win [data-f=home]')].map((e) => e.textContent) }); })()"), await js("JSON.stringify([...document.querySelectorAll('.win [data-count]')].map((i) => i.value))")); if (q.text !== st.text) { console.log('   next:', q.text, q.frame ? '(frame)' : '(no frame)'); if (q.frame) { await click(q.frame.x, q.frame.y); console.log('   clicked it'); } break; } } }
  await sleep(900);
}
console.log('steps seen:', n, '| distinct texts:', seen.size, '| page errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
console.log('tutorial done flag:', await js("localStorage.getItem('keepfall_tutorial_done')"));
ws.close(); chrome.kill(); process.exit(0);
