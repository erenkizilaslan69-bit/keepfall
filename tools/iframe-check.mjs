// The game inside a phone-sized iframe on ANOTHER origin (like CrazyGames), on a slow 4G connection: it loads, connects to the server across origins (CORS + WebSocket),
// reaches the home screen, starts a quick match and is playing. Needs: dev server 5081, Vite for the crazy platform on 5175
// (cd client && VITE_PLATFORM=crazygames KEEPFALL_SERVER=http://localhost:5081 KEEPFALL_CLIENT_PORT=5175 npx vite --port 5175), and the host page served on 8097
// (MSYS_NO_PATHCONV=1 node tools/serve-dist.mjs tools 8097 /). Usage: PW_DIR=<playwright> node tools/iframe-check.mjs [out.png]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'iframe.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-features=IsolateOrigins,site-per-process'] }) // (the iframe stays in the page's process so the network throttle applies to it too);
const ctx = await browser.newContext({ viewport: { width: 900, height: 460 }, deviceScaleFactor: 1 });
await ctx.addInitScript("try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en');localStorage.setItem('keepfall.matches','5')}catch(e){}");
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
// "slow 4G" as Chrome's DevTools defines it: 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
const t0 = Date.now();
await page.goto('http://localhost:8097/crazy-iframe.html?game=http://localhost:8096/', { waitUntil: 'commit' });
const frame = () => page.frames().find((f) => f !== page.mainFrame());
let f = null;
for (let i = 0; i < 60 && !f; i++) { f = frame(); await sleep(500); }
ok(!!f, 'the iframe is there (origin ' + (f ? new URL(f.url()).origin : '?') + ', the page is on ' + new URL(page.url()).origin + ')');
await f.waitForSelector('#quick', { timeout: 180000 });
ok(true, `the home screen after ${((Date.now() - t0) / 1000).toFixed(1)} s on slow 4G`);
const sdkSeen = await f.evaluate('typeof window.CrazyGames');
console.log('window.CrazyGames in the iframe (not the real site):', sdkSeen);
await f.fill('#name', 'Frame');
await f.click('#quick');
await f.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 180000 });
await sleep(6000);
ok(await f.evaluate("document.querySelectorAll('canvas').length > 0 && document.documentElement.classList.contains('in-game')"), 'a quick match is on in the iframe (canvas drawn)');
ok(!/Could not connect/.test(await f.evaluate('document.body.innerText')), 'no "Could not connect" message');
await page.screenshot({ path: OUT });
ok(errors.filter((e) => !/CrazyGames SDK|sdk.crazygames|ERR_/.test(e)).length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
await browser.close();
process.exit(bad ? 1 : 0);
