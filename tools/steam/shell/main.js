'use strict';
// Desktop shell of the offline Steam demo (tools/pack-steam.mjs puts it next to the self-contained game server).
//  - picks a free local port, starts the bundled server there (loopback only), waits for it, shows the client in a window;
//  - the page lives at http://keepfall.localhost (mapped to that port) so its origin, and with it localStorage, is the SAME on every launch;
//  - every request to anything else is cancelled (the demo needs no internet) and counted, so a stray CDN/font/analytics call is visible;
//  - the server is stopped when the window closes (and stops itself if this process is killed: KEEPFALL_PARENT_PID);
//  - Steamworks (steamworks.js) is started only when an app id is configured and the SDK is present; otherwise the bridge answers "not available";
//  - friend-hosted multiplayer (mp.js): the player who makes a room is the server; friends come in over LAN / direct IP or over Steam's relay.
const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { createMp } = require('./mp');

const HOST = 'keepfall.localhost';
const JOIN_HOST = 'join.keepfall.localhost'; // a guest's door to the host's game server (mp.js)
const root = path.resolve(__dirname, '..', '..');            // <package>/  (resources/app/../..)
const serverDir = process.env.KEEPFALL_SERVER_DIR || path.join(root, 'server');
const serverExe = path.join(serverDir, process.platform === 'win32' ? 'Keepfall.Server.exe' : 'Keepfall.Server');
const quietLog = process.env.KEEPFALL_SHELL_LOG;              // test hook: a file the shell writes its facts to
const log = (line) => { if (quietLog) { try { fs.appendFileSync(quietLog, line + '\n'); } catch { /* ignore */ } } };

let server = null, port = 0, guestPort = 0, joinPort = 0, quitting = false, mainWindow = null, mp = null;
/** The build's name: host and guest of a friend-hosted game must have the same one (tools/pack-steam.mjs writes build.json). */
const build = (() => {
  if (process.env.KEEPFALL_BUILD) return String(process.env.KEEPFALL_BUILD).slice(0, 40);
  try { return String(JSON.parse(fs.readFileSync(path.join(root, 'build.json'), 'utf8')).version || 'dev').slice(0, 40); } catch { return 'dev'; }
})();
const blocked = [];

// A crash leaves a trace the player can send: <userData>/crash.log (Windows: %APPDATA%\Keepfall). Never throws.
function crashLog(what, err) {
  const text = new Date().toISOString() + ' ' + what + ': ' + ((err && (err.stack || err.message)) || String(err)) + '\n';
  log('crash ' + what);
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), text); } catch { /* the log is a nicety */ }
}
process.on('uncaughtException', (e) => { crashLog('uncaughtException', e); });

