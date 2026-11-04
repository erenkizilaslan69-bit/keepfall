import { Director, sleep } from './director.mjs';
import { warBase, sendArmy, until } from './war.mjs';
const d = await Director.open();
const { rival } = await warBase(d);
console.log('rival', rival, 'phase', await d.js('keepfallScene.state.phase'), 'soldiers', await d.js('keepfallScene.state.soldiers'), JSON.stringify(await d.js('JSON.stringify(keepfallScene.state.units)')));
console.log('scout', await d.js(`keepfallNet.sendScout(${rival}, 'idle').then(JSON.stringify)`));
await d.speed(20); await sleep(3500); await d.speed(1);
console.log('report', await d.js(`JSON.stringify(keepfallScene.state.scouting.reports.map(r => r.units ?? r))`).then((x) => x.slice(0, 500)));
console.log(JSON.stringify(await sendArmy(d, rival)));
const t0 = Date.now();
for (let i = 0; i < 70; i++) {
  await sleep(1000);
  const s = await d.js(`JSON.stringify({ t: Math.round(keepfallScene.state.elapsedSeconds), war: Math.round(keepfallScene.state.war?.elapsed ?? 0), tr: [...keepfallScene.movers.tracks.values()].filter(t => t.select).map(t => Math.round(100 * t.travelled / t.cumulative.slice(-1)[0]) + (t.fighting ? 'F' : '')), battles: keepfallScene.map.battles.map(b => b.kind + ':' + (b.id || '').slice(0,4)), bp: Object.keys(keepfallScene.battles?.active ?? keepfallScene.battles ?? {}).length, fallen: [...keepfallScene.otherCastles].map(([k, c]) => k + ':' + !!c.fallen), ph: keepfallScene.state.phase, el: keepfallScene.state.eliminated, end: !!document.querySelector('#ranking') })`);
  console.log(i, s);
  if (i === 3) await d.speed(5);
}
d.close();
