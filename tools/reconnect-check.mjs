// Connection trouble in a real (headless) browser: a short drop, a long drop, a page reload and a second tab in the middle of a match.
//   server on 5081, Vite on 5174 with KEEPFALL_SERVER=http://localhost:5082 (this script runs a cutting proxy on 5082 in between), then
//   node tools/reconnect-check.mjs [http://localhost:5174/]   (bots fill the room)
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';

// A TCP pass-through that can cut every connection and refuse new ones: a real network outage for the websocket.
const sockets = new Set();
let down = false;
const proxy = net.createServer((client) => {
  if (down) { client.destroy(); return; }
  const upstream = net.connect(5081, '127.0.0.1');
  sockets.add(client); sockets.add(upstream);
  const close = () => { client.destroy(); upstream.destroy(); sockets.delete(client); sockets.delete(upstream); };
  client.on('error', close); upstream.on('error', close); client.on('close', close); upstream.on('close', close);
  client.pipe(upstream); upstream.pipe(client);
}).listen(5082);
const outage = (on) => { down = on; if (on) for (const s of sockets) s.destroy(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`); if (!ok) failures++; };

const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-rc-'))}`, '--window-size=1280,720', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });

async function tab(targetUrl) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
  const t = await res.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  const run = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  return { send, run, errors, ws, id: t.id };
}

// State of the page as a player sees it.
const view = `(() => ({
  menu: document.documentElement.classList.contains('in-menu'),
  banner: [...document.querySelectorAll('.banner, #banner, .toast')].map((e) => e.textContent.trim()).join(' | ').slice(0, 160),
  clock: document.querySelector('#clock, .clock, .timer')?.textContent?.trim() ?? null,
  scene: !!window.keepfallScene?.ready,
  text: document.body.innerText.slice(0, 200).replace(/\\s+/g, ' '),
}))()`;

try {
  await sleep(1500);
  const a = await tab(URL);
  await sleep(3500);
  await a.run('localStorage.clear(); 1');
  await a.send('Page.navigate', { url: URL });
  await sleep(3500);
  const room = await a.run(`(async () => { const n = window.keepfallNet; const j = await n.createRoom('Eren'); await n.addBot(1); await n.addBot(1); await n.setReady(true); const s = await n.startMatch(); return { code: j.code, started: s.ok, error: s.error }; })()`);
  check('match started with bots', room?.started === true, JSON.stringify(room));
  await a.run(`(async () => { for (let i = 0; i < 100; i++) { if (window.keepfallScene?.ready) break; await new Promise(r => setTimeout(r, 400)); } return 1; })()`);
  let v = await a.run(view);
  check('in the game (not the menu)', v.menu === false && v.scene === true, JSON.stringify(v).slice(0, 160));
  const castleAt = () => a.run(`window.keepfallDebug?.castleTime ?? document.querySelector('[data-clock], .clock')?.textContent ?? 0`);
  const tickNow = () => a.run(`(async () => { const t0 = performance.now(); return window.keepfallNet?.roomCode ?? null; })()`);
  check('the room code is known', (await tickNow()) === room.code);
  await a.run(`history.pushState(null, '', '/oda/${room.code}'); 1`); // what the real screens do

  // 1. a short drop (8 s offline)
  outage(true);
  await sleep(8000);
  v = await a.run(view);
  console.log('info  while offline the page says:', v.text.slice(0, 120));
  outage(false);
  await sleep(12000);
  v = await a.run(view);
  check('after a short drop the player is back in the game', v.menu === false, JSON.stringify(v).slice(0, 200));
  const cmd = await a.run(`window.keepfallNet.setGrowth(true).then(r => r.ok === true, () => false)`);
  check('commands work again after the drop', cmd === true);

  // 2. page reload in the middle of the match
  await a.send('Page.reload');
  await sleep(6000);
  await a.run(`(async () => { for (let i = 0; i < 100; i++) { if (window.keepfallScene?.ready) break; await new Promise(r => setTimeout(r, 400)); } return 1; })()`);
  v = await a.run(view);
  check('after a reload the player is back in the same match', v.menu === false && v.scene === true, JSON.stringify(v).slice(0, 200));
  check('the same seat (commands accepted)', (await a.run(`window.keepfallNet.setGrowth(true).then(r => r.ok === true, () => false)`)) === true);

  // 3. second tab with the same room link
  const b = await tab(URL + 'oda/' + room.code);
  await sleep(5000);
  const vb = await b.run(view);
  console.log('info  second tab sees:', JSON.stringify(vb).slice(0, 200));
  check('a second tab on the match link does not break the first', (await a.run(`window.keepfallNet.setGrowth(true).then(r => r.ok === true, () => false)`)) === true);

  // 4. a long drop (50 s offline: past the library's default retries) then back online
  outage(true);
  await sleep(50000);
  v = await a.run(view);
  console.log('info  after 50 s offline the banner says:', v.banner || '(no banner)');
  outage(false);
  await sleep(15000);
  const back = await a.run(`window.keepfallNet.setGrowth(true).then(r => r.ok === true, () => false)`);
  check('after a 50 s drop the connection comes back by itself (no refresh needed)', back === true, 'the banner said: ' + v.banner);
  // 5. the server restarts (every room is gone): the player must be told, not left with a frozen screen
  if (process.env.SERVER_PID) {
    outage(true);
    await new Promise((r) => { const k = spawn('taskkill', ['/PID', process.env.SERVER_PID, '/F']); k.on('close', r); });
    await sleep(3000);
    const srv = spawn('dotnet', ['src/Keepfall.Server/bin/Release/net10.0/Keepfall.Server.dll', '--urls', 'http://localhost:5081'], { stdio: 'ignore', env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Production' } });
    await sleep(6000);
    outage(false);
    await sleep(20000);
    const banner = await a.run(`document.getElementById('banner')?.textContent ?? ''`);
    console.log('info  after a server restart the banner says:', banner || '(none)');
    check('after a server restart the player is told the room is gone', /Oda kapanmış/.test(banner));
    const shot = await a.send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(process.env.SHOT ?? 'reconnect-restart.png', Buffer.from(shot.result.data, 'base64'));
    await a.run(`document.getElementById('banner')?.click(); 1`);
    await sleep(3000);
    check('clicking it goes to the main menu', (await a.run(`location.pathname`)) === '/');
    srv.kill();
  }
  console.log('info  page errors:', a.errors.length ? a.errors.slice(0, 3).join(' / ') : 'none');
  check('no script errors on the way', a.errors.length === 0);
} catch (e) {
  check('script ran', false, String(e));
}
console.log(failures ? `\n${failures} FAILED` : '\nall ok');
chrome.kill();
proxy.close();
process.exit(failures ? 1 : 0);
