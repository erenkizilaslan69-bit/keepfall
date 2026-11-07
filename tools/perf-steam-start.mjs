// Start-up time and memory of the packed Steam demo: exe launched -> window, -> main menu drawn, -> quick match: map up; then the memory of the processes
// (working set / private bytes per process) while a match runs. Usage: [MEMWATCH=6] [KEEPFALL_PACKAGE_DIR=<folder>] node tools/perf-steam-start.mjs [runs=3]
import { execFileSync, execSync } from 'node:child_process';
import { launch, sleep } from './steam-launch.mjs';
const RUNS = Number(process.argv[2] ?? 3);
const PS = "Get-Process Keepfall,Keepfall.Server -ErrorAction SilentlyContinue | ForEach-Object { $_.Id.ToString() + ':' + $_.ProcessName + '=' + [math]::Round($_.WorkingSet64/1MB) + 'ws/' + [math]::Round($_.PrivateMemorySize64/1MB) + 'priv' }";
const pidsNow = () => execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Process Keepfall,Keepfall.Server -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }; exit 0'], { encoding: 'utf8' }).split(/\s+/).filter(Boolean);
let ignore = new Set();
const mem = () => { try { const rows = execFileSync('powershell', ['-NoProfile', '-Command', PS], { encoding: 'utf8' }).trim().split(/\r?\n/); const by = {}; for (const r of rows) { const [n, v] = r.split('='); const [ws, pr] = v.split('ws/'); by[n.replace(/^d+:/, "")] ??= [0, 0, 0]; by[n][0] += Number(ws); by[n][1] += parseInt(pr); by[n][2]++; } return Object.entries(by).map(([n, [ws, pr, c]]) => `${n}x${c} ws ${ws} MB / private ${pr} MB`).join('; '); } catch { return '?'; } };
for (let r = 1; r <= RUNS; r++) {
  ignore = new Set(pidsNow()); // (other sessions' copies of the game or server are not ours)
  const t0 = Date.now();
  const app = await launch('perf' + r, 9450 + r);
  const tWindow = Date.now() - t0;
  await app.waitFor(`(() => { localStorage.setItem('keepfall_tutorial_seen','true'); localStorage.setItem('keepfall_tutorial_done','true'); localStorage.setItem('keepfall_lang','en'); return true; })()`, 30);
  await app.waitFor(`!!document.querySelector('#quick')`, 60); const tFirstMenu = Date.now() - t0;
  await app.js('location.reload()');
  const t1 = Date.now();
  await app.waitFor(`!!document.querySelector('#quick')`, 60);
  const tMenu = Date.now() - t1;
  await sleep(1500);
  const t2 = Date.now();
  await app.js(`document.querySelector('#quick').click()`);
  await app.waitFor(`!!document.querySelector('canvas') && document.documentElement.classList.contains('in-game')`, 90);
  const tMatch = Date.now() - t2;
  await sleep(8000);
  console.log(`run ${r}: window ${tWindow} ms, first menu ${tFirstMenu} ms (from launch), menu after reload ${tMenu} ms, quick match -> map ${tMatch} ms`);
  console.log(`  +8 s in a match: ${mem()}`);
  for (let k = 0; k < Number(process.env.MEMWATCH ?? 0); k++) { await sleep(10000); console.log(`  +${18 + k * 10} s: ${mem()}`); }
  try { app.ws.close(); } catch { /* */ }
  for (const pid of pidsNow().filter((x) => !ignore.has(x))) { try { execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' }); } catch { /* gone */ } } await sleep(2500);
}
