// Automatic interface audit on phones, tablets and desktop. Drives the game into every screen it can (dev/test hooks only: window.keepfallNet / keepfallUi / keepfallScene, which exist in the
// Vite dev build and NOT in a production build), taps every visible clickable thing, takes a picture of everything that opens, and measures:
//   outside the viewport / safe area, covered by something else, clipped text, text under 12 px, touch targets under 44 px, sideways scroll in windows, missing close button,
//   too many / overlapping notes, console errors, failed requests, taps that change nothing, canvas not filling the screen.
// Output: docs/ui-audit.md, art/shots/ui-audit/** (pictures, never committed) and contact sheets (art/shots/ui-audit/sheets/*.png).
//
// Needs: the dev server (ASPNETCORE_ENVIRONMENT=Development dotnet run ... --urls http://localhost:5081) and Vite (cd client && KEEPFALL_SERVER=http://localhost:5081 npx vite --port 5174), and Playwright
// somewhere (mkdir pw && cd pw && npm i playwright && npx playwright install webkit; PW_DIR points at that folder).
// (start the dev server with Keepfall__MaxRooms=0: the audit opens many rooms; a full server answers "servers are full")
//   PW_DIR=<folder> node tools/ui-audit.mjs [--devices iphone16,pixel7] [--lang en,tr] [--states home,lobby] [--jobs 3] [--url http://localhost:5174] [--out docs/ui-audit.md] [--quick]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { webkit, chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const URL_ = arg('url', 'http://localhost:5174').replace(/\/$/, '');
const OUT_MD = resolve(ROOT, arg('out', 'docs/ui-audit.md'));
const SHOTS = join(ROOT, 'art', 'shots', 'ui-audit');
const QUICK = process.argv.includes('--quick');
const JOBS = Number(arg('jobs', 3));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- devices ------------------------------------------------------------------------------------------------------------------------------------------------
const NOTCH = { t: 0, r: 59, b: 21, l: 59 };
const DEVICES = [
  { id: 'iphone16', engine: 'webkit', w: 852, h: 393, touch: true, dpr: 3, inset: NOTCH },
  { id: 'iphone16-bar', engine: 'webkit', w: 852, h: 323, touch: true, dpr: 3, inset: NOTCH },
  { id: 'iphoneSE', engine: 'webkit', w: 667, h: 375, touch: true, dpr: 2, inset: null },
  { id: 'iphoneProMax', engine: 'webkit', w: 932, h: 430, touch: true, dpr: 3, inset: NOTCH },
  { id: 'pixel7', engine: 'chromium', w: 915, h: 412, touch: true, dpr: 2.625, inset: null },
  { id: 'small', engine: 'chromium', w: 640, h: 360, touch: true, dpr: 2, inset: null },
  { id: 'ipad', engine: 'chromium', w: 1180, h: 820, touch: true, dpr: 2, inset: null },
  { id: 'desk1366', engine: 'chromium', w: 1366, h: 768, touch: false, dpr: 1, inset: null },
  { id: 'desk1920', engine: 'chromium', w: 1920, h: 1080, touch: false, dpr: 1, inset: null },
];
const pick = (list, key) => { const v = arg(key); return v ? list.filter((x) => v.split(',').includes(x.id ?? x)) : list; };
const devices = pick(DEVICES, 'devices');
const langs = (arg('lang', 'en,tr')).split(',');
const wantState = (n) => { const v = arg('states'); return !v || v.split(',').includes(n); };

