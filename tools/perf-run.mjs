// Performance run: plays one whole match (1 human + N bots) in headless Chrome and records frame times, JS heap, DOM nodes, Phaser object counts,
// SignalR traffic and where the frame goes (per-step timings from error-report.guarded). Needs the dev server and the Vite dev client
// (see docs/steam-oncesi-performans.md). Usage:
//   node tools/perf-run.mjs [label=run] [speed=5] [WxH=1280x720] [low=0|1] [bots=3] [maxRealSeconds=900] [client url]
// Output: art/shots/perf/<label>.json (not in git) and a summary on stdout. Software GL: absolute fps only means something next to another run.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [LABEL = 'run', SPEED = '5', SIZE = '1280x720', LOW = '0', BOTS = '3', MAXREAL = '900', URL = 'http://localhost:5174/'] = process.argv.slice(2);
const [W, H] = SIZE.split('x').map(Number);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-perf-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--no-first-run',
  ...(process.env.GPU === '1' ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']), '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--enable-precise-memory-info', '--js-flags=--expose-gc', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const exceptions = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') exceptions.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n').slice(0, 2).join(' | '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// In-page sampler: every frame delta, long tasks, WebSocket traffic. Installed before the page's own scripts run.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const P = window.__perf = { frames: [], long: [], wsIn: 0, wsOut: 0, wsMsgs: 0, wsBig: 0 };
  let last = performance.now();
  const loop = () => { const n = performance.now(); P.frames.push(n - last); last = n; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([Math.round(e.duration), Math.round(e.startTime)]); }).observe({ entryTypes: ['longtask'] }); } catch {}
  const NativeWS = window.WebSocket;
  window.WebSocket = function (...a) {
    const s = new NativeWS(...a);
    s.addEventListener('message', (m) => { const len = typeof m.data === 'string' ? m.data.length : (m.data.byteLength ?? m.data.size ?? 0); P.wsIn += len; P.wsMsgs++; if (len > 20000) P.wsBig++; });
    const send = s.send.bind(s); s.send = (d) => { P.wsOut += typeof d === 'string' ? d.length : (d.byteLength ?? 0); send(d); };
    return s;
  };
  window.WebSocket.prototype = NativeWS.prototype; Object.assign(window.WebSocket, NativeWS);
  window.__kfProf = {};
})()` });

const q = LOW === '1' ? '?nodebug=1&low=1' : '?nodebug=1';
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); localStorage.setItem('keepfall_lang', 'tr'); ${LOW === '1' ? "localStorage.setItem('keepfall_low','1');" : ''} 1`);
await send('Page.navigate', { url: URL + q });
await sleep(3500);
if (process.env.CPUPROF === '1') { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 500 }); await send('Profiler.start'); }
const t0 = Date.now();
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Perf'); const lv = ['medium', 'hard', 'medium', 'easy']; for (let i = 0; i < ${BOTS}; i++) await n.addBot(lv[i]); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 200; i++) { if (window.keepfallScene?.ready) return 1; await new Promise(r => setTimeout(r, 300)); } return 0; })()`);
const loadMs = Date.now() - t0;
if (process.env.CPUPROF === '1') { // where the lobby -> map transition spends its time (self time per function, ms)
  const { result } = await send('Profiler.stop'); const prof = result.profile; const self = new Map();
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  prof.samples.forEach((sid, i) => { const n = byId.get(sid); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (prof.timeDeltas[i] ?? 0) / 1000); });
  console.log('CPU self time during start (ms):'); console.table([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, ms: Math.round(v) })));
}
await run(`window.keepfallNet.setSpeed(${SPEED}); 1`);

const quant = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const stat = (frames) => { const s = [...frames].sort((a, b) => a - b); return { n: s.length, p50: +quant(s, .5).toFixed(1), p95: +quant(s, .95).toFixed(1), p99: +quant(s, .99).toFixed(1), max: Math.round(s.at(-1) ?? 0), over50: s.filter((x) => x > 50).length, over100: s.filter((x) => x > 100).length }; };

