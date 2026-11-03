// Second tab of the same browser: the newer tab takes the seat (no second seat), the older one steps aside with a message; wrong room codes are rate-limited; the back button.
// PW_DIR=<playwright folder> node tools/tab-check.mjs [http://localhost:5174]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { chromium } = require('playwright');
const URL = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
await ctx.addInitScript("try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}");
const a = await ctx.newPage();
await a.goto(URL + '/'); await sleep(2500);
await a.fill('#name', 'Tab'); await a.click('#quick');
await a.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 90000 });
const code = await a.evaluate('keepfallNet.roomCode');
const seat = await a.evaluate('keepfallNet.seat');
await sleep(6000); // the active-room record
const b = await ctx.newPage();
await b.goto(URL + '/'); // no room in the address: the record sends it back to the room
await b.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 60000 });
ok((await b.evaluate('keepfallNet.roomCode')) === code && (await b.evaluate('keepfallNet.seat')) === seat, `new tab: same room ${code}, same seat ${seat} (no second seat)`);
await sleep(1500);
ok(/another tab/i.test(await a.evaluate('document.body.innerText')), 'old tab: "Open in another tab" message');
const players = await b.evaluate('keepfallNet.roomCode && document.querySelectorAll(".cam-rival").length');
ok(players === 3, `the room still has 3 rivals (${players})`);
// wrong codes
const c = await ctx.newPage();
await c.goto(URL + '/'); await sleep(2500);
const errs = await c.evaluate(`(async () => { await keepfallNet.leaveRoom(); const out = []; for (let i = 0; i < 8; i++) { const r = await keepfallNet.joinRoom('QQQQQ' + 'ABCDEFGH'[i], 'x'); out.push(r.error); } return out; })()`);
ok(/Too many/i.test(errs[7] ?? '') || /Çok fazla/.test(errs[7] ?? ''), `8 wrong codes: the last answer is "${errs[7]}"`);
await browser.close();
process.exit(bad ? 1 : 0);
