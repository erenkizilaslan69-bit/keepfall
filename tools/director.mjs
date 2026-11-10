// Director (cameraman) recorder: films a real match from the hidden director view (client/src/director.ts) for trailers and store footage.
//   node tools/director.mjs <client url> --key <Keepfall__DirectorKey> [--room CODE] [--lang en] [--minutes 25] [--out art/promo/director/<date>]
//                          [--demo] [--no-record] [--encoder x264|nvenc]
//   node tools/director.mjs --recut <folder>      (cut a finished recording again from its full.raw.mkv + events.json)
// Opens a HEADED kiosk Chrome on the primary 1920x1080 screen (real GPU, 60 fps), records the whole screen with ffmpeg (ddagrab), and when the match is
// over writes: full.mp4 (the whole match), one clip per event the camera filmed (NN-<event>-m<minute>.mp4: castle-fall, three-way-siege, gate-battle,
// road-clash, phantom-army, army-march), events.json and report.txt (frame rate, CPU of Chrome and ffmpeg). The folder is git-ignored (art/promo/).
// The screen is taken over while it records: nothing else should come in front of the window.
// --demo: a local trial on the Vite dev client (needs a dev server with Keepfall__AllowSpeedControl=true): a headless player tab makes a room with three
// Medium bots, the preparation runs at x20 and the war at x1. Without --demo it waits for (or takes, with --room) a running match on that server.
// Details: docs/kameraman.md.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const flag = (n) => args.includes(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
if (opt('--recut', null)) {
  const out = resolve(opt('--recut'));
  const saved = JSON.parse(readFileSync(join(out, 'events.json'), 'utf8'));
  finish({ out, raw: join(out, 'full.raw.mkv'), events: saved.events, recStart: saved.recordingStartedAt, perf: saved.perf, cores: saved.cores, title: `Director recording ${out} (re-cut)` });
  process.exit(0);
}
const BASE = args[0] && !args[0].startsWith('--') ? args[0] : null;
const KEY = opt('--key', process.env.KEEPFALL_DIRECTOR_KEY ?? null);
if (!BASE || !KEY) { console.log('usage: node tools/director.mjs <client url> --key <key> [--room CODE] [--lang en] [--minutes 25] [--out dir] [--demo] [--no-record]'); process.exit(2); }
const ROOM = opt('--room', null), LANG = opt('--lang', 'en'), MAX_MIN = Number(opt('--minutes', '25'));
const RECORD = !flag('--no-record'), DEMO = flag('--demo');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const d0 = new Date(), pad = (n) => String(n).padStart(2, '0');
const stamp = `${d0.getFullYear()}${pad(d0.getMonth() + 1)}${pad(d0.getDate())}-${pad(d0.getHours())}${pad(d0.getMinutes())}`; // (local time)
const OUT = resolve(opt('--out', join(root, 'art', 'promo', 'director', stamp)));
mkdirSync(OUT, { recursive: true });