// Tests run a host and guests on one machine: each its own profile folder and no single-instance rule.
if (process.env.KEEPFALL_USER_DATA) app.setPath('userData', process.env.KEEPFALL_USER_DATA);
const gotLock = process.env.KEEPFALL_MULTI === '1' || app.requestSingleInstanceLock();
if (!gotLock) app.quit(); // a second launch just focuses the first
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.setName('Keepfall');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function ping(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/ping', timeout: 1000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(p, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (server && server.exitCode !== null) return false;
    if (await ping(p)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function startServer(p) {
  if (!fs.existsSync(serverExe)) throw new Error('Game server missing: ' + serverExe);
  const env = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: 'Production',
    // two loopback doors: the first is this window's own, the second is where friends arrive (through mp.js); the server treats the second as guests
    ASPNETCORE_URLS: 'http://127.0.0.1:' + p + ';http://127.0.0.1:' + guestPort,
    Keepfall__GuestPort: String(guestPort),
    Keepfall__TakeoverSeconds: process.env.KEEPFALL_TAKEOVER_SECONDS || '60', // a friend who drops keeps the seat a minute, then a computer player plays it
    Keepfall__LobbyGraceMinutes: '1',
    Keepfall__Build: build,
    DOTNET_gcServer: '0',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    Keepfall__BalancePath: path.join(serverDir, 'config', 'balance.json'),
    Keepfall__MaxRooms: '4',            // a solo demo: a few rooms are plenty (a replay/new match overlaps the old one for a moment)
    Keepfall__StatsLogSeconds: '0',
    KEEPFALL_PARENT_PID: String(process.pid),
    KEEPFALL_STEAM: '1',                // the server refuses the director (cameraman) connection in the Steam build, whatever else is set
    Keepfall__DirectorKey: '',
  };
  server = spawn(serverExe, [], { cwd: serverDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const tail = [];
  const keep = (b) => { for (const l of String(b).split(/\r?\n/)) { if (l.trim()) { tail.push(l); if (tail.length > 40) tail.shift(); } } };
  server.stdout.on('data', keep);
  server.stderr.on('data', keep);
  server.on('exit', (code) => {
    log('server-exit ' + code);
    if (!quitting) {
      dialog.showErrorBox('Keepfall', 'The game server stopped (code ' + code + ').\n\n' + tail.slice(-8).join('\n'));
      app.quit();
    }
  });
}

function stopServer() {
  quitting = true;
  if (!server || server.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server.kill('SIGTERM');
  } catch { /* already gone */ }
}

// ---------- Steamworks (all optional) ----------
let steam = null; // { client, appId }
function steamAppId() {
  if (process.env.KEEPFALL_STEAM_APPID) return Number(process.env.KEEPFALL_STEAM_APPID) || 0;
  for (const f of [path.join(root, 'steam.json'), path.join(__dirname, 'steam.json')]) {
    try { const n = Number(JSON.parse(fs.readFileSync(f, 'utf8')).appId); if (n > 0) return n; } catch { /* try the next */ }
  }
  return 0; // placeholder: no app id, Steam stays off
}
function startSteam() {
  const appId = steamAppId();
  if (!appId) { log('steam off (no app id)'); return; }
  // 480 is Valve's public test app (Spacewar): for development on this machine only, never for a build that is given to anybody.
  if (appId === 480 && process.env.KEEPFALL_STEAM_DEV !== '1') { log('steam off (test app id 480 needs KEEPFALL_STEAM_DEV=1)'); return; }
  try {
    const sw = require('steamworks.js');
    const client = sw.init(appId);
    try { if (sw.electronEnableSteamOverlay) sw.electronEnableSteamOverlay(); } catch { /* the overlay is a nicety */ }
    steam = { client, appId };
    log('steam on ' + appId);
  } catch (e) { steam = null; log('steam off (' + (e && e.message) + ')'); }
}
const safe = (f, fallback) => { try { return f(); } catch (e) { log('steam call failed: ' + (e && e.message)); return fallback; } };
const ACH = /^[a-z][a-z0-9_]{0,40}$/;
ipcMain.handle('steam:status', () => ({ available: !!steam, appId: steam ? steam.appId : 0 }));
ipcMain.handle('steam:unlock', (_e, id) => !!steam && ACH.test(String(id)) && safe(() => steam.client.achievement.activate(String(id)), false));
ipcMain.handle('steam:cloud-read', (_e, name) => (steam && name === 'progress.json') ? safe(() => (steam.client.cloud.isEnabledForApp() && steam.client.cloud.readFile(name)) || null, null) : null);
ipcMain.handle('steam:cloud-write', (_e, name, text) => !!steam && name === 'progress.json' && typeof text === 'string' && text.length < 200000
  && safe(() => steam.client.cloud.isEnabledForApp() && steam.client.cloud.writeFile(name, text), false));
ipcMain.handle('steam:presence', (_e, key, value) => !!steam && typeof key === 'string' && key.length < 40
  && safe(() => { steam.client.localplayer.setRichPresence(key, value == null ? undefined : String(value).slice(0, 200)); return true; }, false));
ipcMain.handle('shell:blocked', () => blocked.slice());

// ---------- friend-hosted multiplayer (mp.js does the work; every argument is checked there) ----------
let protocolCache = 0;
async function ownProtocol() {
  if (protocolCache) return protocolCache;
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/version', timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => { try { protocolCache = Number(JSON.parse(body).protocol) || 0; } catch { /* asked again next time */ } resolve(protocolCache); });
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}
const mpCall = (f, fallback) => async (_e, arg) => { try { return mp ? await f(arg) : fallback; } catch (e) { log('mp call failed: ' + (e && e.message)); return fallback; } };
ipcMain.handle('mp:info', mpCall(() => mp.info(), null));
ipcMain.handle('mp:host-open', mpCall((o) => mp.hostOpen(o), { ok: false, error: 'off' }));
ipcMain.handle('mp:host-update', mpCall((d) => mp.hostUpdate(d), false));
ipcMain.handle('mp:leave', mpCall(() => mp.leave(), false));
ipcMain.handle('mp:join-lan', mpCall((a) => mp.joinLan(a), { ok: false, error: 'off' }));
ipcMain.handle('mp:join-steam', mpCall((id) => mp.joinSteam(id), { ok: false, error: 'off' }));
ipcMain.handle('mp:lobbies', mpCall(() => mp.lobbies(), []));
ipcMain.handle('mp:invite', mpCall(() => mp.invite(), false));
ipcMain.handle('mp:probe', mpCall(() => mp.probe(), false));

/** The host is quitting: friends' matches end where they stand and they get the end screen (the server's /api/host/stop), then the server may go. */
function tellGuestsWeLeave() {
  return new Promise((resolve) => {
    if (!mp || !mp.isHosting() || !server || server.exitCode !== null) { resolve(); return; }
    const req = http.request({ host: '127.0.0.1', port, path: '/api/host/stop', method: 'POST', timeout: 1500, headers: { 'Content-Length': 0 } }, (res) => { res.resume(); res.on('end', () => setTimeout(resolve, 400)); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.end();
  });
}

// ---------- window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540, show: false, backgroundColor: '#1b1612', autoHideMenuBar: true, title: 'Keepfall',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.removeMenu();
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { mainWindow = null; });
  let farewell = false;
  win.on('close', (e) => {
    if (farewell || !mp || !mp.isHosting()) return;
    e.preventDefault(); // a moment for the friends' end screens to go out
    farewell = true;
    tellGuestsWeLeave().then(() => { if (!win.isDestroyed()) win.close(); });
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The page's process died (out of memory, GPU crash): load it again once instead of leaving a blank window; a second crash within a minute ends the game with a message.
  let lastGone = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    crashLog('render-process-gone', details && details.reason);
    const now = Date.now();
    if (now - lastGone < 60000) { dialog.showErrorBox('Keepfall', 'The game window stopped working (' + (details && details.reason) + ').'); app.quit(); return; }
    lastGone = now;
    if (!win.isDestroyed()) win.loadURL('http://' + HOST + '/');
  });
  win.webContents.on('will-navigate', (e, url) => { if (new URL(url).host !== HOST) e.preventDefault(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL('http://' + HOST + '/');
  return win;
}

async function boot() {
  port = await freePort();
  guestPort = await freePort();
  joinPort = await freePort();
  // keepfall.localhost -> the server's port. *.localhost counts as a secure context, and the origin never changes between launches.
  // join.keepfall.localhost -> this shell's door to a friend's game (only the hub connection of a guest goes there).
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP ' + JOIN_HOST + ' 127.0.0.1:' + joinPort + ', MAP ' + HOST + ' 127.0.0.1:' + port);
  app.commandLine.appendSwitch('disable-features', 'Translate');
  await app.whenReady();
  // Nothing leaves the machine: only the local page and the local hub are allowed.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    let ok = false;
    try {
      const u = new URL(details.url);
      ok = u.host === HOST || u.host === JOIN_HOST || ['devtools:', 'data:', 'blob:', 'file:', 'chrome-extension:'].includes(u.protocol);
    } catch { /* malformed: block */ }
    if (!ok) { blocked.push(details.url.slice(0, 200)); log('blocked ' + details.url.slice(0, 200)); }
    cb({ cancel: !ok });
  });
  startSteam();
  try { startServer(port); } catch (e) { dialog.showErrorBox('Keepfall', String(e.message || e)); app.quit(); return; }
  if (!(await waitForServer(port, 40000))) { stopServer(); dialog.showErrorBox('Keepfall', 'The game server did not start.'); app.quit(); return; }
  mp = createMp({ log, guestPort, joinPort, build, protocol: ownProtocol, steam: () => steam, argv: process.argv,
    notify: (event) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mp:event', event); } });
  log('ready port=' + port + ' guest=' + guestPort + ' join=' + joinPort + ' build=' + build);
  createWindow();
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (mp) mp.dispose(); stopServer(); });
process.on('exit', stopServer);
if (gotLock) boot().catch((e) => { dialog.showErrorBox('Keepfall', String((e && e.message) || e)); app.quit(); });
