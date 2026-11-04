// c09 (4 s): the four kingdoms' castles. Each kingdom is recorded close-up in a match of its own; the clean version is the four side by side (centre strip of each),
// the UI version is four one-second cuts. Usage: node tools/promo/kingdoms.mjs [--takes 2]
import { spawnSync } from 'node:child_process';
import { Director, sleep, CLIPS } from './director.mjs';
const args = process.argv.slice(2);
const takes = Number(args[args.indexOf('--takes') + 1] || 2);
const KINGDOMS = ['golge', 'tuccar', 'kahin', 'entrikaci'];
const ff = (a) => { const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('ffmpeg failed'); };
const d = await Director.open();
for (let t = 1; t <= takes; t++) {
  const parts = [];
  for (const k of KINGDOMS) {
    await d.match({ kingdom: k, deck: ['kilicli', 'okcu', 'mancinik', 'suvari'] }); await d.install(); await sleep(2500);
    const c = await d.js('JSON.stringify({ x: keepfallScene.castleSprite.x, y: keepfallScene.castleSprite.y })').then(JSON.parse);
    await d.ui(false); await d.camNow(c.x, c.y - 70, 1.25); await sleep(400);
    parts.push([await d.take(`c09-part-${k}-clean-t${t}`, '', 4, () => d.cam(c.x, c.y - 40, 1.6, 4000)), k]);
    await d.ui(true); await d.camNow(c.x, c.y - 70, 1.35); await sleep(400);
    parts.push([await d.take(`c09-part-${k}-ui-t${t}`, '', 1.3, () => d.cam(c.x, c.y - 50, 1.55, 1300)), k]);
  }
  const clean = parts.filter(([f]) => f.includes('-clean-')).map(([f]) => f), ui = parts.filter(([f]) => f.includes('-ui-')).map(([f]) => f);
  ff([...clean.flatMap((f) => ['-i', f]), '-filter_complex', clean.map((_, i) => `[${i}:v]crop=480:1080:720:0[v${i}]`).join(';') + ';' + clean.map((_, i) => `[v${i}]`).join('') + 'hstack=inputs=4,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '60', `${CLIPS}c09-clean-t${t}.mp4`]);
  ff([...ui.flatMap((f) => ['-i', f]), '-filter_complex', ui.map((_, i) => `[${i}:v]trim=0:1,setpts=PTS-STARTPTS[v${i}]`).join(';') + ';' + ui.map((_, i) => `[v${i}]`).join('') + 'concat=n=4:v=1:a=0,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '60', `${CLIPS}c09-ui-t${t}.mp4`]);
  console.log('c09 take', t, 'done');
}
d.close();
