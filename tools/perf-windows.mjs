// Opens and closes the game's windows hundreds of times (castle, buildings, forest, rival) and reads the DOM nodes, event listeners and heap after garbage collection:
// flat = no leak in the window code. Needs the dev server and Vite dev client. Usage: node tools/perf-windows.mjs [rounds=60] [client url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROUNDS = Number(process.argv[2] ?? 60), URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-win-'))}`, '--window-size=1280,720', '--no-first-run', '--ignore-gpu-blocklist', '--enable-precise-memory-info', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t; for (let i = 0; i < 40; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (t.some((x) => x.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const p = new Map(); ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); } });
const send = (m, a = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
const run = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description ?? '') : r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('HeapProfiler.enable');
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen','true'); localStorage.setItem('keepfall_lang','tr'); 1`);
await send('Page.navigate', { url: URL + '?nodebug=1' }); await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('W'); await n.addBot('easy'); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 200; i++) { if (window.keepfallScene?.ready) return 1; await new Promise(r => setTimeout(r, 300)); } return 0; })()`);
await sleep(3000); await run(`document.querySelectorAll('[data-close], .decree button').forEach((b) => b.click()); 1`);
const read = async () => { await send('HeapProfiler.collectGarbage'); await send('HeapProfiler.collectGarbage'); await sleep(300); const c = (await send('Memory.getDOMCounters')).result; return { heapMB: await run(`Math.round(performance.memory.usedJSHeapSize / 104857.6) / 10`), nodes: c.nodes, listeners: c.jsEventListeners }; };
const rows = [{ round: 0, ...(await read()) }];
const seats = await run(`JSON.stringify(window.keepfallScene.layout.regions.map((r) => r.seat).filter((x) => x && x !== window.keepfallNet.seat))`);
for (let r = 1; r <= 4; r++) {
  const err = await run(`(async () => { const s = window.keepfallScene; const w = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < ${ROUNDS}; i++) { for (const t of [{ kind: 'castle' }, { kind: 'building', type: 'farm' }, { kind: 'building', type: 'lumberCamp' }, { kind: 'building', type: 'mine' }, { kind: 'building', type: 'forge' }, { kind: 'forest', id: 'northWest' }, { kind: 'enemy', seat: ${JSON.parse(seats)[0] ?? 2} }]) { s.select(t); await w(20); document.querySelectorAll('.win [data-close], [data-close]').forEach((b) => b.click()); await w(10); } }
    return 'ok'; })()`);
  rows.push({ round: r * ROUNDS, ...(await read()), err: err === 'ok' ? '' : err });
}
console.table(rows);
ws.close(); chrome.kill(); process.exit(0);
