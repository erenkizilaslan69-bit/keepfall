// Edge cases of the packed Steam demo that steam-check.mjs does not cover (run `node tools/pack-steam.mjs` first):
//   a second launch while the game runs, broken save data in the page's storage, F11 / window sizes, console errors, the server's log folder.
//   node tools/steam-edge-check.mjs                       (KEEPFALL_PACKAGE_DIR=<folder> checks another package folder)
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exe, launch, sleep } from './steam-launch.mjs';

if (!existsSync(exe)) { console.error('Run node tools/pack-steam.mjs first.'); process.exit(1); }
const userData = mkdtempSync(join(tmpdir(), 'kf-edge-'));
const OUT = join(userData, 'shot');
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const serverPids = () => {
  try { return execSync('tasklist /FI "IMAGENAME eq Keepfall.Server.exe" /FO CSV /NH', { encoding: 'utf8' }).split(/\r?\n/).filter((l) => l.includes('Keepfall.Server')).map((l) => Number(l.split('","')[1])); }
  catch { return []; }
};

const before = new Set(serverPids());
const app = await launch('edge', 9447, '', userData, OUT);
const errors = [];
app.ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
});
await app.send('Runtime.enable');
await app.js(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}`);
await app.js('location.reload()');
check('menu appears', await app.waitFor(`!!document.querySelector('#quick')`));

// ---- a second launch (same user data, like a double click on the Steam button) ----
const servers = serverPids().filter((p) => !before.has(p));
const second = spawn(exe, [`--user-data-dir=${userData}`], { stdio: 'ignore' });
let exited = false;
second.on('exit', () => { exited = true; });
for (let i = 0; i < 40 && !exited; i++) await sleep(250);
check('a second launch quits at once', exited);
await sleep(1000);
check('the first game is still running', alive(app.child.pid) && await app.js(`!!document.querySelector('#quick')`));
check('no second server was started', serverPids().filter((p) => !before.has(p)).length === servers.length, `${servers.length} server(s)`);

// ---- broken data in storage ----
await app.js(`(()=>{
  localStorage.setItem('keepfall_progress_v1','{{{ not json');
  localStorage.setItem('keepfall.prefs','null');
  localStorage.setItem('keepfall.audio','[1,2');
  localStorage.setItem('keepfall_challenges','[1,2');
  localStorage.setItem('keepfall.deck','"x"');
  localStorage.setItem('keepfall.fill','5');
  localStorage.setItem('keepfall_active_room','{"code":42}');
})()`);
errors.length = 0;
await app.js('location.reload()');
check('broken saves: the menu still comes up', await app.waitFor(`!!document.querySelector('#quick')`));
await sleep(1500);
await app.js(`document.querySelector('#progress')?.click()`);
await sleep(800);
check('broken saves: the progress window opens', await app.js(`!!document.querySelector('.win, .progress, [class*=progress]')`));
await app.shot('broken-progress');
check('broken saves: no script error', errors.length === 0, errors.slice(0, 3).join(' | '));
await app.js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

// ---- F11 and window sizes (this Electron has no Browser.getWindowForTarget: judge by what the page sees) ----
const fullScreen = () => app.js(`innerWidth >= screen.width && innerHeight >= screen.height - 2`);
const pressF11 = async () => {
  await app.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F11', code: 'F11', windowsVirtualKeyCode: 122 });
  await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F11', code: 'F11', windowsVirtualKeyCode: 122 });
  await sleep(1200);
};
// (a synthetic CDP key event goes to the page, not to the shell's before-input-event hook, so F11 itself cannot be pressed from here: it is a manual check)
void fullScreen; void pressF11;
await app.js('location.reload()');
await app.waitFor(`!!document.querySelector('#quick')`);
await sleep(1500);
for (const [w, h] of [[960, 540], [1280, 720], [1920, 1080], [800, 450]]) {
  await app.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const overflow = await app.js(`document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1`);
  const quick = await app.js(`(()=>{const r=document.querySelector('#quick')?.getBoundingClientRect();return !!r && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth})()`);
  check(`viewport ${w}x${h}: no scrollbars, Quick play fully visible`, !overflow && quick, `overflow=${overflow} quick=${quick}`);
  await app.shot(`size-${w}`);
}
await app.send('Emulation.clearDeviceMetricsOverride');

// ---- a match must not leave script errors ----
errors.length = 0;
await app.js(`document.querySelector('#quick').click()`);
await app.waitFor(`!!document.querySelector('canvas')`, 40);
await sleep(8000);
check('a quick match: no script errors in 8 s', errors.length === 0, errors.slice(0, 3).join(' | '));
const blocked = await app.js(`window.keepfallSteam.blockedRequests()`);
check('nothing tried to leave the machine', Array.isArray(blocked) && blocked.length === 0, (blocked ?? []).join(' | '));

// ---- the server's log folder ----
const pkg = join(exe, '..');
const logDir = join(pkg, 'server', 'logs');
check('the client error log (if any) is inside the install folder, not elsewhere', !existsSync(logDir) || readdirSync(logDir).every((f) => /\.log$/.test(f)), existsSync(logDir) ? readdirSync(logDir).join(',') : 'no logs folder');

// ---- the page's process dies: the shell loads the page again (once) ----
void app.send('Page.crash');
let reloaded = false;
for (let i = 0; i < 40 && !reloaded; i++) {
  await sleep(500);
  try {
    const t = (await (await fetch('http://127.0.0.1:9447/json')).json()).find((x) => x.type === 'page' && x.url.includes('keepfall.localhost'));
    if (t) {
      const w = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, rej) => { w.addEventListener('open', r); w.addEventListener('error', rej); });
      const id = 1;
      reloaded = await new Promise((res) => { w.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id === id) { res(d.result?.result?.value === true); w.close(); } }); w.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: "!!document.querySelector('#quick, canvas')", returnByValue: true } })); });
    }
  } catch { /* still reloading */ }
}
check('after a render crash the shell reloads the game', reloaded);
check('the crash was written down', /crash render-process-gone/.test(readFileSync(app.log, 'utf8')));

execSync(`taskkill /PID ${app.child.pid} /T /F`, { stdio: 'ignore' });
for (let i = 0; i < 40 && !servers.every((p) => !alive(p)); i++) await sleep(500);
check('server gone after the shell is killed', servers.every((p) => !alive(p)));
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
