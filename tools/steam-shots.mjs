// Steam store screenshots: 1920x1080, interface clean (no debug layer, no dev speed buttons), staged on the REAL client (dev hooks) in headless Chrome.
// Scenes that cannot be waited for in a real match (a siege with three sides, a castle that burns down, the end-of-match "who deceived whom" card) are staged
// with the same renderer the game uses; they show real game visuals, not a mock-up.
// Needs the dev server (5081, Development, Keepfall__MaxRooms=0) and the Vite dev client (5174).
// Usage: node tools/steam-shots.mjs [out-folder=art/steam/new] [--only map,gate,...] [--lang en|tr] [--url http://localhost:5174]
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'art/steam/new';
const ONLY = arg('only', '') ? arg('only', '').split(',') : null;
const LANG = arg('lang', 'en');
const URL = arg('url', 'http://localhost:5174').replace(/\/$/, '') + '/';
const want = (n) => !ONLY || ONLY.includes(n);
mkdirSync(OUT, { recursive: true });

const b = await launch({ width: 1920, height: 1080, dpr: 1, init: `try{localStorage.setItem('keepfall_lang','${LANG}');localStorage.setItem('keepfall_name','Eren')}catch(e){}` });
const js = (e) => b.js(e);
const shot = async (name, ms = 900) => { await sleep(ms); await b.shot(`${OUT}/${name}.png`); console.log('saved', `${OUT}/${name}.png`); };
// the dev server's speed buttons (x1/x5/x20) are not in the real game: hidden, and so is anything else that is a tool
await js(`document.addEventListener('DOMContentLoaded', () => 0); 1`);
const hideDev = () => js(`(() => { let s = document.getElementById('steam-hide'); if (!s) { s = document.createElement('style'); s.id = 'steam-hide'; document.head.appendChild(s); } s.textContent = '.tb-speed, .kf-debug, .kf-fps, [data-dev], body > pre, body > div[style*="9999"] { display: none !important; } '+ (window.__hideNotes === false ? '' : '.notes { display: none !important; } ') + (window.__hideSiegeFocus ? '.siege-focus { display: none !important; } ' : '') + '.tut-frame, .tut-card, .tut-hand, .hint-card, .kf-lowfps { display: none !important; }'; return 1; })()`);
await b.goto(URL);
await b.waitFor("document.querySelector('#quick')", 40);
await hideDev();

// ---- one real match: four players, three bots; the bots leave us alone at first (guided), so that the staging is calm ----------------------------------------------
// (a kingdom of deception: the Shadow Kingdom or the Schemers, so that the panel shows a false army / a false envoy; the match is started again until one comes up)
for (let tries = 0; tries < 12; tries++) {
  const r = await js(`(async () => { const n = keepfallNet; if (n.roomCode) { try { await n.leaveRoom(); } catch (e) {} } let r = await n.createRoom('Eren'); if (!r.ok) return r.error; for (const l of ['medium', 'easy', 'medium']) { r = await n.addBot(l); if (!r.ok) return r.error; }
    await n.setGuided(true); await n.setReady(true); r = await n.startMatch(); return r.ok ? 'ok' : r.error; })()`);
  if (r !== 'ok') throw new Error('match: ' + r);
  await b.waitFor("document.documentElement.classList.contains('in-game') && !!keepfallScene.state && keepfallScene.ready", 90);
  await sleep(2200);
  await js("document.querySelector('#kingdom-decree [data-close]')?.click(); 1");
  const k = await js('keepfallScene.state.kingdom?.id ?? null');
  console.log('kingdom', k);
  if (k === 'golge' || k === 'entrikaci' || tries === 11) break;
}
await hideDev();
const speed = (n) => js(`keepfallNet.setSpeed(${n}).then(() => 1)`);

