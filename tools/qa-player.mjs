// QA player: plays a whole match as a human would (headless Chrome, development server + Vite client running) against bots and takes pictures every
// few seconds and at every important event, for the polish round's QA (docs/qa-raporu.md). It also collects command failures, console errors, the debug layer's
// faults and the frame rate. Usage: node tools/qa-player.mjs <out-dir> [mode=normal|die] [speed=5] [bots=hard,medium,easy] [client url]
//   normal: economy, weapons, arming, scouts, envoys, forest, kingdom abilities, attacks, recall, redirect
//   die:    plays the economy only and lets the bots take the castle; then looks at the spectator view and tries its buttons
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'art/shots/qa/m1';
const MODE = process.argv[3] ?? 'normal';
const SPEED = Number(process.argv[4] ?? 5);
const BOTS = (process.argv[5] ?? 'hard,medium,easy').split(',');
const URL = process.argv[6] ?? 'http://localhost:5174/';
const SIZE = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const SHOT_EVERY_MS = Number(process.env.SHOT_EVERY ?? 20000);
mkdirSync(OUT, { recursive: true });

const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-qa-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${SIZE[0]},${SIZE[1]}`, '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const problems = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') problems.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('CONSOLE ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), new Promise((res) => setTimeout(() => res({ result: { exceptionDetails: { text: 'TIMEOUT 25 s' } } }), 25000))]);
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: SIZE[0], height: SIZE[1], deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);

const t0 = Date.now();
const log = [];
let shotNo = 0;
const shot = async (tag) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const name = `${String(++shotNo).padStart(3, '0')}-${Math.round((Date.now() - t0) / 1000)}s-${tag}.png`;
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
  return name;
};

// the room: a human (this script) and the bots
const levelsText = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
await run(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
  document.querySelector('input').value='QA'; btn('Oda kur').click(); await w(1500);
  for (const l of ${JSON.stringify(BOTS.map((b) => levelsText[b]))}) { [...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===l)[0]?.click(); await w(500); }
  await w(500); return 1;})()`);
await shot('lobby');
await run(`(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const btn=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(t));
  btn('Hazırım').click(); await w(700); btn('Maçı başlat').click(); await w(500); return 1;})()`);
await run(`(async()=>{for(let i=0;i<200;i++){ if(window.keepfallScene?.ready) return 1; await new Promise(r=>setTimeout(r,300)); } return 0;})()`);
await sleep(2500);
await shot('start-decree');
await run(`document.querySelector('#kingdom-decree [data-close]')?.click(); 1`);
await sleep(800);
await shot('start');
await run(`window.keepfallNet.setSpeed(${SPEED})`);
const kingdom = await run(`window.keepfallScene.state?.kingdom?.id ?? 'none'`);
console.log('kingdom:', kingdom);