// ---- a Chrome over CDP -------------------------------------------------------------------------
async function chrome({ headed, width = 1920, height = 1080 }) {
  const port = 9700 + Math.floor(Math.random() * 250);
  const flags = headed
    ? ['--kiosk', '--window-position=0,0', `--window-size=${width},${height}`, '--force-device-scale-factor=1', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
      '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion', '--disable-infobars']
    : ['--headless=new', `--window-size=1280,720`];
  const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-director-'))}`,
    '--no-first-run', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--lang=en-US', ...flags, 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${LANG}');localStorage.setItem('keepfall_name','Director')}catch(e){}` });
  const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  return {
    proc, send, js,
    goto: (u) => send('Page.navigate', { url: u }),
    waitFor: async (expr, sec) => { for (let i = 0; i < sec * 2; i++) { try { if (await js(expr)) return true; } catch { /* */ } await sleep(500); } return false; },
    close: () => { try { ws.close(); } catch { /* */ } spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); },
  };
}
const withQuery = (u, q) => u + (u.includes('?') ? '&' : '?') + q;

// ---- the demo match (dev client only) ----------------------------------------------------------
let player = null;
if (DEMO) {
  player = await chrome({ headed: false });
  await player.goto(BASE);
  if (!(await player.waitFor('!!window.keepfallNet && !!document.querySelector("#quick")', 40))) { console.error('--demo needs the Vite dev client (window.keepfallNet)'); process.exit(1); }
  const made = await player.js(`(async () => { const n = keepfallNet; let r = await n.createRoom('Player');
    if (!r.ok) return 'create ' + r.error;
    for (const l of ['medium', 'medium', 'medium']) { r = await n.addBot(l); if (!r.ok) return 'bot ' + r.error; }
    r = await n.setReady(true); r = await n.startMatch(); return r.ok ? 'ok ' + n.roomCode : 'start ' + r.error; })()`);
  if (!String(made).startsWith('ok')) { console.error('demo match:', made); process.exit(1); }
  log('demo match', made.slice(3), '(a headless player tab + 3 Medium bots)');
}

// ---- the director page ---------------------------------------------------------------------------
const dir = await chrome({ headed: RECORD });
await dir.goto(withQuery(BASE, `director=${encodeURIComponent(KEY)}&lang=${LANG}${ROOM ? '&room=' + ROOM : ''}${player ? '&room=' + (await player.js('keepfallNet.roomCode')) : ''}`));
await dir.waitFor('!!window.keepfallDirector', 30);
for (;;) {
  const s = await dir.js('JSON.stringify({ room: keepfallDirector.room ?? null, error: keepfallDirector.error ?? null })').then((x) => JSON.parse(x ?? '{}'));
  if (s.error) { console.error('director refused: is the server started with Keepfall__DirectorKey (16+ characters), the same key, and not a hosted/Steam server?'); dir.close(); player?.close(); process.exit(1); }
  if (s.room) { log('watching room', s.room); break; }
  await sleep(2000);
}
await dir.waitFor('!!document.querySelector("#stage canvas")', 60);
await sleep(3000);

// ---- recording -----------------------------------------------------------------------------------
const raw = join(OUT, 'full.raw.mkv');
let recorder = null, recStart = 0;
function startRecording() {
  const enc = opt('--encoder', 'x264') === 'nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'constqp', '-qp', '16', '-g', '60']
    : ['-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '16', '-g', '60'];
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=60:draw_mouse=0,hwdownload,format=bgra',
    ...enc, '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'pipe', 'inherit'] });
  // the first encoded frame tells when the recording's second 0 was (wall clock)
  ff.stdout.on('data', (d) => {
    const m = /frame=(\d+)/.exec(String(d));
    if (m && !recStart && Number(m[1]) > 0) recStart = Date.now() - (Number(m[1]) / 60) * 1000 - 500; // (progress is written every ~0.5 s)
  });
  return ff;
}
const front = () => { try { spawn('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate(${dir.proc.pid})`], { stdio: 'ignore', windowsHide: true }).unref(); } catch { /* */ } dir.send('Page.bringToFront'); };
let keepFront = null;
if (RECORD) { front(); keepFront = setInterval(front, 3000); recorder = startRecording(); log('recording', raw); }

// demo: the preparation at x20, the war at x1 (the host is the headless player)
let sped = false;
const perf = { samples: [], cpu: [] };
const cpuOf = (pid) => { const r = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid} or ParentProcessId=${pid}" | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum`], { encoding: 'utf8' }); return Number(r.stdout.trim().replace(',', '.')) || 0; };
const cores = Number(spawnSync('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors'], { encoding: 'utf8' }).stdout.trim()) || 1;
let lastCpu = null, lastFrames = null;
const t0 = Date.now();
for (;;) {
  await sleep(5000);
  const s = JSON.parse(await dir.js('JSON.stringify({ phase: keepfallDirector.phase, frames: keepfallDirector.cam?.frames ?? 0, n: keepfallDirector.log.length })') ?? '{}');
  const now = Date.now();
  if (lastFrames) perf.samples.push((s.frames - lastFrames.f) / ((now - lastFrames.t) / 1000));
  lastFrames = { f: s.frames, t: now };
  if (RECORD) {
    const c = { chrome: cpuOf(dir.proc.pid), ff: cpuOf(recorder.pid), t: now };
    if (lastCpu) perf.cpu.push({ chrome: (c.chrome - lastCpu.chrome) / ((now - lastCpu.t) / 1000) / cores * 100, ff: (c.ff - lastCpu.ff) / ((now - lastCpu.t) / 1000) / cores * 100 });
    lastCpu = c;
  }
  if (player) {
    const p = JSON.parse(await player.js('JSON.stringify({ phase: keepfallUi?.castle?.phase ?? null, left: keepfallUi?.castle ? keepfallUi.castle.prepSeconds - keepfallUi.castle.elapsedSeconds : null })') ?? '{}');
    if (!sped && p.phase === 'preparation' && p.left > 40) { sped = true; await player.js('keepfallNet.setSpeed(20).then(() => 1)'); log('demo: preparation at x20'); }
    if (sped && (p.phase !== 'preparation' || p.left <= 25)) { sped = false; await player.js('keepfallNet.setSpeed(1).then(() => 1)'); log('demo: x1'); }
  }
  if (s.n !== undefined && (now - t0) % 60000 < 5000) log(`phase ${s.phase}, events so far ${s.n}`);
  if (s.phase === 'ended' || now - t0 > MAX_MIN * 60000) { log(s.phase === 'ended' ? 'the match is over' : `stopped after ${MAX_MIN} min`); break; }
}
await sleep(4000);
const events = JSON.parse(await dir.js('JSON.stringify(keepfallDirector.log)') ?? '[]');
if (keepFront) clearInterval(keepFront);
if (recorder) { recorder.stdin.write('q'); await new Promise((r) => recorder.on('close', r)); }
dir.close(); player?.close();
writeFileSync(join(OUT, 'events.json'), JSON.stringify({ recordingStartedAt: recStart, perf, cores, events }, null, 2));

