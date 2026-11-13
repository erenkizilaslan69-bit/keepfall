// The promo clips and store screenshots that the director's event camera does not film (calm preparation, the whole map, a village plundered, a bandit camp raided,
// a three-sided siege) and clean 1920x1080 store pictures. A HEADED kiosk Chrome plays a solo match (three Medium bots) on the Vite dev client; the interface is hidden
// (no labels, no cursor), ffmpeg records the primary screen (ddagrab, 60 fps) clip by clip. Real where it can be (calm, map, plunder, raid), STAGED with the game's own
// renderers where nobody can order the moment (three-way siege, a fall, a phantom for the pictures): clips.md says which.
//   node tools/promo-extra.mjs <client url> --out <dir> [--lang en] [--only calm,map,plunder,raid,siege3,shots]
// The screen is taken over while it records. The folder is git-ignored (art/promo/).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = args[0], OUT = resolve(opt('--out', 'art/promo/director/extra')), LANG = opt('--lang', 'en');
const ONLY = opt('--only', 'calm,map,plunder,raid,siege3,shots').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
mkdirSync(OUT, { recursive: true }); mkdirSync(join(OUT, 'steam'), { recursive: true });
const NOTES = join(OUT, 'extra-notes.md');
const note = (s) => appendFileSync(NOTES, s + '\n');

// ---- a headed Chrome over CDP ------------------------------------------------------------------
const port = 9700 + Math.floor(Math.random() * 250);
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-extra-'))}`, '--no-first-run', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--lang=en-US', '--kiosk', '--window-position=0,0', '--window-size=1920,1080', '--force-device-scale-factor=1', '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion', '--disable-infobars', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${LANG}');localStorage.setItem('keepfall.matches','12');localStorage.setItem('keepfall.normalMatches','12');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false, fullRules: true }));sessionStorage.setItem('keepfall.lowfps-offer','1')}catch(e){};` });
const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'js error'); return r.result?.result?.value; };
const waitFor = async (expr, sec) => { for (let i = 0; i < sec * 2; i++) { try { if (await js(expr)) return true; } catch { /* */ } await sleep(500); } return false; };
const front = () => { try { spawn('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate(${proc.pid})`], { stdio: 'ignore', windowsHide: true }).unref(); } catch { /* */ } send('Page.bringToFront'); };
const keepFront = setInterval(front, 3000); front();
const net = (m, ...a) => js(`(async () => JSON.stringify(await keepfallNet.${m}(${a.map((x) => JSON.stringify(x)).join(',')})))()`).then((r) => { try { return JSON.parse(r); } catch { return r; } });
const castle = () => js('JSON.stringify(keepfallUi?.castle ?? null)').then((r) => JSON.parse(r));
const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); log('picture', file); };
/** Records `sec` seconds of the primary screen into <name>.mp4 (the page keeps doing its camera work meanwhile). */
const rec = (name, sec) => new Promise((res) => { const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=60:draw_mouse=0,hwdownload,format=bgra', '-t', String(sec),
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '60', '-movflags', '+faststart', join(OUT, name + '.mp4')], { stdio: 'inherit' }); ff.on('close', res); log('recording', name, sec + ' s'); });

