// Opens an unpacked game zip (served by tools/serve-dist.mjs) in headless Chrome WITHOUT the platform SDK reachable and lists console errors / failed requests,
// then waits for the home screen. Usage: node tools/zip-check.mjs [http://localhost:8099/] [out.png]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const URL = process.argv[2] ?? 'http://localhost:8099/', OUT = process.argv[3] ?? 'zip-check.png';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1280,720', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const problems = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
  if (d.method === 'Network.loadingFailed') problems.push('request failed: ' + d.params.errorText + ' ' + (d.params.blockedReason ?? ''));
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) problems.push(`http ${d.params.response.status}: ${d.params.response.url}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Network.enable'); if (process.env.NOSDK) await send('Network.setBlockedURLs', { urls: ['*sdk.crazygames.com*'] }); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
let state = '';
for (let i = 0; i < 80; i++) {
  await sleep(1000);
  state = (await send('Runtime.evaluate', { expression: `document.body.innerText.slice(0, 120).replace(/\n/g, ' | ') + ' || sdk=' + (typeof window.CrazyGames)`, returnByValue: true })).result.value;
  if (/Oda kur|Create room|Quick play|Hızlı oyna/i.test(state)) break;
}
console.log('screen:', state ?? 'n/a');
// The crazy build: no private room / join-by-code on the home screen, no dev hooks, no debug panel even with ?debug=1.
const dom = (await send('Runtime.evaluate', { expression: `JSON.stringify({ create: !!document.querySelector('#create'), join: !!document.querySelector('#join'), code: !!document.querySelector('#code'), quick: !!document.querySelector('#quick'), hooks: ['keepfallScene', 'keepfallUi', 'keepfallNet', 'keepfallAudio'].filter((k) => k in window), diag: !!document.querySelector('.kf-diag') })`, returnByValue: true })).result.value;
console.log('dom:', dom);
if (process.env.CRAZYFLAGS && (/"create":true|"join":true|"code":true|"quick":false|"diag":true/.test(dom) || !/"hooks":\[\]/.test(dom))) { console.log('FAIL: flags/hooks'); problems.push('flags/hooks wrong: ' + dom); }
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(problems.length ? 'PROBLEMS:\n' + [...new Set(problems)].join('\n') : 'no console errors / failed requests');
chrome.kill(); process.exit(0);
