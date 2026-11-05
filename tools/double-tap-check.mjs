// iOS Safari zooms the page on a quick double tap. This drives WebKit (touch emulation, a phone held sideways) and double-taps every kind of button; the page scale must stay 1,
// the second touchend must be cancelled (that is what stops the zoom), and every tap must still count (two taps on "+1" queue two weapons, not one and not three).
// Needs the dev server and Vite: PW_DIR=<playwright> node tools/double-tap-check.mjs [http://localhost:5174] [852,393]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { webkit } = require('playwright');
const URL = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const [W, H] = (process.argv[3] ?? '852,393').split(',').map(Number);
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript("try{localStorage.setItem('keepfall_lang','en');localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true')}catch(e){}");
await ctx.addInitScript("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.tb-speed { display: none !important; }'; document.head.appendChild(s); })");
const p = await ctx.newPage();
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(URL + '/'); await p.waitForSelector('#quick');
await p.fill('#name', 'Tap'); await p.click('#quick');
await p.waitForFunction("document.documentElement.classList.contains('in-game')", null, { timeout: 60000 });
await sleep(4500);
await p.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click(); 1");
// what the page sees: the second touchend of a quick pair is cancelled; the scale never leaves 1
await p.evaluate("window.__ends = []; document.addEventListener('touchend', (e) => window.__ends.push(e.defaultPrevented), false); 1");
const scale = () => p.evaluate('window.visualViewport.scale');
const center = (sel) => p.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
const dbl = async (sel, gap = 90) => { const c = await center(sel); if (!c) return false; await p.touchscreen.tap(c[0], c[1]); await sleep(gap); await p.touchscreen.tap(c[0], c[1]); await sleep(400); return true; };
const queued = () => p.evaluate("(keepfallScene.state.queue ?? []).reduce((n, o) => n + o.remaining, 0)");

// 1. "+1" of the forge: two quick taps = two weapons
await p.evaluate("keepfallScene.select({ kind: 'building', type: 'forge' }); 1"); await sleep(900);
const q0 = await queued();
const sel = '[data-act="queue"][data-n="1"]:not(:disabled)';
ok(await dbl(sel), 'forge window: the +1 button exists');
await sleep(1500);
const q1 = await queued();
ok(q1 - q0 === 2, `two quick taps on +1 queue two weapons (${q0} -> ${q1})`);
ok((await scale()) === 1, 'page scale is 1 after double-tapping +1');
// 2. the close cross, tabs of the castle window, tabs of a rival's window, a player chip
await dbl('.win-close'); // (the first tap closes the window; the second lands on the map under it and may open something else: at most one window is open)
ok(await p.evaluate("document.querySelectorAll('.win').length <= 1"), 'the close cross: a double tap leaves at most one window');
await p.evaluate("keepfallScene.select({ kind: 'castle' }); 1"); await sleep(900);
await dbl('.win .tab:nth-child(2)'); ok(await p.evaluate("document.querySelectorAll('.win .tab.on').length === 1"), 'castle tabs: a double tap on a tab leaves one tab selected');
await p.evaluate("keepfallUi.windows.close(true); keepfallScene.select({ kind: 'enemy', seat: 2 }); 1"); await sleep(900);
await dbl('[data-tab-sec="envoy"]'); ok(await p.evaluate("document.querySelector('[data-sec=envoy]').classList.contains('on')"), "a rival's tabs: the Envoy tab is open after a double tap");
await dbl('.chip[data-seat]:not(.me)'); ok((await scale()) === 1, 'page scale is 1 after double-tapping a player chip');
await dbl('.settings-fab, .tb-icons [data-settings]'); ok(await p.evaluate("!!document.querySelector('.settings')"), 'settings opens on a double tap (once, not toggled away)') ;
// 3. the quick second touchend was cancelled, the scale never moved
const ends = await p.evaluate('window.__ends');
ok(ends.some((d) => d === true), `a second touchend of a quick pair was cancelled (${ends.filter(Boolean).length} of ${ends.length})`);
ok((await scale()) === 1, 'page scale is still 1 at the end');
ok(await p.evaluate("document.documentElement.getBoundingClientRect().width === innerWidth"), 'the page is not wider than the screen');
ok(errors.length === 0, 'no page errors ' + errors.slice(0, 2).join(' | '));
await b.close();
process.exit(bad ? 1 : 0);