// ---- the match -----------------------------------------------------------------------------------
await send('Page.navigate', { url: BASE });
if (!(await waitFor('!!window.keepfallNet && !!document.querySelector("#quick")', 40))) throw new Error('needs the Vite dev client');
await sleep(1500);
const made = await js(`(async () => { const n = keepfallNet; let r = await n.createRoom('Player'); if (!r.ok) return 'create ' + r.error; for (const l of ['medium', 'medium', 'medium']) { r = await n.addBot(l); if (!r.ok) return 'bot ' + r.error; } r = await n.setReady(true); r = await n.startMatch(); return r.ok ? 'ok' : 'start ' + r.error; })()`);
if (made !== 'ok') throw new Error('match: ' + made);
await waitFor('document.documentElement.classList.contains("in-game") && !!keepfallUi?.castle && !!keepfallScene?.layout', 60);
await sleep(2500);
await js(`document.querySelector('#kingdom-decree [data-close]')?.click(); 1`);
// clean picture: no interface, no labels (the same hiding the director uses), the fog off for the map shots
await js(`(() => { const st = document.createElement('style'); st.textContent = '.ui-root, .ui-labels, .world-labels, #banner, .kf-lowfps, .quests, .minimap, .kf-minimap { display: none !important; } * { cursor: none !important; }'; document.head.appendChild(st); return 1; })()`);
const speed = (x) => net('setSpeed', x);
const hold = (fn) => js(`(() => { clearInterval(window.__cam); const f = ${fn}; f(); window.__cam = setInterval(f, 50); return 1; })()`);
const release = () => js('clearInterval(window.__cam); 1');
const c0 = await castle(); const deck = c0.deck ?? c0.units.map((u) => u.id);
const mySeat = await js('keepfallScene.mySeat');
const rivals = JSON.parse(await js('JSON.stringify(keepfallUi.room.players.map((p) => p.seat))')).filter((x) => x !== mySeat);
// workers on the jobs, scouting a forest quarter: both calm and useful later
for (const [j, n] of [['farmer', 4], ['lumberjack', 2], ['miner', 3], ['blacksmith', 2]]) await net('moveWorkers', 'idle', j, n);
const quarters = JSON.parse(await js('JSON.stringify(keepfallUi.castle.scouting.quarters.map((q) => q.corner))'));
await net('sendExplore', quarters[0], 'farmer');
await speed(8);

// economy helper (soldiers by the game's own commands), time forward until `until` game seconds
let qi = 1;
async function build(until, wanted) {
  const t0 = Date.now(); let step = 0, up = 0;
  for (;;) {
    const c = await castle(); if (!c || c.elapsedSeconds >= until || c.eliminated || Date.now() - t0 > 240000) return c;
    step++;
    // the other quarters of the forest, one scout after the other: villages and camps show up on the map
    if (qi < quarters.length && !c.scouting.scoutsAway && !c.scouting.locked) { const r = await net('sendExplore', quarters[qi], 'farmer'); if (r.ok) qi++; }
    for (const u of c.units) if (u.weapons > 0 && c.resources.food > 25 && c.soldiers + (u.arming ?? 0) < wanted) await net('armWorkers', u.id, Math.min(u.weapons, 2), 'idle');
    if (c.queue.length < 2) await net('queueWeapon', deck[step % deck.length], 2);
    const idle = c.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    if (idle > 0 && (c.resources.food < 150 || c.starving)) await net('moveWorkers', 'idle', 'farmer', 1);
    else if (idle > 3) await net('moveWorkers', 'idle', ['miner', 'lumberjack'][step % 2], 1);
    if (c.resources.wood > 160 && c.resources.iron > 110) await net('upgradeBuilding', ['farm', 'mine', 'forge', 'lumberCamp'][up++ % 4]);
    await sleep(900);
  }
}

// 1) calm preparation: the castle at work (real time), close and middle shot
if (ONLY.includes('calm')) {
  await speed(1);
  await js(`(() => { const sc = keepfallScene; sc.fog?.setVisible(false); sc.centerOnCastle(); return 1; })()`);
  await hold(`() => { const sc = keepfallScene; sc.cameras.main.setZoom(2); sc.centerOnCastle(); }`);
  await sleep(1500); await rec('calm-castle-close', 10);
  await hold(`() => { const sc = keepfallScene; sc.cameras.main.setZoom(1); sc.centerOnCastle(); }`);
  await sleep(1200); await rec('calm-castle-wide', 10);
  await release();
  note('- calm-castle-close.mp4 / calm-castle-wide.mp4: our own castle in the preparation at normal speed, workers at the farm, mine, lumber camp and smithy, soldiers by the campfire (real, 2x and 1x zoom).');
  await speed(8);
}

