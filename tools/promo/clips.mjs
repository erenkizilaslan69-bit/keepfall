// The trailer clips. Usage: node tools/promo/clips.mjs c01 [c02 ...] [--takes 2]. Each clip runs `takes` times for both the clean (no interface) and the UI version.
import { Director, sleep, CLIPS } from './director.mjs';
const args = process.argv.slice(2);
const takes = Number(args[args.indexOf('--takes') + 1] || 2);
const wanted = args.filter((a) => /^c\d\d$/.test(a));
const HOME = { castle: [512, 430], farm: [190, 250], lumber: [840, 240], mine: [200, 590], forge: [830, 590], camp: [640, 656], gate: [512, 452] };
const DECK = ['kilicli', 'okcu', 'mancinik', 'suvari'];

/** Everyone to work, the four buildings at level 2 (the yard is busy), then back to normal speed. */
async function ecoBase(d, { upgrade = true } = {}) {
  await d.match({ deck: DECK });
  await d.install();
  await d.js(`(async () => { const n = keepfallNet; for (const [to, c] of [['farmer', 4], ['lumberjack', 4], ['miner', 4], ['blacksmith', 4]]) await n.moveWorkers('idle', to, c); return 1; })()`);
  if (upgrade) {
    await d.js(`(async () => { for (const b of ['farm', 'lumberCamp', 'mine', 'forge']) await keepfallNet.upgradeBuilding(b); return 1; })()`);
    await d.speed(20); await sleep(4500); await d.speed(1);
    await d.js(`(async () => { const n = keepfallNet; for (const [to, c] of [['farmer', 2], ['lumberjack', 2], ['miner', 2], ['blacksmith', 2]]) await n.moveWorkers('idle', to, c); return 1; })()`);
  }
  await sleep(3000);
}
const at = (p, dx = 0, dy = 0) => [p[0] + dx, p[1] + dy];

const J = (d, e) => d.js(`JSON.stringify(${e})`).then(JSON.parse);
/** Camera follows the first own mover matching `pred` (a JS expression over the track `t`) for `ms`. */
const follow = (d, pred, zoom, ms, lag = 0.07) => d.js(`window.__follow(() => { const t = [...keepfallScene.movers.tracks.values()].find((t) => ${pred}); if (!t) return null; const o = keepfallScene.layout.regions.find((r) => r.seat === keepfallScene.mySeat).origin; return { x: (t.shown.x - o.x) * 64, y: (t.shown.y - o.y) * 64 }; }, ${zoom}, ${ms}, ${lag})`);
/** The same, but not awaited: the camera keeps following while the script goes on (the recorder warms up, the clip starts mid-shot). */
const followBg = (d, pred, zoom, ms, lag = 0.07) => d.js(`(() => { window.__follow(() => { const t = [...keepfallScene.movers.tracks.values()].find((t) => ${pred}); if (!t) return null; const o = keepfallScene.layout.regions.find((r) => r.seat === keepfallScene.mySeat).origin; return { x: (t.shown.x - o.x) * 64, y: (t.shown.y - o.y) * 64 }; }, ${zoom}, ${ms}, ${lag}); return 1; })()`);
const PROGRESS = (frac) => `[...keepfallScene.movers.tracks.values()].some((t) => t.select && t.route && t.cumulative.length && t.travelled / t.cumulative[t.cumulative.length - 1] > ${frac})`;
/** Waits (game running at the given speed) until a page expression is truthy; gives up after `sec` real seconds. */
async function until(d, expr, sec = 30, speed = 20) { await d.speed(speed); const t0 = Date.now(); let ok = false; while (Date.now() - t0 < sec * 1000) { if (await d.js(`!!(${expr})`)) { ok = true; break; } await sleep(400); } await d.speed(1); return ok; }
/** Gold from the forest: explore our own quarter, then send the scout to the chests, until we hold `need`. */
async function getGold(d, need) {
  const st = await d.state(); const my = await d.js('keepfallScene.mySeat');
  const mine = st.scouting.quarters.find((x) => x.seat === my);
  await d.js(`keepfallNet.sendExplore('${mine.corner}', 'idle').then(() => 1)`);
  await d.speed(20); await sleep(1800);
  for (let k = 0; k < 4; k++) {
    if (await d.js('keepfallScene.state.resources.gold') >= need) break;
    const id = await d.js(`(keepfallScene.map.sites.filter((s) => s.kind === 'chest' && !s.gone)[0] ?? {}).id ?? null`);
    if (!id) break;
    await d.js(`keepfallNet.sendChestScout('${id}', 'idle').then(() => 1)`);
    await sleep(2200);
  }
  await d.speed(1);
  return (await d.js('keepfallScene.state.resources.gold')) >= need;
}
/** The preparation phase runs out at x20 (about 25 s real); sends of armies are war-only. */
const toWar = (d) => until(d, "keepfallScene.state.phase === 'war'", 45, 20);
const must = async (d, call) => { const r = await d.js(`${call}.then(JSON.stringify)`).then(JSON.parse); if (!r.ok) throw new Error(`${call} -> ${r.error}`); return r; };
let keepSeat;
const RIVAL = (d) => d.js('keepfallScene.state.scouting.targets[0].seat');

