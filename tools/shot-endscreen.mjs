// The end screen with made-up results (dev server + Vite dev client): victory and defeat pictures in the player's colour; usage: node tools/shot-endscreen.mjs <out-prefix> [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'endscreen', URL = process.argv[3] ?? 'http://localhost:5174/';
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, `--window-size=${process.env.SIZE ?? '1280,800'}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text) : r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
if (process.env.EMULATE) { const [w, h] = (process.env.SIZE ?? '1280,800').split(',').map(Number); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); }
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('keepfall_lang','${process.env.KFLANG ?? 'tr'}')` });
await send('Page.navigate', { url: URL });
await sleep(3500);
const C = process.env.COLORS ? process.env.COLORS.split(',') : ['red', 'purple'];
for (const [name, mySeat, color] of [['victory', 0, C[0]], ['defeat', 1, C[1]]]) {
  const r = await evalJs(`(async()=>{
    const { EndScreen } = await import('/src/screens.ts');
    document.querySelectorAll('.screen').forEach((e) => e.remove());
    const e = new EndScreen(document.getElementById('app') ?? document.body, { backToLobby: async () => ({ ok: true }) }, ${mySeat});
    const ranking = [
      { seat: 0, name: 'Aylin', color: ${JSON.stringify(color)}, place: 1, population: 91, eliminated: false, kingdom: 'kahin' },
      { seat: 1, name: 'Bora', color: 'blue', place: 2, population: 40, eliminated: true, kingdom: 'golge' },
      { seat: 2, name: 'Cem', color: 'yellow', place: 3, population: 22, eliminated: true, kingdom: 'tuccar' }];
    const sum = { durationSeconds: 1100, startPopulation: 10, finalPopulation: 91, peakPopulation: 95, peopleBorn: 120, workers: [{ name: 'Çiftçi', count: 20 }, { name: 'Oduncu', count: 14 }], units: [{ name: 'Kılıçlı', soldiers: 12, weapons: 3 }, { name: 'Okçu', soldiers: 8, weapons: 0 }],
      weaponsMade: 60, produced: { food: 900, wood: 700, iron: 400, gold: 0 }, final: { food: 100, wood: 50, iron: 20, gold: 0 }, starvingSeconds: 0, idleWorkerSeconds: 30, buildings: [{ name: 'Tarla', level: 3 }, { name: 'Demirhane', level: 2 }], war: { attacksLaunched: 3, enemiesKilled: 40, soldiersLost: 12, eliminated: false }, samples: Array.from({ length: 12 }, (_, i) => ({ seconds: i * 100, population: 10 + i * 7, soldiers: i * 2, food: 100 + i * 30, wood: 50, iron: 20 })) };
    e.update({ code: 'X', phase: 'ended', players: [{ seat: 0, name: 'Aylin', color: ${mySeat === 0 ? JSON.stringify(color) : "'red'"}, isHost: true, connected: true }, { seat: 1, name: 'Bora', color: ${mySeat === 1 ? JSON.stringify(color) : "'blue'"}, isHost: false, connected: true }],
      result: { winners: [0], byElimination: true, ranking, summaries: [{ seat: 0, name: 'Aylin', color: 'red', summary: sum }, { seat: 1, name: 'Bora', color: 'blue', summary: sum }, { seat: 2, name: 'Cem', color: 'yellow', summary: sum }] } });
    await new Promise((r) => setTimeout(r, 900)); return 1; })()`);
  console.log(name, r);
  console.log(name, 'turkish left:', await evalJs("(()=>{const re=/[çğıöşüÇĞİÖŞÜ]|\\b(Kale|Tarla|Orman|Maden|Demirhane|Odun|Demir|Yemek|Asker|Gözcü|Ulak|Oda|Deste|Başlat|Savaş|Rapor|Hazır|Oyuncu|Krallık|Ordu|Silah|Sandık|Köy|Kamp)\\b/; const out=new Set(); for(const l of document.body.innerText.split('\\n')){const s=l.trim(); if(s&&re.test(s)) out.add(s)} for(const e of document.querySelectorAll('[title],[aria-label],[placeholder]')){for(const a of ['title','aria-label','placeholder']){const v=e.getAttribute(a); if(v&&re.test(v)) out.add('['+a+'] '+v)}} return JSON.stringify([...out].filter((x)=>!/Türkçe$/.test(x)))})()"));
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}-${name}.png`, Buffer.from(s.result.data, 'base64'));
}
ws.close(); chrome.kill(); process.exit(0);
