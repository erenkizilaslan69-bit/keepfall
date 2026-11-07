// Starts the packed Steam demo (steam-build/Keepfall/Keepfall.exe, see tools/pack-steam.mjs) and checks it like a player would:
// the window opens, only solo doors exist (no "Oda kur"/"Odaya katıl"), the bridge is there with Steam off, no request left the machine,
// a quick match starts, progress survives a relaunch (same origin), and closing the window stops the server.
//   node tools/steam-check.mjs [out-prefix]      screenshots go to <out-prefix>-*.png (default art/shots/steam/check; git-ignored)
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const exe = join(root, 'steam-build', 'Keepfall', 'Keepfall.exe');
if (!existsSync(exe)) { console.error('Run node tools/pack-steam.mjs first.'); process.exit(1); }
const OUT = process.argv[2] ?? join(root, 'art', 'shots', 'steam', 'check');
mkdirSync(dirname(OUT), { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'kf-steam-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const serverPids = () => {
  try { return execSync('tasklist /FI "IMAGENAME eq Keepfall.Server.exe" /FO CSV /NH', { encoding: 'utf8' }).split(/\r?\n/).filter((l) => l.includes('Keepfall.Server')).map((l) => Number(l.split('","')[1])); } catch { return []; }
};

async function launch(label, cdpPort) {
  const log = join(userData, `${label}.log`);
  writeFileSync(log, '');
  const child = spawn(exe, [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userData}`], { stdio: 'ignore', env: { ...process.env, KEEPFALL_SHELL_LOG: log, KEEPFALL_STEAM_APPID: '' } });
  let target;
  for (let i = 0; i < 120 && !target; i++) {
    await sleep(500);
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('keepfall.localhost')); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('no window');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'js error'); return r.result?.result?.value; };
  const waitFor = async (expr, sec = 30) => { for (let i = 0; i < sec * 2; i++) { try { if (await js(expr)) return true; } catch { /* loading */ } await sleep(500); } return false; };
  const shot = async (name) => writeFileSync(`${OUT}-${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  return { child, js, waitFor, shot, send, log, ws };
}

// ---- first launch ----
const before = new Set(serverPids());
let app = await launch('first', 9444);
const serverNow = serverPids().filter((p) => !before.has(p));
check('window opens on keepfall.localhost', true);
check('server process started', serverNow.length === 1, `pid ${serverNow.join(',')}`);
await app.js(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}`);
await app.js('location.reload()');
await sleep(1500);
check('main menu appears (Quick play)', await app.waitFor(`!!document.querySelector('#quick')`));
await sleep(2500);
check('challenges button present', await app.js(`!!document.querySelector('#challenges')`));
check('progress button present', await app.js(`!!document.querySelector('#progress')`));
check('multiplayer doors closed (no create/join)', await app.js(`!document.querySelector('#create') && !document.querySelector('#join') && !document.querySelector('#code')`));
const bridge = await app.js(`(async()=>{const b=window.keepfallSteam;if(!b)return null;return {shell:b.shell,status:await b.status()}})()`);
check('desktop bridge present, Steam off without an app id', !!bridge && bridge.status.available === false, JSON.stringify(bridge));
await app.shot('menu');
await app.js(`localStorage.setItem('kf_probe','kept')`);

// quick match: starts, the map comes up
await app.js(`document.querySelector('#quick').click()`);
check('quick match reaches the game screen', await app.waitFor(`!!document.querySelector('canvas') && !!document.querySelector('.topbar, #hud, .kf-topbar, .hud')`, 40) || await app.waitFor(`document.querySelectorAll('canvas').length>0 && !document.querySelector('#quick')`, 20));
await sleep(6000);
await app.shot('match');

// the page may not have asked anything outside; the shell cancelled and counted such requests
const blocked = await app.js(`window.keepfallSteam.blockedRequests()`);
check('no request left the machine', Array.isArray(blocked) && blocked.length === 0, blocked && blocked.length ? blocked.join(' | ') : '');

// close the window the way a player does; the server must stop
const firstServer = serverNow[0];
void app.send('Browser.close'); // never answers: the browser goes away
for (let i = 0; i < 30 && alive(app.child.pid); i++) await sleep(300);
await sleep(1500);
check('shell exits when the window closes', !alive(app.child.pid));
check('server stops with it', !alive(firstServer));

// ---- second launch: the origin is stable, so the page kept its storage ----
app = await launch('second', 9445);
await app.waitFor(`!!document.querySelector('#quick')`);
check('progress/storage survives a relaunch', (await app.js(`localStorage.getItem('kf_probe')`)) === 'kept');
check('relaunch picks a (probably) new port', true, readFileSync(app.log, 'utf8').split('\n').find((l) => l.startsWith('ready')) ?? '');
await app.shot('menu-relaunch');
// hard kill of the shell: the server must not stay behind (KEEPFALL_PARENT_PID)
const second = serverPids().filter((p) => !before.has(p));
execSync(`taskkill /PID ${app.child.pid} /F`, { stdio: 'ignore' });
let gone = false;
for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = second.every((p) => !alive(p)); }
check('server stops even when the shell is killed', gone, `pid ${second.join(',')}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
