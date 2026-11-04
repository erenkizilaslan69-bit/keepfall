// c14 (6 s): the war seen from above, the whole map, a slow pan. We stay home with no army, the hard bots take our castle, and as a spectator we see the whole world.
// Usage: node tools/promo/spectator.mjs [--takes 2]
import { Director, sleep } from './director.mjs';
import { until } from './war.mjs';
const args = process.argv.slice(2);
const takes = Number(args[args.indexOf('--takes') + 1] || 2);
for (let i = 1; i <= takes; i++) for (const tag of ['clean', 'ui']) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const d = await Director.open();
    try {
      await d.match({ bots: ['hard', 'hard', 'hard'], guided: false }); await d.install();
      if (!(await until(d, 'keepfallScene.state.eliminated === true || keepfallScene.spectating', 60, 20))) throw new Error('never eliminated');
      await sleep(1500);
      // let the bots fight on for a while at x20, then watch at x3
      await d.speed(20); await sleep(2500); await d.speed(3);
      await d.ui(tag === 'ui');
      const b = await d.js('(() => { const b = keepfallScene.cameras.main.getBounds(); return JSON.stringify({ x: b.x, y: b.y, w: b.width, h: b.height }); })()').then(JSON.parse);
      const z = await d.js('keepfallScene.cameras.main.zoom');
      console.log('bounds', JSON.stringify(b), 'zoom', z, 'ended', await d.js(`!!document.querySelector('#ranking')`));
      const zoom = 0.58, vh = 1080 / zoom, cx = b.x + b.w / 2;
      await d.camNow(cx, b.y + vh / 2 + 80, zoom);
      const f = await d.take(`c14-${tag}-t${i}`, '', 7, async () => { await sleep(500); await d.cam(cx, b.y + b.h - vh / 2 - 80, zoom, 6200); });
      console.log(f, 'phase', await d.js('keepfallScene.state.phase'));
      d.close(); break;
    } catch (e) { console.log(`c14 ${tag} t${i} attempt ${attempt} failed:`, String(e.message ?? e).slice(0, 200)); d.close(); }
  }
}
