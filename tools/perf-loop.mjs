// Match -> menu -> match loop for leaks: after every round the garbage is collected and heap, DOM nodes, documents and JS event listeners are read
// (CDP Memory.getDOMCounters). A flat line is healthy; a staircase is a leak. Needs the dev server and the Vite dev client.
// Usage: node tools/perf-loop.mjs [rounds=10] [seconds-in-match=12] [client url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROUNDS = Number(process.argv[2] ?? 10), STAY = Number(process.argv[3] ?? 12), URL = process.argv[4] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-loop-'))}`,
  '--window-size=1280,720', '--no-first-run', '--ignore-gpu-blocklist', '--enable-precise-memory-info', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n')[0]); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + r.result.exceptionDetails.text : r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('HeapProfiler.enable');
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen','true'); localStorage.setItem('keepfall_lang','tr'); 1`);
await send('Page.navigate', { url: URL + '?nodebug=1' }); await sleep(3500);
const rows = [];
for (let r = 0; r <= ROUNDS; r++) {
  await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Loop'); await n.addBot('easy'); await n.setReady(true); await n.startMatch(); return 1; })()`);
  await run(`(async () => { for (let i = 0; i < 200; i++) { if (window.keepfallScene?.ready) return 1; await new Promise(r => setTimeout(r, 300)); } return 0; })()`);
  await run(`window.keepfallNet.setSpeed(10); 1`);
  await sleep(STAY * 1000);
  const inGame = await run(`JSON.stringify({ children: window.keepfallScene.children.length, tex: window.keepfallScene.sys.game.textures.getTextureKeys().length })`);
  await run(`window.keepfallLeave()`); await sleep(1500);
  await send('HeapProfiler.collectGarbage'); await send('HeapProfiler.collectGarbage'); await sleep(500);
  const c = (await send('Memory.getDOMCounters')).result;
  const heap = await run(`Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10`);
  rows.push({ round: r, heapMB: heap, nodes: c.nodes, listeners: c.jsEventListeners, documents: c.documents, ...JSON.parse(inGame) });
  console.log(JSON.stringify(rows.at(-1)));
}
console.table(rows);
console.log('errors:', [...new Set(errors)].slice(0, 8).join(' / ') || 'none');
ws.close(); chrome.kill(); process.exit(0);
