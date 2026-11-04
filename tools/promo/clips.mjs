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

const CLIPSET = {
  // c01 (6 s) morning: the castle and the workers busy, the camera creeps up to the castle
  c01: { seconds: 6, reuse: true, setup: (d) => ecoBase(d),
    action: async (d) => { await d.camNow(...at(HOME.castle, 40, 60), 1.0); await sleep(500); await d.cam(HOME.castle[0] + 10, HOME.castle[1] + 20, 1.75, 5600); } },
  // c02 (5 s) a building goes up L1 -> L4 (sped up): one building per take
  c02: { seconds: 5, reuse: false, setup: (d, i) => ecoBase(d, { upgrade: false }),
    action: async (d, i) => {
      const bt = ['farm', 'lumberCamp', 'mine', 'forge'][i % 4], p = [HOME.farm, HOME.lumber, HOME.mine, HOME.forge][i % 4];
      await d.camNow(p[0] + 60, p[1] - 30, 1.1);
      await d.js(`keepfallNet.upgradeBuilding('${bt}').then(() => 1)`); await d.speed(20);
      const ups = (async () => { for (const ms of [800, 1700]) { await sleep(ms); await d.js(`keepfallNet.upgradeBuilding('${bt}').then(() => 1)`); } })();
      await d.cam(p[0], p[1], 1.55, 4800); await ups; await d.speed(1);
    } },
  // c03 (4 s) the forge makes weapons, workers become soldiers
  c03: { seconds: 4, reuse: false, setup: async (d) => {
      await ecoBase(d);
      await d.js(`(async () => { const n = keepfallNet; for (const u of ['kilicli', 'okcu', 'suvari']) await n.queueWeapon(u, 3); return 1; })()`);
      await d.speed(20); await sleep(9000); await d.speed(1);
    },
    action: async (d) => {
      await d.camNow(HOME.forge[0] + 70, HOME.forge[1] + 10, 1.5);
      await d.speed(5);
      const arm = (async () => { await sleep(1000); await d.js(`(async () => { const n = keepfallNet; for (const u of ['kilicli', 'okcu', 'suvari']) await n.armWorkers(u, 2, 'idle'); return 1; })()`); })();
      await d.cam(HOME.camp[0] - 60, HOME.camp[1] - 20, 1.45, 3600); await arm; await d.speed(1);
    } },
};

let d = null; let kept = null;
for (const name of wanted) {
  const c = CLIPSET[name]; if (!c) { console.log('no such clip', name); continue; }
  for (let i = 0; i < takes; i++) {
    for (const tag of ['clean', 'ui']) {
      if (!d || !c.reuse || kept !== name) { if (d) d.close(); d = await Director.open(); await c.setup(d, i); kept = name; }
      await d.ui(tag === 'ui');
      const f = await d.take(`${name}-${tag}-t${i + 1}`, '', c.seconds, () => c.action(d, i));
      console.log(f);
    }
  }
  if (d) { d.close(); d = null; kept = null; }
}