const phases = { preparation: [], war: [] }, samples = [];
let lastProf = '{}', ended = false, tick = 0, prevWs = { in: 0, msgs: 0 };
const start = Date.now();
while (!ended && Date.now() - start < Number(MAXREAL) * 1000) {
  const out = await run(`(async () => {
    const s = window.keepfallScene, n = window.keepfallNet, P = window.__perf; const c = s?.state;
    const frames = P.frames.splice(0), long = P.long.splice(0); ${process.env.GC === '1' ? 'if (window.gc) window.gc();' : ''}
    const o = { frames, long, wsIn: P.wsIn, wsMsgs: P.wsMsgs, wsBig: P.wsBig, wsOut: P.wsOut, dom: document.getElementsByTagName('*').length,
      prof: JSON.stringify(window.__kfProf), heap: performance.memory ? performance.memory.usedJSHeapSize : 0, ended: !!document.querySelector('.screen.end') };
    if (s) {
      o.hasScene = true; o.children = s.children.length; o.tweens = s.tweens.getTweens().length; o.textures = s.sys.game.textures.getTextureKeys().length; o.anims = s.anims.anims.size;
      o.timers = s.time._active?.length ?? 0; o.listeners = s.events.eventNames().length;
    }
    if (c) {
      o.phase = c.phase; o.t = Math.round(c.elapsedSeconds); o.elim = c.eliminated; o.armies = c.war?.armies?.length ?? 0;
      o.soldiers = c.units.reduce((a, u) => a + u.soldiers, 0);
      if (c.phase === 'ended') o.ended = true;
      if (!c.eliminated && c.phase !== 'ended') {
        const unit = (id) => c.units.find((x) => x.id === id); const idle = c.jobs.find((j) => j.job === 'idle')?.count ?? 0;
        if (!window.__init) { window.__init = 1; for (const j of ['blacksmith', 'miner', 'lumberjack', 'farmer']) await n.moveWorkers('idle', j, j === 'farmer' ? 3 : 2); }
        for (const id of ['kilicli', 'okcu', 'mizrakci', 'kalkanli']) { const u = unit(id); if (u && c.queue.length < 3 && c.resources.iron >= u.iron && c.resources.wood >= u.wood) { await n.queueWeapon(id, 1); break; } }
        for (const id of ['kilicli', 'okcu', 'mizrakci', 'kalkanli']) { const u = unit(id); if (u && u.weapons > 0 && c.elapsedSeconds > 100) { await n.armWorkers(id, Math.min(u.weapons, idle > 0 ? idle : 2), idle > 0 ? 'idle' : 'lumberjack'); } }
        if (c.phase === 'war') {
          const home = Object.fromEntries(c.units.filter((u) => u.soldiers > 0).map((u) => [u.id, u.soldiers])); const total = Object.values(home).reduce((a, b) => a + b, 0);
          const seats = s.layout.regions.map((r) => r.seat).filter((x) => x && x !== n.seat);
          if (total >= 6 && c.war.armies.length < 3 && Math.random() < 0.5) await n.sendArmy(seats[Math.floor(Math.random() * seats.length)], home, {}, null, 'attack');
        }
      }
    }
    return JSON.stringify(o); })()`);
  let o; try { o = JSON.parse(out); } catch { console.log('bad sample', String(out).slice(0, 200)); await sleep(2000); continue; }
  if (!o.hasScene) { if (samples.length) { ended = true; break; } await sleep(1000); continue; }
  lastProf = o.prof;
  const ph = o.phase === 'war' ? 'war' : 'preparation';
  phases[ph].push(...o.frames);
  const wsDelta = { bytes: o.wsIn - prevWs.in, msgs: o.wsMsgs - prevWs.msgs }; prevWs = { in: o.wsIn, msgs: o.wsMsgs };
  samples.push({ real: Math.round((Date.now() - start) / 1000), phase: o.phase, t: o.t, heapMB: +(o.heap / 1048576).toFixed(1), dom: o.dom, children: o.children, tweens: o.tweens, textures: o.textures, anims: o.anims,
    armies: o.armies, soldiers: o.soldiers, frame: stat(o.frames), longTasks: o.long.length, longMax: Math.max(0, ...o.long.map((l) => l[0])), longList: o.long.filter((l) => l[0] >= 100).map((l) => `${l[0]}ms@${Math.round(l[1] / 1000)}s`), ws: wsDelta });
  ended = o.ended;
  if (++tick % 6 === 0) console.log(`[${LABEL}] real ${samples.at(-1).real}s ${o.phase} t=${o.t} heap ${samples.at(-1).heapMB}MB dom ${o.dom} children ${o.children} fps p50 ${samples.at(-1).frame.p50}ms p95 ${samples.at(-1).frame.p95}ms`);
  await sleep(1800);
}
const prof = JSON.parse(lastProf || '{}');
const profRows = Object.entries(prof).map(([k, v]) => ({ step: k, totalMs: Math.round(v.ms), n: v.n, avgMs: +(v.ms / Math.max(1, v.n)).toFixed(3), maxMs: +v.max.toFixed(1) })).sort((a, b) => b.totalMs - a.totalMs).slice(0, 14);
const heap = samples.map((s) => s.heapMB);
const total = samples.at(-1);
const result = {
  label: LABEL, speed: SPEED, size: SIZE, low: LOW, bots: BOTS, loadMs, endedNaturally: ended, realSeconds: samples.at(-1)?.real,
  prep: stat(phases.preparation), war: stat(phases.war),
  heapMB: { first: heap[2], max: Math.max(...heap), last: heap.at(-1) }, domMax: Math.max(...samples.map((s) => s.dom)), childrenMax: Math.max(...samples.map((s) => s.children ?? 0)),
  tweensMax: Math.max(...samples.map((s) => s.tweens ?? 0)), texturesLast: total?.textures, longTasks: samples.reduce((a, s) => a + s.longTasks, 0), longMax: Math.max(...samples.map((s) => s.longMax)),
  wsMB: +((prevWs.in) / 1048576).toFixed(2), wsMsgs: prevWs.msgs, profile: profRows, exceptions: [...new Set(exceptions)].slice(0, 10), samples,
};
mkdirSync(join(root, 'art', 'shots', 'perf'), { recursive: true });
writeFileSync(join(root, 'art', 'shots', 'perf', `${LABEL}.json`), JSON.stringify(result, null, 1));
const { samples: _s, profile, ...brief } = result;
console.log(JSON.stringify(brief, null, 1));
console.table(profile);
console.log('long tasks >=100ms:', samples.flatMap((s) => s.longList.map((l) => `${l}(${s.phase} t${s.t})`)).join(' '));
console.log('GL:', await run(`(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`));
ws.close(); chrome.kill(); process.exit(0);