// helpers living in the page
await js(`window.__kf = {
  cam: (x, y, z) => { const c = keepfallScene.cameras.main; c.setZoom(z); c.centerOn(x, y); },
  // the other three regions, drawn the way a spectator sees them (buildings at a level), fog off
  rivals: async (level) => {
    const s = keepfallScene;
    const { RegionDisplay } = await import('/src/scene/RegionDisplay.ts'); const { toWorld } = await import('/src/scene/world.ts'); const A = await import('/src/scene/assets.ts');
    await new Promise((r) => A.loadSpectatorAssets(s, s.otherColors, r));
    window.__rd = [];
    const types = ['farm', 'lumberCamp', 'mine', 'forge'];
    for (const r of s.layout.regions) {
      if (r.seat === s.mySeat || r.seat === null) continue;
      const d = new RegionDisplay(s, s.labels, r.seat, toWorld(r.origin), r.color || 'red', s.color);
      d.sync({ seat: r.seat, buildings: s.state.buildings.map((x) => ({ ...x, level, upgradeRemaining: null })), jobs: [], units: [], eliminated: false });
      window.__rd.push([r, d]);
    }
    __kf.noFog();
  },
  // the server's next picture would put the levels back: the state is passed through a filter
  noFog: () => { const s = keepfallScene; s.fog.draw = () => {}; s.fog.setVisible(false); },
  levels: (level) => { const s = keepfallScene; if (!s.__setState) { s.__setState = s.setState.bind(s); } window.__lv = level; s.setState = (st) => s.__setState(window.__lv ? { ...st, buildings: st.buildings.map((x) => ({ ...x, level: window.__lv, upgradeRemaining: null })) } : st); s.setState(s.state); },
};
1`);

// ---- 1. economy at level 3 and level 4: our castle (fog is part of the game: it stays) -----------------------------------------------------------------------------------
if (want('castle-l3') || want('castle-l4')) {
  for (const lv of [3, 4]) {
    if (!want('castle-l' + lv)) continue;
    await js(`__kf.levels(${lv}); keepfallScene.centerOnCastle(); keepfallScene.cameras.main.setZoom(1.15); 1`);
    await shot(`castle-l${lv}`, 1500);
  }
}

// ---- 5b. the kingdom's panel (the secret abilities) and a building window --------------------------------------------------------------------------------------------------
if (want('kingdom')) {
  await js(`window.__kf.noFog(); keepfallScene.centerOnCastle(); keepfallScene.cameras.main.setZoom(1.15); document.querySelector('.kingdom-fab')?.click(); 1`);
  await shot('kingdom-panel', 1200);
  await js("document.querySelector('.kingdom-panel .kd-x')?.click(); 1");
}
if (want('forge')) {
  await js(`__kf.levels(3); keepfallScene.centerOnCastle(); keepfallScene.cameras.main.setZoom(1.15); keepfallScene.select({ kind: 'building', type: 'forge' }); 1`);
  await shot('forge-window', 1500);
  await js('keepfallUi.windows.close(true); 1');
}

// ---- 5. an envoy's letter (ulak) over the map ---------------------------------------------------------------------------------------------------------------------------
if (want('envoy')) {
  await js(`__kf.levels(2); 1`);
  await js(` keepfallScene.centerOnCastle(); keepfallScene.cameras.main.setZoom(1.15); 1`);
  await sleep(600);
  await js(`keepfallUi.reports.showLetter({ id: 1, fromSeat: 2, fromName: 'Bot Red', fromColor: 'red', at: 0, food: 8, wood: 0, iron: 4, gold: 12, message: 'Peace for now? Keep your army off my road and I will keep mine off yours.' }); 1`);
  await shot('envoy-letter', 1200);
  await js("document.querySelector('.letter-win [data-close], .letter-win button')?.click(); 1");
}

// ---- 2. the whole map: all four castles, the forest in the middle (a spectator's view: no fog) ----------------------------------------------------------------------------
await js(`(async () => { await __kf.rivals(3); return 1; })()`); await sleep(800);
console.log('layout', await js(`JSON.stringify({ size: keepfallScene.layout.size, bounds: keepfallScene.cameras.main.getBounds(), zoom: keepfallScene.cameras.main.zoom, regions: keepfallScene.layout.regions.map((r) => [r.seat, r.origin, r.width, r.height]) })`));
console.log('fog visible:', await js(`keepfallScene.fog.rt.visible + ' alpha ' + keepfallScene.fog.rt.alpha + ' depth ' + keepfallScene.fog.rt.depth`));
if (want('map')) {
  await js(`(async () => { const { toWorld } = await import('/src/scene/world.ts'); const a = toWorld({ x: 0, y: 0 }), z = toWorld({ x: keepfallScene.layout.size, y: keepfallScene.layout.size }); const ps = keepfallScene.layout.regions.map((r) => toWorld({ x: r.origin.x + r.width / 2, y: r.origin.y + r.height / 2 })); const cx = ps.reduce((n, p) => n + p.x, 0) / ps.length, cy = ps.reduce((n, p) => n + p.y, 0) / ps.length, zm = 1080 * 0.96 / (z.y - a.y); const c = keepfallScene.cameras.main; c.stopFollow?.(); c.removeBounds?.(); __kf.cam(cx, cy, zm); await new Promise((r) => setTimeout(r, 400)); __kf.cam(cx, cy, zm); return 1; })()`);
  await shot('map-overview', 1500);
}

