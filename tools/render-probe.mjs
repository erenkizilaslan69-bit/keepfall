// Measures the hosted server (or any server) from this machine without changing it: HTTP and SignalR round trips, then M concurrent matches
// (one human seat + 3 bots each, real time) and how evenly the 1 Hz castle/map pushes arrive. Usage:
//   node tools/render-probe.mjs <base-url> [matches=1] [seconds=60]
// WARX20=n keeps the war at x20 for n more seconds before the measuring begins (armies are out by then).
// With WAR=1 (a server that allows speed control, Keepfall:AllowSpeedControl=true) every room runs at x20 through its preparation, then at x1 once it is in
// the war, and only the war is measured (the gaps are cleared when the last room has reached it).
// Needs client/node_modules (@microsoft/signalr). The rooms are left to the server's abandoned-room cleanup.
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const signalR = require('@microsoft/signalr');

const BASE = (process.argv[2] ?? 'http://localhost:5080').replace(/\/$/, '');
const M = Number(process.argv[3] ?? 1), SECONDS = Number(process.argv[4] ?? 60);
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const stat = (a) => a.length ? `n=${a.length} min=${Math.min(...a).toFixed(0)} p50=${pct(a, .5).toFixed(0)} p95=${pct(a, .95).toFixed(0)} max=${Math.max(...a).toFixed(0)} ms` : 'n=0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const hub = new signalR.HubConnectionBuilder().withUrl(`${BASE}/hub`, { withCredentials: false }).configureLogging(signalR.LogLevel.Error).build();
  const t0 = performance.now();
  await hub.start();
  return { hub, connectMs: performance.now() - t0 };
}

// ---- 1. round trips ----
const http = [];
for (let i = 0; i < 30; i++) { const t = performance.now(); await (await fetch(`${BASE}/ping`)).text(); http.push(performance.now() - t); await sleep(100); }
console.log('HTTP /ping (keep-alive)        ', stat(http));
{
  const { hub, connectMs } = await connect();
  console.log(`SignalR connect (negotiate+ws)  ${connectMs.toFixed(0)} ms, transport ${hub.connection.transport?.constructor?.name ?? '?'}`);
  await hub.invoke('CreateRoom', 'probe');
  const rt = [];
  for (let i = 0; i < 40; i++) { const t = performance.now(); await hub.invoke('SetName', 'probe'); rt.push(performance.now() - t); await sleep(100); }
  console.log('SignalR invoke round trip       ', stat(rt));
  await hub.stop();
}

// ---- 2. concurrent matches ----
const rooms = [];
for (let m = 0; m < M; m++) {
  const { hub } = await connect();
  const r = { hub, name: `probe${m}`, castle: [], map: [], room: [], lastCastle: 0, lastMap: 0, lastRoom: 0, bytes: 0, started: false, war: false, at1: false };
  hub.on('CastleState', () => { const n = performance.now(); if (r.lastCastle) r.castle.push(n - r.lastCastle); r.lastCastle = n; });
  hub.on('MapState', () => { const n = performance.now(); if (r.lastMap) r.map.push(n - r.lastMap); r.lastMap = n; });
  hub.on('RoomState', (v) => {
    const n = performance.now(); if (r.lastRoom) r.room.push(n - r.lastRoom); r.lastRoom = n;
    if (process.env.WAR && v?.phase === 'war' && !r.war) { r.war = true; setTimeout(() => { r.at1 = true; void hub.invoke('SetSpeed', 1); }, Number(process.env.WARX20 ?? 0) * 1000); }
  });
  const j = await hub.invoke('CreateRoom', r.name);
  for (let b = 0; b < 3; b++) await hub.invoke('AddBot', 'medium');
  await hub.invoke('SetReady', true);
  const s = await hub.invoke('StartMatch');
  r.started = s?.ok ?? false;
  if (process.env.SPEED || process.env.WAR) await hub.invoke('SetSpeed', Number(process.env.SPEED ?? 20)); // servers that allow it only
  if (!r.started) console.log('room', m, 'did not start:', s?.error);
  rooms.push(r);
}
console.log(`${M} match(es) running (1 human + 3 Medium bots each, real time) for ${SECONDS}s ...`);
if (process.env.WAR) {
  // wait until every room is in the war (at most 6 minutes), then measure only that
  const t0 = performance.now();
  while (rooms.some((r) => !r.at1) && performance.now() - t0 < 360_000) await sleep(1000);
  console.log(`${rooms.filter((r) => r.at1).length} of ${rooms.length} rooms reached the war (and WARX20 seconds of it at x20) after ${((performance.now() - t0) / 1000).toFixed(0)}s; measuring ${SECONDS}s of war at x1`);
  await sleep(3000);
  for (const r of rooms) { r.castle.length = 0; r.map.length = 0; r.room.length = 0; }
}
await sleep(SECONDS * 1000);
const all = (k) => rooms.flatMap((r) => r[k].slice(3)); // drop the first few (warm-up)
console.log(`gap between CastleState pushes (target 1000 ms) ${stat(all('castle'))}`);
console.log(`gap between MapState pushes    (target 1000 ms) ${stat(all('map'))}`);
console.log(`gap between RoomState pushes   (target 1000 ms) ${stat(all('room'))}`);
const late = all('castle').filter((x) => x > 1500).length;
console.log(`pushes later than 1.5 s: ${late} of ${all('castle').length}`);
for (const r of rooms) await r.hub.stop();
process.exit(0);
