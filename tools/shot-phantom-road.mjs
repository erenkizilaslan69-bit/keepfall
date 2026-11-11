// A phantom army (the Shadow's) that comes apart on meeting an army on the road must fade for the RIVAL too (the one whose army it met), not blink out.
// The state is forced in the page (dev handles): a seen army of another colour beside one of ours, then it is gone with no battle. Also the negative
// control: the same army vanishing far from every other army just disappears (nothing is told by the fade). Pictures: art/shots/cila2/phantom-road-*.png.
// Needs the dev server (5081) and Vite (5174).   node tools/shot-phantom-road.mjs [out-prefix]
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/cila2/phantom-road';
mkdirSync(dirname(OUT), { recursive: true });
const b = await launch({ width: 1920, height: 1080 });
let bad = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };
try {
  await b.goto('http://localhost:5174/');
  await b.waitFor(`!!document.querySelector('#quick')`);
  await sleep(1500);
  await b.js(`document.querySelector('#quick').click()`);
  await b.waitFor(`!!window.keepfallScene?.layout && !!window.keepfallScene?.movers`, 60);
  await sleep(6000);
  await b.js(`document.querySelector('#kingdom-decree button')?.click(); document.querySelectorAll('.ui-root, #stage > :not(canvas)').forEach((e) => { e.style.display = 'none'; }); 1`);
  const made = await b.js(`(() => { const s = window.keepfallScene; s.setMap = () => {}; s.fog?.setVisible(false);
    const g = s.layout.regions.find((r) => r.seat === s.mySeat).gate; const seat = [...s.otherCastles.keys()][0]; const color = s.otherCastles.get(seat).color;
    const units = [{ unitId: 'kilicli', count: 6 }, { unitId: 'okcu', count: 4 }];
    window.__at = (dx, dy) => ({ x: g.x + dx, y: g.y + dy });
    const own = (p) => ({ id: 'own-1', kind: 'army', position: p, velocity: { x: 0, y: 0 }, route: [p], travelled: 0, speed: 0, units, fighting: false, decoy: false, visionRadius: 6 });
    const seen = (p) => ({ id: 'seen-1', kind: 'army', ownerSeat: seat, ownerColor: color, position: p, velocity: { x: 0, y: 0 }, units, fake: false });
    window.__sync = (ownP, seenP) => s.movers.sync({ elapsedSeconds: 0, vision: [], own: ownP ? [own(ownP)] : [], seen: seenP ? [seen(seenP)] : [], battles: [], trail: [], sites: [], lastSeen: [] });
    window.__faded = () => s.children.list.filter((c) => c.tintTopLeft === 0x8a6fd0 && c.visible).length;
    return { gate: g }; })()`);
  await b.js(`(async () => { const s = window.keepfallScene; const W = await import('/src/scene/world.ts'); const p = W.toWorld(window.__at(8, 0)); const cam = s.cameras.main; window.__hold = () => { cam.setZoom(2); cam.centerOn(p.x, p.y); requestAnimationFrame(window.__hold); }; window.__hold(); })(); 1`);
  // 1) beside one of our armies: it must fade
  await b.js(`window.__sync(window.__at(8.4, 0), window.__at(8, 0)); 1`); await sleep(800);
  await b.shot(`${OUT}-0-meeting.png`);
  check('before it goes nothing is faded', (await b.js(`window.__faded()`)) === 0);
  await b.js(`window.__sync(window.__at(8.4, 0), null); 1`); await sleep(350);
  check('seen army gone beside our army: it fades (rises as smoke)', (await b.js(`window.__faded()`)) > 0);
  await b.shot(`${OUT}-1-fading.png`); await sleep(500); await b.shot(`${OUT}-2-fading.png`); await sleep(1800);
  check('the fade ends (nothing left)', (await b.js(`window.__faded()`)) === 0);
  // 2) control: far from any other army it just vanishes
  await b.js(`window.__sync(window.__at(-6, 6), window.__at(8, 0)); 1`); await sleep(3500); // (our drawn army has to have walked over there first: it was made up beside the other)
  await b.js(`window.__sync(window.__at(-6, 6), null); 1`); await sleep(350);
  console.log('  (tracks left:', await b.js(`[...window.keepfallScene.movers.tracks.keys()].join(',')`), '; faded:', await b.js(`window.__faded()`), ')');
  check('seen army gone far from every other army: no fade', (await b.js(`window.__faded()`)) === 0);
  check('no stray sprites (audit clean)', (await b.js(`window.keepfallScene.movers.audit().length`)) === 0);
} finally { b.close(); }
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
