// Stage F: the end of a match: victory, defeat, "who fooled whom", the XP breakdown, a level up (all staged with the game's own EndScreen and made-up results), and the
// spectator view of a player whose castle really fell (a real match, left alone at x20).
import { session, take, stage, startSolo, castle, call, LANG } from './tam-tur-lib.mjs';

const N = LANG === 'tr' ? { me: 'Aslan', a: 'Bora', b: 'Cem', c: 'Deniz' } : { me: 'Lion', a: 'Noah', b: 'Mia', c: 'Emma' };
const DEC = [
  "D(95.2, 'FakeReportSet', 1, null, null, 40, null)", "D(131, 'FakeReportRead', 1, 2, null, 0, null)", "D(212, 'DecoySent', 1, 0, null, 12, null)", "D(240, 'DecoySighted', 1, 0, null, 0, null)", "D(262, 'DecoyFaded', 1, 0, null, 0, null)",
  "D(301, 'Bribed', 2, 0, null, 8, null)", "D(330, 'ArmyAsSent', 3, 1, 0, 14, null)", "D(372, 'DisguisedFought', 3, 1, 0, 0, 'fell')", "D(492, 'Unmasked', 3, 1, 0, 0, 'time')", "D(520, 'OracleSawIncoming', 0, 1, null, 0, 'decoy')"].join(', ');
const endScreen = (s, { mySeat, color, deceptions = false, scrollTo = null, xp = null }) => s.js(`(async () => {
  const { EndScreen } = await import('/src/screens.ts');
  document.querySelectorAll('.screen').forEach((e) => e.remove());
  const e = new EndScreen(document.getElementById('app') ?? document.body, { backToLobby: async () => ({ ok: true }) }, ${mySeat});
  const ranking = [
    { seat: 0, name: ${JSON.stringify(mySeat === 0 ? N.me : N.a)}, color: ${mySeat === 0 ? JSON.stringify(color) : "'red'"}, place: 1, population: 91, eliminated: false, kingdom: 'kahin' },
    { seat: 1, name: ${JSON.stringify(mySeat === 0 ? N.a : N.me)}, color: ${mySeat === 1 ? JSON.stringify(color) : "'blue'"}, place: 2, population: 40, eliminated: true, kingdom: 'golge' },
    { seat: 2, name: ${JSON.stringify(N.b)}, color: 'yellow', place: 3, population: 22, eliminated: true, kingdom: 'tuccar' },
    { seat: 3, name: ${JSON.stringify(N.c)}, color: 'purple', place: 4, population: 9, eliminated: true, kingdom: 'entrikaci' }];
  const sum = { durationSeconds: 1100, startPopulation: 10, finalPopulation: 91, peakPopulation: 95, peopleBorn: 120, workers: [{ name: ${JSON.stringify(LANG === 'tr' ? 'Çiftçi' : 'Farmer')}, count: 20 }, { name: ${JSON.stringify(LANG === 'tr' ? 'Oduncu' : 'Lumberjack')}, count: 14 }],
    units: [{ name: ${JSON.stringify(LANG === 'tr' ? 'Kılıçlı' : 'Swordsman')}, soldiers: 12, weapons: 3 }, { name: ${JSON.stringify(LANG === 'tr' ? 'Okçu' : 'Archer')}, soldiers: 8, weapons: 0 }],
    weaponsMade: 60, produced: { food: 900, wood: 700, iron: 400, gold: 0 }, final: { food: 100, wood: 50, iron: 20, gold: 0 }, starvingSeconds: 0, idleWorkerSeconds: 30,
    buildings: [{ name: ${JSON.stringify(LANG === 'tr' ? 'Tarla' : 'Farm')}, level: 3 }, { name: ${JSON.stringify(LANG === 'tr' ? 'Demirhane' : 'Smithy')}, level: 2 }], war: { attacksLaunched: 3, enemiesKilled: 40, soldiersLost: 12, eliminated: false },
    samples: Array.from({ length: 12 }, (_, i) => ({ seconds: i * 100, population: 10 + i * 7, soldiers: i * 2, food: 100 + i * 30, wood: 50, iron: 20 })) };
  const D = (at, kind, a, t, as, count, detail) => ({ at, kind, actorSeat: a, targetSeat: t, asSeat: as, count, detail });
  e.update({ code: 'X', phase: 'ended', players: ranking.map((r) => ({ seat: r.seat, name: r.name, color: r.color, isHost: r.seat === 0, connected: true })),
    result: { winners: [0], byElimination: true, ranking, ${deceptions ? `deceptions: [ ${DEC} ],` : ''}
      summaries: ranking.map((r) => ({ seat: r.seat, name: r.name, color: r.color, summary: sum })) } });
  ${xp ? `const { xpBlockHtml, animateXpBars } = await import('/src/ui/progress.ts'); const L = await import('/src/progress/level.ts');
  const x = ${xp}; x.levelBefore = L.levelOf(x.before); x.levelAfter = L.levelOf(x.after); x.titles = x.titleIds.map((id) => L.TITLES.find((t) => t.id === id)).filter(Boolean); x.patterns = [];
  e.setProgressHtml(xpBlockHtml(x)); animateXpBars(document.querySelector('#progress-panel'));` : ''}
  await new Promise((r) => setTimeout(r, 1100));
  ${scrollTo ? `document.querySelector(${JSON.stringify(scrollTo)})?.scrollIntoView({ block: 'start' });` : ''}
  return 1; })()`);