finish({ out: OUT, raw, events, recStart, perf, cores, title: `Director recording ${stamp}  (${BASE}${ROOM ? ', room ' + ROOM : ''}${DEMO ? ', demo' : ''})` });
process.exit(0);

// ---- cutting (also: --recut <folder>, to finish a recording whose cutting was cut short) ----------
function finish({ out, raw, events, recStart, perf, cores, title }) {
  const ffmpeg = (a) => spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: 'inherit' }).status === 0;
  const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60', '-movflags', '+faststart'];
  const lines = [];
  let cutOk = true;
  if (existsSync(raw)) {
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw], { encoding: 'utf8' }).stdout.trim()) || 0;
    let n = 0;
    // the event clips first (they are what is wanted most), then the whole match
    for (const e of events.filter((x) => x.shot && x.shotAt).sort((a, b) => a.shotAt - b.shotAt)) {
      const from = Math.max(0, (e.shotAt - recStart) / 1000 - 0.5);
      const to = Math.min(dur, ((e.shotEnd ?? e.end) - recStart) / 1000 + 1.0);
      if (to - from < 2) continue;
      const name = `${String(++n).padStart(2, '0')}-${e.type}-m${String(e.minute).padStart(2, '0')}.mp4`;
      log('clip', name);
      cutOk = ffmpeg(['-ss', from.toFixed(2), '-i', raw, '-t', (to - from).toFixed(2), ...ENC, join(out, name)]) && cutOk;
      lines.push(`${name}  ${(to - from).toFixed(1)} s  (from ${from.toFixed(1)} s of full.mp4, score ${e.score})`);
    }
    log('encoding full.mp4');
    cutOk = ffmpeg(['-i', raw, ...ENC, join(out, 'full.mp4')]) && cutOk;
    if (cutOk) rmSync(raw, { force: true }); // (kept when something failed: --recut <folder> tries again)
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const report = [
    title,
    `events: ${events.length} (filmed ${events.filter((e) => e.shot).length}); by type: ${Object.entries(events.reduce((m, e) => ((m[e.type] = (m[e.type] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    perf?.samples?.length ? `page frame rate: average ${avg(perf.samples).toFixed(1)}, lowest ${Math.min(...perf.samples).toFixed(1)} fps` : 'page frame rate: not measured',
    perf?.cpu?.length ? `CPU (share of all ${cores} logical cores): Chrome ${avg(perf.cpu.map((c) => c.chrome)).toFixed(1)} %, ffmpeg ${avg(perf.cpu.map((c) => c.ff)).toFixed(1)} %` : 'CPU: not measured',
    '', 'clips:', ...lines,
  ].join('\n');
  writeFileSync(join(out, 'report.txt'), report + '\n');
  console.log('\n' + report + '\n\n' + out);
  if (existsSync(join(out, 'full.mp4'))) console.log('full.mp4', (statSync(join(out, 'full.mp4')).size / 1e6).toFixed(0), 'MB');
}
