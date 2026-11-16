// How long the packed desktop game takes to open: from the launch to (1) the first page in the window (the loading screen in the new shell, the game itself in
// the old one) and (2) the main menu ready to click (the Play button there and the loading screen gone or fading out). Cold profile every run.
//   node tools/measure-startup.mjs [runs=3]         (steam-build/Keepfall/Keepfall.exe; KEEPFALL_PACKAGE_DIR for another package)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exe, sleep } from './steam-launch.mjs';

const RUNS = Number(process.argv[2] ?? 3);
if (!existsSync(exe)) { console.error('Run node tools/pack-steam.mjs first.'); process.exit(1); }

async function once(i) {
  const userData = mkdtempSync(join(tmpdir(), 'kf-start-'));
  const log = join(userData, 'shell.log');
  const port = 9600 + i;
  const t0 = performance.now();
  const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: 'ignore', env: { ...process.env, KEEPFALL_SHELL_LOG: log } });
  let firstPage = null, menu = null, ws = null, id = 0, stages = '';
  const pending = new Map();
  try {
    while (performance.now() - t0 < 60_000 && menu === null) {
      let targets = [];
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* not up yet */ }
      const page = targets.find((t) => t.type === 'page');
      if (page && firstPage === null) firstPage = performance.now() - t0;
      const game = targets.find((t) => t.type === 'page' && t.url.includes('keepfall.localhost'));
      if (game && !ws) {
        ws = new WebSocket(game.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r));
        ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
      }
      if (ws) {
        const r = await new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: `!!document.querySelector('#play') && document.querySelector('#play').offsetParent !== null && (!document.getElementById('kf-splash') || document.getElementById('kf-splash').classList.contains('kfs-out')) && JSON.stringify(window.kfSplash ? window.kfSplash.timing : {})`, returnByValue: true } })); });
        const v = r.result?.result?.value; if (typeof v === 'string') { menu = performance.now() - t0; stages = v; }
      }
      await sleep(50);
    }
  } finally {
    try { ws?.close(); } catch { /* */ }
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  }
  let shell = '';
  try { shell = readFileSync(log, 'utf8').split('\n').filter((l) => /window-shown|ready port|server-failed/.test(l)).map((l) => l.slice(13)).join(' | '); } catch { /* old shell: no such lines */ }
  return { firstPage, menu, shell, stages };
}

const rows = [];
for (let i = 0; i < RUNS; i++) {
  const r = await once(i);
  rows.push(r);
  console.log(`run ${i + 1}: first page in the window ${r.firstPage === null ? '—' : Math.round(r.firstPage) + ' ms'}, menu ready ${r.menu === null ? '— (not in 60 s)' : Math.round(r.menu) + ' ms'}${r.stages && r.stages !== '{}' ? ' page stages ' + r.stages : ''}${r.shell ? '   [' + r.shell + ']' : ''}`);
  await sleep(1500);
}
const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null; };
console.log(`median: first page ${med('firstPage')} ms, menu ready ${med('menu')} ms`);
