// Screenshots of the screens at three window sizes (headless Chrome via CDP), for before/after comparisons of the look.
// Needs the dev server and the Vite dev client running (see README); usage: node tools/shot.mjs <output folder> <tag> [client url]
// e.g. node tools/shot.mjs docs/gorsel/once once http://localhost:5174/   → docs/gorsel/once-1280x720-home.png …
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'shot';
const URL = process.argv[4] ?? 'http://localhost:5174/';
const SIZES = [[1000, 640], [1280, 720], [1920, 1080]];
// `extra` as a 5th argument takes the windows that need made-up data too (army, forest places, scout report, battle report, countdown, bot end) and the end screen.
const EXTRA = process.argv.includes('extra');
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
const shot = async (size, name) => {
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${tag}-${size[0]}x${size[1]}-${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
};
const wait = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;
const click = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))?.click();`;

await send('Runtime.enable');
await send('Page.enable');
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run('localStorage.clear(); sessionStorage.clear(); 1');
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await shot(size, 'home');

  await run(`(async () => { document.querySelector('input').value = 'Eren'; ${click('Oda kur')} ${wait(1800)} ${click('Kolay')} ${wait(900)} 1; })()`);
  await shot(size, 'lobby');

  await run(`(async () => { ${click('Hazırım')} ${wait(800)} ${click('Maçı başlat')} ${wait(2500)} 1; })()`);
  await run(`(async () => { for (let i = 0; i < 80; i++) { if (window.keepfallScene?.battles) break; ${wait(500)} } ${wait(1500)} 1; })()`);
  await shot(size, 'game');
  for (const [name, target] of [
    ['farm', "{kind:'building',type:'farm'}"], ['forge', "{kind:'building',type:'forge'}"], ['castle', "{kind:'castle'}"], ['enemy', "{kind:'enemy',seat:2}"],
  ]) {
    await run(`window.keepfallUi.windows.close(); window.keepfallUi.open(${target}); 1`);
    await shot(size, name);
  }
  await run('window.keepfallUi.windows.close(); document.querySelector(".tb-sound [data-guide]")?.click(); 1');
  await shot(size, 'guide');
  await run('document.querySelector(".guide-close")?.click(); 1');
  if (EXTRA) {
    await run(`(async () => {
      const ui = window.keepfallUi, W = (ms) => new Promise(r => setTimeout(r, ms));
      window.__fake = {
        army: { id: 1, targetSeat: 2, targetName: 'Bot Kırmızı', targetColor: 'red', state: 'marching', units: [{ unitId: 'kilicli', name: 'Kılıçlı', count: 8 }, { unitId: 'okcu', name: 'Okçu', count: 4 }], distance: .4, remainingSeconds: 42, mode: 'attack', fighting: false, siteId: null, siteKind: null },
        sites: [
          { id: 'v1', kind: 'village', position: { x: 20, y: 20 }, spur: [], quarter: 'northWest', gone: false, bandits: [], discoveredAt: 0, seenAt: 0, minSoldiers: 3 },
          { id: 'c1', kind: 'camp', position: { x: 24, y: 26 }, spur: [], quarter: 'northWest', gone: false, bandits: [{ unitId: 'kilicli', name: 'Kılıçlı', count: 6 }, { unitId: 'okcu', name: 'Okçu', count: 1 }], discoveredAt: 0, seenAt: 0, minSoldiers: 0 },
          { id: 'x1', kind: 'chest', position: { x: 18, y: 30 }, spur: [], quarter: 'northWest', gone: false, bandits: [], discoveredAt: 0, seenAt: 0, minSoldiers: 0 }],
        report: { targetSeat: 2, targetName: 'Bot Kırmızı', targetColor: 'red', observedAt: 100, deliveredAt: 160, soldiers: [{ unitId: 'okcu', name: 'Okçu', count: 7 }, { unitId: 'kilicli', name: 'Kılıçlı', count: 12 }, { unitId: 'mizrakci', name: 'Mızrakçı', count: 5 }, { unitId: 'kalkanli', name: 'Kalkanlı', count: 3 }], buildings: [{ type: 'farm', name: 'Tarla', level: 2 }, { type: 'lumberCamp', name: 'Odunçu kampı', level: 1 }, { type: 'mine', name: 'Maden', level: 3 }, { type: 'forge', name: 'Demirhane', level: 1 }] },
        battle: { id: 1, at: 100, attacking: true, opponentSeat: 2, opponentName: 'Bot Kırmızı', opponentColor: 'red', attackerUnits: [{ unitId: 'kilicli', name: 'Kılıçlı', count: 14, lost: 5 }, { unitId: 'okcu', name: 'Okçu', count: 6, lost: 2 }, { unitId: 'kalkanli', name: 'Kalkanlı', count: 4, lost: 0 }], defenderUnits: [{ unitId: 'mizrakci', name: 'Mızrakçı', count: 12, lost: 12 }, { unitId: 'okcu', name: 'Okçu', count: 5, lost: 5 }], winner: 'attacker', youWon: true, castleDamage: 500, castleHpAfter: 0, castleHpMax: 500, defenderEliminated: true, kind: 'siege', loot: { food: 120, wood: 40, iron: 12, gold: 55, people: 4 } },
      };
      ui.ctx.army = () => window.__fake.army;
      ui.setSites(window.__fake.sites);
      window.__shots = { ui };
      return 1; })()`);
    for (const [name, js] of [
      ['army', "ui.open({ kind: 'army', id: 'fake' })"],
      ['forest', "ui.open({ kind: 'forest', id: 'northWest' })"],
      ['village', "ui.open({ kind: 'site', id: 'v1' })"],
      ['camp', "ui.open({ kind: 'site', id: 'c1' })"],
      ['chest', "ui.open({ kind: 'site', id: 'x1' })"],
      ['scroll', "ui.castle = { ...ui.castle, scouting: { ...ui.castle.scouting, reports: [window.__fake.report] } }; ui.toggleScroll(2, new DOMRect(window.innerWidth - 330, 56, 120, 30))"],
      ['ferman', "ui.reports.showScout(window.__fake.report)"],
      ['battle', "import('/src/ui/report-html.ts').then((m) => ui.reports.open(m.reportHtml(window.__fake.battle)))"],
      ['countdown', "ui.wait.classList.remove('hidden'); ui.wait.querySelector('.spec-n').textContent = '4'"],
      ['botend', "ui.finish.classList.remove('hidden')"],
    ]) {
      // the made-up data is put back every 150 ms: the real state from the server would otherwise replace it
      await run(`(async () => { const ui = window.keepfallUi; clearInterval(window.__keep); ui.windows.close(); ui.closeScroll?.(); ui.reports.close(); ui.wait.classList.add('hidden'); ui.finish.classList.add('hidden');
        const apply = () => { ui.setSites(window.__fake.sites); ${js}; };
        apply(); window.__keep = setInterval(() => { try { ui.setSites(window.__fake.sites); if (${JSON.stringify(name)} === 'countdown') ui.wait.classList.remove('hidden'); if (${JSON.stringify(name)} === 'botend') ui.finish.classList.remove('hidden'); } catch {} }, 150);
        await new Promise(r => setTimeout(r, 700)); return 1; })()`);
      await shot(size, name);
    }
    await run(`(async () => { const ui = window.keepfallUi; clearInterval(window.__keep); ui.windows.close(); ui.closeScroll?.(); ui.reports.close(); ui.wait.classList.add('hidden'); ui.finish.classList.add('hidden'); await window.keepfallNet.setSpeed(20); return 1; })()`);
    await run(`(async () => { for (let i = 0; i < 400; i++) { if (document.querySelector('.screen.end .ranking')) return i; await new Promise(r => setTimeout(r, 500)); } return 'never'; })()`);
    await shot(size, 'end');
  }
}
ws.close();
chrome.kill();
process.exit(0);
