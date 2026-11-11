// Pictures of two things nobody can stage on demand in a real match: a FALLEN castle (a solid ruin, not a see-through castle) and a phantom army of
// the Shadow coming apart at our gate (it fades and drifts up instead of blinking out). The state is forced in the page (dev handles), the drawing is
// the game's own. Needs the dev server (5081) and Vite (5174).
//   node tools/shot-ruin.mjs [out-prefix]      → art/shots/ruin/<prefix>-*.png (not in git: the pictures hold the Free Pack)
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/ruin/shot';
const URL = process.argv[3] ?? 'http://localhost:5174/';
mkdirSync(dirname(OUT), { recursive: true });
const b = await launch({ width: 1920, height: 1080 });
try {
  await b.goto(URL);
  await b.waitFor(`!!document.querySelector('#quick')`);
  await sleep(1500);
  await b.js(`document.querySelector('#quick').click()`);
  await b.waitFor(`!!window.keepfallScene?.layout && !!window.keepfallScene?.movers`, 60);
  await sleep(6000);
  await b.js(`document.querySelector('#kingdom-decree button')?.click(); document.querySelectorAll('.ui-root, #stage > :not(canvas)').forEach((e) => { e.style.display = 'none'; }); 1`);
  // a rival's castle, close up, no fog
  const seat = await b.js(`(() => { const s = window.keepfallScene; s.fog?.setVisible(false); const seat = [...s.otherCastles.keys()][0]; const c = s.otherCastles.get(seat); const cam = s.cameras.main; cam.setZoom(1.5); cam.centerOn(c.image.x, c.image.y - 60);
    window.__hold = () => { cam.setZoom(1.5); cam.centerOn(c.image.x, c.image.y - 60); requestAnimationFrame(window.__hold); }; window.__hold(); return seat; })()`);
  await sleep(1200);
  await b.shot(`${OUT}-castle-standing.png`);
  // the look before this change, set up by hand for the comparison (a squashed, grey, see-through castle and wall)
  await b.js(`(() => { const s = window.keepfallScene; const c = s.otherCastles.get(${seat}); c.image.setAlpha(0.45).setTint(0x888888).setScale(c.image.scaleX, c.image.scaleY * 0.8); const w = s.walls.get(${seat}); w?.rt?.setAlpha(0.45).setTint(0x888888); w?.floor?.image?.setAlpha(0.6).setTint(0x888888); window.__sy = c.image.scaleY / 0.8; return 1; })()`);
  await sleep(600);
  await b.shot(`${OUT}-castle-before.png`);
  await b.js(`(() => { const s = window.keepfallScene; const c = s.otherCastles.get(${seat}); c.image.setAlpha(1).clearTint().setScale(c.image.scaleX, window.__sy); const w = s.walls.get(${seat}); w?.rt?.setAlpha(1).clearTint(); w?.floor?.image?.setAlpha(1).clearTint(); s.setRoom = () => {}; c.fallen = false; s.markFallen(${seat}, c, true); return 1; })()`);
  await sleep(700);
  await b.shot(`${OUT}-castle-falling.png`); // the show: fireballs, the stone sinks
  await sleep(5000);
  await b.shot(`${OUT}-castle-after.png`);

  // a phantom army at our own gate: there, then gone
  const made = await b.js(`(() => { const s = window.keepfallScene; s.setMap = () => {}; const g = s.layout.regions.find((r) => r.seat === s.mySeat).gate; const base = s.state ? null : null;
    window.__map = (seen) => ({ elapsedSeconds: 0, vision: [], own: [], seen, battles: [], trail: [], sites: [], lastSeen: [] });
    window.__phantom = { id: 'phantom-1', kind: 'army', ownerSeat: ${seat}, ownerColor: s.otherCastles.get(${seat}).color, position: { x: g.x, y: g.y }, velocity: { x: 0, y: 0 }, units: [{ unitId: 'kilicli', count: 6 }, { unitId: 'okcu', count: 4 }] };
    const W = s.movers; W.sync(window.__map([window.__phantom]));
    const cam = s.cameras.main; cancelAnimationFrame(0); const at = { x: 0, y: 0 };
    return { gate: g, color: window.__phantom.ownerColor }; })()`);
  await b.js(`(async () => { const s = window.keepfallScene; const W = await import('/src/scene/world.ts'); const p = W.toWorld(${JSON.stringify(made.gate)}); const cam = s.cameras.main; window.__hold = () => { cam.setZoom(2); cam.centerOn(p.x, p.y - 20); requestAnimationFrame(window.__hold); }; return 1; })()`);
  await sleep(1500);
  await b.shot(`${OUT}-phantom-0-marching.png`);
  await b.js(`window.keepfallScene.movers.sync(window.__map([])); 1`);
  await sleep(330); await b.shot(`${OUT}-phantom-1.png`);
  await sleep(300); await b.shot(`${OUT}-phantom-2.png`);
  await sleep(500); await b.shot(`${OUT}-phantom-3.png`);
  await sleep(900); await b.shot(`${OUT}-phantom-4-gone.png`);
  const stray = await b.js(`window.keepfallScene.movers.audit().join(' | ')`);
  console.log('made', JSON.stringify(made), '| audit after:', stray || 'clean');
} finally { b.close(); }
