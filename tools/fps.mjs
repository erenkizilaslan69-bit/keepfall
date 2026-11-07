// Frame rate of the map in headless Chrome (software GL, so the numbers only mean something next to each other): the same 4-player match
// measured idle and with three crowded battles. Needs the dev server and the Vite dev client; usage: node tools/fps.mjs [client url] [seconds]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';
const SECONDS = Number(process.argv[3] ?? 10);
const [W, H] = (process.env.SIZE ?? '1280x720').split('x').map(Number); // env: SIZE=1920x1080, GPU=1 (real graphics card instead of software GL), LOW=1 (low graphics)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-fps-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${W},${H}`, '--no-first-run',
  ...(process.env.GPU === '1' ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']), '--disable-renderer-backgrounding', '--disable-background-timer-throttling', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); localStorage.setItem('keepfall_lang', 'tr'); 1`);
await send('Page.navigate', { url: URL + (process.env.LOW === '1' ? '?low=1&nodebug=1' : '?nodebug=1') });
await sleep(3500);

await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);

const measure = (label) => run(`(async () => {
  const g = window.keepfallScene.sys.game; const f0 = g.getFrame(); const t0 = performance.now();
  const samples = []; let last = performance.now();
  await new Promise((resolve) => { const tick = () => { const now = performance.now(); samples.push(now - last); last = now; if (now - t0 < ${SECONDS * 1000}) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
  const dt = (performance.now() - t0) / 1000; const sorted = [...samples].sort((a, b) => a - b);
  return JSON.stringify({ label: ${JSON.stringify('LABEL')}, fps: +((g.getFrame() - f0) / dt).toFixed(1), worstFrameMs: Math.round(sorted.at(-1)), p50FrameMs: +sorted[Math.floor(sorted.length * .5)].toFixed(1), p95FrameMs: +sorted[Math.floor(sorted.length * .95)].toFixed(1), p99FrameMs: +sorted[Math.floor(sorted.length * .99)].toFixed(1), over50: sorted.filter((x) => x > 50).length, children: window.keepfallScene.children.length });
})()`).then((s) => console.log(label, s));

if (process.env.THROTTLE) await send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }); // THROTTLE=4: a CPU four times slower (weak laptop)
await run('window.__kfProf = {}; 1');
await measure('idle');
// three battles of 24 soldiers a side at once, near our castle, replayed for the whole measurement
await run(`(async () => {
  const s = window.keepfallScene; const now = s.gameNow().now;
  const side = (seat, color, n, unit) => ({ seat, color, name: 'x', soldiers: Array.from({ length: n }, (_, i) => ({ unitId: ['kilicli', 'okcu', 'mizrakci', 'kalkanli'][i % 4], row: i % 4 === 1 ? 'second' : 'first' })) });
  const at = [{ x: 10, y: 8 }, { x: 16, y: 10 }, { x: 12, y: 14 }];
  at.forEach((p, i) => s.playBattle({ id: 'fps' + i, kind: 'field', at: p, facing: { x: 1, y: 0 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 400, fightSeconds: 200,
    sides: [side(1, 'blue', 24), side(2, 'red', 24)],
    hits: Array.from({ length: 300 }, (_, k) => [k * 0.4, k % 24, 24 + (k * 7) % 24]).flat(), deaths: [], advances: [], winner: 'defender' }));
  return 1; })()`);
await sleep(1500);
await run('window.__kfProf = {}; 1');
if (process.env.CPUPROF === '1') { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
await measure('crowded');
// every Graphics object on the display list replays all its commands (and triangulates its fills) EVERY frame: list the heavy ones
console.log('graphics:', await run(`JSON.stringify(window.keepfallScene.children.list.filter((o) => o.type === 'Graphics').map((g) => ({ cmds: g.commandBuffer.length, depth: Math.round(g.depth), x: Math.round(g.x), y: Math.round(g.y), visible: g.visible })).sort((a, b) => b.cmds - a.cmds).slice(0, 12))`));
if (process.env.CPUPROF === '1') { // self time per function while the crowded battles run
  const prof = (await send('Profiler.stop')).result.profile; const byId = new Map(prof.nodes.map((n) => [n.id, n])); const self = new Map(); let sum = 0;
  prof.samples.forEach((sid, i) => { const n = byId.get(sid); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`; const d = (prof.timeDeltas[i] ?? 0) / 1000; sum += d; self.set(k, (self.get(k) ?? 0) + d); });
  console.table([...self].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => ({ fn: k, ms: Math.round(v), pct: +(v * 100 / sum).toFixed(1) })));
}
console.table(Object.entries(JSON.parse(await run('JSON.stringify(window.__kfProf)'))).map(([k, v]) => ({ step: k, avgMs: +(v.ms / v.n).toFixed(3), maxMs: +v.max.toFixed(1) })).sort((a, b) => b.avgMs - a.avgMs).slice(0, 8));
ws.close();
chrome.kill();
process.exit(0);
