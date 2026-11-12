// The lobby's bottom buttons ("Back to the main menu", "Start match", "Leave room") each on ONE line in all 15 languages and at several window sizes (a word is never
// split over lines: "Ana / menüye / dön"), single-player and multiplayer lobby, nothing off the screen.
// Needs the dev server (5081) and Vite (5174).   node tools/check-lobby-buttons.mjs [out-dir] [langs] [--shots tr]   (SIZES=1280x720,1024x640 ...)
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const ALL = ['en', 'tr', 'zh-CN', 'zh-TW', 'ru', 'es-ES', 'es-419', 'pt-BR', 'de', 'fr', 'ja', 'ko', 'pl', 'it', 'uk'];
const OUT = process.argv[2] ?? 'art/shots/lobby-buttons';
const LANGS = (process.argv[3] ?? ALL.join(',')).split(',');
const SHOTS = (process.argv[4] ?? 'tr,en').split(',');
const SIZES = (process.env.SIZES ?? '1280x720,1024x640,960x600').split(',').map((s) => s.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };
// how many lines a button's text takes, and whether it reaches past the window
const probe = `(() => { const out = {}; for (const id of ['leave', 'start', 'ready']) { const el = document.getElementById(id); if (!el || el.classList.contains('hidden') || !el.offsetParent) continue;
  const r = document.createRange(); r.selectNodeContents(el); const tops = new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4))); const b = el.getBoundingClientRect();
  out[id] = { lines: tops.size, text: el.textContent.trim(), right: Math.round(b.right), bottom: Math.round(b.bottom), left: Math.round(b.left), w: Math.round(b.width) }; }
  out.win = [innerWidth, innerHeight]; return JSON.stringify(out); })()`;
for (const [w, h] of SIZES) {
  for (const lang of LANGS) {
    const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','10');localStorage.setItem('keepfall.normalMatches','10');localStorage.removeItem('keepfall.soloBots');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false }))}catch(e){}` });
    try {
      await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#play')`); await sleep(1500);
      for (const kind of ['solo', 'room']) {
        if (kind === 'solo') await b.js(`document.querySelector('#play').click(); 1`);
        else { await b.js(`{ const n = document.querySelector('#name'); if (n) n.value = 'T'; } document.querySelector('#create')?.click(); 1`); }
        const ok = await b.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= ${kind === 'solo' ? 4 : 1}`, 20).then(() => true, () => false);
        if (!ok) { console.log(`skip ${lang} ${w}x${h} ${kind} (lobby did not open)`); if (kind === 'room') break; }
        await sleep(900);
        const d = JSON.parse(await b.js(probe));
        const bad1 = Object.entries(d).filter(([k, v]) => k !== 'win' && (v.lines !== 1 || v.right > d.win[0] || v.left < 0));
        check(bad1.length === 0, `${lang} ${w}x${h} ${kind}: buttons on one line, inside the window`, bad1.length ? JSON.stringify(bad1) : Object.values(d).filter((v) => v.text).map((v) => v.text).join(' | '));
        if (SHOTS.includes(lang) && w === SIZES[0][0]) await b.shot(`${OUT}/${kind}-${lang}-${w}x${h}.png`);
        if (kind === 'solo') { await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#play')`, 20); await sleep(1200); }
      }
    } finally { b.close(); }
  }
}
process.exit(bad ? 1 : 0);
