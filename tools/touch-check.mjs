// Touch input on the map with real touch events (CDP): a tap on the castle opens its window, one finger drags the map, two fingers pinch to zoom, a long press shows a tip,
// and a mouse still works (wheel zoom). Dev servers needed. Usage: node tools/touch-check.mjs [WxH=844x390] [http://localhost:5174]
import { launch, sleep } from './cdp.mjs';
const [W, H] = (process.argv[2] ?? '844x390').split('x').map(Number);
const URL = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch({ width: W, height: H, mobile: true, dpr: 2, ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
const touch = (type, pts) => b.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
const cam = () => b.js("(() => { const c = keepfallScene.cameras.main; return { x: c.scrollX, y: c.scrollY, z: c.zoom, mx: c.midPoint.x, my: c.midPoint.y, w: c.width, h: c.height }; })()");
try {
  await b.goto(URL + '/');
  await b.js("document.querySelector('#name').value='Touch'; document.querySelector('#quick').click(); 1");
  ok(await b.waitFor("document.documentElement.classList.contains('in-game')", 40), 'in the match (touch emulation)');
  await sleep(4000);
  await b.js("document.querySelector('#kingdom-decree [data-close]')?.click(); 1");
  await sleep(600);
  ok(await b.js("matchMedia('(pointer: coarse)').matches"), 'the page sees a coarse pointer');
  ok((await b.js("document.documentElement.classList.contains('touch')")) && (await b.js("(() => { try { return JSON.parse(localStorage.getItem('keepfall.prefs') ?? '{}').lowGraphics !== false } catch { return true } })()")), 'touch class on, low graphics default on');
  // tap on the castle
  const castle = await b.js("(() => { const s = keepfallScene.castleSprite, c = keepfallScene.cameras.main; return { x: (s.x - c.midPoint.x) * c.zoom + c.width / 2, y: (s.y - s.displayHeight / 2 - c.midPoint.y) * c.zoom + c.height / 2 }; })()");
  await touch('touchStart', [[castle.x, castle.y]]); await sleep(60); await touch('touchEnd', []);
  await sleep(900);
  ok(await b.js("!!document.querySelector('.ui-root .win')"), 'a tap on the castle opens its window');
  await b.shot('art/shots/touch-castle-window.png');
  await b.js("keepfallUi.windows.close(true); 1");
  // drag with one finger
  const c0 = await cam();
  await touch('touchStart', [[W / 2, H / 2]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[W / 2 - i * 20, H / 2 - i * 10]]); await sleep(20); }
  await touch('touchEnd', []); await sleep(300);
  const c1 = await cam();
  ok(Math.abs(c1.x - c0.x) > 40 && Math.abs(c1.y - c0.y) > 20, `one finger drags the map (scroll ${Math.round(c0.x)},${Math.round(c0.y)} -> ${Math.round(c1.x)},${Math.round(c1.y)})`);
  ok(!(await b.js("!!document.querySelector('.ui-root .win')")), 'a drag does not open a window');
  // a small wobble is a tap, not a drag
  const c2 = await cam();
  await touch('touchStart', [[W / 2, H / 2]]); await touch('touchMove', [[W / 2 + 4, H / 2 + 3]]); await touch('touchEnd', []); await sleep(600);
  ok(await b.js("!!document.querySelector('.ui-root .win')"), 'a tap (with a small wobble) opens the castle window');
  await b.js('keepfallUi.windows.close(true); 1');
  const c3 = await cam();
  ok(Math.abs(c3.x - c2.x) < 1 && Math.abs(c3.y - c2.y) < 1, 'a 5 px wobble does not move the map');
  // pinch out: zoom in, pinch in: zoom out
  const z0 = (await cam()).z;
  await touch('touchStart', [[W / 2 - 30, H / 2], [W / 2 + 30, H / 2]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[W / 2 - 30 - i * 12, H / 2], [W / 2 + 30 + i * 12, H / 2]]); await sleep(20); }
  await touch('touchEnd', []); await sleep(300);
  const z1 = (await cam()).z;
  ok(z1 > z0 * 1.3, `two fingers apart zoom in (${z0.toFixed(2)} -> ${z1.toFixed(2)})`);
  await touch('touchStart', [[W / 2 - 150, H / 2], [W / 2 + 150, H / 2]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[W / 2 - 150 + i * 14, H / 2], [W / 2 + 150 - i * 14, H / 2]]); await sleep(20); }
  await touch('touchEnd', []); await sleep(300);
  const z2 = (await cam()).z;
  ok(z2 < z1 * 0.8, `two fingers together zoom out (${z1.toFixed(2)} -> ${z2.toFixed(2)})`);
  ok(!(await b.js("!!document.querySelector('.ui-root .win')")), 'a pinch does not open a window');
  // the canvas moved 70 px with no event (Safari's address bar): a pinch still zooms about the middle between the fingers, a tap still lands
  await b.js("document.getElementById('stage').style.transform = 'translateY(70px)'");
  await sleep(300);
  const info = () => b.js("(() => { const c = keepfallScene.cameras.main, r = keepfallScene.game.canvas.getBoundingClientRect(); return { z: c.zoom, mx: c.midPoint.x, my: c.midPoint.y, w: c.width, h: c.height, top: r.top }; })()");
  const worldAt = (i, x, y) => ({ x: i.mx + (x - i.w / 2) / i.z, y: i.my + (y - i.top - i.h / 2) / i.z });
  const i0 = await info();
  const m = { x: W * 0.5, y: H * 0.5 + 70 };
  const p0 = worldAt(i0, m.x, m.y);
  await touch('touchStart', [[m.x - 40, m.y], [m.x + 40, m.y]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[m.x - 40 - i * 10, m.y], [m.x + 40 + i * 10, m.y]]); await sleep(20); }
  await touch('touchEnd', []); await sleep(300);
  const i1 = await info();
  const p1 = worldAt(i1, m.x, m.y);
  ok(i1.z > i0.z * 1.3 && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 8, `canvas shifted 70 px: pinch zooms about the fingers' middle (${i0.z.toFixed(2)} -> ${i1.z.toFixed(2)}, middle moved ${Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(1)} world px)`);
  await b.js("document.getElementById('stage').style.transform = ''");
  await sleep(300);

  // long press on a button with a title: the tip shows and the button is not pressed
  const btn = await b.js("(() => { const e = document.querySelector('[data-cam=home]'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await touch('touchStart', [[btn.x, btn.y]]); await sleep(700);
  ok(await b.js("!!document.querySelector('.kf-tip')"), 'a long press on a button shows its tip');
  await b.shot('art/shots/touch-longpress.png');
  await touch('touchEnd', []); await sleep(300);
  // targets of at least 44 px
  const small = await b.js("[...document.querySelectorAll('.ui-root button, .guide-fab, .settings-fab, .lang-fab')].filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return [e.className.toString().slice(0, 30), Math.round(r.width), Math.round(r.height)]; }).filter((x) => x[1] < 43 || x[2] < 43)");
  ok(small.length === 0, `every visible button is at least 44x44 (${JSON.stringify(small)})`);
  // a mouse still zooms with the wheel
  const zBefore = (await cam()).z;
  await b.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: -120 });
  await sleep(300);
  ok((await cam()).z > zBefore, 'mouse wheel zoom still works');
} finally { b.close(); }
process.exit(bad ? 1 : 0);
