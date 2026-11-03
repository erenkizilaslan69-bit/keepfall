// The canvas moves under the finger without a resize event (Safari's address bar sliding in and out) and the viewport changes height in the middle of a match:
// a tap on a building must still land, and a pinch must zoom about the middle between the fingers. WebKit, touch events fired at the canvas.
// PW_DIR=<playwright folder> node tools/touch-offset-check.mjs [http://localhost:5174]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { webkit } = require('playwright');
const URL = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript("try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}");
const page = await ctx.newPage();
await page.goto(URL + '/');
await sleep(3000);
await page.fill('#name', 'Offset');
await page.click('#quick');
await page.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 90000 });
await sleep(6000);
await page.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click()");
await sleep(500);

// (WebKit has no Touch constructor, so only taps can be made here: page.touchscreen.tap. The pinch with a shifted canvas is in touch-check.mjs, with real multi-touch.)
const castleAt = () => page.evaluate("(() => { const s = keepfallScene.castleSprite, c = keepfallScene.cameras.main, r = keepfallScene.game.canvas.getBoundingClientRect(); return { x: r.left + (s.x - c.midPoint.x) * c.zoom + c.width / 2, y: r.top + (s.y - s.displayHeight / 2 - c.midPoint.y) * c.zoom + c.height / 2 }; })()");
const tap = async (p) => { await page.touchscreen.tap(p.x, p.y); await sleep(800); };
const pointerError = () => page.evaluate("(() => { const p = keepfallScene.input.pointer1, r = keepfallScene.game.canvas.getBoundingClientRect(); return { px: p.x, py: p.y, cx: p.downX, cy: p.downY, top: r.top, left: r.left }; })()");
const windowOpen = () => page.evaluate("!!document.querySelector('.ui-root .win')");
const closeWin = () => page.evaluate('keepfallUi.windows.close(true)');

// 0. a plain tap
await tap(await castleAt());
ok(await windowOpen(), 'a tap on the castle opens its window');
await closeWin();

// 1. the viewport gets shorter in the middle of the match (the address bar opens)
await page.setViewportSize({ width: 852, height: 323 });
await sleep(1500);
await tap(await castleAt());
ok(await windowOpen(), 'bar open (viewport 852x323): a tap on the castle still opens its window');
await closeWin();
await page.screenshot({ path: 'art/shots/touch-offset-bar-open.png' });

// 2. the canvas is moved 70 px without any resize event
await page.evaluate("document.getElementById('stage').style.transform = 'translateY(70px)'");
await tap(await castleAt());
ok(await windowOpen(), 'canvas moved 70 px with no event: the tap still lands on the castle');
// the point Phaser works with is the finger's place on the canvas: tap at client (300, 250) -> canvas (300, 180)
await page.touchscreen.tap(300, 250);
await sleep(300);
const pe = await pointerError();
ok(Math.abs(pe.px - 300) < 2 && Math.abs(pe.py - (250 - pe.top)) < 2, `canvas moved 70 px: the touch is at canvas (${Math.round(pe.px)}, ${Math.round(pe.py)}), expected (300, ${Math.round(250 - pe.top)})`);
await closeWin();

// 3. the bar closes again (taller viewport) and the stage moves back
await page.evaluate("document.getElementById('stage').style.transform = ''");
await page.setViewportSize({ width: 852, height: 393 });
await sleep(1200);
await tap(await castleAt());
ok(await windowOpen(), 'bar closed again: a tap still lands');
await closeWin();
await page.screenshot({ path: 'art/shots/touch-offset-bar-closed.png' });
await browser.close();
process.exit(bad ? 1 : 0);
