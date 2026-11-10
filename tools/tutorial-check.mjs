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
const MOBILE = !!process.env.MOBILE; // a phone: touch events (a tap in the middle of the frame), mobile emulation, a simulated Dynamic Island
const click = async (x, y) => {
  if (MOBILE) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return;
  }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: MOBILE });
if (MOBILE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('keepfall_lang','${process.env.KFLANG ?? 'en'}');${MOBILE ? "document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('sim-inset'))" : ''}` });
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
    frame: fr ? { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2, w: fr.width, h: fr.height } : null,
    // the preparation clock from the game state, not from the (translated) text: works in every language
    left: (() => { const c = window.keepfallUi.castle; return c && c.phase === 'preparation' ? Math.max(0, Math.round(c.prepSeconds - c.elapsedSeconds)) : null; })(), done: !!localStorage.getItem('keepfall_tutorial_done') });
})()`);

const FAST = !!process.env.FAST; // x20 from the first step to the end (FAST=1): the whole tutorial at the fastest room speed
const REAL = !!process.env.REALTIME; // real time (x1) from the first click to the end: no speed-up; hints and the first minutes of the war are watched afterwards
const seen = new Set(); let n = 0, sped = false, last = '', lastLog = 0, completed = false, lastCountdown = false;
const stateLine = () => js("(() => { const c = window.keepfallUi.castle; if (!c) return null; return JSON.stringify({ phase: c.phase, t: Math.round(c.elapsedSeconds), war: Math.round(Math.max(0, c.elapsedSeconds - c.prepSeconds)), soldiers: c.soldiers, arming: c.units.reduce((n, u) => n + u.arming, 0), weapons: c.units.reduce((n, u) => n + u.weapons, 0), queued: c.queue.reduce((n, o) => n + o.remaining, 0), armies: c.war.armies.length, incoming: c.war.incoming.length, food: Math.round(c.resources.food), foodNet: Math.round((c.rates.foodIn - c.rates.foodOut) * 10) / 10, starving: c.starving, eliminated: c.eliminated, reports: c.scouting.reports.length, speed: c.speed }); })()");
const hintsSeen = new Set();
const watchHints = async () => { const raw = await js("JSON.stringify([...document.querySelectorAll('.notes .ribbon, .notes > *')].map((n) => n.textContent.trim()))"); for (const h of JSON.parse(raw ?? '[]')) if (!hintsSeen.has(h)) { hintsSeen.add(h); console.log('   ribbon:', h.slice(0, 150)); } };
const t0 = Date.now();
if (FAST) console.log('   speed x20 (whole run):', await js('(async () => JSON.stringify(await window.keepfallNet.setSpeed(20)))()'));
while (Date.now() - t0 < (REAL ? 1_500_000 : 420_000)) {
  if (REAL && Date.now() - lastLog > 30_000) { lastLog = Date.now(); console.log('   [state]', await stateLine()); }
  if (REAL) await watchHints();
  const raw = await read();
  if (!raw) { console.log('tutorial element gone'); completed = true; break; }
  const st = JSON.parse(raw);
  // the countdown step: no frame and the preparation clock is running (any language)
  const countdown = !st.frame && st.left !== null && /\d:\d\d/.test(st.text);
  if (!st.hidden && st.text !== last && !(countdown && lastCountdown)) {
    last = st.text; n++;
    await sleep(700);
    const label = String(n).padStart(2, '0');
    await shot(label);
    console.log(`${label} [${st.step}] ${st.text}${st.frame ? '' : '  (no frame)'}`);
    seen.add(st.text);
    if (!/the war starts in/.test(st.text)) console.log('   state:', await js("(() => { const c = window.keepfallUi.castle; return JSON.stringify({ soldiers: c.soldiers, pop: c.population, jobs: c.jobs.map((j) => j.job + ':' + j.count).join(' '), phase: c.phase, armies: c.war.armies.length + ':' + c.war.armies.map((a) => a.state + a.units.map((u) => u.count).join('/')).join(','), notes: [...document.querySelectorAll('.notes .ribbon, .notes > *')].map((n) => n.textContent.trim()).join(' | ').slice(0, 160), win: window.keepfallUi.windows.current && window.keepfallUi.windows.current.kind, queue: c.queue.length, units: c.units.filter((u) => u.weapons + u.soldiers + u.arming > 0).map((u) => [u.id, u.weapons, u.soldiers, u.arming]) }); })()"));
  }
  if (countdown) last = st.text;
  lastCountdown = countdown;
  if (st.done) { completed = true; if (!REAL) break; }
  // waiting for the war: speed the match up (development server) and drop back to x1 when about 45 s are left, so the attack step is played in real time
  const left = REAL || FAST || !countdown ? null : st.left;
  if (left !== null && !sped && left > 60) { sped = true; console.log('   speed x20:', await js('(async () => JSON.stringify(await window.keepfallNet.setSpeed(20)))()')); }
  if (!REAL && !FAST && sped && (left === null || left <= 60)) { console.log('   speed x1:', await js('(async () => JSON.stringify(await window.keepfallNet.setSpeed(1)))()')); sped = false; }
  if (st.frame) await click(st.frame.x, st.frame.y);
  if (/First press|Önce/.test(st.text)) { for (let k = 0; k < 14; k++) { await sleep(150); const r2 = await read(); if (!r2) { console.log('   (gone)'); break; } const q = JSON.parse(r2); console.log('   dbg:', await js("(() => { const b = document.querySelector('.win [data-act=all]'); const r = b && b.getBoundingClientRect(); const f = document.querySelector('.tut-frame').getBoundingClientRect(); return JSON.stringify({ disabled: b && b.disabled, btn: r && [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)], frame: [Math.round(f.x + f.width / 2), Math.round(f.y + f.height / 2)], home: [...document.querySelectorAll('.win [data-f=home]')].map((e) => e.textContent) }); })()"), await js("JSON.stringify([...document.querySelectorAll('.win [data-count]')].map((i) => i.value))")); if (q.text !== st.text) { console.log('   next:', q.text, q.frame ? '(frame)' : '(no frame)'); if (q.frame) { await click(q.frame.x, q.frame.y); console.log('   clicked it'); } break; } } }
  await sleep(900);
}
if (REAL) {
  // after the tutorial: watch the first minutes of the war (is the player still alive?), send a scout to a rival to see the report hint
  let scouted = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 330_000) {
    const raw = await stateLine(); if (!raw) break;
    const c = JSON.parse(raw);
    await watchHints();
    if (Date.now() - lastLog > 20_000) { lastLog = Date.now(); console.log('   [state]', raw); }
    if (!scouted && c.phase === 'war') { scouted = true; console.log('   scout to the rival:', await js("(async () => { const c = window.keepfallUi.castle; const seat = c.scouting.targets[0].seat; return JSON.stringify(await window.keepfallNet.sendScout(seat, 'idle')); })()")); }
    if (c.eliminated) { console.log('   ELIMINATED at war second', c.war); break; }
    if (c.war >= 270) { console.log('   still alive at war second', c.war); break; }
    await sleep(1500);
  }
  await shot('final');
}
console.log('steps seen:', n, '| distinct texts:', seen.size, '| page errors:', errors.length ? errors.slice(0, 3).join(' | ') : 'none');
console.log('tutorial done flag:', await js("localStorage.getItem('keepfall_tutorial_done')"));
ws.close(); chrome.kill(); process.exit(0);
