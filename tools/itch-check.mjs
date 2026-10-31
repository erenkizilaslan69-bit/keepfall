// The itch.io build as a browser sees it: the page comes from another origin and sub-folder (tools/serve-dist.mjs, case-sensitive, port 8099)
// than the game server (5081), with an iframe around it. Plays into a match against a bot and lists every failed request and script error.
//   node tools/serve-dist.mjs   (client/dist-itch built with VITE_SERVER_URL=http://localhost:5081)   +   a game server on 5081   →   node tools/itch-check.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PAGE = process.argv[2] ?? 'http://localhost:8099/html/12345/';
const [W, H] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-itch-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const bad = []; const reqs = new Map();
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  const p = d.params;
  if (d.method === 'Network.requestWillBeSent') reqs.set(p.requestId, p.request.url);
  if (d.method === 'Network.responseReceived' && p.response.status >= 400) bad.push(`HTTP ${p.response.status} ${p.response.url}`);
  if (d.method === 'Network.loadingFailed' && !p.canceled) bad.push(`FAILED ${p.errorText} ${reqs.get(p.requestId)}`);
  if (d.method === 'Runtime.exceptionThrown') bad.push('EXCEPTION ' + (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).split('\n')[0]);
  if (d.method === 'Runtime.consoleAPICalled' && p.type === 'error') bad.push('CONSOLE ' + p.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + r.result.exceptionDetails.text : r.result?.result?.value; };
await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// the wrapper page: the game in an iframe on a different origin (localhost:8100 → 8099), like html-classic.itch.zone
await send('Page.navigate', { url: PAGE });
await sleep(3000);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen','true'); localStorage.setItem('keepfall_lang','en'); 1`);
await send('Page.navigate', { url: PAGE });
await sleep(3500);
// the production build has no test hooks (window.keepfallNet is dev only): drive the screens like a player
const click = (sel) => run(`(async () => { for (let i = 0; i < 60; i++) { const e = document.querySelector(${JSON.stringify(sel)}); if (e && !e.disabled) { e.click(); return true; } await new Promise(r => setTimeout(r, 250)); } return false; })()`);
console.log('create room:', await click('#create'));
console.log('add bot:', await click('[data-a=addbot][data-level=easy]'));
await sleep(500);
console.log('ready:', await click('#ready'));
await sleep(500);
console.log('start:', await click('#start'));
const ready = await run(`(async () => { for (let i = 0; i < 150; i++) { if (document.querySelector('canvas') && document.querySelector('.topbar, #topbar')) return true; await new Promise(r => setTimeout(r, 400)); } return false; })()`);
console.log('game screen:', ready);
await sleep(15000);
const shot = await send('Page.captureScreenshot', { format: 'png' });
const out = join(process.env.TEMP ?? tmpdir(), 'itch-check.png');
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
const uniq = [...new Set(bad)];
console.log(uniq.length ? uniq.join('\n') : 'no failed request, no script error');
console.log('screenshot:', out);
ws.close(); chrome.kill(); process.exit(uniq.length ? 1 : 0);
