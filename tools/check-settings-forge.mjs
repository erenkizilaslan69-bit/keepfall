// Two window checks (with pictures for before/after):
//  settings: the window keeps one size in every tab (title, tab strip and close button never move; a long tab scrolls in its body), in 15 languages, 1280x720 and 1920x1080;
//  forge: while weapons are being made each order's bar and time left sit under its own weapon row, and the window needs no scrolling when it opens.
// Needs the dev server (speed control on) and Vite:  KEEPFALL_SERVER=http://localhost:5083 KEEPFALL_CLIENT_PORT=5176 npm --prefix client run dev
//   node tools/check-settings-forge.mjs <out-prefix> [settings,forge] [langs=all] [sizes=1280x720,1920x1080]      (URL=http://localhost:5176)
// Pictures go to art/shots/<out-prefix>-*.png (git-ignored). Exit 1 when a check fails.
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const PREFIX = process.argv[2] ?? 'settings-forge';
const WHAT = (process.argv[3] ?? 'settings,forge').split(',');
const ALL = ['en', 'tr', 'zh-CN', 'zh-TW', 'ru', 'es-ES', 'es-419', 'pt-BR', 'de', 'fr', 'ja', 'ko', 'pl', 'it', 'uk'];
const LANGS = !process.argv[4] || process.argv[4] === 'all' ? ALL : process.argv[4].split(',');
const SIZES = (process.argv[5] ?? '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
const BASE = (process.env.URL ?? 'http://localhost:5176').replace(/\/$/, '');
mkdirSync('art/shots', { recursive: true });
const init = (lang) => `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall.matches','12');localStorage.setItem('keepfall.normalMatches','12');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false, fullRules: true }));sessionStorage.setItem('keepfall.lowfps-offer','1')}catch(e){}`;
let bad = 0;
const fail = (msg) => { bad++; console.log('  FAIL', msg); };

// ---- settings: the box, the title, the tab strip and the close button, measured in every tab ----
const MEASURE = `(() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(','); };
  const body = document.querySelector('.settings-body'); const pane = [...document.querySelectorAll('.settings [data-pane]')].find((p) => !p.classList.contains('hidden'));
  return JSON.stringify({ box: r('.settings'), title: r('.settings .guide-title'), tabs: r('.settings .set-tabs'), close: r('.settings .guide-close'), foot: r('.settings .set-foot'),
    scrolls: body ? body.scrollHeight > body.clientHeight + 1 : false, fits: (() => { const b = document.querySelector('.settings').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; })(),
    pane: pane ? Math.round(pane.scrollHeight) : 0 }); })()`;
async function settings() {
  for (const [w, h] of SIZES) for (const lang of LANGS) {
    const b = await launch({ width: w, height: h, init: init(lang) });
    try {
      await b.goto(BASE + '/'); await b.waitFor(`!!document.querySelector('.settings-fab')`, 30); await sleep(1200);
      await b.js(`document.querySelector('.settings-fab').click(); 1`); await sleep(600);
      const seen = {};
      for (const tab of ['sound', 'display', 'language', 'game', 'controls']) {
        await b.js(`document.querySelector('.set-tab[data-tab="${tab}"]').click(); 1`); await sleep(250);
        seen[tab] = JSON.parse(await b.js(MEASURE));
        if (lang === 'tr' || lang === 'en' || lang === 'de') await b.shot(`art/shots/${PREFIX}-settings-${w}-${lang}-${tab}.png`);
      }
      const tabs = Object.keys(seen), first = seen[tabs[0]];
      const moved = ['box', 'title', 'tabs', 'close', 'foot'].filter((k) => tabs.some((t) => seen[t][k] !== first[k]));
      const notFit = tabs.filter((t) => !seen[t].fits);
      console.log(`settings ${w}x${h} ${lang}: box ${first.box}${moved.length ? '  MOVES: ' + moved.map((k) => `${k} [${tabs.map((t) => seen[t][k]).join(' | ')}]`).join('; ') : '  steady'}  scrolling tabs: ${tabs.filter((t) => seen[t].scrolls).join(',') || 'none'}`);
      if (moved.length) fail(`${w}x${h} ${lang}: settings window moves when the tab changes (${moved.join(',')})`);
      if (notFit.length) fail(`${w}x${h} ${lang}: settings window leaves the screen (${notFit.join(',')})`);
    } finally { b.close(); }
  }
}

// ---- forge: a real solo match, weapons ordered, the window opened while they are being made ----
const FORGE = `(() => { const win = [...document.querySelectorAll('.win')].find((w) => w.querySelector('[data-unit]')); if (!win) return JSON.stringify(null);
  const body = win.querySelector('.win-body') ?? win; const sc = [body, ...body.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
  const wb = win.getBoundingClientRect(); const bars = [...win.querySelectorAll('.gbar:not(.hidden)')].filter((g) => g.closest('[data-unit], .order'));
  const rows = bars.map((g) => { const row = g.closest('[data-unit]'); const gb = g.getBoundingClientRect(); return { unit: row?.dataset.unit ?? null, visible: gb.bottom <= Math.min(wb.bottom, innerHeight) && gb.top >= wb.top, text: (g.closest('.uorder, .order')?.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 40) }; });
  return JSON.stringify({ scrolls: !!sc, win: [Math.round(wb.top), Math.round(wb.bottom)], rows }); })()`;
async function forge() {
  for (const [w, h] of SIZES) for (const lang of LANGS.filter((l) => l === 'tr' || l === 'en').slice(0, 2)) {
    const b = await launch({ width: w, height: h, init: init(lang) });
    const call = (expr) => b.js(`(async () => JSON.stringify(await ${expr}))()`);
    try {
      await b.goto(BASE + '/'); await b.waitFor(`!!document.querySelector('#play')`, 40); await sleep(1200);
      await b.js(`document.querySelector('#play').click(); 1`); await b.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= 4`, 30); await sleep(800);
      await b.js(`document.querySelector('#start').click(); 1`); await b.waitFor(`document.documentElement.classList.contains('in-game') && !!window.keepfallUi?.castle`, 60); await sleep(1500);
      await b.js(`document.querySelector('#kingdom-decree [data-close], #kingdom-decree button')?.click(); 1`); await sleep(500);
      const net = (m, ...a) => call(`window.keepfallNet.${m}(${a.map((x) => JSON.stringify(x)).join(',')})`);
      await net('moveWorkers', 'idle', 'farmer', 3); await net('moveWorkers', 'idle', 'lumberjack', 2); await net('moveWorkers', 'idle', 'miner', 2); await net('moveWorkers', 'idle', 'blacksmith', 2);
      await net('setSpeed', 10); await sleep(9000); await net('setSpeed', 1);
      const c = JSON.parse(await b.js(`JSON.stringify(keepfallUi.castle)`)); const deck = c.deck ?? c.units.map((u) => u.id);
      // three orders: two of the first weapon of the deck, then one of another, then the first again (each its own line)
      await net('queueWeapon', deck[0], 2); await net('queueWeapon', deck[1], 1); await net('queueWeapon', deck[0], 1);
      await sleep(2500);
      await b.js(`keepfallUi.windows.close(); keepfallUi.open({ kind: 'building', type: 'forge' }); 1`); await sleep(2500);
      const r = JSON.parse(await b.js(FORGE));
      await b.shot(`art/shots/${PREFIX}-forge-${w}-${lang}.png`);
      console.log(`forge ${w}x${h} ${lang}: window ${r?.win}, scrolls ${r?.scrolls}, bars ${JSON.stringify(r?.rows)}`);
      if (!r) fail(`${w}x${h} ${lang}: forge window not open`);
      else {
        if (r.scrolls) fail(`${w}x${h} ${lang}: the forge window needs scrolling`);
        if (!r.rows.length) fail(`${w}x${h} ${lang}: no order bar in the forge`);
        if (r.rows.some((x) => !x.unit)) fail(`${w}x${h} ${lang}: an order bar is not under its weapon row`);
        if (r.rows.some((x) => !x.visible)) fail(`${w}x${h} ${lang}: an order bar is out of sight`);
      }
      await b.js(`window.keepfallLeave && window.keepfallLeave(); 1`).catch(() => {}); await sleep(400);
    } finally { b.close(); }
  }
}

if (WHAT.includes('settings')) await settings();
if (WHAT.includes('forge')) await forge();
console.log(bad ? `${bad} problem(s)` : 'all good');
process.exit(bad ? 1 : 0);
