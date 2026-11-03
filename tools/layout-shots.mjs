// The phone layout items of round 3, one picture each, with the address bar closed and open (Chrome) or closed (WebKit):
// 1 the camera buttons, 2 a window next to the right edge (rival castle), 3 the castle window's Defense tab (cross, save button), 4 the kingdom panel with the decoy steppers,
// 5 the notes at the start of the war, 6 a "reconnecting" blip. Usage: PW_DIR=<playwright folder> node tools/layout-shots.mjs <out-prefix> [webkit|chromium] [WxH=852x393] [http://localhost:5174]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { webkit, chromium } = require('playwright');
const OUT = process.argv[2] ?? 'lay';
const engine = process.argv[3] ?? 'chromium';
const [W, H] = (process.argv[4] ?? '852x393').split('x').map(Number);
const URL = (process.argv[5] ?? 'http://localhost:5174').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = engine === 'webkit'
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
await ctx.addInitScript("try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}");
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL + '/');
await sleep(3000);
await page.fill('#name', 'Phone');
await page.click('#quick');
await page.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 90000 });
await page.waitForFunction("typeof window.keepfallScene === 'object' && !!keepfallScene.state", null, { timeout: 90000 });
await sleep(4000);
await page.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click()");
await sleep(600);
const tag = (n) => `${OUT}-${engine}-${W}x${H}-${n}`;
const states = engine === 'chromium' ? [['closed', 0], ['bar', 70]] : [['closed', 0]];
const close = () => page.evaluate('keepfallUi.windows.close(true)');
for (const [name, cut] of states) {
  await page.setViewportSize({ width: W, height: H - cut });
  await sleep(1500);
  await page.screenshot({ path: `${tag(name)}-1cam.png` });
  await page.evaluate("keepfallScene.select({ kind: 'enemy', seat: 2 })");
  await sleep(900);
  await page.screenshot({ path: `${tag(name)}-2enemy.png` });
  await close();
  await page.evaluate("keepfallScene.select({ kind: 'castle' })");
  await sleep(900);
  await page.evaluate("[...document.querySelectorAll('.win [data-tab]')].pop()?.click()");
  await sleep(500);
  await page.screenshot({ path: `${tag(name)}-3castle.png` });
  await close();
  // the kingdom panel with the Shadow Kingdom's decoy controls (the real kingdom is drawn by lot: the view is rebuilt as the shadow one)
  await page.evaluate(`(() => { const k = keepfallUi.kingdom, c = k.castle; k.update = () => {}; const kv = { ...c.kingdom, id: 'golge', name: 'Shadow Kingdom' }; k.build(kv, c); k.panel.classList.remove('hidden'); })()`);
  await sleep(700);
  await page.screenshot({ path: `${tag(name)}-4kingdom.png` });
  await page.evaluate("keepfallUi.kingdom.panel.classList.add('hidden')");
  // notes: two notes at once, a long one
  await page.evaluate("keepfallUi.notes.push('The war has begun! Your armies can set out.', 'battle', 6000); keepfallUi.notes.push('Purple\\'s scout spied on your castle and saw a long list of things you would rather keep secret.', 'info', 6000)");
  await sleep(700);
  await page.screenshot({ path: `${tag(name)}-5notes.png` });
  await sleep(6500);
}
await page.setViewportSize({ width: W, height: H });
console.log(tag('x'), errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'no errors');
await browser.close();
