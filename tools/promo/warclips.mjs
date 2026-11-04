// c10 (army leaves) -> c11 (road battle) -> master (gate battle, fall, end screen) from ONE staged match per version; c12/c13/c15 are cut from the master by cuts.json.
// Usage: node tools/promo/warclips.mjs [--takes 2] [--tags clean,ui]
import { Director, sleep, CLIPS } from './director.mjs';
import { warBase, sendArmy, until, must } from './war.mjs';
const args = process.argv.slice(2);
const takes = Number(args[args.indexOf('--takes') + 1] || 2);
const tags = (args.includes('--tags') ? args[args.indexOf('--tags') + 1] : 'clean,ui').split(',');
const ARMY_PROGRESS = (cmp) => `[...keepfallScene.movers.tracks.values()].some((t) => t.select && !t.scout && t.route && t.cumulative.length && t.travelled / t.cumulative[t.cumulative.length - 1] ${cmp})`;
const followBg = (d, zoom, ms, lag = 0.06) => d.js(`(() => { window.__camStop = false; window.__follow(() => { const t = [...keepfallScene.movers.tracks.values()].find((t) => t.select && !t.scout); if (!t) return null; const o = keepfallScene.layout.regions.find((r) => r.seat === keepfallScene.mySeat).origin; return { x: (t.shown.x - o.x) * 64, y: (t.shown.y - o.y) * 64 }; }, ${zoom}, ${ms}, ${lag}); return 1; })()`);

for (let i = 1; i <= takes; i++) for (const tag of tags) {
  const t0 = Date.now(); const chk = () => { if (Date.now() - t0 > 12 * 60_000) throw new Error('timeout: 12 min for this unit'); };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const d = await Director.open();
    try {
      const { rival } = await warBase(d);
      await d.ui(tag === 'ui');
      await d.js(`keepfallNet.sendScout(${rival}, 'idle').then(() => 1)`); await d.speed(20); await sleep(3500); await d.speed(1);
      const gate = await d.js('JSON.stringify({ x: keepfallScene.castleSprite.x, y: keepfallScene.castleSprite.y })').then(JSON.parse);
      // ---- c10: the army marches out
      await d.camNow(gate.x + 110, gate.y + 40, 1.35); await sleep(300);
      const f10 = await d.take(`c10-${tag}-t${i}`, '', 6, async () => { await sleep(400); await sendArmy(d, rival); await followBg(d, 1.3, 9000, 0.05); });
      console.log(f10);
      // ---- c11: the army meets another on the road (the first battle comes at about 55-59 %)
      await d.js('window.__camStop = true; 1'); await sleep(100);
      if (!(await until(d, ARMY_PROGRESS('> 0.45'), 25, 5))) throw new Error('no progress');
      await followBg(d, 1.45, 20000, 0.08);
      const f11 = await d.take(`c11-${tag}-t${i}`, '', 4, async () => { await sleep(4000); });
      console.log(f11);
      // ---- master: second road battle, the gate, the fall, the end
      await d.js('window.__camStop = true; 1'); await sleep(100);
      if (!(await until(d, ARMY_PROGRESS('> 0.885') + ' || keepfallScene.state.phase === "ended"', 25, 5))) throw new Error('no gate');
      await followBg(d, 1.75, 60000, 0.07);
      const m = await d.take(`master-${tag}-t${i}`, '', 18, async () => { await sleep(200); });
      console.log(m, 'phase', await d.js('keepfallScene.state.phase'));
      if (tag === 'ui') { const f15 = await d.take(`c15-${tag}-t${i}`, '', 3.5, async () => { await sleep(200); }); console.log(f15); }
      d.close(); break;
    } catch (e) { console.log(`war ${tag} t${i} attempt ${attempt} failed:`, String(e.message ?? e).slice(0, 200)); d.close(); if (/timeout/.test(String(e.message))) { console.log('SKIPPED (timeout)', tag, i); break; } try { chk(); } catch { console.log('SKIPPED (timeout)', tag, i); break; } }
  }
}
