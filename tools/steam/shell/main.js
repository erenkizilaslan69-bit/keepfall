'use strict';
// Desktop shell of the offline Steam demo (tools/pack-steam.mjs puts it next to the self-contained game server).
//  - picks a free local port, starts the bundled server there (loopback only), waits for it, shows the client in a window;
//  - the page lives at http://keepfall.localhost (mapped to that port) so its origin, and with it localStorage, is the SAME on every launch;
//  - every request to anything else is cancelled (the demo needs no internet) and counted, so a stray CDN/font/analytics call is visible;
//  - the server is stopped when the window closes (and stops itself if this process is killed: KEEPFALL_PARENT_PID);
//  - Steamworks (steamworks.js) is started only when an app id is configured and the SDK is present; otherwise the bridge answers "not available".
const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = 'keepfall.localhost';
const root = path.resolve(__dirname, '..', '..');            // <package>/  (resources/app/../..)
const serverDir = process.env.KEEPFALL_SERVER_DIR || path.join(root, 'server');
const serverExe = path.join(serverDir, process.platform === 'win32' ? 'Keepfall.Server.exe' : 'Keepfall.Server');
const quietLog = process.env.KEEPFALL_SHELL_LOG;              // test hook: a file the shell writes its facts to
const log = (line) => { if (quietLog) { try { fs.appendFileSync(quietLog, line + '\n'); } catch { /* ignore */ } } };

let server = null, port = 0, quitting = false, mainWindow = null;
const blocked = [];

// A crash leaves a trace the player can send: <userData>/crash.log (Windows: %APPDATA%\Keepfall). Never throws.
function crashLog(what, err) {
  const text = new Date().toISOString() + ' ' + what + ': ' + ((err && (err.stack || err.message)) || String(err)) + '\n';
  log('crash ' + what);
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), text); } catch { /* the log is a nicety */ }
}
process.on('uncaughtException', (e) => { crashLog('uncaughtException', e); });

const gotLock = app.requestSingleInstanceLock();
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
    ASPNETCORE_URLS: 'http://127.0.0.1:' + p,
    DOTNET_gcServer: '0',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    Keepfall__BalancePath: path.join(serverDir, 'config', 'balance.json'),
    Keepfall__MaxRooms: '4',            // a solo demo: a few rooms are plenty (a replay/new match overlaps the old one for a moment)
    Keepfall__StatsLogSeconds: '0',
    KEEPFALL_PARENT_PID: String(process.pid),
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
  // keepfall.localhost -> the server's port. *.localhost counts as a secure context, and the origin never changes between launches.
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP ' + HOST + ' 127.0.0.1:' + port);
  app.commandLine.appendSwitch('disable-features', 'Translate');
  await app.whenReady();
  // Nothing leaves the machine: only the local page and the local hub are allowed.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    let ok = false;
    try {
      const u = new URL(details.url);
      ok = u.host === HOST || ['devtools:', 'data:', 'blob:', 'file:', 'chrome-extension:'].includes(u.protocol);
    } catch { /* malformed: block */ }
    if (!ok) { blocked.push(details.url.slice(0, 200)); log('blocked ' + details.url.slice(0, 200)); }
    cb({ cancel: !ok });
  });
  startSteam();
  try { startServer(port); } catch (e) { dialog.showErrorBox('Keepfall', String(e.message || e)); app.quit(); return; }
  if (!(await waitForServer(port, 40000))) { stopServer(); dialog.showErrorBox('Keepfall', 'The game server did not start.'); app.quit(); return; }
  log('ready port=' + port);
  createWindow();
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', stopServer);
process.on('exit', stopServer);
if (gotLock) boot().catch((e) => { dialog.showErrorBox('Keepfall', String((e && e.message) || e)); app.quit(); });