// ---- 3. the battle at a gate; then a second army joins (three sides at one gate) ------------------------------------------------------------------------------------------
const BATTLE = `(side) => ({ seat: side[0], color: side[1], name: side[2], attacker: side[3], soldiers: Array.from({ length: side[4] }, (_, i) => ({ unitId: i % 4 === 0 ? 'okcu' : i % 4 === 1 ? 'mizrakci' : 'kilicli', row: i % 4 === 0 ? 'second' : 'first' })) })`;
const gateSetup = `(async () => {
  const s = keepfallScene, now = s.gameNow().now, mk = ${BATTLE};
  const region = s.layout.regions.find((r) => r.seat !== s.mySeat && r.seat !== null);
  const gate = region.gate ?? { x: region.origin.x + region.width / 2, y: region.origin.y + region.height };
  window.__g = { s, now, mk, gate, seat: region.seat };
  return 1; })()`;
await js(gateSetup);
if (want('gate') || want('siege3')) {
  await js('window.__hideSiegeFocus = true; 1'); await hideDev();
  await js(`(async () => {
    const { s, now, mk, gate, seat } = window.__g;
    const hits = [], deaths = [];
    for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 10 + ((i + t) % 8)); hits.push(t * 2, 10 + i, (i + t) % 6); }
    deaths.push(30, 2, 34, 11, 40, 1, 48, 12);
    s.playBattle({ id: 'st1', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60,
      sides: [mk([s.mySeat, 'blue', 'Eren', true, 14]), mk([seat, 'red', 'Bot', false, 11])], hits, deaths, advances: [], winner: 'attacker' });
    s.cameras.main.setZoom(1.5); s.lookAt(gate); return 1; })()`);
  await shot('gate-battle', 3500);
  await shot('gate-battle-b', 1500);
}
if (want('siege3')) {
  await js('window.__hideSiegeFocus = false; 1'); await hideDev();
  await js(`(async () => {
    const { s, now, mk, gate, seat } = window.__g;
    const hits = [], deaths = [];
    for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 10 + ((i + t) % 8)); hits.push(t * 2, 10 + i, 18 + (i + t) % 6); hits.push(t * 2, 18 + i, 10 + (i + t) % 8); }
    deaths.push(30, 2, 34, 11, 40, 1, 48, 12, 52, 19, 56, 20);
    s.playBattle({ id: 'st1', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60, update: true, fromTick: 6,
      sides: [mk([s.mySeat, 'blue', 'Eren', true, 12]), mk([seat, 'red', 'Bot', false, 9]), mk([4, 'purple', 'Mor', true, 9])], hits, deaths, advances: [], winner: 'attacker' });
    return 1; })()`);
  await shot('siege-three-sides', 3500);
}