// 2) soldiers, then the village plunder and the camp raid (real)
let sites = [];
if (ONLY.includes('plunder') || ONLY.includes('raid')) {
  const c = await build(420, 6);
  console.log('   soldiers', c?.soldiers, 'phase', c?.phase);
  sites = JSON.parse(await js('JSON.stringify((keepfallScene.map?.sites ?? []).map((s) => ({ id: s.id, kind: s.kind, min: s.minSoldiers, bandits: s.bandits.reduce((n, b) => n + b.count, 0), gone: s.gone })))'));
  console.log('   sites', JSON.stringify(sites));
}
async function raid(kind, name, pick) {
  const site = pick(sites.filter((s) => s.kind === kind && !s.gone));
  if (!site) { note(`- ${name}: NOT FILMED (no ${kind} found by the scout in time)`); return; }
  const c = await castle(); const army = {}; const rows = {};
  let ri = 0; for (const u of c.units) if (u.soldiers > 0) { army[u.id] = u.soldiers; rows[u.id] = ['first', 'second', 'third', 'fourth'][ri++]; } // (one unit type per row)
  if (!Object.keys(army).length) { note(`- ${name}: NOT FILMED (no soldiers armed in time)`); return; }
  const r = await net('sendArmyToSite', site.id, army, rows, null);
  console.log('   sendArmyToSite', kind, JSON.stringify(r));
  if (!r.ok) { note(`- ${name}: NOT FILMED (${r.error})`); return; }
  await speed(8);
  // follow our column; slow to normal speed for the last stretch, then film
  const target = await js(`(async () => { const W = await import('/src/scene/world.ts'); const p = keepfallScene.sites.positionOf(${JSON.stringify(site.id)}); return JSON.stringify(p); })()`);
  const tp = JSON.parse(target);
  await hold(`() => { const sc = keepfallScene; const tr = sc.movers.debugTracks().find((x) => x.own && !x.scout); sc.cameras.main.setZoom(2); if (tr) sc.lookAt(tr.shown); }`);
  let near = false;
  for (let i = 0; i < 240 && !near; i++) {
    await sleep(500);
    if (i % 10 === 0) console.log('   follow', i, await js(`JSON.stringify({ tracks: keepfallScene.movers.debugTracks().map((x) => [x.key, x.own, x.scout, Math.round(x.shown.x), Math.round(x.shown.y)]), armies: (keepfallUi.castle.war.armies ?? []).map((a) => a.state ?? a.status), phase: keepfallUi.castle.phase })`));
    near = await js(`(() => { const sc = keepfallScene; const tr = sc.movers.debugTracks().find((x) => x.own && !x.scout); if (!tr) return false; const W = tr.shown; const p = ${JSON.stringify(tp)}; return Math.hypot(W.x * 64 - p.x, W.y * 64 - p.y) < 64 * 16; })()`);
  }
  await speed(1);
  await rec(name, 14);
  await release();
  note(`- ${name}.mp4: our army (${Object.entries(army).map(([u, n]) => `${n} ${u}`).join(', ')}) walks to a ${kind} in the forest and ${kind === 'village' ? 'plunders it' : 'fights the bandits'} (real, normal speed, zoom 2).`);
  await speed(8);
}
if (ONLY.includes('plunder')) await raid('village', 'village-plunder', (l) => l.sort((a, b) => a.min - b.min)[0]);
if (ONLY.includes('raid')) await raid('camp', 'camp-raid', (l) => l.sort((a, b) => a.bandits - b.bandits)[0]);
await speed(1);

// 3) the map as a whole, a slow pan over four castles and the forest (real)
if (ONLY.includes('map')) {
  await js(`(() => { const sc = keepfallScene; sc.fog?.setVisible(false); return 1; })()`);
  const size = await js('keepfallScene.layout.size');
  // a slow glide from the top left castle across the forest to the bottom right, then a wide hold
  await hold(`(() => { const sc = keepfallScene; const t0 = performance.now(); const S = ${size}; return () => { const k = Math.min(1, (performance.now() - t0) / 14000); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; sc.cameras.main.setZoom(0.55); sc.lookAt({ x: S * (0.28 + 0.44 * e), y: S * (0.28 + 0.44 * e) }); }; })()`);
  await sleep(800); await rec('map-pan', 14);
  await release();
  note('- map-pan.mp4: the whole map, a slow glide from one castle across the forest to the opposite one (real match, fog off, zoom 0.55).');
}

