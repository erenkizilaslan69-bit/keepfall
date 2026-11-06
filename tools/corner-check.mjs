// Armies must keep to their road round corners, also when the news stops for a while. Headless Chrome on the Vite dev client (needs the dev server and
// Vite running, see README): a match with one Easy bot, then (1) an army of ours walks a route with sharp corners (the server's news arrives once a second,
// then stops for four seconds, then goes on) and (2) a rival's army (only position and velocity, as the server tells it) walks a real road of the map that
// has a bend, with the same stop; then (3) every other kind of walker (our scout and envoy, a rival's scout and envoy, a rival's army of catapults and cavalry) and
// the room between the drawn soldiers of a column (nobody may stand closer than 26 px to a neighbour). Every frame the drawn leader's distance from the road is
// measured; the check fails if it is ever over 0.3 tiles.
// Usage: node tools/corner-check.mjs [http://localhost:5174/]   (CORNER_LIMIT=0.3 to change the limit)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';
const LIMIT = Number(process.env.CORNER_LIMIT ?? 0.3);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-corner-'))}`,
  '--window-size=1280,720', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n')[0]);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const finish = (code) => { try { ws.close(); } catch { /* closed */ } chrome.kill(); process.exit(code); };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); localStorage.setItem('keepfall_lang', 'en'); 1`);
