// Reconnect check in headless Chrome (dev servers: 5081 + Vite 5174): quick play, then (1) the line is cut and the page reconnects by itself and keeps seat and room,
// (2) the line is cut while the "offline" switch is on for 12 s, (3) the page is loaded afresh at "/" (a phone that dropped the tab) and lands back in the match.
// Usage: node tools/reconnect-check.mjs [http://localhost:5174/]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const URL = process.argv[2] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, '--window-size=1280,720', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const waitFor = async (expr, sec) => { for (let i = 0; i < sec * 2; i++) { if (await js(expr)) return true; await sleep(500); } return false; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}" });
await send('Page.navigate', { url: URL });
await sleep(3500);
await js("document.querySelector('#quick').click(); 1");
ok(await waitFor("document.documentElement.classList.contains('in-game')", 30), 'quick play: in the match');
await sleep(3000);
const snap = () => js("({ seat: keepfallNet.seat, room: keepfallNet.roomCode, game: document.documentElement.classList.contains('in-game'), state: keepfallNet.hub.state, t: document.querySelector('.tb-clock, .clock, #clock')?.textContent ?? null })");
const a = await snap();
console.log('start', JSON.stringify(a));

// (1) the line breaks (the transport is closed with an error: the library reconnects)
await js("keepfallNet.hub.connection.stop(new Error('test cut')); 1");
await sleep(500);
const mid = await snap();
ok(mid.state !== 'Connected', `cut: state is ${mid.state}`);
ok(await waitFor("keepfallNet.hub.state === 'Connected'", 20), 'cut: connected again by itself');
const b = await snap();
ok(b.seat === a.seat && b.room === a.room && b.game, `cut: same seat ${b.seat} and room ${b.room}, still in the match`);
await sleep(2500);
ok(await js("!!document.querySelector('.army-sign, .tb-players, .topbar, #ui') && document.documentElement.classList.contains('in-game')"), 'cut: the game screen is alive');

// (2) offline for 12 s (and the line is cut), then online
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await js("keepfallNet.hub.connection.stop(new Error('offline cut')); 1");
await sleep(12000);
ok((await snap()).state !== 'Connected', 'offline: not connected');
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
ok(await waitFor("keepfallNet.hub.state === 'Connected'", 30), 'offline: connected after the network is back');
const c = await snap();
ok(c.seat === a.seat && c.room === a.room, `offline: same seat ${c.seat} and room ${c.room}`);

// (3) the page is opened afresh at the start address (no room in it): the last room is found again
await sleep(6000); // the "active room" record is refreshed every 5 s
await send('Page.navigate', { url: URL });
ok(await waitFor("document.documentElement.classList.contains('in-game')", 40), 'reload at "/": back in the match');
const d = await snap();
ok(d.room === a.room && d.seat === a.seat, `reload: same room ${d.room}, seat ${d.seat}`);
ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