const stageBattle0 = 1;
// 4) staged: a three-sided siege (the game\'s replay renderer with a made-up log) + the pictures for the store
const stageBattle = (n, ticksFrom = 0) => js(`(async () => { const sc = keepfallScene; const now = sc.gameNow().now;
  const mk = (side) => ({ seat: side[0], color: side[1], name: side[2], attacker: side[3], soldiers: Array.from({ length: side[4] }, (_, i) => ({ unitId: ['okcu', 'mizrakci', 'kilicli', 'kalkanli'][i % 4], row: i % 4 === 0 ? 'second' : 'first' })) });
  const region = sc.layout.regions.find((r) => r.seat === ${rivals[0]}) ?? sc.layout.regions[1]; const gate = region.gate ?? { x: region.origin.x + region.width / 2, y: region.origin.y + region.height };
  const hits = [], deaths = []; for (let t = 1; t < 60; t++) for (let i = 0; i < 8; i++) { hits.push(t * 2, i, 12 + ((i + t) % 10)); hits.push(t * 2, 12 + i, (i + t) % 8); ${n === 3 ? 'hits.push(t * 2, 24 + i, 12 + (i + t) % 10);' : ''} }
  deaths.push(30, 2, 34, 13, 40, 1, 48, 14, 55, 3, 60, 15);
  sc.fog?.setVisible(false);
  sc.playBattle({ id: 'px${n}', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now - ${ticksFrom}, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60,
    sides: [mk([sc.mySeat, 'blue', 'A', true, 12]), mk([${rivals[0]}, 'red', 'B', false, 10])${n === 3 ? `, mk([${rivals[1]}, 'yellow', 'C', true, 10])` : ''}], hits, deaths, advances: [], winner: 'attacker' });
  window.__gate = gate; return 1; })()`);
const followGate = (z) => hold(`() => { const sc = keepfallScene; sc.cameras.main.setZoom(${z}); sc.lookAt(window.__gate); }`);

