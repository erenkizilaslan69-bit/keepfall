// An army's picture when the server's news stops for a few seconds (a phone's network stalling, a throttled tab) and then arrives in a burst: the column must not stand still and
// then jump (a "teleport"). The drawn position at the moment the news arrives is compared with the server's position; needs the dev server + Vite. Usage: node tools/movers-stall-check.mjs
import { launch, sleep } from './cdp.mjs';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch({ width: 852, height: 393, mobile: true, dpr: 1 });
try {
  await b.goto('http://localhost:5174/');
  await b.js("document.querySelector('#name').value='S'; document.querySelector('#quick').click(); 1");
  await b.waitFor("typeof window.keepfallScene === 'object' && !!keepfallScene.state && !!keepfallScene.movers && !!keepfallScene.movers.corrections", 90);
  await sleep(3000);
  const r = await b.js(`(() => {
    const scene = keepfallScene, m = scene.movers;
    scene.scene.pause(); // the scene's own frames stop: the test drives the clock
    let clock = 100000; const realNow = performance.now.bind(performance); performance.now = () => clock;
    const army = (travelled) => ({ own: [{ id: 't1', kind: 'army', units: [{ unitId: 'kilicli', name: 'Swordsman', count: 3 }], position: { x: 10, y: 10 + travelled }, velocity: { x: 0, y: 2.5 }, route: [{ x: 10, y: 10 }, { x: 10, y: 90 }], travelled, speed: 2.5, visionRadius: 5, fighting: false, missionKind: null, targetSeat: 0, quarter: null, siteId: null }], seen: [] });
    const frames = (sec) => { for (let i = 0; i < sec * 60; i++) { clock += 1000 / 60; m.update(1 / 60); } };
    m.corrections.length = 0;
    m.sync(army(0)); frames(1); m.sync(army(2.5)); frames(1); m.sync(army(5));
    frames(4.5); // a stall: nothing arrives for 4.5 s, the army walked 11.25 tiles
    m.sync(army(5 + 2.5 * 4.5));
    const stalled = m.corrections.filter((c) => c.key === 'own:t1').map((c) => +c.tiles.toFixed(2));
    frames(0.5);
    const t = m.tracks.get('own:t1'); const shownY = t.shown.y;
    performance.now = realNow; scene.scene.resume();
    return JSON.stringify({ corrections: stalled, shownY, serverY: 10 + 5 + 2.5 * 4.5 });
  })()`);
  const d = JSON.parse(r);
  console.log(JSON.stringify(d));
  ok(d.corrections.length >= 3, 'the news was seen by the mover');
  ok(Math.max(...d.corrections.slice(-1)) < 2.5, `after a 4.5 s stall the drawn column is ${d.corrections.at(-1)} tiles from the server's position when the news arrives (limit 2.5)`);
} finally { b.close(); }
process.exit(bad ? 1 : 0);
