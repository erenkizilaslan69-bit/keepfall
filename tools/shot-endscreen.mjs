// The end screen with made-up results (dev server + Vite dev client): victory and defeat pictures in the player's colour; usage: node tools/shot-endscreen.mjs <out-prefix> [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'endscreen', URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1280,800', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
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
await sleep(3500);
for (const [name, mySeat, color] of [['victory', 0, 'red'], ['defeat', 1, 'purple']]) {
  const r = await evalJs(`(async()=>{
    const { EndScreen } = await import('/src/screens.ts');
    document.querySelectorAll('.screen').forEach((e) => e.remove());
    const e = new EndScreen(document.getElementById('app') ?? document.body, { backToLobby: async () => ({ ok: true }) }, ${mySeat});
    const ranking = [
      { seat: 0, name: 'Aylin', color: ${JSON.stringify(color)}, place: 1, population: 91, eliminated: false, kingdom: 'kahin' },
      { seat: 1, name: 'Bora', color: 'blue', place: 2, population: 40, eliminated: true, kingdom: 'golge' },
      { seat: 2, name: 'Cem', color: 'yellow', place: 3, population: 22, eliminated: true, kingdom: 'tuccar' }];
    e.update({ code: 'X', phase: 'ended', players: [{ seat: 0, name: 'Aylin', color: ${mySeat === 0 ? JSON.stringify(color) : "'red'"}, isHost: true, connected: true }, { seat: 1, name: 'Bora', color: ${mySeat === 1 ? JSON.stringify(color) : "'blue'"}, isHost: false, connected: true }],
      result: { winners: [0], byElimination: true, ranking, summaries: [] } });
    await new Promise((r) => setTimeout(r, 900)); return 1; })()`);
  console.log(name, r);
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${name}.png`, Buffer.from(s.result.data, 'base64'));
}
ws.close(); chrome.kill(); process.exit(0);
