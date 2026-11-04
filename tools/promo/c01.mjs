import { Director, sleep } from './director.mjs';
const d = await Director.open();
await d.match({});
await d.install();
// everybody to work, buildings a little bigger so the yard is busy
await d.js(`(async () => { const n = keepfallNet; for (const [to, c] of [['farmer', 4], ['lumberjack', 4], ['miner', 4], ['blacksmith', 1]]) await n.moveWorkers('idle', to, c); return 1; })()`);
await sleep(8000);
const castle = await d.js('JSON.stringify({ x: keepfallScene.castleSprite.x, y: keepfallScene.castleSprite.y })').then(JSON.parse);
for (const tag of ['clean', 'ui']) {
  await d.ui(tag === 'ui');
  await d.camNow(castle.x - 20, castle.y - 20, 0.8);
  await sleep(600);
  const f = await d.take('c01-test', tag, 6, async () => { await d.cam(castle.x, castle.y + 40, 1.7, 6000); });
  console.log(f);
}
d.close();