await send('Page.navigate', { url: URL }); await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); await n.addBot('easy'); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.ready) break; await new Promise(r => setTimeout(r, 400)); } await new Promise(r => setTimeout(r, 2500)); document.getElementById('kingdom-decree')?.remove(); return 1; })()`);

const result = await run(`(async () => {
  const s = window.keepfallScene; s.apply = () => {}; s.setMap = () => {};
  const dist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0; return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t); };
  const offRoads = (p, roads) => Math.min(...roads.flatMap((pts) => pts.slice(1).map((q, i) => dist(p, pts[i], q))));
  const cumul = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return c; };
  const along = (pts, cum, d) => { let i = 0; while (i < pts.length - 2 && cum[i + 1] < d) i++; const a = pts[i], b = pts[i + 1], sg = cum[i + 1] - cum[i], t = sg ? Math.max(0, Math.min(1, (d - cum[i]) / sg)) : 0; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }; };
  const base = { targetSeat: 1, returning: false, units: [{ unitId: 'kilicli', name: 'k', count: 6 }], visionRadius: 8, fighting: false, missionKind: null, quarter: null, siteId: null };
  const walk = async (name, route, speed, mk, roads, stopFrom = 4) => {
    const cum = cumul(route), len = cum[cum.length - 1];
    let travelled = 0, worst = 0, worstAt = 0, frames = 0;
    const t0 = performance.now();
    let raf = 0, minSep = 1e9; const sample = () => { const tr = s.movers.debugTracks().find((x) => x.key.includes(name)); if (tr) { const d = offRoads(tr.shown, roads); frames++; if (d > worst) { worst = d; worstAt = (performance.now() - t0) / 1000; }
      const nearBend = route.slice(1, -1).some((v) => Math.hypot(tr.shown.x - v.x, tr.shown.y - v.y) < 2.6); // a column bunches up round a sharp corner: only the straight stretches are measured
      const sp = nearBend ? [] : s.movers.debugSprites().filter((x) => x.active && (x.x !== 0 || x.y !== 0) && x.getData('track') === tr.key); for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) { const dd = Math.hypot(sp[i].x - sp[j].x, sp[i].y - sp[j].y); if (dd < minSep) { minSep = dd; globalThis.__sepAt = ((performance.now() - t0) / 1000).toFixed(1) + 's ' + i + '-' + j + ' ' + sp[i].texture.key + '/' + sp[j].texture.key; } } } raf = requestAnimationFrame(sample); }; raf = requestAnimationFrame(sample);
    let sec = 0;
    while (travelled < len - 0.5) {
      const pos = along(route, cum, travelled);
      const stopped = sec >= stopFrom && sec < stopFrom + 4; // the news stops for four seconds
      if (!stopped) { s.movers.sync(mk(pos, travelled, route, speed)); }
      await new Promise((r) => setTimeout(r, 1000)); sec++; travelled += speed;
      if (sec > 40) break;
    }
    cancelAnimationFrame(raf);
    s.movers.sync({ ...s.state, own: [], seen: [] });
    return { name, worst: Number(worst.toFixed(3)), worstAtSec: Number(worstAt.toFixed(1)), frames, minSep: minSep > 1e8 ? null : Math.round(minSep), sepAt: globalThis.__sepAt };
  };
  const out = [];
  // 1. our army on a route with sharp corners (the server gives the whole route)
  const route = [{ x: 8, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 14 }, { x: 9, y: 15 }, { x: 9, y: 20 }, { x: 16, y: 21 }];
  for (const stop of [2, 4, 6]) out.push(await walk('own:cc1', route, 2.5, (pos, travelled, r, speed) => {
    const a = along(r, cumul(r), travelled);
    return { ...s.state, seen: [], own: [{ ...base, id: 'cc1', kind: 'army', position: pos.p, velocity: { x: a.dir.x * speed, y: a.dir.y * speed }, route: r, travelled, speed }] };
  }, [route], stop));
  // 2. a rival's army on a real road with a bend (only where it is and which way it goes)
  const bend = s.layout.roads.map((r) => r.points).filter((p) => p.length >= 3).map((p) => {
    let best = 0; for (let i = 1; i + 1 < p.length; i++) { const a = { x: p[i].x - p[i - 1].x, y: p[i].y - p[i - 1].y }, b = { x: p[i + 1].x - p[i].x, y: p[i + 1].y - p[i].y }; const c = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1); best = Math.max(best, Math.acos(Math.max(-1, Math.min(1, c)))); }
    return { p, best };
  }).sort((x, y) => y.best - x.best)[0];
  if (bend) {
    s.movers.setRoads(s.layout.roads.map((r) => r.points));
    const roadsOf = s.layout.roads.map((r) => r.points);
    const seenUnits = (list) => list.map(([unitId, count]) => ({ unitId, name: unitId, count }));
    const seenKinds = [
      ['seen:cc2', 'army', seenUnits([['kilicli', 6]])],
      ['seen:cc3', 'scout', []],
      ['seen:cc4', 'envoy', []],
      ['seen:cc5', 'army', seenUnits([['suvari', 2], ['kalkanli', 3], ['okcu', 3], ['mancinik', 3], ['kesis', 1]])],
    ];
    for (const [name, kind, units] of seenKinds) {
      for (const stop of name === 'seen:cc2' ? [1, 3] : [2]) {
        out.push(await walk(name, bend.p, 2.5, (pos, travelled, r, speed) => {
          const a = along(r, cumul(r), travelled);
          return { ...s.state, own: [], seen: [{ id: name.slice(5), kind, ownerColor: 'red', units, position: pos.p, velocity: { x: a.dir.x * speed, y: a.dir.y * speed }, heading: a.dir }] };
        }, roadsOf, stop));
        out[out.length - 1].bendDegrees = Math.round(bend.best * 180 / Math.PI);
      }
    }
  }
  // our own scout and envoy on the sharp route, our own army of catapults and cavalry
  for (const [name, kind, units] of [['own:cc6', 'scout', []], ['own:cc7', 'envoy', []], ['own:cc8', 'army', [{ unitId: 'suvari', name: 's', count: 2 }, { unitId: 'kalkanli', name: 'k', count: 3 }, { unitId: 'mancinik', name: 'm', count: 3 }, { unitId: 'okcu', name: 'o', count: 3 }]]]) {
    out.push(await walk(name, route, 2.5, (pos, travelled, r, speed) => {
      const a = along(r, cumul(r), travelled);
      return { ...s.state, seen: [], own: [{ ...base, id: name.slice(4), kind, units, position: pos.p, velocity: { x: a.dir.x * speed, y: a.dir.y * speed }, route: r, travelled, speed, missionKind: kind === 'scout' ? 'spy' : null }] };
    }, [route], 3));
  }
  return JSON.stringify(out);
})()`);
let ok = true;
try {
  for (const r of JSON.parse(result)) {
    const pass = r.worst < LIMIT && (r.minSep === null || r.minSep >= 26);
    ok &&= pass;
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${r.name}: the column was at most ${r.worst} tiles from its road (limit ${LIMIT}), at ${r.worstAtSec} s, ${r.frames} frames${r.minSep !== null ? `, closest two soldiers ${r.minSep} px (${r.sepAt})` : ''}${r.bendDegrees ? `, bend ${r.bendDegrees}°` : ''}`);
  }
} catch { console.log('FAIL no result:', String(result).slice(0, 300)); ok = false; }
if (errors.length) { console.log('page errors:', errors.slice(0, 3).join(' | ')); ok = false; }
console.log(ok ? 'All checks passed.' : 'Some checks failed.');
finish(ok ? 0 : 1);