// 3b) staged: a fight at a bandit camp (the game's replay renderer, a made-up log; camp kind) - our soldiers against the camp's bandits
if (ONLY.includes('campbattle')) {
  await net('sendExplore', quarters[0], 'farmer'); await speed(8);
  let camp = null;
  for (let i = 0; i < 60 && !camp; i++) { await sleep(1000); camp = JSON.parse(await js(`JSON.stringify((keepfallScene.map?.sites ?? []).find((s) => s.kind === 'camp' || s.kind === 'bigCamp') ?? null)`)); }
  await speed(1);
  if (!camp) note('- camp-battle: NOT FILMED (no camp found)');
  else {
    await js(`(() => { const sc = keepfallScene; const now = sc.gameNow().now; const site = ${JSON.stringify(camp)}; sc.fog?.setVisible(false);
      const mk = (seat, color, name, attacker, n, units) => ({ seat, color, name, attacker, soldiers: Array.from({ length: n }, (_, i) => ({ unitId: units[i % units.length], row: i % 3 === 0 ? 'second' : 'first' })) });
      const hits = [], deaths = []; for (let t = 1; t < 60; t++) for (let i = 0; i < 8; i++) { hits.push(t * 2, i, 10 + ((i + t) % 8)); hits.push(t * 2, 10 + i, (i + t) % 8); }
      deaths.push(30, 12, 36, 14, 42, 11, 50, 15, 56, 10, 62, 16);
      sc.playBattle({ id: 'pc1', kind: 'camp', at: site.position, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60,
        sides: [mk(sc.mySeat, 'blue', 'A', true, 10, ['kilicli', 'mizrakci', 'okcu', 'kalkanli']), mk(-1, 'black', 'Bandits', false, 8, ['kilicli', 'okcu', 'mizrakci'])], hits, deaths, advances: [], winner: 'attacker' });
      window.__gate = site.position; return 1; })()`);
    await followGate(2); await sleep(4000); await rec('camp-battle', 12); await release();
    note('- camp-battle.mp4: STAGED with the game own replay renderer at a real bandit camp of this map (a made-up log): ten of our soldiers against eight bandits, zoom 2.');
  }
}
if (ONLY.includes('siege3')) {
  await stageBattle(3); await followGate(2); await sleep(5000); await rec('siege-three-way', 12); await release();
  note('- siege-three-way.mp4: STAGED with the game\'s own replay renderer (a made-up log): a defender (red) and two attackers (blue, yellow) at one gate, zoom 2.');
}
if (ONLY.includes('shots')) {
  const S = (n) => join(OUT, 'steam', n);
  await stageBattle(2); await followGate(2); await sleep(4000); await shot(S('steam-1-gate-battle.png'));
  await stageBattle(3, 3); await followGate(2); await sleep(5000); await shot(S('steam-2-three-way-siege.png'));
  await js(`(() => { const sc = keepfallScene; const seat = ${rivals[1]}; const c = sc.otherCastles.get(seat); sc.setRoom = () => {}; c.fallen = false; sc.markFallen(seat, c, true); window.__gate = { x: c.image.x / 64, y: c.image.y / 64 - 1 }; return 1; })()`);
  await hold(`() => { const sc = keepfallScene; const c = sc.otherCastles.get(${rivals[1]}); sc.cameras.main.setZoom(2); sc.cameras.main.centerOn(c.image.x, c.image.y - 40); }`);
  await sleep(1500); await shot(S('steam-3-castle-falling.png')); await sleep(5000); await shot(S('steam-3b-castle-ruin.png')); await release();
  // a phantom of a rival at our gate, a moment before it comes apart
  await js(`(async () => { const sc = keepfallScene; const g = sc.layout.regions.find((r) => r.seat === sc.mySeat).gate; sc.setMap = () => {};
    window.__map = (seen) => ({ elapsedSeconds: 0, vision: [], own: [], seen, battles: [], trail: [], sites: [], lastSeen: [] });
    window.__ph = { id: 'phantom-1', kind: 'army', ownerSeat: ${rivals[0]}, ownerColor: sc.otherCastles.get(${rivals[0]}).color, position: { x: g.x - 6, y: g.y + 5 }, velocity: { x: 1.4, y: -1.1 }, units: [{ unitId: 'kilicli', count: 8 }, { unitId: 'okcu', count: 5 }, { unitId: 'mizrakci', count: 5 }] };
    sc.movers.sync(window.__map([window.__ph])); const W = await import('/src/scene/world.ts'); const p = W.toWorld({ x: g.x - 3, y: g.y + 2 }); window.__cam = setInterval(() => { sc.cameras.main.setZoom(2); sc.cameras.main.centerOn(p.x, p.y); }, 50); return 1; })()`);
  await sleep(2500); await shot(S('steam-4-phantom-army.png'));
  await js(`keepfallScene.movers.sync(window.__map([])); 1`); await sleep(500); await shot(S('steam-4b-phantom-dissolving.png')); await release();
  await js(`(() => { const sc = keepfallScene; sc.fog?.setVisible(false); const S = sc.layout.size; sc.cameras.main.setZoom(0.3); sc.lookAt({ x: S / 2, y: S / 2 }); return 1; })()`);
  await sleep(1500); await shot(S('steam-5-wide-map.png'));
  note('- steam/*.png: clean 1920x1080 store pictures (no interface). 1 gate battle, 2 three-way siege, 3 castle falling / 3b ruin, 4 phantom army / 4b dissolving, 5 wide map. The battles, the fall and the phantom are STAGED with the game\'s own renderers.');
}
clearInterval(keepFront);
try { ws.close(); } catch { /* */ } spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
console.log('done', OUT);
process.exit(0);