const CLIPSET = {
  // c01 (6 s) morning: the castle and the workers busy, the camera creeps up to the castle
  c01: { seconds: 6, reuse: true, setup: (d) => ecoBase(d),
    action: async (d) => { await d.camNow(...at(HOME.castle, 40, 60), 1.0); await sleep(500); await d.cam(HOME.castle[0] + 10, HOME.castle[1] + 20, 1.75, 5600); } },
  // c02 (5 s) a building goes up L1 -> L4 (sped up): one building per take
  c02: { seconds: 5, reuse: false, setup: (d, i) => ecoBase(d, { upgrade: false }),
    action: async (d, i) => {
      const bt = ['forge', 'mine', 'lumberCamp', 'farm'][i % 4], p = [HOME.forge, HOME.mine, HOME.lumber, HOME.farm][i % 4];
      await d.camNow(p[0] + 60, p[1] - 30, 1.1);
      await d.js(`keepfallNet.upgradeBuilding('${bt}').then(() => 1)`); await d.speed(20);
      const ups = (async () => { for (const ms of [800, 1700]) { await sleep(ms); await d.js(`keepfallNet.upgradeBuilding('${bt}').then(() => 1)`); } })();
      await d.cam(p[0], p[1], 1.9, 4800); await ups; await d.speed(1);
    } },
  // c03 (4 s) the forge makes weapons, workers become soldiers
  c03: { seconds: 4, reuse: false, setup: async (d) => {
      await ecoBase(d);
      await d.js(`(async () => { const n = keepfallNet; for (const u of ['kilicli', 'okcu', 'suvari']) await n.queueWeapon(u, 3); return 1; })()`);
      await d.speed(20); await sleep(9000); await d.speed(1);
    },
    action: async (d) => {
      await d.camNow(780, 590, 2.2);
      await d.speed(5);
      const arm = (async () => { await sleep(1000); await d.js(`(async () => { const n = keepfallNet; for (const u of ['kilicli', 'okcu', 'suvari']) await n.armWorkers(u, 2, 'idle'); return 1; })()`); })();
      await d.cam(660, 620, 2.2, 3600); await arm; await d.speed(1);
    } },
};

