// Store-page screenshots from the PACKED demo (steam-build/Keepfall, see tools/pack-steam.mjs): the menu, the challenge list, the achievements screen,
// and a quick match (the prepared castle, a minute in). 1920x1080 (the store's screenshot size). Output: art/shots/steam/ (git-ignored: Tiny Swords art inside).
//   node tools/shot-steam.mjs [out-dir]            KFLANG=tr|en (default en), SIZE=1920,1080
//   node tools/shot-steam.mjs --clip [seconds]     raw trailer frames of a quick match, one per second: <out>/clip/f0001.png ...
//                                                  assemble: ffmpeg -framerate 30 -i clip/f%04d.png -c:v libx264 -pix_fmt yuv420p clip.mp4 (a 1 s step looks fast-forwarded: use -framerate 4..8 or interpolate)
// War, battle replays and the end screen need the dev speed (x5/x20): take those with the existing tools against a Development server
// (tools/shot-march.mjs, shot-fx.mjs, shot-kingdoms.mjs, shot-endscreen.mjs, shot-deceptions.mjs, shot-progress.mjs; docs/steam-magaza.md lists which frame comes from which).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep, root } from './steam-launch.mjs';

const args = process.argv.slice(2);
const clip = args.includes('--clip');
const nums = args.filter((a) => /^\d+$/.test(a));
const outDir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? join(root, 'art', 'shots', 'steam');
const [w, h] = (process.env.SIZE ?? '1920,1080').split(',').map(Number);
const lang = process.env.KFLANG || 'en';
mkdirSync(outDir, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'kf-steam-shot-'));
const app = await launch('shots', 9447, '', userData, join(outDir, 'x'));
try {
  await app.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await app.js(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.name','Aldric')}catch(e){}`);
  await app.js('location.reload()');
  await sleep(1500);
  await app.waitFor(`!!document.querySelector('#quick')`);
  await sleep(3000);
  const shot = async (name) => { writeFileSync(join(outDir, `${name}.png`), Buffer.from((await app.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); console.log('wrote', name); };
  if (!clip) {
    await shot('01-menu');
    await app.js(`document.querySelector('#challenges').click()`);
    await app.waitFor(`!!document.querySelector('.screen.challenges .ch-card')`);
    await sleep(1000);
    await shot('02-challenges');
    await app.js(`document.querySelector('[data-back]').click()`);
    await app.waitFor(`!!document.querySelector('#progress')`);
    await app.js(`document.querySelector('#progress').click()`);
    await sleep(1500);
    await shot('03-progress');
    await app.js(`document.querySelector('[data-back]')?.click()`);
    await app.waitFor(`!!document.querySelector('#quick')`);
  }
  await app.js(`document.querySelector('#quick').click()`);
  await app.waitFor(`document.querySelectorAll('canvas').length>0 && !document.querySelector('#quick')`, 60);
  await sleep(clip ? 3000 : 60000);
  if (!clip) { await shot('04-castle-prep'); }
  else {
    const seconds = Number(nums[0] ?? 40);
    mkdirSync(join(outDir, 'clip'), { recursive: true });
    for (let i = 1; i <= seconds; i++) {
      writeFileSync(join(outDir, 'clip', `f${String(i).padStart(4, '0')}.png`), Buffer.from((await app.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
      await sleep(1000);
    }
    console.log(`wrote ${seconds} frames to ${join(outDir, 'clip')}`);
  }
} finally {
  try { process.kill(app.child.pid); } catch { /* gone */ }
  await sleep(1500); // the server follows its parent (KEEPFALL_PARENT_PID)
}
