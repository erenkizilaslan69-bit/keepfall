// Round 5 of the phone tests: the rival's small pop-up and its report, the kingdom panel (Merchant Republic), the rival castle's attack form, the notes while a modal is open,
// the spectator view with the Reports button and a report card. Usage: PW_DIR=<playwright> node tools/layout5-shots.mjs <out-prefix> [webkit|chromium] [http://localhost:5174]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { webkit, chromium } = require('playwright');
const OUT = process.argv[2] ?? 'l5';
const engine = process.argv[3] ?? 'webkit';
const URL = (process.argv[4] ?? 'http://localhost:5174').replace(/\/$/, '');
const W = 852, H = 393;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = engine === 'webkit'
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
await ctx.addInitScript("try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en');localStorage.setItem('keepfall.matches','5')}catch(e){};document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('sim-inset'))");
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL + '/');
await sleep(3000);
await page.fill('#name', 'Phone');
await page.click('#quick');
await page.waitForFunction("typeof window.keepfallScene === 'object' && !!keepfallScene.state", null, { timeout: 90000 });
await sleep(4000);
await page.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click()");
await sleep(500);
const tag = (n) => `${OUT}-${engine}-${n}.png`;
const shot = async (n) => { await sleep(700); await page.screenshot({ path: tag(n) }); };
const bars = engine === 'chromium' ? [['closed', 0], ['bar', 70]] : [['closed', 0]];
for (const [state, cut] of bars) {
  await page.setViewportSize({ width: W, height: H - cut });
  await sleep(1200);
  // 1 the rival's pop-up (avatar in the top strip) and the same with a report
  const avatar = await page.evaluate("(() => { const e = document.querySelector('.cam-rival, .rival-av, [data-rival]'); return !!e; })()");
  await page.evaluate("document.querySelector('.chip[data-seat=\"2\"]')?.click()");
  await shot(`${state}-1popup`);
  await page.evaluate("document.querySelector('.scroll-pop [data-act=close]')?.click()");
  // 2 the kingdom panel as the Merchant Republic
  await page.evaluate(`(() => { const k = keepfallUi.kingdom, c = k.castle; k.update = () => {}; k.build({ ...c.kingdom, id: 'tuccar', name: 'Merchant Republic' }, c); k.panel.classList.remove('hidden'); k.panel.scrollTop = 600; })()`);
  await shot(`${state}-2kingdom`);
  await page.evaluate("keepfallUi.kingdom.panel.classList.add('hidden')");
  // 3 the rival castle's attack form (war phase look: buttons enabled does not matter for the layout)
  await page.evaluate("keepfallScene.select({ kind: 'enemy', seat: 2 })");
  await sleep(800);
  await page.evaluate("document.querySelector('.win .win-body')?.scrollTo(0, 9999)");
  await shot(`${state}-3attack`);
  await page.evaluate('keepfallUi.windows.close(true)');
  // 4 notes over the spectator countdown: four server texts at once, the countdown window stays readable
  await page.evaluate("keepfallUi.setSpectatorWait(12)");
  await page.evaluate("['Kalen düştü, elendin. Artık izleyicisin.', 'Kırmızı saldırısı savunmanı yendi: kalen düştü.', 'Kalen düştü, elendin.'].forEach((t) => keepfallUi.notify(t))");
  await shot(`${state}-4fallen`);
}
await page.setViewportSize({ width: W, height: H });
console.log(OUT, engine, errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'no errors');
await browser.close();
