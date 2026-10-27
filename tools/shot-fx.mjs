// Screenshots of the battle and castle EFFECTS (sparks, dust, arrow trails, smoke and flames on a damaged castle, the collapse) in headless Chrome.
// Needs the dev server and the Vite dev client running; usage: node tools/shot-forest.mjs <output folder> <tag> [client url]
// e.g. node tools/shot-fx.mjs docs/gorsel-harita efekt http://localhost:5174/  → efekt-battle.png, efekt-damage1.png …
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'shot';
const URL = process.argv[4] ?? 'http://localhost:5174/';
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-shot-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,800', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
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
const shot = async (name) => {
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${tag}-${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); sessionStorage.clear(); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
await run(`document.querySelector('.ui-root').style.visibility = 'hidden'; (async () => { const s = window.keepfallScene; s.fog.setVisible(false); s.centerOnCastle(); await new Promise(r => setTimeout(r, 800)); })()`);
// A battle in front of the castle: 8 against 8, swords and arrows, blows and falls over a few seconds.
await run(`(async () => {
  const s = window.keepfallScene, now = s.gameNow().now, hits = [], deaths = [];
  const side = (seat, color) => ({ seat, color, name: 'x', soldiers: Array.from({ length: 8 }, (_, i) => ({ unitId: i % 3 === 0 ? 'okcu' : 'kilicli', row: 'front' })) });
  for (let t = 1; t < 20; t++) for (let i = 0; i < 8; i++) { hits.push(t, i, 8 + ((i + t) % 8)); hits.push(t, 8 + i, (i + 2 * t) % 8); }
  [3, 6, 9, 12].forEach((t, k) => { deaths.push(t * 2, k * 2, t * 2, 8 + k * 2 + 1); });
  const c = s.castleSprite;
  const tile = { x: c.x / 64 + 0.5, y: c.y / 64 - 2.5 };
  window.__fx = { c };
  s.playBattle({ id: 'fx1', kind: 'field', at: tile, facing: { x: 1, y: 0 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 40, fightSeconds: 20,
    sides: [side(2, 'red'), side(3, 'yellow')], hits, deaths, advances: [], winner: 'attacker' });
  s.cameras.main.setZoom(1.2); s.lookAt(tile);
  return 1; })()`);
await sleep(3500);
await shot('battle');
await sleep(900);
await shot('battle2');
// castle damage: smoke at two thirds, flames below a third, then the collapse
await run(`(async () => { const s = window.keepfallScene, c = window.__fx.c; s.updateWall = () => {}; s.cameras.main.setZoom(1); s.centerOnCastle(); s.fx.damage('own', c.x, c.y, 0.5, false); await new Promise(r => setTimeout(r, 1200)); })()`);
await shot('damage-smoke');
await run(`(async () => { const s = window.keepfallScene, c = window.__fx.c; s.fx.damage('own', c.x, c.y, 0.2, false); await new Promise(r => setTimeout(r, 1200)); })()`);
await shot('damage-fire');
await run(`(async () => { const s = window.keepfallScene, c = window.__fx.c; s.fx.collapse(c, c.x, c.y, c.scaleX); await new Promise(r => setTimeout(r, 450)); })()`);
await shot('collapse-early');
await sleep(1200);
await shot('collapse-late');
console.log('errors', await run(`window.__errs?.length ?? 0`));
ws.close();
chrome.kill();
process.exit(0);
