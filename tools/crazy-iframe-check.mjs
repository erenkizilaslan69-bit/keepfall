// CrazyGames QA preview stand-in: the game in an iframe of another origin (http://fake-crazy.test), MOUSE (no touch), CLEAN localStorage, at the sizes QA uses.
// Per size: does the guided first match start (tutorial card + frame)? are the window types laid out like on a desktop (cross visible and clickable, -/+ buttons square)?
// STORAGE=blocked makes localStorage/sessionStorage throw (a browser that blocks third-party storage in an iframe).
// Usage: PW_DIR=<playwright> node tools/crazy-iframe-check.mjs <out-prefix> [http://localhost:5174] [1196x630,1024x576,1280x720,1366x768]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'ci';
const GAME = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
const SIZES = (process.argv[4] ?? '1196x630,1024x576,1280x720,1366x768').split(',').map((s) => s.split('x').map(Number));
const BLOCKED = process.env.STORAGE === 'blocked';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { createServer } from 'node:http';
let PAGE = '';
// The stand-in site is a real server on another origin (127.0.0.1:8100, the game is on localhost): a route-faked origin is blocked from framing localhost by the browser.
const site = createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); }).listen(8100, '127.0.0.1');
const browser = await chromium.launch({ channel: 'chrome' });
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
for (const [W, H] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: W + 40, height: H + 80 }, hasTouch: false, isMobile: false });
  await ctx.addInitScript("try{localStorage.setItem('keepfall_lang','en')}catch(e){}");
  if (BLOCKED) await ctx.addInitScript("if (location.hostname === 'localhost') { for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(window, k, { get() { throw new DOMException('blocked', 'SecurityError'); } }); }");
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  PAGE = `<!doctype html><body style="margin:0;background:#222"><iframe id="g" src="${GAME}/" style="width:${W}px;height:${H}px;border:0;margin:20px" allow="autoplay; fullscreen"></iframe></body>`;
  await page.goto('http://127.0.0.1:8100/');
  const f = page.frameLocator('#g'); const frame = () => page.frames().find((x) => x.url().startsWith(GAME));
  await sleep(3500);
  const fr = frame(); if (!fr) console.log('frames', page.frames().map((x) => x.url()));
  const ev = (e) => fr.evaluate(e);
  const tag = `${OUT}-${W}x${H}${BLOCKED ? '-blocked' : ''}`;
  await fr.waitForSelector('#quick', { timeout: 40000 });
  await fr.fill('#name', 'Eren'); await fr.click('#quick');
  await fr.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 90000 });
  await sleep(5000);
  const tut = await ev("JSON.stringify({ card: !!document.querySelector('.tut-card'), frame: !!document.querySelector('.tut-frame'), touch: document.documentElement.classList.contains('touch'), coarse: matchMedia('(pointer: coarse)').matches, u: getComputedStyle(document.documentElement).getPropertyValue('--u') })");
  console.log(W + 'x' + H, tut);
  const t = JSON.parse(tut);
  ok(t.card && t.frame, `${W}x${H}: the guided match starts (tutorial card + frame)`);
  ok(!t.touch && !t.coarse, `${W}x${H}: desktop layout (no touch class)`);
  await page.screenshot({ path: `${tag}-0tutorial.png` });
  await ev("document.querySelector('.tut-card [data-act=skip], .tut-skip')?.click(); 1");
  await ev("(document.querySelector('#kingdom-decree [data-close]') ?? document.querySelector('.kingdom-decree button'))?.click(); 1");
  await sleep(600);
  // every window type: the cross visible + clickable, the +/- buttons square-ish and inside the window
  const wins = [['mine', "{ kind: 'building', type: 'mine' }"], ['farm', "{ kind: 'building', type: 'farm' }"], ['forge', "{ kind: 'building', type: 'forge' }"], ['castle', "{ kind: 'castle' }"], ['rival', "{ kind: 'enemy', seat: 2 }"]];
  for (const [name, target] of wins) {
    await ev(`keepfallUi.windows.close(true); keepfallScene.select(${target}); 1`);
    await sleep(900);
    const r = await ev(`(() => { const w = document.querySelector('.win'); if (!w) return 'null'; const x = w.querySelector('.win-close'); const xr = x && x.getBoundingClientRect(); const wr = w.getBoundingClientRect();
      const hit = xr && document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2); const btns = [...w.querySelectorAll('.btn-round')].map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0);
      return JSON.stringify({ x: xr && [Math.round(xr.left), Math.round(xr.top), Math.round(xr.width), Math.round(xr.height)], inside: xr && xr.left >= 0 && xr.top >= 0 && xr.right <= innerWidth && xr.bottom <= innerHeight, clickable: !!hit && (hit === x || x.contains(hit)), win: [Math.round(wr.left), Math.round(wr.top), Math.round(wr.width), Math.round(wr.height)], vh: innerHeight, btns: btns.slice(0, 6).map((b) => [Math.round(b.width), Math.round(b.height)]), bad: btns.filter((b) => b.width < 20 || b.height < 20 || Math.abs(b.width - b.height) > 8).length }); })()`);
    console.log('  ', name, r);
    if (r === 'null') { ok(false, `${W}x${H} ${name}: no window`); continue; }
    const j = JSON.parse(r);
    ok(j.x && j.inside && j.clickable, `${W}x${H} ${name}: the cross is visible and clickable`);
    ok(j.bad === 0, `${W}x${H} ${name}: -/+ buttons are round-ish (${j.btns.map((b) => b.join('x')).join(' ')})`);
    if (name === 'mine' || name === 'castle') await page.screenshot({ path: `${tag}-${name}.png` });
  }
  ok(errors.length === 0, `${W}x${H}: no page errors ${errors.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await browser.close(); site.close();
process.exit(bad ? 1 : 0);