// ---- the checks that run inside the page ----------------------------------------------------------------------------------------------------------------------
const AUDIT_JS = `(opts) => {
  const iw = innerWidth, ih = innerHeight, touch = opts.touch, inset = opts.inset || { t: 0, r: 0, b: 0, l: 0 };
  const out = [];
  const desc = (e) => { if (!e) return '?'; const c = (e.className && e.className.baseVal === undefined ? String(e.className) : '').trim().split(/\\s+/).slice(0, 2).join('.'); const txt = (e.getAttribute('aria-label') || e.textContent || e.title || '').trim().replace(/\\s+/g, ' ').slice(0, 24); return e.tagName.toLowerCase() + (c ? '.' + c : '') + (txt ? ' "' + txt + '"' : ''); };
  const faceAway = (e) => { const f = e.closest('.ucard-face'); const card = e.closest('.ucard'); return !!(f && card && (f.classList.contains('back') !== card.classList.contains('flipped'))); }; // (the side of a deck card that is turned away)
  const visible = (e) => { if (faceAway(e)) return false; const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || n.hidden) return false; } return true; };
  const scroller = (e) => { for (let n = e.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2) return n; } return null; };
  const clipRect = (e) => { let r = e.getBoundingClientRect(); const vis = { left: 0, top: 0, right: iw, bottom: ih }; for (let n = e.parentElement; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = n.getBoundingClientRect(); vis.left = Math.max(vis.left, b.left); vis.top = Math.max(vis.top, b.top); vis.right = Math.min(vis.right, b.right); vis.bottom = Math.min(vis.bottom, b.bottom); } } return { r, vis }; };
  const add = (sev, type, e, note, rect) => { const r = rect || (e && e.getBoundingClientRect()); out.push({ sev, type, el: desc(e), note: note || '', rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null }); };
  const SEL = 'button, a[href], input, select, textarea, [role=button], [data-act], [data-a], [data-cam], [data-tab], .btn, .btn-round, .tab, .chip[data-seat], .report-tag';
  const skip = (e) => e.closest('.kf-diag, .kf-touch-dom, .kf-tip, .tut-root, .tb-speed, .tb-c, .dev-only, .kf-debug, [data-dev]') || e.matches('input[type=hidden]'); // (.tb-speed: dev-only speed buttons; .tb-c: the player's banner hangs from the top edge by design)
  const pageScrolls = !!document.scrollingElement && document.scrollingElement.scrollHeight > ih + 2 && document.documentElement.classList.contains('in-menu');
  const els = [...new Set([...document.querySelectorAll(SEL)])].filter((e) => visible(e) && !skip(e));
  const rotate = document.getElementById('rotate-screen'); const rotateOn = rotate && getComputedStyle(rotate).display !== 'none';
  for (const e of els) {
    if (rotateOn && !rotate.contains(e)) continue;
    const { r, vis } = clipRect(e);
    const sc = scroller(e);
    const ix = Math.max(0, Math.min(r.right, vis.right) - Math.max(r.left, vis.left)), iy = Math.max(0, Math.min(r.bottom, vis.bottom) - Math.max(r.top, vis.top));
    const hiddenInScroll = sc && (iy < r.height - 1) && !(r.top < 0 || r.bottom > ih); // scrolled out of its own scroller: not an error
    if (hiddenInScroll || ix === 0 || iy === 0) continue;
    // outside the screen
    const outB = pageScrolls ? 0 : r.bottom - ih; // (a menu page that scrolls: the part below the fold is not hidden)
    if (r.left < -1 || r.top < -1 || r.right > iw + 1 || outB > 1) add('critical', 'outside-viewport', e, 'sticks out by ' + Math.round(Math.max(-r.left, -r.top, r.right - iw, outB)) + ' px');
    else if (inset.l + inset.r + inset.t + inset.b > 0 && (r.left < inset.l - 1 || r.right > iw - inset.r + 1 || r.top < inset.t - 1 || r.bottom > ih - inset.b + 1) && !e.closest('.fab, .guide-fab, .settings-fab, .lang-fab'))
      add('minor', 'outside-safe-area', e, 'inside the notch / home-bar band');
    // covered
    const cx = Math.min(Math.max(r.left + r.width / 2, vis.left + 1), vis.right - 1), cy = Math.min(Math.max(r.top + r.height / 2, vis.top + 1), vis.bottom - 1);
    if (cx >= 0 && cy >= 0 && cx <= iw && cy <= ih) {
      const top = document.elementFromPoint(cx, cy);
      if (e.matches('input[type=checkbox], input[type=radio]')) { /* custom-drawn: the label covers it on purpose */ } else if (top && top.closest('.guide-overlay, .modal-shade, .spec-wait, .win, .kingdom-panel, .scroll-pop, .decree, .settings, .guide, .screen.end, .screen.lobby') && !e.closest('.guide-overlay, .modal-shade, .spec-wait, .win, .kingdom-panel, .scroll-pop, .decree, .settings, .guide, .screen.end, .screen.lobby')) { /* a window lies over what is behind it on purpose: only its own things and what must stay reachable are counted */ } else if (top && !(top === e || e.contains(top) || top.contains(e) || (e.tagName === 'INPUT' && top.closest('label') === e.closest('label')))) add('critical', 'covered', e, 'covered by ' + desc(top));
    }
    // touch target
    if (touch && (r.width < 43.5 || r.height < 43.5)) { const hit = getComputedStyle(e, '::after'); const grown = hit && hit.content !== 'none' && hit.position === 'absolute'; if (!grown) add(Math.min(r.width, r.height) < 28 ? 'important' : 'minor', 'small-target', e, Math.round(r.width) + 'x' + Math.round(r.height) + ' px'); }
    // clipped text
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX) && (e.textContent || '').trim()) add('important', 'text-clipped', e, 'scrollWidth ' + e.scrollWidth + ' > ' + e.clientWidth);
  }
  // text size (every element that owns a text node), one entry per distinct tag.class
  const seen = new Set();
  for (const e of document.querySelectorAll('body *')) {
    if (skip(e) || !visible(e)) continue;
    if (rotateOn && !rotate.contains(e)) continue;
    let own = false; for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) { own = true; break; }
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 11.95) { const key = e.tagName + '.' + String(e.className).split(' ')[0]; if (!seen.has(key)) { seen.add(key); add(fs < 10 ? 'important' : 'minor', 'small-text', e, fs.toFixed(1) + ' px'); } }
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX) && !e.matches('button, .btn, [role=button]') && getComputedStyle(e).display !== 'inline') add('important', 'text-clipped', e, 'scrollWidth ' + e.scrollWidth + ' > ' + e.clientWidth);
  }
  // windows
  const WINS = '.win, .kingdom-panel, .scroll-pop, .decree, .settings, .guide, .tut-card, .modal-shade > *, .spec-wait .paper, .screen.end, .screen.lobby';
  for (const w of document.querySelectorAll(WINS)) {
    if (!visible(w)) continue;
    const r = w.getBoundingClientRect();
    if (w.scrollWidth > w.clientWidth + 2 && !/lobby|end/.test(w.className)) add('important', 'window-hscroll', w, 'scrollWidth ' + w.scrollWidth + ' > ' + w.clientWidth);
    if (r.left < -1 || r.right > iw + 1 || (r.top < -1 && !/lobby|end/.test(w.className)) || (r.bottom > ih + 1 && !/lobby|end/.test(w.className))) add('critical', 'window-outside', w, 'window sticks out of the screen');
    if (/^(win |win$)|kingdom-panel|scroll-pop|decree|settings|guide|modal/.test(w.className + ' ')) {
      const closers = [...document.querySelectorAll('.win-close, [data-close], .kd-x, .decree-x, [data-act=close], [data-a=close], .guide-close')].filter((c) => visible(c));
      const ok = closers.some((c) => { const b = c.getBoundingClientRect(); return b.left >= -1 && b.right <= iw + 1 && b.top >= -1 && b.bottom <= ih + 1; });
      if (!ok && !w.classList.contains('tut-card')) add('critical', 'no-visible-close', w, 'no close button inside the screen');
    }
  }
  // notes
  const notes = [...document.querySelectorAll('.notes .ribbon')].filter(visible);
  if (notes.length > 2) add('important', 'notes-many', notes[0], notes.length + ' notes at once');
  const modal = [...document.querySelectorAll('.spec-wait:not(.hidden) .paper, .modal-shade:not(.hidden) > *, .guide-overlay .guide')].filter(visible)[0];
  if (modal) for (const n of notes) { const a = n.getBoundingClientRect(), b = modal.getBoundingClientRect(); if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) { add('important', 'note-over-modal', n, 'a note lies over ' + desc(modal)); break; } }
  // the page itself
  const se = document.scrollingElement; if (se && se.scrollWidth > iw + 1) add('important', 'page-hscroll', document.body, 'page scrolls sideways by ' + (se.scrollWidth - iw));
  const cv = [...document.querySelectorAll('#stage canvas:not(.minimap)')].sort((a, b) => b.width - a.width)[0];
  if (cv && document.documentElement.classList.contains('in-game')) { const b = cv.getBoundingClientRect(); if (Math.abs(b.left) > 1 || Math.abs(b.top) > 1 || Math.abs(b.width - iw) > 2 || Math.abs(b.height - ih) > 2) add('critical', 'canvas-not-full', cv, 'canvas ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' at ' + Math.round(b.left) + ',' + Math.round(b.top) + ' on ' + iw + 'x' + ih); }
  return { issues: out, clickable: els.length };
}`;