// the human, as one function called every second or so
await run(`window.__qaMode = ${JSON.stringify(MODE)}; window.__qa = { done: {}, last: {}, fail: {}, events: [] }; window.__qaStep = async () => {
  const s = window.keepfallScene, n = window.keepfallNet, c = s?.state, m = s?.map;
  if (!c) return { gone: true };
  const q = window.__qa, t = c.elapsedSeconds, out = { t: Math.round(t), phase: c.phase, elim: c.eliminated };
  if (c.eliminated || c.phase === 'ended') return out;
  const once = (key, f) => { if (!q.done[key]) { q.done[key] = 1; q.stage = key; return f(); } };
  const every = (key, sec, f) => { if (t - (q.last[key] ?? -1e9) >= sec) { q.last[key] = t; q.stage = key; return f(); } };
  const fail = (what, r) => { if (r && r.ok === false) { const k = what + ':' + r.error; q.fail[k] = (q.fail[k] ?? 0) + 1; if (q.fail[k] === 1) q.events.push('FAIL ' + what + ' → ' + r.error); } return r; };
  const idle = c.jobs.find((j) => j.job === 'idle')?.count ?? 0;
  const deck = c.deck ?? c.units.map((u) => u.id);
  const from = ['idle', 'farmer', 'lumberjack', 'miner'].map((j) => [j, c.jobs.find((x) => x.job === j)?.count ?? 0]).sort((a, b) => b[1] - a[1])[0][0];
  const rivals = c.scouting.targets.map((x) => x.seat);
  const myKingdom = c.kingdom?.id;
  const die = window.__qaMode === 'die';
  // economy: spread the people, upgrade, make weapons
  await once('jobs', async () => { for (const [j, k] of [['farmer', 4], ['lumberjack', 3], ['miner', 3], ['blacksmith', 2]]) fail('move ' + j, await n.moveWorkers('idle', j, k)); });
  await every('farmers', 20, async () => { if (c.rates.foodIn < c.rates.foodOut && idle > 0) { const r = await n.moveWorkers('idle', 'farmer', Math.min(idle, 2)); if (r.ok) q.events.push('more farmers'); } });
  await every('upg', 25, async () => { for (const b of ['farm', 'forge', 'lumberCamp', 'mine']) { const r = await n.upgradeBuilding(b); if (r.ok) { q.events.push('upgrade ' + b); break; } } });
  if (!die) {
    await every('weapon', 2, async () => {
      for (const id of deck) { const u = c.units.find((x) => x.id === id); if (u && c.queue.length < 4 && c.resources.iron >= u.iron && c.resources.wood >= u.wood) { fail('queue ' + id, await n.queueWeapon(id, 1)); break; } }
    });
    await every('arm', 3, async () => {
      for (const u of c.units) if (u.weapons > 0 && t > 150) { if (idle < 2) break; const r = await n.armWorkers(u.id, Math.min(u.weapons, 3, idle), 'idle'); if (r.ok) q.events.push('arm ' + u.id); else fail('arm', r); break; }
    });
    // scouts, explore, chests, envoy, mercenaries
    await every('scout', 70, async () => { const seat = rivals[Math.floor(Math.random() * rivals.length)]; if (seat && idle > 0) fail('scout', await n.sendScout(seat, 'idle')); });
    await every('explore', 45, async () => { const qd = c.scouting.quarters.find((x) => x.seat === null && !x.explored && !x.busy); if (qd && idle > 0) fail('explore', await n.sendExplore(qd.corner, 'idle')); });
    await every('chest', 35, async () => { const site = (m?.sites ?? []).find((x) => x.kind === 'chest' && !x.gone && !x.busy); if (site && idle > 0) fail('chest', await n.sendChestScout(site.id, 'idle')); });
    await once('envoy', async () => { if (t > 200 && rivals[0] && idle > 0) { const r = await n.sendEnvoy(rivals[0], 5, 0, 0, 0, 'Merhaba, barış?', 'idle'); if (r.ok) q.events.push('envoy sent'); else { q.done.envoy = 0; q.last.envoyRetry = t; } } });
    await every('merc', 20, async () => { for (const id of deck) { const u = c.units.find((x) => x.id === id); if (u && u.price > 0 && c.resources.gold >= u.price) { const r = await n.hireMercenary(id, 1); if (r.ok) { q.events.push('hired ' + id); break; } } } });
    // forest places with the army at home: villages and camps
    await every('site', 40, async () => {
      const home = Object.fromEntries(c.units.filter((u) => u.soldiers > 0).map((u) => [u.id, u.soldiers])); const total = Object.values(home).reduce((a, b) => a + b, 0);
      const site = (m?.sites ?? []).find((x) => (x.kind === 'village' || x.kind === 'camp') && !x.gone && !x.busy);
      if (site && total >= 5 && c.war.armies.length < 2) { const r = await n.sendArmyToSite(site.id, home, null, null); if (r.ok) q.events.push('army to ' + site.kind); else fail('army to site', r); }
    });
    // kingdom abilities
    if (myKingdom === 'golge') {
      await once('fake', async () => { const r = await n.setFakeReport({ [deck[0]]: 40 }); q.events.push('fake report ' + r.ok); fail('fake report', r); });
      await every('decoy', 90, async () => { if (c.phase === 'war' && rivals[0]) { const r = await n.sendDecoy(rivals[0], { [deck[0]]: 8 }); if (r.ok) q.events.push('decoy sent'); else fail('decoy', r); } });
    }
    if (myKingdom === 'tuccar') {
      await every('camp', 45, async () => { const site = (m?.sites ?? []).find((x) => (x.kind === 'camp' || x.kind === 'bigCamp') && !x.gone); if (site && rivals[0]) { const r = await n.hireCamp(site.id, rivals[0]); if (r.ok) q.events.push('camp hired'); else fail('hire camp', r); } });
      await every('bribe', 20, async () => { const a = (m?.seen ?? []).find((x) => x.kind === 'army'); if (a) { const r = await n.bribeArmy(a.id, 3); if (r.ok) q.events.push('bribe'); else fail('bribe', r); } });
    }
    if (myKingdom === 'entrikaci') {
      await every('as', 120, async () => { if (rivals.length > 1) { const r = await n.sendEnvoyAs(rivals[0], rivals[1], 3, 0, 0, 0, 'Bu mektup bir oyun.', 'idle'); if (r.ok) q.events.push('envoy as other'); else fail('envoy as', r); } });
    }
    // the war: attack the rival with the weakest last report, recall, redirect, intercept
    if (c.phase === 'war') {
      const home = Object.fromEntries(c.units.filter((u) => u.soldiers > 0).map((u) => [u.id, u.soldiers])); const total = Object.values(home).reduce((a, b) => a + b, 0);
      await every('attack', 30, async () => {
        if (total >= 10 && c.war.armies.length < 2) {
          const seat = rivals[Math.floor(Math.random() * rivals.length)];
          const send = Object.fromEntries(Object.entries(home).map(([k, v]) => [k, Math.ceil(v * 0.5)]));
          const r = await n.sendArmy(seat, send, {}, null, Math.random() < 0.3 ? 'intercept' : 'attack'); if (r.ok) q.events.push('army sent to ' + seat); else fail('send army', r);
        }
      });
      await every('recall', 55, async () => { const a = c.war.armies.find((x) => !x.fighting); if (a) { const r = Math.random(); if (r < 0.3) { fail('recall', await n.recallArmy(a.id)); q.events.push('recall'); } else if (r < 0.6 && rivals.length > 1) { fail('redirect', await n.redirectArmy(a.id, rivals[Math.floor(Math.random() * rivals.length)], null)); q.events.push('redirect'); } } });
      await every('defense', 120, async () => { fail('defense', await n.setDefense({}, null)); });
    }
  }
  out.pop = c.population; out.soldiers = c.soldiers; out.armies = c.war.armies.length; out.battles = c.war.battles.length; out.guards = c.guards;
  out.res = [c.resources.food, c.resources.wood, c.resources.iron, c.resources.gold].map(Math.round);
  return out;
};
window.__qaStep ? 1 : 0`);