Object.assign(CLIPSET, {
  // c04 (5 s) the fog: a scout leaves along the road, leaves a trail, the fog opens
  c04: { seconds: 5, reuse: false,
    setup: async (d) => {
      await d.match({ deck: DECK }); await d.install(); await sleep(1500);
      const r = await RIVAL(d);
      await d.js(`keepfallNet.sendScout(${r}, 'idle').then(() => 1)`);
      await until(d, PROGRESS(0.3), 60, 20);
      await d.speed(3); await followBg(d, 't.scout && t.select', 1.7, 14000, 0.09);
    },
    action: async () => { await sleep(5000); } },
  // c05 (4 s) the scout report window opens (UI only)
  c05: { seconds: 4, tags: ['ui'], reuse: false,
    setup: async (d) => { await d.match({ deck: DECK }); await d.install(); const r = await RIVAL(d); await d.js(`keepfallNet.sendScout(${r}, 'idle').then(() => 1)`); await until(d, 'keepfallScene.state.scouting.reports.length > 0', 90); await d.js(`document.querySelector('.notes').innerHTML = ''; 1`); },
    action: async (d) => { const r = await RIVAL(d); await sleep(700); await d.js(`keepfallScene.select({ kind: 'enemy', seat: ${r} }); 1`); await sleep(1800); await d.js(`document.querySelector('.win .win-body')?.scrollBy({ top: 140, behavior: 'smooth' }); 1`); } },
  // c06 (4 s) the envoy window, the message is typed (UI only)
  c06: { seconds: 4, tags: ['ui'], reuse: false, setup: async (d) => { await d.match({ deck: DECK }); await d.install(); await sleep(1500); },
    action: async (d) => {
      const r = await RIVAL(d);
      await d.js(`keepfallScene.select({ kind: 'enemy', seat: ${r} }); 1`); await sleep(900);
      await d.js(`(() => { const i = document.querySelector('.win input[placeholder], .win textarea'); const all = [...document.querySelectorAll('.win input, .win textarea')]; const m = all.find((e) => /message|mesaj/i.test(e.placeholder || '')) ?? all[all.length - 1]; m.scrollIntoView({ block: 'center', behavior: 'smooth' }); m.focus(); return 1; })()`);
      await sleep(500);
      for (const ch of 'Truce until the famine?') { await d.b.send('Input.insertText', { text: ch }); await sleep(95); }
    } },
  // c07 (5 s) Shadow Kingdom: the phantom army marches on the rival
  c07: { seconds: 5, reuse: false, setup: async (d) => {
      await d.match({ deck: DECK, kingdom: 'golge' }); await d.install();
      await getGold(d, 12);
      await toWar(d);
      const r = await RIVAL(d);
      await must(d, `keepfallNet.sendDecoy(${r}, { kilicli: 6, okcu: 5, mancinik: 2, suvari: 4 })`);
      await until(d, PROGRESS(0.3), 20, 20);
      await followBg(d, 't.select', 1.15, 14000, 0.07);
    },
    action: async () => { await sleep(5000); } },
  // c08 (4 s) Merchant Republic: a hired bandit camp sets out
  c08: { seconds: 4, reuse: false, setup: async (d) => {
      await d.match({ deck: DECK, kingdom: 'tuccar' }); await d.install();
      await getGold(d, 50);
      await toWar(d);
      const r = await RIVAL(d);
      const camp = await d.js(`(keepfallScene.map.sites.find((s) => s.kind === 'camp' && !s.gone && (s.bandits ?? []).length > 0) ?? {}).id ?? null`);
      await must(d, `keepfallNet.hireCamp('${camp}', ${r})`);
      await sleep(400);
      await until(d, PROGRESS(0.03), 20, 20);
      await followBg(d, 't.select', 1.3, 14000, 0.07);
    },
    action: async () => { await sleep(4000); } },
});

let d = null; let kept = null;
for (const name of wanted) {
  const c = CLIPSET[name]; if (!c) { console.log('no such clip', name); continue; }
  for (let i = 0; i < takes; i++) {
    for (const tag of (c.tags ?? ['clean', 'ui'])) {
      for (let attempt = 1; ; attempt++) {
        try {
          if (!d || !c.reuse || kept !== name) { if (d) d.close(); d = await Director.open(); await c.setup(d, i); kept = name; }
          await d.ui(tag === 'ui');
          const f = await d.take(`${name}-${tag}-t${i + 1}`, '', c.seconds, () => c.action(d, i));
          if (await d.js("!!document.querySelector('#ranking') || keepfallScene.state.eliminated === true")) throw new Error('the match was over while recording');
          console.log(f); break;
        } catch (e) { console.log(`${name} ${tag} attempt ${attempt} failed:`, String(e.message ?? e).slice(0, 160)); kept = null; if (attempt >= 3) throw e; }
      }
    }
  }
  if (d) { d.close(); d = null; kept = null; }
}
