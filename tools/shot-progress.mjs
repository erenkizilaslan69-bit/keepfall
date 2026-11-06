// The achievements/mastery screen and the end screen's progress block with a made-up save (Vite dev client on 5174);
// usage: node tools/shot-progress.mjs <out-prefix> [url]. Shots go to art/shots/ilerleme/ (not in git).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'progress', URL = process.argv[3] ?? 'http://localhost:5174/';
mkdirSync('art/shots/ilerleme', { recursive: true });
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
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`art/shots/ilerleme/${OUT}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');
const save = JSON.stringify({
  v: 1, matches: 23, wins: 11,
  kingdoms: { golge: { played: 4, won: 1 }, tuccar: { played: 9, won: 6 }, kahin: { played: 6, won: 3 }, entrikaci: { played: 4, won: 1 } },
  achievements: { first_win: 1, village_raid: 1, camp_clear: 1, early_win: 1, scout_report: 1, bribe: 1, wins_10: 1, matches_10: 1, ghost_win: 1, envoy: 1, challenge_win: 1, flawless: 1 },
  picks: { frame: 'silver', banners: { tuccar: 'b' } },
});
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('keepfall_lang','${process.env.KFLANG ?? 'tr'}'); localStorage.setItem('keepfall_progress_v1', ${JSON.stringify(save)});` });
await send('Page.navigate', { url: URL });
await sleep(3500);
let r = await evalJs(`(async()=>{
  const { ProgressScreen } = await import('/src/ui/progress.ts');
  document.querySelectorAll('.screen').forEach((e) => e.remove());
  document.documentElement.classList.add('in-menu');
  new ProgressScreen(document.getElementById('app') ?? document.body, { challengeStars: {}, challengeCount: 8 }, { back: () => {} });
  await new Promise((r) => setTimeout(r, 600));
  return document.querySelectorAll('.pg-ach').length + ' achievements, ' + document.querySelectorAll('.pg-swatch').length + ' swatches';
})()`);
console.log('screen:', r);
await shot('screen');
await evalJs(`document.querySelector('.pg-scroll').scrollTop = 430`);
await sleep(300);
await shot('screen-mid');
await evalJs(`document.querySelector('.pg-scroll').scrollTop = 99999`);
await sleep(300);
await shot('screen-bottom');

r = await evalJs(`(async()=>{
  const { EndScreen } = await import('/src/screens.ts');
  const { recordMatch } = await import('/src/progress/catalog.ts');
  const { progressPanelHtml } = await import('/src/ui/progress.ts');
  document.querySelectorAll('.screen').forEach((e) => e.remove());
  const e = new EndScreen(document.getElementById('app') ?? document.body, { backToLobby: async () => ({ ok: true }) }, 1);
  const delta = recordMatch({ kingdom: 'kahin', won: true, earned: ['castle_felled', 'last_standing', 'first_win'] }, { challengeStars: {}, challengeCount: 8 });
  e.setProgressHtml(progressPanelHtml(delta));
  const ranking = [
    { seat: 1, name: 'Aylin', color: 'red', place: 1, population: 91, eliminated: false, kingdom: 'kahin', frame: 'gold', banner: 'c' },
    { seat: 2, name: 'Bora', color: 'blue', place: 2, population: 40, eliminated: true, kingdom: 'tuccar', frame: 'bronze', banner: 'b' },
    { seat: 3, name: 'Cem', color: 'yellow', place: 3, population: 22, eliminated: true, kingdom: 'golge', frame: null, banner: 'a' }];
  const sum = { durationSeconds: 1100, startPopulation: 10, finalPopulation: 91, peakPopulation: 95, peopleBorn: 120, workers: [], units: [], weaponsMade: 60, produced: { food: 900, wood: 700, iron: 400, gold: 0 }, final: { food: 100, wood: 50, iron: 20, gold: 0 }, starvingSeconds: 0, idleWorkerSeconds: 30, buildings: [], war: { attacksLaunched: 3, enemiesKilled: 40, soldiersLost: 12, eliminated: false }, samples: [] };
  e.update({ code: 'X', phase: 'ended', players: [{ seat: 1, name: 'Aylin', color: 'red', isHost: true, connected: true }], result: { winners: [1], byElimination: true, ranking, deceptions: [], summaries: [{ seat: 1, name: 'Aylin', color: 'red', summary: sum }] } });
  await new Promise((r) => setTimeout(r, 900));
  document.querySelector('.end-scroll').scrollTop = 160;
  return delta.newAchievements.map((a) => a.id).join(',') + ' | cosmetics: ' + delta.newCosmetics.map((c) => c.id).join(',') + ' | mastery ' + delta.masteryBefore + '->' + delta.masteryAfter;
})()`);
console.log('end:', r);
await sleep(300);
await shot('end');
await evalJs(`document.querySelector('.end-scroll').scrollTop = 560`);
await sleep(300);
await shot('end-ranking');
ws.close(); chrome.kill();
process.exit(0);
