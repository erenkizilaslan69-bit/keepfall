// Stage E: the war. A real match is played up to an army on the road (the march is the real thing); the fights, the siege, the three-way siege, the fall of a castle and the
// vanishing phantom are STAGED with the game's own renderers (scene.playBattle, markFallen, movers.sync) because nobody can order them in a real match at the right moment
// (the pictures are the game's own drawing; tools/shot-siege3.mjs and shot-ruin.mjs use the same handles).
import { session, take, stage, startSolo, economy, castle, call, LANG, attempt } from './tam-tur-lib.mjs';

const net = (s, m, ...a) => call(s, `window.keepfallNet.${m}(${a.map((x) => JSON.stringify(x)).join(',')})`);
const hideUi = (s, on) => s.js(`document.querySelectorAll('.ui-root').forEach((e) => { e.style.visibility = ${on ? "'hidden'" : "''"}; }); 1`);

stage('E', () => attempt('war', async () => {
  const s = await session({});
  try {
    await startSolo(s, { kingdom: null });
    await s.sleep(1500);
    // into the war phase (the economy runs on its own for a while), then the march: an army of our colour drawn by the game's own mover code on a real road
    const e = await economy(s, { untilSeconds: 312, soldiers: 2, speed: 8 });
    console.log('   economy:', JSON.stringify({ t: e.elapsedSeconds, phase: e.phase, soldiers: e.soldiers, elim: e.eliminated }));
    await net(s, 'setSpeed', 1);
    const me = await s.js(`keepfallUi.mySeat ?? keepfallUi.seat ?? 0`);
    const rivals = JSON.parse(await s.js(`JSON.stringify(keepfallUi.room.players.map((p) => p.seat))`)).filter((x) => x !== me);
    await take(s, 'savas-yuruyus', async () => {
      await s.js(`(() => { const sc = keepfallScene; sc.setMap = () => {}; sc.fog?.setVisible(false); const g = sc.layout.regions.find((r) => r.seat === sc.mySeat).gate; let best = null;
        for (const r of sc.layout.roads) r.points.forEach((p, i) => { if (i < r.points.length - 1) { const d = Math.hypot(p.x - g.x, p.y - g.y); if (!best || d < best.d) best = { d, p, q: r.points[i + 1] }; } });
        const len = Math.hypot(best.q.x - best.p.x, best.q.y - best.p.y) || 1, v = { x: (best.q.x - best.p.x) / len * 2.5, y: (best.q.y - best.p.y) / len * 2.5 };
        const units = [['kilicli', 5], ['mizrakci', 4], ['kalkanli', 3], ['okcu', 4], ['kesis', 1]].map(([unitId, count]) => ({ unitId, count }));
        let pos = { x: best.p.x, y: best.p.y };
        const push = () => sc.movers.sync({ elapsedSeconds: 0, vision: [], own: [], seen: [{ id: 'march-1', kind: 'army', ownerSeat: sc.mySeat, ownerColor: 'blue', position: { ...pos }, velocity: v, units }], battles: [], trail: [], sites: [], lastSeen: [] });
        push(); window.__march = setInterval(() => { pos = { x: pos.x + v.x, y: pos.y + v.y }; push(); }, 1000);
        window.__follow = setInterval(() => { const tr = sc.movers.debugTracks().find((x) => x.key.startsWith('seen:march')); if (tr) { sc.cameras.main.setZoom(1.6); sc.lookAt(tr.shown); } }, 100); return 1; })()`);
      await s.sleep(6000); await hideUi(s, true); await s.sleep(500); return true; });
    await s.js(`clearInterval(window.__follow); clearInterval(window.__march); keepfallScene.movers.sync({ elapsedSeconds: 0, vision: [], own: [], seen: [], battles: [], trail: [], sites: [], lastSeen: [] }); 1`);
    await hideUi(s, false);

    // staged: fights at the gate of a rival (the game's replay renderer with made-up logs)
    const stage1 = (n, sides, ticksFrom = 0, extra = '') => s.js(`(async () => { const sc = keepfallScene; const now = sc.gameNow().now;
      const mk = (side) => ({ seat: side[0], color: side[1], name: side[2], attacker: side[3], soldiers: Array.from({ length: side[4] }, (_, i) => ({ unitId: ['okcu', 'mizrakci', 'kilicli', 'kalkanli'][i % 4], row: i % 4 === 0 ? 'second' : 'first' })) });
      const region = sc.layout.regions.find((r) => r.seat === ${rivals[0]}) ?? sc.layout.regions[1]; const gate = region.gate ?? { x: region.origin.x + region.width / 2, y: region.origin.y + region.height };
      const hits = [], deaths = []; for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 10 + ((i + t) % 8)); hits.push(t * 2, 10 + i, (i + t) % 6); ${n === 3 ? 'hits.push(t * 2, 18 + i, 10 + (i + t) % 8);' : ''} }
      deaths.push(30, 2, 34, 11, 40, 1, 48, 12);
      const cols = ['${'blue'}', 'red', 'yellow', 'purple'];
      sc.fog?.setVisible(false);
      sc.playBattle({ id: 'tt${n}', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now - ${ticksFrom}, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60,
        sides: [mk([sc.mySeat, 'blue', ${JSON.stringify(LANG === 'tr' ? 'Aslan' : 'Lion')}, true, 10]), mk([${rivals[0]}, 'red', ${JSON.stringify(LANG === 'tr' ? 'Bot Kırmızı' : 'Bot Red')}, false, 8])${n === 3 ? `, mk([${rivals[1]}, 'yellow', ${JSON.stringify(LANG === 'tr' ? 'Bot Sarı' : 'Bot Yellow')}, true, 8])` : ''}],
        hits, deaths, advances: [], winner: 'attacker' });
      sc.cameras.main.setZoom(1.15); sc.lookAt(gate); window.__gate = gate; return 1; })()`);
    await hideUi(s, true);
    await take(s, 'savas-kapi', async () => { await stage1(2, null); await s.sleep(2500); return true; });
    await take(s, 'savas-kusatma', async () => { await s.sleep(9000); return true; });
    await take(s, 'savas-uclu', async () => {
      await s.js(`(() => { const sc = keepfallScene; const now = sc.gameNow().now; return 1; })()`);
      await stage1(3, null, 3); await s.sleep(4500); return true; });

    // the fall of a castle (a rival's): the show and the ruin
    await take(s, 'kale-dusus', async () => {
      await s.js(`(() => { const sc = keepfallScene; const seat = ${rivals[0]}; const c = sc.otherCastles.get(seat); const cam = sc.cameras.main; cam.setZoom(1.5); cam.centerOn(c.image.x, c.image.y - 60);
        window.__hold = () => { cam.setZoom(1.5); cam.centerOn(c.image.x, c.image.y - 60); window.__raf = requestAnimationFrame(window.__hold); }; window.__hold();
        sc.setRoom = () => {}; c.fallen = false; sc.markFallen(seat, c, true); return 1; })()`);
      await s.sleep(5500); return true; });
    await s.js(`cancelAnimationFrame(window.__raf); window.__hold = () => {}; 1`);

    // a phantom of a rival at our gate, coming apart
    await take(s, 'sahte-ordu-dagilma', async () => {
      const made = await s.js(`(() => { const sc = keepfallScene; const seat = ${rivals[1]}; const g = sc.layout.regions.find((r) => r.seat === sc.mySeat).gate; sc.setMap = () => {};
        window.__map = (seen) => ({ elapsedSeconds: 0, vision: [], own: [], seen, battles: [], trail: [], sites: [], lastSeen: [] });
        window.__phantom = { id: 'phantom-1', kind: 'army', ownerSeat: seat, ownerColor: sc.otherCastles.get(seat).color, position: { x: g.x, y: g.y }, velocity: { x: 0, y: 0 }, units: [{ unitId: 'kilicli', count: 6 }, { unitId: 'okcu', count: 4 }] };
        sc.movers.sync(window.__map([window.__phantom])); return JSON.stringify(g); })()`);
      await s.js(`(async () => { const sc = keepfallScene; const W = await import('/src/scene/world.ts'); const p = W.toWorld(${made}); const cam = sc.cameras.main; window.__hold = () => { cam.setZoom(2); cam.centerOn(p.x, p.y - 20); window.__raf = requestAnimationFrame(window.__hold); }; window.__hold(); return 1; })()`);
      await s.sleep(1500);
      await s.js(`keepfallScene.movers.sync(window.__map([])); 1`); await s.sleep(650); return true; });
    await s.js(`cancelAnimationFrame(window.__raf); 1`);
    await hideUi(s, false);

    // the battle report (a made-up one in the game's own list) and the map as a whole
    await take(s, 'savas-raporu', async () => {
      await s.js(`(() => { const sc = keepfallScene; sc.cameras.main.setZoom(1); sc.centerOnCastle(); const rep = keepfallUi.reports, upd = rep.update.bind(rep); rep.update = () => {}; upd([{ id: 1, at: 320, attacking: true, opponentSeat: ${rivals[0]}, opponentName: ${JSON.stringify(LANG === 'tr' ? 'Bot Kırmızı' : 'Bot Red')}, opponentColor: 'red',
        attackerUnits: [{ unitId: 'kilicli', name: ${JSON.stringify(LANG === 'tr' ? 'Kılıçlı' : 'Swordsman')}, count: 8, lost: 3 }, { unitId: 'okcu', name: ${JSON.stringify(LANG === 'tr' ? 'Okçu' : 'Archer')}, count: 4, lost: 1 }],
        defenderUnits: [{ unitId: 'mizrakci', name: ${JSON.stringify(LANG === 'tr' ? 'Mızrakçı' : 'Spearman')}, count: 6, lost: 6 }], winner: 'attacker', youWon: true, defenderEliminated: false, kind: 'siege', loot: null }], 330); return 1; })()`);
      await s.sleep(700);
      console.log('   report DOM:', await s.js(`JSON.stringify({ toggle: !!document.querySelector('.report-toggle:not(.hidden)'), tags: document.querySelectorAll('[data-report]').length })`));
      await s.click('.report-toggle'); await s.sleep(700); await s.click('[data-report]'); await s.sleep(900);
      return s.exists('.report-win, .win'); });
    await s.b.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`); await s.sleep(500);
    await take(s, 'genel-harita', async () => {
      await s.js(`document.querySelectorAll('.siege-focus').forEach((e) => e.classList.add('hidden')); 1`);
      await s.js(`(() => { const sc = keepfallScene; sc.fog?.setVisible(false); sc.focusForest(); const cam = sc.cameras.main; cam.setZoom(0.3); sc.lookAt({ x: sc.layout.size / 2, y: sc.layout.size / 2 }); return 1; })()`);
      await s.sleep(1200); return true; });
  } finally { s.close(); }
}));
