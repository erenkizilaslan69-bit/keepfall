import { Director, sleep } from './director.mjs';
const d = await Director.open();
console.log('kingdom', await d.match({ deck: ['kilicli', 'okcu', 'mancinik', 'suvari'] }));
await d.install();
const st = await d.state();
const rival = st.scouting.targets[0].seat;
console.log('rival', rival, await d.js(`keepfallNet.sendScout(${rival}, 'idle').then(JSON.stringify)`));
await d.speed(20);
for (let i = 0; i < 60; i++) { await sleep(1000); const n = await d.js('keepfallScene.state.scouting.reports.length'); if (n > 0) break; }
await d.speed(1);
console.log('reports', await d.js('keepfallScene.state.scouting.reports.length'));
await d.js(`keepfallScene.select({ kind: 'enemy', seat: ${rival} }); 1`);
await sleep(1500);
await d.shot('art/promo/probe-report.png');
console.log(await d.js(`document.querySelector('.win')?.innerText.slice(0, 700) ?? 'no win'`));
console.log(await d.js(`[...document.querySelectorAll('.win input, .win textarea, .win select, .win button')].map(e => e.tagName + '#' + e.id + '.' + e.className + '[' + (e.dataset.act ?? e.dataset.f ?? '') + '] ' + (e.placeholder ?? e.textContent?.slice(0,20))).join('\n')`));
d.close();
