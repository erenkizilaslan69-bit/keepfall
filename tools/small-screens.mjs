// Home and lobby screens at a small size (CrazyGames' mobile iframe is 800x450): usage SIZE=800,450 node tools/small-screens.mjs [http://localhost:5174/] <out-prefix>
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const URL = process.argv[2] ?? 'http://localhost:5174/', OUT = process.argv[3] ?? 'quick';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, `--window-size=${process.env.SIZE ?? '800,450'}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
const [VW, VH] = (process.env.SIZE ?? '800,450').split(',').map(Number);
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }); // the window size includes the browser's own frame
await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_lang','tr')" });
await send('Page.navigate', { url: URL });
await sleep(3500);
writeFileSync(`${OUT}-home.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
await js("document.querySelector('#name').value='Aylin'; 1");
writeFileSync(`${OUT}-home.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
await js("document.querySelector('#create').click(); 1");
for (let i = 0; i < 15; i++) { await sleep(1000); if (await js("!!document.querySelector('.lobby')")) break; }
await js("(async()=>{const n=window.keepfallNet; for (const l of ['easy','medium','hard']) await n.addBot(l); return 1})()");
await sleep(2500);
writeFileSync(`${OUT}-lobby.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
console.log('lobby scroll height', await js('document.documentElement.scrollHeight'), 'viewport', await js('innerHeight'));
ws.close(); chrome.kill(); process.exit(0);