stage('F', async () => {
  let s = await session({});
  try {
    await s.waitFor(`!!document.querySelector('#play')`, 30); await s.sleep(1500);
    await take(s, 'mac-sonu-kazanma', async () => { await endScreen(s, { mySeat: 0, color: 'red' }); return true; });
    await take(s, 'mac-sonu-kaybetme', async () => { await endScreen(s, { mySeat: 1, color: 'blue' }); return true; });
    await take(s, 'kim-kimi-kandirdi', async () => { await endScreen(s, { mySeat: 1, color: 'blue', deceptions: true, scrollTo: '.deceptions, #deceptions' }); await s.sleep(500); return s.exists('.deceptions, #deceptions'); });
    const xpA = `{ match: 40, win: 60, modeFactor: 1.4, moments: [{ id: 'fake_report', xp: 40 }, { id: 'felled', xp: 60 }], goals: 0, firstClear: 0, total: 224, before: 2300, after: 2524, titleIds: [] }`;
    await take(s, 'xp-dokumu', async () => { await endScreen(s, { mySeat: 0, color: 'red', xp: xpA, scrollTo: '#progress-panel' }); await s.sleep(2500); return true; });
    const xpB = `{ match: 40, win: 60, modeFactor: 1.4, moments: [{ id: 'fake_report', xp: 40 }, { id: 'felled', xp: 60 }], goals: 0, firstClear: 0, total: 224, before: 2600, after: 2824, titleIds: ['castle_breaker'] }`;
    await take(s, 'seviye-atlama', async () => { await endScreen(s, { mySeat: 0, color: 'red', xp: xpB, scrollTo: '#progress-panel' }); await s.sleep(2500); return true; });
  } finally { s.close(); }

  // the spectator: a real match left alone at x20 until the castle falls
  s = await session({});
  try {
    await startSolo(s, { kingdom: null, bots: 'hard' });
    await call(s, `window.keepfallNet.setSpeed(20)`);
    const t0 = Date.now(); let out = false;
    while (Date.now() - t0 < 420_000) { const c = await castle(s); if (c?.eliminated) { out = true; break; } await s.sleep(2000); }
    console.log('   castle fell:', out);
    if (!out) throw new Error('the castle did not fall in time (the bots left it alone)');
    await call(s, `window.keepfallNet.setSpeed(1)`);
    await s.sleep(2500);
    await take(s, 'izleyici', async () => { await s.click('[data-a="watch"]'); await s.sleep(3500); return true; });
  } finally { s.close(); }
});