// ---- one run: a device in a language ---------------------------------------------------------------------------------------------------------------------------
const SEV_ORDER = { critical: 0, important: 1, minor: 2 };
async function run(device, lang) {
  const tag = `${device.id}-${lang}`;
  const dir = join(SHOTS, tag);
  mkdirSync(dir, { recursive: true });
  const results = { tag, device: device.id, lang, states: [], issues: [], worked: [], skipped: [], consoleErrors: [], failed: [] };
  const browser = await (device.engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chrome' }));
  const UA = device.engine === 'webkit' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    : device.touch ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' : undefined;
  const ctx = await browser.newContext({ viewport: { width: device.w, height: device.h }, deviceScaleFactor: device.dpr, isMobile: device.touch && device.id !== 'ipad', hasTouch: device.touch, userAgent: UA });
  const inset = device.inset;
  await ctx.addInitScript(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.matches','5')}catch(e){}` +
    (inset ? `;document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('sim-inset'))` : ''));
  const page = await ctx.newPage();
  const where = { state: 'start' };
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(sdk\.crazygames|favicon)/.test(m.text())) results.consoleErrors.push({ state: where.state, text: m.text().slice(0, 160) }); });
  page.on('pageerror', (e) => results.consoleErrors.push({ state: where.state, text: String(e).slice(0, 160) }));
  page.on('requestfailed', (r) => { if (!/crazygames|favicon|client-log/.test(r.url())) results.failed.push({ state: where.state, url: r.url().slice(0, 100), why: r.failure()?.errorText }); });

  const tap = async (x, y) => { if (device.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  const auditOpts = { touch: device.touch, inset: inset ?? { t: 0, r: 0, b: 0, l: 0 } };
  let shotN = 0;
  /** Audit what is on the screen now: measure, outline the problems in red, take the picture. */
  const audit = async (state, note = '') => {
    where.state = state;
    let res;
    try { res = await page.evaluate(`(${AUDIT_JS})(${JSON.stringify(auditOpts)})`); } catch (e) { results.skipped.push(`${state}: audit failed (${String(e).slice(0, 80)})`); return null; }
    const file = join(dir, `${String(++shotN).padStart(3, '0')}-${state.replace(/[^a-z0-9-]/gi, '_')}.png`);
    try {
      await page.evaluate((rects) => { document.querySelectorAll('.kf-audit-box').forEach((n) => n.remove()); for (const [x, y, w, h] of rects) { const d = document.createElement('div'); d.className = 'kf-audit-box'; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:2px solid #ff1744;background:rgba(255,23,68,.15);z-index:2147483000;pointer-events:none`; document.body.appendChild(d); } }, res.issues.filter((i) => i.rect && i.sev !== 'minor').map((i) => i.rect));
      await page.screenshot({ path: file });
      await page.evaluate(() => document.querySelectorAll('.kf-audit-box').forEach((n) => n.remove()));
    } catch (e) { results.skipped.push(`${state}: screenshot failed`); }
    const rel = file.slice(SHOTS.length + 1).replace(/\\/g, '/');
    results.states.push({ state, note, shot: rel, issues: res.issues.length, clickable: res.clickable });
    for (const i of res.issues) results.issues.push({ ...i, state, shot: rel });
    if (res.issues.length === 0) results.worked.push(state);
    return res;
  };
  const sig = () => page.evaluate("document.body.innerText.length + ':' + document.querySelectorAll('*').length + ':' + document.documentElement.className + ':' + (window.keepfallUi && keepfallUi.windows && keepfallUi.windows.isOpen)");
  const NO_TAP = /quick|hızlı oyna|private room|oda kur|join room|odaya katıl|leave|ayrıl|ana menü|main menu|reload|yenile|retry|finish|bitir|rehberi tekrar|restart|restart tutorial|new match|yeni maç|again|tekrar/i;
  /** Tap every visible clickable thing inside `root`, one by one: what changed is audited and shot, then `reopen` puts the screen back. */
  const LIST = `(sel) => { const box = document.querySelector(sel); if (!box) return []; const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    return [...box.querySelectorAll('button, [data-act], [data-a], [data-tab], select, .tab, .btn, a[href]')].filter((e) => vis(e) && e.tagName !== 'SELECT' && !/^(−|-)$/.test((e.textContent || '').trim()) && !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !/(^| )(disabled|inactive|off)( |$)/.test(e.className) && getComputedStyle(e).pointerEvents !== 'none' && !e.matches('.win-close, [data-close], .kd-x, [data-act=close], [data-a=close]'))
      .map((e, i) => { const r = e.getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2, label: (e.getAttribute('aria-label') || e.textContent || e.dataset.act || e.dataset.a || e.dataset.tab || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 20) }; }); }`;
  /** Tap every visible clickable thing inside `root`, one by one: what changed is audited and shot, then `reopen` puts the screen back. */
  const exercise = async (state, root, reopen, cap = 14) => {
    const list = await page.evaluate(`(${LIST})(${JSON.stringify(root)})`);
    let n = 0;
    for (const t of list) {
      if (n >= cap) break;
      if (NO_TAP.test(t.label) || t.label === 'TR' || t.label === 'EN') continue;
      n++;
      await reopen();
      const els = await page.evaluate(`(${LIST})(${JSON.stringify(root)})`);
      const at = els[t.i]; if (!at || at.label !== t.label) continue; // (the screen is not the same any more: nothing is tapped blindly)
      const before = await sig();
      try { await tap(at.x, at.y); } catch { continue; }
      await sleep(450);
      const after = await sig();
      const tapState = `${state}-tap-${t.label.replace(/[^a-z0-9]+/gi, '_')}`;
      if (before === after) { results.issues.push({ sev: 'critical', type: 'dead-button', el: t.label, note: 'an active button; the tap changed nothing', rect: null, state: tapState, shot: null }); continue; }
      await audit(tapState, 'after tapping "' + t.label + '"');
    }
  };

  const home = async () => { await page.goto(URL_ + '/'); await sleep(2800); };
  const closeAll = async () => { try { await page.evaluate("(() => { document.getElementById('kingdom-decree')?.remove(); try { keepfallUi.windows.close(true); keepfallUi.closeTop && keepfallUi.closeTop(); } catch (e) {} document.querySelectorAll('.settings-overlay, .guide-overlay').forEach((n) => n.remove()); })()"); } catch { /* */ } };

  try {
    // ---- menus
    if (wantState('home')) {
      await home();
      await audit('home');
      if (!QUICK) await exercise('home', '#app', home, 6);
      await home();
      await page.evaluate("document.querySelector('.settings-fab').click()"); await sleep(600);
      await audit('settings');
      if (!QUICK) await exercise('settings', '.settings', async () => { await home(); await page.evaluate("document.querySelector('.settings-fab').click()"); await sleep(500); }, 8);
      await home();
      await page.evaluate("document.querySelector('.guide-fab').click()"); await sleep(900);
      await audit('help');
      await home();
    }
    // ---- lobby: private room, bots, deck; the quick match is the match below
    if (wantState('lobby')) {
      await home();
      await page.fill('#name', 'Audit'); await page.evaluate("document.querySelector('#create').click()");
      await page.waitForSelector('.lobby', { timeout: 20000 }); await sleep(1800);
      await audit('lobby-private');
      await page.evaluate("(async () => { for (const l of ['easy', 'medium']) await keepfallNet.addBot(l); })()"); await sleep(900);
      await audit('lobby-with-bots');
      await page.evaluate("document.querySelector('#deck-cards')?.scrollIntoView()"); await sleep(500);
      await audit('lobby-deck');
      await page.evaluate("document.querySelector('.share')?.scrollIntoView()"); await sleep(300);
      await audit('lobby-invite');
      if (!QUICK) await exercise('lobby', '.lobby', async () => {}, 8);
      await page.evaluate("keepfallNet.leaveRoom()");
    }
    // ---- a match
    if (wantState('match')) {
      await home();
      await page.fill('#name', 'Audit'); await page.evaluate("document.querySelector('#quick').click()");
      await page.waitForFunction("typeof window.keepfallScene === 'object' && !!keepfallScene.state", null, { timeout: 90000 });
      await page.waitForSelector('#kingdom-decree', { timeout: 20000 }).catch(() => {});
      await page.waitForFunction("!document.querySelector('.cloud-curtain')", null, { timeout: 15000 }).catch(() => {}); await sleep(900);
      await audit('decree');
      await page.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click()"); await sleep(500);
      const decreeAgain = await page.evaluate("!!document.getElementById('kingdom-decree')");
      if (decreeAgain) { results.issues.push({ sev: 'important', type: 'decree-stays', el: '#kingdom-decree', note: 'the decree did not close with its button', rect: null, state: 'decree', shot: null }); await page.evaluate("document.getElementById('kingdom-decree')?.remove()"); }
      await audit('prep-hud');
      const sel = async (t) => { await closeAll(); await page.evaluate(`keepfallScene.select(${JSON.stringify(t)})`); await sleep(800); };
      for (const type of ['farm', 'lumberCamp', 'mine', 'forge']) {
        await sel({ kind: 'building', type });
        await audit('building-' + type);
        if (!QUICK) await exercise('building-' + type, '.ui-root .win', async () => sel({ kind: 'building', type }), 8);
      }
      await sel({ kind: 'castle' });
      await audit('castle');
      const tabs = await page.evaluate("[...document.querySelectorAll('.ui-root .win [data-tab]')].map((t) => t.dataset.tab)");
      for (const tb of tabs) { await sel({ kind: 'castle' }); await page.evaluate((x) => document.querySelector(`.ui-root .win [data-tab="${x}"]`)?.click(), tb); await sleep(500); await audit('castle-tab-' + tb); }
      if (!QUICK) await exercise('castle', '.ui-root .win', async () => sel({ kind: 'castle' }), 8);
      const seats = await page.evaluate("keepfallUi.room.players.filter((p) => p.seat !== keepfallNet.seat).map((p) => p.seat)");
      for (const seat of seats.slice(0, QUICK ? 1 : 3)) {
        await sel({ kind: 'enemy', seat });
        await audit('enemy-' + seat);
        await page.evaluate("document.querySelector('.ui-root .win .win-body')?.scrollTo(0, 99999)"); await sleep(300);
        await audit('enemy-' + seat + '-attack-form');
        if (!QUICK && seat === seats[0]) await exercise('enemy', '.ui-root .win', async () => sel({ kind: 'enemy', seat }), 10);
      }
      // the rival's avatar pop-up, with and without a scout report
      await closeAll();
      await page.evaluate(`document.querySelector('.chip[data-seat="${seats[0]}"]')?.click()`); await sleep(600);
      await audit('rival-avatar-panel');
      await page.evaluate(`(() => { const u = keepfallUi, c = u.castle; const rep = { targetSeat: ${seats[0]}, targetName: 'Bot', targetColor: 'red', observedAt: c.elapsedSeconds, deliveredAt: c.elapsedSeconds, soldiers: [{ unitId: 'kilicli', name: 'Swordsman', count: 5 }, { unitId: 'okcu', name: 'Archer', count: 3 }], buildings: [{ type: 'farm', name: 'Farm', level: 2 }, { type: 'forge', name: 'Blacksmith', level: 1 }], kingdom: 'golge', deck: ['kilicli', 'okcu', 'mizrakci', 'kalkanli'] }; u.castle = { ...c, scouting: { ...c.scouting, reports: [rep] } }; u.renderScroll && u.renderScroll(); })()`); await sleep(500);
      await audit('scout-report');
      await closeAll();
      // the kingdom panel: all four kingdoms
      for (const [id, name] of [['golge', 'Shadow Kingdom'], ['tuccar', 'Merchant Republic'], ['kahin', 'The Oracles'], ['entrikaci', 'The Schemers']]) {
        await page.evaluate(`(() => { const k = keepfallUi.kingdom, c = k.castle; k.update = () => {}; k.build({ ...c.kingdom, id: '${id}', name: '${name}', look: '${id}' }, c); k.panel.classList.remove('hidden'); k.panel.scrollTop = 0; })()`); await sleep(500);
        await audit('kingdom-' + id);
        await page.evaluate("keepfallUi.kingdom.panel.scrollTo(0, 99999)"); await sleep(300);
        await audit('kingdom-' + id + '-end');
        if (!QUICK) await exercise('kingdom-' + id, '.kingdom-panel', async () => { await page.evaluate(`(() => { const k = keepfallUi.kingdom, c = k.castle; k.build({ ...c.kingdom, id: '${id}', name: '${name}', look: '${id}' }, c); k.panel.classList.remove('hidden'); })()`); await sleep(300); }, 6);
        await page.evaluate("keepfallUi.kingdom.panel.classList.add('hidden')");
      }
      // forest: the quarters and made-up places (village, camp, big camp, chest)
      await sel({ kind: 'forest', id: 'northWest' });
      await audit('forest-quarter');
      const mk = (id, kind, bandits, minSoldiers = 0) => ({ id, kind, position: { x: 100, y: 100 }, spur: [], quarter: 'northWest', gone: false, bandits, discoveredAt: 1, seenAt: 1, minSoldiers });
      for (const [id, kind, bandits] of [['s1', 'village', [{ unitId: 'kilicli', name: 'Swordsman', count: 4 }]], ['s2', 'camp', [{ unitId: 'okcu', name: 'Archer', count: 6 }]], ['s3', 'bigCamp', [{ unitId: 'kilicli', name: 'Swordsman', count: 8 }, { unitId: 'okcu', name: 'Archer', count: 6 }]], ['s4', 'chest', []]]) {
        await closeAll();
        await page.evaluate(`(() => { const u = keepfallUi; u.sites = [${JSON.stringify(mk(id, kind, bandits, 3))}]; u.setSites = () => {}; u.open({ kind: 'site', id: '${id}' }); })()`); await sleep(700);
        await audit('site-' + kind);
        if (!QUICK && kind === 'bigCamp') await exercise('site-' + kind, '.ui-root .win', async () => { await page.evaluate(`keepfallUi.open({ kind: 'site', id: '${id}' })`); await sleep(400); }, 6);
      }
      await closeAll();
      // an army on its way, several notes, the connection dropping and coming back
      await page.evaluate("keepfallUi.notes.setIncoming([{ fromSeat: 2, fromName: 'Bot Red', fromColor: 'red', arrivesInSeconds: 25 }, { fromSeat: 3, fromName: 'Bot Yellow', fromColor: 'yellow', arrivesInSeconds: 40 }], 1)"); await sleep(500);
      await audit('incoming-armies');
      await page.evaluate("keepfallUi.notes.setIncoming([], 1); ['Red\\'s scout spied on your castle.', 'Your scout is back.', 'Yellow\\'s scout spied on your castle.', 'Exploration done: the places of this part of the forest are on the map'].forEach((t, i) => keepfallUi.notes.push(t + i, 'info', 8000))"); await sleep(600);
      await audit('notes-burst');
      await page.evaluate("keepfallNet.on.status('reconnecting')"); await sleep(1900);
      await audit('connection-lost');
      await page.evaluate("keepfallNet.on.status('connected')"); await sleep(700);
      await audit('connection-back');
      await sleep(2000);
      // the reports modal and the spectator countdown (made up), the portrait "rotate" screen
      await page.evaluate("keepfallUi.setSpectatorWait(10)"); await sleep(500);
      await page.evaluate("['Kalen düştü, elendin.', 'Kalen düştü.'].forEach((t) => keepfallUi.notify(t))"); await sleep(500);
      await audit('eliminated-countdown');
      await page.evaluate("(() => { keepfallUi.wait.classList.add('hidden'); })()");
      if (device.touch) {
        await page.setViewportSize({ width: device.h, height: device.w }); await sleep(900);
        await audit('portrait-rotate-screen');
        await page.setViewportSize({ width: device.w, height: device.h }); await sleep(900);
      }
      // the war, sped up: what shows up by itself (battles, reports, falling, spectating, the end screen) is audited when it appears
      await page.evaluate("keepfallNet.setSpeed(20)");
      const seen = new Set(); const t0 = Date.now();
      while (Date.now() - t0 < (QUICK ? 40000 : 170000)) {
        await sleep(1500);
        const st = await page.evaluate("(() => { const c = window.keepfallUi && keepfallUi.castle; return JSON.stringify({ end: !!document.querySelector('.screen.end'), phase: c && c.phase, elim: c && c.eliminated, inc: document.querySelectorAll('.notes .ribbon').length, rep: document.querySelectorAll('.report-tag, .report-toggle:not(.hidden)').length, spec: !!(window.keepfallUi && keepfallUi.spectating) }); })()").catch(() => null);
        if (!st) continue;
        const s = JSON.parse(st);
        if (s.phase === 'war' && !seen.has('war')) { seen.add('war'); await audit('war-phase'); }
        if (s.rep && !seen.has('reports')) { seen.add('reports'); await audit('war-reports'); await page.evaluate("document.querySelector('.report-toggle')?.click()"); await sleep(500); await audit('war-reports-list'); await page.evaluate("document.querySelector('.report-toggle')?.click()"); await sleep(300); }
        if (s.elim && !seen.has('elim')) { seen.add('elim'); await audit('eliminated'); }
        if (s.spec && !seen.has('spec')) { seen.add('spec'); await sleep(1200); await audit('spectator'); }
        if (s.end) { await sleep(1500); await audit('match-end'); seen.add('end'); break; }
      }
      if (!seen.has('end')) results.skipped.push('match-end: the match did not finish in the time allowed');
      if (!seen.has('war')) results.skipped.push('war-phase: not reached');
      if (!seen.has('reports')) results.skipped.push('battle reports: none appeared in the time allowed');
      if (!seen.has('elim')) results.skipped.push('elimination / spectator: the player was not eliminated (state not reached)');
      if (seen.has('end')) { if (!QUICK) await exercise('match-end', '.screen.end', async () => {}, 4); }
    }
  } catch (e) {
    results.skipped.push('run stopped: ' + String(e).slice(0, 300)); console.log(tag, 'STOPPED', String(e).slice(0, 300));
  }
  await browser.close();
  return results;
}

// ---- run everything, write the report and the contact sheets ------------------------------------------------------------------------------------------------------
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
if (!process.argv.includes('--keep')) for (const f of existsSync(SHOTS) ? readdirSync(SHOTS) : []) if (!arg('devices') || f.startsWith(arg('devices').split(',')[0])) rmSync(join(SHOTS, f), { recursive: true, force: true });
const jobs = [];
for (const d of devices) for (const l of langs) jobs.push([d, l]);
const all = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => {
  while (next < jobs.length) {
    const [d, l] = jobs[next++];
    const t0 = Date.now();
    const r = await run(d, l).catch((e) => ({ tag: `${d.id}-${l}`, device: d.id, lang: l, states: [], issues: [], worked: [], skipped: ['crashed: ' + String(e).slice(0, 120)], consoleErrors: [], failed: [] }));
    console.log(`${r.tag}: ${r.states.length} screens, ${r.issues.length} issues (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    all.push(r);
  }
}));
all.sort((a, b) => a.tag.localeCompare(b.tag));

const issues = all.flatMap((r) => r.issues.map((i) => ({ ...i, device: r.device, lang: r.lang })));
for (const r of all) for (const c of r.consoleErrors) issues.push({ sev: 'critical', type: 'console-error', el: '', note: c.text, rect: null, state: c.state, shot: null, device: r.device, lang: r.lang });
for (const r of all) for (const f of r.failed) issues.push({ sev: 'important', type: 'failed-request', el: f.url, note: f.why, rect: null, state: f.state, shot: null, device: r.device, lang: r.lang });
// the same problem on the same element in the same state on many devices/languages is one line with a count
const groups = new Map();
for (const i of issues) { const wide = ['small-text', 'small-target', 'outside-safe-area', 'covered', 'dead-button'].includes(i.type); const k = [i.sev, i.type, wide ? '(several screens)' : i.state, i.el].join('|'); const g = groups.get(k) ?? { ...i, state: wide ? '(several screens)' : i.state, where: [], count: 0 }; g.count++; if (g.where.length < 4) g.where.push(`${i.device}/${i.lang}`); if (!g.shot && i.shot) g.shot = i.shot; groups.set(k, g); }
const grouped = [...groups.values()].sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || b.count - a.count);
const byType = {};
for (const i of issues) byType[i.type] = (byType[i.type] ?? 0) + 1;
const bySev = { critical: 0, important: 0, minor: 0 };
for (const i of issues) bySev[i.sev]++;
const screens = all.reduce((n, r) => n + r.states.length, 0);

// contact sheets: 9 small pictures with a label each; the worst screens first, plus one sheet of screens with no problem at all
const stateRows = all.flatMap((r) => r.states.map((s) => ({ ...s, device: r.device, lang: r.lang, bad: r.issues.filter((i) => i.shot === s.shot && i.sev !== 'minor').length, worst: r.issues.filter((i) => i.shot === s.shot).sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev])[0] })));
const sheetDir = join(SHOTS, 'sheets');
mkdirSync(sheetDir, { recursive: true });
async function sheet(name, rows, title) {
  if (!rows.length) return null;
  const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#111;color:#eee;font:13px sans-serif"><h3 style="margin:8px">${title}</h3><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px">${rows.map((r) => `<figure style="margin:0;background:#222;border:2px solid ${r.worst ? (r.worst.sev === 'critical' ? '#ff1744' : r.worst.sev === 'important' ? '#ff9100' : '#ffd600') : '#00c853'}"><div style="padding:4px 6px;font-size:12px"><b>${r.worst ? r.worst.sev.toUpperCase() + ': ' + r.worst.type : 'OK'}</b> · ${r.device}/${r.lang} · ${r.state}${r.worst ? '<br>' + (r.worst.el + ' ' + r.worst.note).slice(0, 70) : ''}</div><img src="file:///${join(SHOTS, r.shot).replace(/\\/g, '/')}" style="width:100%;display:block"></figure>`).join('')}</div></body>`;
  const f = join(sheetDir, name + '.html');
  writeFileSync(f, html);
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 1800, height: 1000 } });
  await p.goto('file:///' + f.replace(/\\/g, '/'));
  await sleep(800);
  const h = await p.evaluate('document.body.scrollHeight');
  await p.setViewportSize({ width: 1800, height: Math.min(h, 3200) });
  await p.screenshot({ path: join(sheetDir, name + '.png'), fullPage: true });
  await b.close();
  rmSync(f);
  return `art/shots/ui-audit/sheets/${name}.png`;
}
const worstFirst = stateRows.filter((r) => r.bad > 0).sort((a, b) => SEV_ORDER[a.worst.sev] - SEV_ORDER[b.worst.sev] || b.bad - a.bad);
// one picture per (state kind) first, so the sheets show different problems rather than the same one on every device
const seenKinds = new Set(); const diverse = [];
for (const r of worstFirst) { const k = r.state.replace(/-tap-.*/, '') + '|' + r.worst.type; if (!seenKinds.has(k)) { seenKinds.add(k); diverse.push(r); } }
const sheets = [];
for (let i = 0; i < Math.min(diverse.length, 36); i += 9) { const s = await sheet(`problems-${i / 9 + 1}`, diverse.slice(i, i + 9), `Problems (page ${i / 9 + 1})`); if (s) sheets.push(s); }
const good = await sheet('all-good', stateRows.filter((r) => r.state && !r.worst && r.clickable > 3).filter((_, i) => i % 5 === 0).slice(0, 9), 'Everything fine');
if (good) sheets.push(good);

// ---- docs/ui-audit.md
const md = [];
md.push('# UI audit', '', `Generated by \`tools/ui-audit.mjs\` (${new Date().toISOString().slice(0, 16).replace('T', ' ')}). Devices: ${devices.map((d) => `${d.id} ${d.w}x${d.h}`).join(', ')}. Languages: ${langs.join(', ')}.`, '');
md.push('## Summary', '', `- Screens audited: **${screens}** (${all.length} runs).`, `- Issues: **${issues.length}** (critical ${bySev.critical}, important ${bySev.important}, minor ${bySev.minor}); ${grouped.length} distinct after grouping equal problems across devices.`, `- By type: ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
md.push('### Ten most critical', '');
grouped.slice(0, 10).forEach((g, i) => md.push(`${i + 1}. **${g.sev}** \`${g.type}\` in *${g.state}* — ${g.el} ${g.note ? '(' + g.note + ')' : ''} — ${g.count}× (${g.where.join(', ')}) — ${g.shot ? '`' + g.shot + '`' : ''}`));
md.push('', '## Active buttons that did nothing (dead buttons)', '', ...(grouped.filter((g) => g.type === 'dead-button').map((g) => `- ${g.el} — ${g.state} — ${g.count}× (${g.where.join(', ')})`) || []), '', '## Contact sheets', '', ...sheets.map((s) => `- \`${s}\``), '');
for (const sev of ['critical', 'important', 'minor']) {
  const rows = grouped.filter((g) => g.sev === sev);
  md.push(`## ${sev[0].toUpperCase() + sev.slice(1)} (${rows.length})`, '', '| type | state | element | note | count | where | picture |', '|---|---|---|---|---|---|---|');
  for (const g of rows) md.push(`| ${g.type} | ${g.state} | ${g.el.replace(/\|/g, '/')} | ${String(g.note).replace(/\|/g, '/').slice(0, 80)} | ${g.count} | ${g.where.join(', ')} | ${g.shot ? '`' + g.shot + '`' : ''} |`);
  md.push('');
}
md.push('## What works (screens with no finding)', '');
const okStates = new Map();
for (const r of all) for (const s of r.worked) okStates.set(s, (okStates.get(s) ?? 0) + 1);
for (const [s, n] of [...okStates].sort()) md.push(`- ${s} (${n}/${all.length} runs clean)`);
md.push('', '## Not reached / skipped', '');
for (const r of all) for (const s of r.skipped) md.push(`- ${r.tag}: ${s}`);
md.push('', '## Per run', '', '| run | screens | issues |', '|---|---|---|', ...all.map((r) => `| ${r.tag} | ${r.states.length} | ${r.issues.length + r.consoleErrors.length + r.failed.length} |`), '');
writeFileSync(OUT_MD, md.join('\n'));

console.log(`\n${screens} screens, ${issues.length} issues: critical ${bySev.critical}, important ${bySev.important}, minor ${bySev.minor}`);
console.log('by type:', JSON.stringify(byType));
console.log('top 10:'); grouped.slice(0, 10).forEach((g, i) => console.log(` ${i + 1}. ${g.sev} ${g.type} [${g.state}] ${g.el} ${g.note} x${g.count}`));
console.log('report:', OUT_MD); console.log('sheets:', sheets.join(', '));
