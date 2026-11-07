// Screenshots of a siege that a second army joins (three sides at one gate), in headless Chrome. Needs the dev server (5081) and Vite (5174); usage: node tools/shot-siege3.mjs <folder> <tag> [url]; SIZE=1920,1080 for another size.


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
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${process.env.SIZE ?? '1280,720'}`, '--no-first-run',
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
await send('Emulation.setDeviceMetricsOverride', { width: Number((process.env.SIZE ?? '1280,720').split(',')[0]), height: Number((process.env.SIZE ?? '1280,720').split(',')[1]), deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); localStorage.setItem('keepfall_lang', 'tr'); sessionStorage.clear(); 1`);
await send('Page.navigate', { url: URL });
await sleep(3500);
await run(`(async () => { const n = window.keepfallNet; await n.createRoom('Eren'); for (const l of ['easy', 'medium', 'easy']) await n.addBot(l); await n.setReady(true); await n.startMatch(); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 120; i++) { if (window.keepfallScene?.battles) break; await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2500)); return 1; })()`);
await run(`(async () => { for (let i = 0; i < 20; i++) { const b = [...document.querySelectorAll('button')].find((x) => /Anladım|Got it/.test(x.textContent)); if (b) { b.click(); break; } await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 1200)); return 1; })()`);
await run(`(async () => { const s = window.keepfallScene; s.fog.setVisible(false); s.centerOnCastle(); await new Promise(r => setTimeout(r, 800)); })()`);
// A siege in front of the castle of seat 2 (a rival's gate): first alone, then a second army joins.
const BATTLE = `(side) => ({ seat: side[0], color: side[1], name: side[2], attacker: side[3], soldiers: Array.from({ length: side[4] }, (_, i) => ({ unitId: i % 4 === 0 ? 'okcu' : i % 4 === 1 ? 'mizrakci' : 'kilicli', row: i % 4 === 0 ? 'second' : 'first' })) })`;
await run(`(async () => {
  const s = window.keepfallScene, now = s.gameNow().now, mk = ${BATTLE};
  const region = s.layout.regions.find((r) => r.seat === 2) ?? s.layout.regions[1];
  window.__s3 = { s, now, mk };
  const gate = region.gate ?? { x: region.origin.x + region.width / 2, y: region.origin.y + region.height };
  window.__s3.gate = gate;
  const hits = [], deaths = [];
  for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 10 + ((i + t) % 8)); hits.push(t * 2, 10 + i, (i + t) % 6); }
  deaths.push(30, 2, 34, 11, 40, 1, 48, 12);
  s.playBattle({ id: 'sg1', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60,
    sides: [mk([s.mySeat, 'blue', 'Eren', true, 10]), mk([3, 'yellow', 'Sarı', false, 8])], hits, deaths, advances: [], winner: 'attacker' });
  s.cameras.main.setZoom(1.1); s.lookAt(gate);
  return 1; })()`);
await sleep(2500);
await shot('1-two-sides');
await run(`(async () => {
  const { s, now, mk, gate } = window.__s3;
  const hits = [], deaths = [];
  for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 10 + ((i + t) % 8)); hits.push(t * 2, 10 + i, 18 + (i + t) % 6); hits.push(t * 2, 18 + i, 10 + (i + t) % 8); }
  deaths.push(30, 2, 34, 11, 40, 1, 48, 12, 52, 19, 56, 20);
  s.playBattle({ id: 'sg1', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60, update: true, fromTick: 6,
    sides: [mk([s.mySeat, 'blue', 'Eren', true, 10]), mk([3, 'yellow', 'Sarı', false, 8]), mk([4, 'purple', 'Mor', true, 8])], hits, deaths, advances: [], winner: 'attacker' });
  return 1; })()`);
await sleep(1500);
await shot('2-three-sides');
await sleep(2500);
await shot('3-three-sides-later');
ws.close();
chrome.kill();