// ---- 4. our castle burns and falls (the effects of a siege replay; the server has no castle health) ------------------------------------------------------------------------
if (want('fall')) {
  await js(`(async () => { const s = keepfallScene, c = s.castleSprite; s.updateWall = () => {}; window.__c = c; s.centerOnCastle(); s.cameras.main.setZoom(1.2); s.fx.damage('own', c.x, c.y, 0.18, false); await new Promise((r) => setTimeout(r, 1500)); return 1; })()`);
  await shot('castle-burning', 600);
  await js(`(async () => { const s = keepfallScene, c = window.__c; s.fx.collapse(c, c.x, c.y, c.scaleX); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
  await shot('castle-falls', 300);
}

// ---- 6. the end of the match: who deceived whom (the end screen, with the recap of a made-up match) --------------------------------------------------------------------------
if (want('end')) {
  await js(`(async () => { try { await keepfallNet.leaveRoom(); } catch (e) {} sessionStorage.clear(); return 1; })()`);
  await b.goto(URL); await b.waitFor("document.querySelector('#quick')", 40); await hideDev();
  if (want('end')) {
    await js(`(async () => {
      const { EndScreen } = await import('/src/screens.ts');
      document.querySelectorAll('.screen').forEach((e) => e.remove());
      const e = new EndScreen(document.getElementById('app') ?? document.body, { backToLobby: async () => ({ ok: true }) }, 0);
      const ranking = [
        { seat: 0, name: 'Eren', color: 'blue', place: 1, population: 91, eliminated: false, kingdom: 'kahin' },
        { seat: 1, name: 'Bot Red', color: 'red', place: 2, population: 40, eliminated: true, kingdom: 'golge' },
        { seat: 2, name: 'Bot Yellow', color: 'yellow', place: 3, population: 22, eliminated: true, kingdom: 'tuccar' }];
      const sum = { durationSeconds: 1100, startPopulation: 10, finalPopulation: 91, peakPopulation: 95, peopleBorn: 120, workers: [{ name: 'Çiftçi', count: 20 }, { name: 'Oduncu', count: 14 }], units: [{ name: 'Kılıçlı', soldiers: 12, weapons: 3 }, { name: 'Okçu', soldiers: 8, weapons: 0 }],
        weaponsMade: 60, produced: { food: 900, wood: 700, iron: 400, gold: 0 }, final: { food: 100, wood: 50, iron: 20, gold: 0 }, starvingSeconds: 0, idleWorkerSeconds: 30, buildings: [{ name: 'Tarla', level: 3 }, { name: 'Demirhane', level: 2 }], war: { attacksLaunched: 3, enemiesKilled: 40, soldiersLost: 12, eliminated: false }, samples: Array.from({ length: 12 }, (_, i) => ({ seconds: i * 100, population: 10 + i * 7, soldiers: i * 2, food: 100 + i * 30, wood: 50, iron: 20 })) };
      e.update({ code: 'X', phase: 'ended', players: [{ seat: 0, name: 'Eren', color: 'blue', isHost: true, connected: true }, { seat: 1, name: 'Bot Red', color: 'red', isHost: false, connected: true }],
        result: { winners: [0], byElimination: true, ranking, deceptions: [
          { at: 95.2, kind: 'FakeReportSet', actorSeat: 1, targetSeat: null, asSeat: null, count: 40, detail: null },
          { at: 131, kind: 'FakeReportRead', actorSeat: 1, targetSeat: 2, asSeat: null, count: 0, detail: null },
          { at: 212, kind: 'DecoySent', actorSeat: 1, targetSeat: 0, asSeat: null, count: 12, detail: null },
          { at: 240, kind: 'DecoySighted', actorSeat: 1, targetSeat: 0, asSeat: null, count: 0, detail: null },
          { at: 262, kind: 'DecoyFaded', actorSeat: 1, targetSeat: 0, asSeat: null, count: 0, detail: null },
          { at: 301, kind: 'Bribed', actorSeat: 2, targetSeat: 0, asSeat: null, count: 8, detail: null },
          { at: 330, kind: 'ArmyAsSent', actorSeat: 2, targetSeat: 1, asSeat: 0, count: 14, detail: null },
          { at: 372, kind: 'DisguisedFought', actorSeat: 2, targetSeat: 1, asSeat: 0, count: 0, detail: 'fell' },
          { at: 492, kind: 'Unmasked', actorSeat: 2, targetSeat: 1, asSeat: 0, count: 0, detail: 'time' },
          { at: 520, kind: 'OracleSawIncoming', actorSeat: 1, targetSeat: 0, asSeat: null, count: 0, detail: 'decoy' }],
          summaries: [{ seat: 0, name: 'Eren', color: 'blue', summary: sum }, { seat: 1, name: 'Bot Red', color: 'red', summary: sum }, { seat: 2, name: 'Bot Yellow', color: 'yellow', summary: sum }] } });
      await new Promise((r) => setTimeout(r, 900)); return 1; })()`);
    await shot('end-top', 800);
    await js("document.querySelector('.deceptions')?.scrollIntoView({ block: 'start' }); 1");
    await shot('end-who-deceived-whom', 600);
  }
}
b.close();
process.exit(0);
