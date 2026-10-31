// Envoy UI check in headless Chrome: the rival's castle window with the envoy form, and the decree an envoy brings. A letter whose message is
// markup must show as plain text (no element made, no script run). Saves screenshots.
// Needs the dev server and the Vite dev client; usage: node tools/shot-envoy.mjs <output folder> <tag> [client url]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'hud';
const URL = process.argv[4] ?? 'http://localhost:5174/';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-hud-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,800', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
let bad = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok   ' : 'FAIL ', name, extra); if (!ok) bad++; };

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); sessionStorage.clear(); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2000)); return 1; })()`);

// 1. the rival's window with the envoy form
await run(`window.keepfallUi.open({ kind: 'enemy', seat: 2 }); 1`);
await sleep(800);
const form = JSON.parse(await run(`JSON.stringify({
  inputs: [...document.querySelectorAll('.win [data-env]')].map(e => e.dataset.env),
  text: !!document.querySelector('.win textarea[data-f="env-text"]'),
  button: document.querySelector('.win [data-act="envoy"]')?.textContent,
  total: document.querySelector('.win [data-f="env-total"]')?.textContent,
})`));
check('the rival window has the four load boxes, a message box and a send button', form.inputs.join() === 'food,wood,iron,gold' && form.text && /Ulak/.test(form.button), JSON.stringify(form));
await run(`(() => { const w = document.querySelector('.win'); w.querySelector('[data-env="food"]').value = '5'; w.querySelector('[data-env="food"]').dispatchEvent(new Event('input', { bubbles: true })); w.querySelector('[data-f="env-text"]').value = 'Barış önerisi'; w.querySelector('[data-f="env-text"]').dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await sleep(300);
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(outDir, `${tag}-form.png`), Buffer.from(shot1.result.data, 'base64'));

// 2. the decree, with a message that is markup
const evil = '<img src=x onerror="window.__xss=1"><b>kalın</b> & <script>window.__xss=2</script>';
await run(`window.keepfallUi.reports.showLetter({ id: 1, fromSeat: 2, fromName: 'Bora', fromColor: 'red', at: 0, food: 5, wood: 0, iron: 2, gold: 10, message: ${JSON.stringify(evil)} }); 1`);
await sleep(600);
const decree = JSON.parse(await run(`JSON.stringify({
  text: document.querySelector('.letter-text')?.textContent,
  elements: document.querySelectorAll('.letter-text *').length,
  imgs: document.querySelectorAll('.letter-win img, .letter-win script').length,
  xss: window.__xss ?? null,
  from: document.querySelector('.letter-from')?.textContent,
})`));
check('the decree shows the message as plain text', decree.text === evil && decree.elements === 0 && decree.imgs === 0 && decree.xss === null, JSON.stringify(decree));
check('the decree says who it is from', /Bora/.test(decree.from));
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(outDir, `${tag}-decree.png`), Buffer.from(shot2.result.data, 'base64'));
ws.close();
chrome.kill();
console.log(bad === 0 ? 'All envoy UI checks passed.' : `${bad} check(s) failed.`);
process.exit(bad === 0 ? 0 : 1);
