// Readability: the text inside panels (windows, the kingdom panel, settings, reports) must be at least 14 px (effective) and nothing may spill at 1280x720.
// Needs the dev server and Vite (KEEPFALL_SERVER=http://localhost:5083 KEEPFALL_CLIENT_PORT=5176 npm --prefix client run dev; URL env).
//   node tools/check-textsize.mjs [size=1280x720,1920x1080] [langs=tr,en]       exit 1 when a panel has text under 14 px
import { launch, sleep } from './cdp.mjs';
const BASE = (process.env.URL ?? 'http://localhost:5176').replace(/\/$/, '');
const SIZES = (process.argv[2] ?? '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
const LANGS = (process.argv[3] ?? 'tr,en').split(',');
const MIN = 14;
let bad = 0;
const SCAN = `(() => { const roots = [...document.querySelectorAll('.win, .kingdom-panel:not(.hidden), .settings, .report-win, .info-win, .guide:not(.settings), .scout-report')].filter((e) => e.offsetParent);
  const out = []; const seen = new Set();
  for (const root of roots) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || !el.offsetParent) continue;
      const cs = getComputedStyle(el); const px = parseFloat(cs.fontSize); if (px >= ${MIN} - 0.05) continue;
      const key = (el.className || el.tagName) + '|' + Math.round(px); if (seen.has(key)) continue; seen.add(key);
      out.push({ sel: el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.'), px: Math.round(px * 10) / 10, text: n.textContent.trim().slice(0, 28), root: String(root.className).split(' ')[0] }); } }
  const spill = roots.filter((r) => { const b = r.getBoundingClientRect(); return b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.left < -1 || b.top < -1; }).map((r) => String(r.className).split(' ')[0]);
  return JSON.stringify({ out, spill, u: getComputedStyle(document.documentElement).getPropertyValue('--u') }); })()`;
for (const [w, h] of SIZES) for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','12');localStorage.setItem('keepfall.normalMatches','12');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false, fullRules: true }));sessionStorage.setItem('keepfall.lowfps-offer','1')}catch(e){}` });
  try {
    await b.goto(BASE + '/'); await b.waitFor(`!!document.querySelector('#play')`, 30); await sleep(1500);
    const total = new Map(); let spill = new Set(); let u = '';
    const scan = async (what) => { await sleep(300); const r = JSON.parse(await b.js(SCAN)); u = r.u; for (const o of r.out) total.set(`${o.root} ${o.sel} ${o.px}px "${o.text}"`, what); for (const s of r.spill) spill.add(`${what}:${s}`); };
    // menu windows
    await b.js(`document.querySelector('.settings-fab').click(); 1`); await sleep(600);
    for (const tab of ['sound', 'display', 'language', 'game', 'controls']) { await b.js(`document.querySelector('.set-tab[data-tab="${tab}"]').click(); 1`); await sleep(300); await scan('settings-' + tab); }
    await b.js(`document.querySelector('[data-act="about"]').click(); 1`); await sleep(400); await scan('about');
    await b.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('[data-act="close"]')?.click(); 1`); await sleep(500);
    // a match: castle, buildings, rival, kingdom panel, forest
    await b.js(`document.querySelector('#play').click(); 1`); await b.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= 4`, 30); await sleep(900); await scan('lobby');
    await b.js(`document.querySelector('#start').click(); 1`); await b.waitFor(`document.documentElement.classList.contains('in-game') && !!window.keepfallUi?.castle`, 60); await sleep(2500);
    await b.js(`document.querySelector('#kingdom-decree [data-close]')?.click(); 1`); await sleep(600);
    const open = async (t, what) => { await b.js(`keepfallUi.windows.close(); keepfallUi.open(${JSON.stringify(t)}); 1`); await sleep(700); await scan(what); };
    await open({ kind: 'castle' }, 'castle'); for (const tab of ['hire', 'growth', 'defense']) { await b.js(`document.querySelector('.win [data-tab="${tab}"]')?.click(); 1`); await sleep(300); await scan('castle-' + tab); }
    for (const type of ['farm', 'lumberCamp', 'mine', 'forge']) await open({ kind: 'building', type }, 'building-' + type);
    const seat = await b.js(`keepfallUi.room.players.find((p) => p.seat !== (keepfallUi.mySeat ?? 0)).seat`);
    await open({ kind: 'enemy', seat }, 'enemy'); await open({ kind: 'forest', id: 'northWest' }, 'forest');
    await b.js(`keepfallUi.windows.close(); document.querySelector('.kingdom-fab')?.click(); 1`); await sleep(700); await scan('kingdom');
    await b.js(`document.querySelectorAll('.kd-tile').forEach((t) => t.click()); 1`); await sleep(300); await scan('kingdom-tiles');
    await b.js(`document.querySelector('.guide-btn, #help, [title="?"]')?.click(); 1`);
    console.log(`${w}x${h} ${lang} --u=${u.trim()}: ${total.size} text kinds under ${MIN}px, spill: ${[...spill].join(',') || 'none'}`);
    for (const [k, v] of [...total].slice(0, 40)) console.log('   ', k, '·', v);
    if (total.size || spill.size) bad++;
  } finally { b.close(); }
}
process.exit(bad ? 1 : 0);
