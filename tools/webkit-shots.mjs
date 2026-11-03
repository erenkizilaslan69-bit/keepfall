// WebKit (Safari's engine) and Chromium phone emulation with Playwright. Playwright is not a dependency of the repo: install it anywhere and point PW_DIR at that folder
// (`mkdir pw && cd pw && npm i playwright && npx playwright install webkit`).
// Usage: PW_DIR=<folder> node tools/webkit-shots.mjs <out-prefix> [engine=webkit|chromium] [WxH=852x393] [http://localhost:5174] [inset=0|1]
// inset=1 simulates a notch / Dynamic Island: safe-area insets of 0 (top) 59 (left/right) 21 (bottom) via CSS env() overrides (--sa-*), see ui/touch.css.
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { webkit, chromium } = require('playwright');
const OUT = process.argv[2] ?? 'wk';
const engine = process.argv[3] ?? 'webkit';
const [W, H] = (process.argv[4] ?? '852x393').split('x').map(Number);
const URL = (process.argv[5] ?? 'http://localhost:5174').replace(/\/$/, '');
const inset = process.argv[6] === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = engine === 'webkit'
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: engine === 'webkit' ? 3 : 2.625, isMobile: true, hasTouch: true, userAgent: UA });
await ctx.addInitScript(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}` + (inset ? `;document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('sim-inset'))` : ''));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const tag = `${OUT}-${engine}-${W}x${H}${inset ? '-inset' : ''}`;
await page.goto(URL + '/');
await sleep(3500);
await page.screenshot({ path: `${tag}-1home.png` });
await page.fill('#name', 'Phone');
await page.click('#quick');
await page.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 90000 });
await sleep(6000);
await page.screenshot({ path: `${tag}-2decree.png` });
await page.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click()");
await sleep(1200);
await page.screenshot({ path: `${tag}-3map.png` });
const open = async (name, expr) => { await page.evaluate(`keepfallScene.${expr}`); await sleep(1000); await page.screenshot({ path: `${tag}-${name}.png` }); await page.evaluate('keepfallUi.windows.close(true)'); await sleep(300); };
await open('4castle', "select({ kind: 'castle' })");
await open('5farm', "select({ kind: 'building', type: 'farm' })");
await open('6forge', "select({ kind: 'building', type: 'forge' })");
await open('7enemy', "select({ kind: 'enemy', seat: 2 })");
const info = await page.evaluate("({ iw: innerWidth, ih: innerHeight, canvas: [document.querySelector('#stage canvas').width, document.querySelector('#stage canvas').height], vv: [visualViewport.width, visualViewport.height], diag: window.keepfallScene ? [keepfallScene.scale.gameSize.width, keepfallScene.scale.gameSize.height] : null })");
console.log(tag, JSON.stringify(info), errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'no errors');
await browser.close();
