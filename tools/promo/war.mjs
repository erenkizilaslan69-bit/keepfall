// A staged war against one easy bot: a mixed army (swords, archers, a catapult, cavalry) is made and sent; helpers for the clips that need the road and the gate.
import { Director, sleep } from './director.mjs';
export const DECK = ['kilicli', 'okcu', 'mancinik', 'suvari'];
export const ARMY = { kilicli: 8, okcu: 6, mancinik: 2, suvari: 4 };
export const ROWS = { kilicli: 'first', suvari: 'second', okcu: 'third', mancinik: 'fourth' };

export async function until(d, expr, sec = 30, speed = 20) { await d.speed(speed); const t0 = Date.now(); let ok = false; while (Date.now() - t0 < sec * 1000) { if (await d.js(`!!(${expr})`)) { ok = true; break; } await sleep(300); } await d.speed(1); return ok; }
export async function must(d, call) { const r = await d.js(`${call}.then(JSON.stringify)`).then(JSON.parse); if (!r.ok) throw new Error(`${call} -> ${r.error}`); return r; }

/** A started match with one bot, the army armed and the war on; returns { rival }. */
export async function warBase(d, { bots = ['easy'], army = ARMY } = {}) {
  await d.match({ bots, deck: DECK }); await d.install();
  await d.js(`(async () => { const n = keepfallNet; await n.moveWorkers('idle', 'farmer', 3); await n.moveWorkers('idle', 'blacksmith', 4); return 1; })()`);
  for (const [u, n] of Object.entries(army)) await must(d, `keepfallNet.queueWeapon('${u}', ${n})`);
  await until(d, 'keepfallScene.state.queue.length === 0', 45, 20);
  await d.js(`(async () => { await keepfallNet.moveWorkers('blacksmith', 'idle', 4); await keepfallNet.moveWorkers('farmer', 'idle', 3); return 1; })()`);
  for (const [u, n] of Object.entries(army)) await must(d, `keepfallNet.armWorkers('${u}', ${n}, 'idle')`);
  await until(d, "keepfallScene.state.phase === 'war' && keepfallScene.state.units.every((u) => !u.arming)", 45, 20);
  const rival = await d.js('keepfallScene.state.scouting.targets[0].seat');
  return { rival };
}
export const sendArmy = (d, rival, army = ARMY) => must(d, `keepfallNet.sendArmy(${rival}, ${JSON.stringify(army)}, ${JSON.stringify(ROWS)}, null)`);
