// Two armies walk towards each other on open ground, meet (the server drops both columns from the picture and announces the battle) and the replay plays.
// Takes a picture every ~0.25 s around the meeting so the hand-over from marching column to battle replay can be looked at frame by frame, and prints how far
// every soldier jumped between two frames (a big jump = the pop the players see). Needs the dev server and the Vite client.
// Usage: node tools/encounter-check.mjs <out-prefix> [client url]    Env: SIZE=1280,720
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const OUT = process.argv[2] ?? 'art/shots/test-duzeltme/enc';
const URL = process.argv[3] ?? 'http://localhost:5174/';
const [W, H] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
mkdirSync(dirname(OUT), { recursive: true });
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-enc-'))}`, `--window-size=${W},${H}`, '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
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
const logs = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
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
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); localStorage.setItem('keepfall_lang', 'tr'); 1`);
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); await n.addBot('easy'); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.ready) break; await new Promise(r => setTimeout(r, 400)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
await run(`document.querySelectorAll('.modal-back,#kingdom-decree,.decree').forEach(e => e.querySelector('[data-close]')?.click()); 1`);

// The page side: fake the server. The real map pictures are cut off (they would remove our fake columns); we call the real sync ourselves.
const setup = `(() => {
  const s = window.keepfallScene, c = s.cameras.main;
  const sync = s.movers.sync.bind(s.movers);
  s.movers.sync = () => {};
  const P = { x: 40, y: 40 };
  const army = (id, color, x, vx, units) => ({ id, kind: 'army', ownerSeat: color === 'red' ? 1 : 2, ownerColor: color, position: { x, y: P.y }, velocity: { x: vx, y: 0 }, units: units.map(([unitId, count]) => ({ unitId, name: unitId, count })) });
  const mix = [['kalkanli', 6], ['kilicli', 10], ['okcu', 7], ['mizrakci', 3]];
  const frame = (seen) => sync({ elapsedSeconds: 0, vision: [], own: [], seen, battles: [], trail: [], sites: [], lastSeen: [] });
  c.setZoom(1.3); const w = (p) => ({ x: (p.x - s.layout.regions.find((r) => r.seat === s.mySeat).origin.x) * 64, y: (p.y - s.layout.regions.find((r) => r.seat === s.mySeat).origin.y) * 64 });
  const toW = (p) => window.__toWorld ? window.__toWorld(p) : null;
  document.querySelectorAll('.topbar,.cam-btns,.kf-minimap,.notes').forEach((e) => (e.style.visibility = 'hidden'));
  window.__enc = { P, army, mix, frame, sync, t0: null, startedAt: null };
  return 1;
})()`;
console.log('setup', await run(setup));
console.log('go', await run(`(async () => {
  const E = window.__enc, s = window.keepfallScene, g = s.gameNow;
  const speed = 1.0; // tiles a second
  let ax = E.P.x - 7, bx = E.P.x + 7;
  const mod = await import('/src/scene/world.ts');
  const at = mod.toWorld(E.P); s.cameras.main.centerOn(at.x, at.y);
  E.frame([E.army('a', 'red', ax, speed, E.mix), E.army('b', 'blue', bx, -speed, E.mix)]);
  E.t0 = performance.now();
  window.__rel = () => E.startedAt === null ? -((E.meetAt ?? 1e9) - (performance.now() - E.t0) / 1000) : s.gameNow().now - E.startedAt;
  const meet = (bx - ax - 1) / (2 * speed); E.meetAt = meet; // when the leaders are one tile apart
  let ticks = 0;
  const iv = setInterval(() => {
    const el = (performance.now() - E.t0) / 1000;
    if (el >= meet) {
      clearInterval(iv);
      E.frame([]); // the server drops both columns: they are in a battle now
      const side = (seat, color, n) => ({ seat, color, name: color, attacker: seat === 1, soldiers: [...Array(6).fill(['kalkanli', 'first']), ...Array(10).fill(['kilicli', 'second']), ...Array(7).fill(['okcu', 'third']), ...Array(3).fill(['mizrakci', 'third'])].map(([unitId, row]) => ({ unitId, row })) });
      const hits = []; const deaths = [];
      for (let k = 5; k < 22; k++) for (let j = 0; j < 4; j++) { hits.push(k, (k * 3 + j * 5) % 16, 26 + ((k * 7 + j * 3) % 16)); hits.push(k, 26 + ((k * 5 + j) % 16), (k * 2 + j * 7) % 16); }
      for (let k = 8; k < 22; k += 2) { deaths.push(k, (k * 5) % 16); deaths.push(k, 26 + ((k * 3) % 16)); }
      const now = s.gameNow().now; E.startedAt = now;
      s.playBattle({ id: 'enc1', kind: 'field', at: E.P, facing: { x: 1, y: 0 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 24, fightSeconds: 12, sides: [side(1, 'red'), side(2, 'blue')], hits, deaths, advances: [], winner: 'attacker' });
      return;
    }
    ticks++;
    if (ticks % 1 === 0) { const x1 = ax + speed * el, x2 = bx - speed * el; E.frame([E.army('a', 'red', x1, speed, E.mix), E.army('b', 'blue', x2, -speed, E.mix)]); }
  }, 500);
  return 'meet in ' + meet.toFixed(1) + ' s';
})()`));

// Pictures: from 1.5 s before the meeting until 5 s after.
const frames = [];
const t00 = Date.now();
while (Date.now() - t00 < 11000) {
  const rel = await run('window.__rel ? window.__rel() : -99');
  if (typeof rel === 'number' && rel > -2.2 && rel < 6) {
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: W / 2 - 330, y: H / 2 - 200, width: 660, height: 400, scale: 1 } });
    const name = `${OUT}-${String(frames.length).padStart(2, '0')}.png`;
    writeFileSync(name, Buffer.from(shot.result.data, 'base64'));
    // where every soldier sprite stands right now (scene px): to measure how far each moves between two pictures
    const pos = await run(`JSON.stringify(window.keepfallScene.children.list.filter(o => o.type === 'Sprite' && (o.getData('track') || o.getData('replay')) && o.visible).map(o => [Math.round(o.x), Math.round(o.y)]))`);
    frames.push({ name, rel: Number(rel.toFixed(2)), count: JSON.parse(pos).length });
  }
  await sleep(40);
}
console.log(frames.map((f) => `${f.name.split('/').pop()}  t=${f.rel}s  sprites=${f.count}`).join('\n'));
writeFileSync(`${OUT}-frames.json`, JSON.stringify(frames, null, 1));
console.log(logs.join('\n') || 'no exceptions');
ws.close(); chrome.kill(); process.exit(0);