// windows to open for pictures, in turn
const windows = [
  `{kind:'building',type:'farm'}`, `{kind:'building',type:'forge'}`, `{kind:'building',type:'mine'}`, `{kind:'castle'}`,
  `{kind:'forest',id:'northEast'}`, `{kind:'building',type:'lumberCamp'}`,
];
let adShots = 0, lastAd = 0;
let windowNo = 0, lastShot = Date.now(), lastBattles = 0, lastPhase = '', status = {}, spectated = false, spectatorShots = 0;
const MAX_MS = 16 * 60_000;
while (Date.now() - t0 < MAX_MS) {
  const raw = await run(`(async()=>JSON.stringify(await window.__qaStep()))()`);
  try { status = JSON.parse(raw); } catch { status = { error: raw }; }
  if (status.error) { const st = await run(`window.__qa?.stage`); problems.push('STEP ' + String(status.error).slice(0, 300) + ' (stage ' + st + ')'); }
  const ended = await run(`!!document.querySelector('.screen.end')`);
  if (ended || status.phase === 'ended') { await sleep(1500); await shot('end'); break; }
  if (status.phase && status.phase !== lastPhase) { lastPhase = status.phase; await shot('phase-' + status.phase); }
  if (status.battles !== undefined && status.battles > lastBattles) { lastBattles = status.battles; await sleep(800); await shot('battle-report'); }
  if (status.elim && !spectated) {
    spectated = true;
    log.push(`eliminated at ${status.t}`);
    await sleep(2500); await shot('eliminated');
    // wait for the first spectator picture (match.spectatorWaitSeconds), then look at everything and press every button
    for (let i = 0; i < 40; i++) { if (await run(`!!document.querySelector('.cam-btns button') && window.keepfallScene?.spectating`)) break; await sleep(1000); }
    await sleep(2500); await shot('spectator-1');
    const btns = await run(`[...document.querySelectorAll('.cam-btns button, .report-toggle, .minimap')].map(b=>b.textContent.trim().slice(0,20)||b.className)`);
    log.push('spectator buttons: ' + JSON.stringify(btns));
    log.push('own farm sprites: ' + (await run(`JSON.stringify([...window.keepfallScene.buildings.get('farm').sprites.map((x) => x.texture.key)].slice(0, 4))`)));
    log.push('own kingdom in scene: ' + (await run(`JSON.stringify({own: window.keepfallScene.ownKingdom, state: window.keepfallScene.state?.kingdom?.id ?? null, elim: window.keepfallScene.state?.eliminated})`)));
  }
  // AD=1: pictures for the shop page / trailer: whenever a battle replay plays, look at it close up (at most one picture per 7 s, up to 14)
  if (process.env.AD && status.phase === 'war' && adShots < 14 && Date.now() - lastAd > 7000) {
    const at = await run(`(()=>{const b=window.keepfallScene?.battles?.active?.find((x)=>!x.ended); return b ? JSON.stringify({x:b.at.x,y:b.at.y,kind:b.kind}) : null;})()`);
    if (at) {
      const p = JSON.parse(at);
      await run(`(()=>{const s=window.keepfallScene; s.cameras.main.setZoom(1.25); s.lookAt({x:${p.x},y:${p.y}}); return 1;})()`);
      await sleep(1800);
      lastAd = Date.now(); adShots++;
      await shot(`ad-battle-${p.kind}`);
    }
  }
  if (spectated) {
    if (spectatorShots < 8 && Date.now() - lastShot > 6000) {
      spectatorShots++; lastShot = Date.now();
      // press the next camera button, then look
      await run(`(()=>{const b=[...document.querySelectorAll('.cam-btns button')]; const x=b[${spectatorShots} % Math.max(1,b.length)]; x?.click(); return b.length;})()`);
      await sleep(1500); await shot('spectator-cam' + spectatorShots);
    }
  } else if (Date.now() - lastShot > SHOT_EVERY_MS) {
    lastShot = Date.now();
    // every other picture has a window open (the building, the castle, the forest), the others show the map as it is
    if (windowNo % 2 === 1) await run(`(()=>{window.keepfallUi?.open(${windows[Math.floor(windowNo / 2) % windows.length]}); return 1;})()`);
    await sleep(900);
    await shot(`t${status.t}-${windowNo % 2 === 1 ? 'window' : 'map'}`);
    if (windowNo % 2 === 1) await run(`(()=>{window.keepfallUi?.windows?.close(); return 1;})()`);
    windowNo++;
  }
  await sleep(1200);
}
const events = await run(`JSON.stringify(window.__qa?.events ?? [])`);
const fails = await run(`JSON.stringify(window.__qa?.fail ?? {})`);
const rep = await run(`JSON.stringify(window.keepfallDebug?.report?.() ?? null)`);
const vio = await run(`JSON.stringify((window.keepfallDebug?.violations ?? []).slice(0, 12).map(v=>({kind:v.kind,id:v.id,game:v.game,message:v.message})))`);
const endText = await run(`document.querySelector('.screen.end')?.innerText?.slice(0, 600) ?? ''`);
const summary = { kingdom, mode: MODE, speed: SPEED, last: status, events: JSON.parse(events || '[]'), commandFailures: JSON.parse(fails || '{}'), debug: JSON.parse(rep || 'null'), violations: JSON.parse(vio || '[]'), problems, log, endText };
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 1).slice(0, 6000));
ws.close(); chrome.kill(); process.exit(0);
