// The lobby's empty-seat rows in all 15 languages: "Empty slot 3" on ONE line, the bot buttons beside it or under it (never overlapping it), the bot-difficulty list drawn
// in the game's own style (not the browser's), the room code shown once (the ribbon; the box that repeated it is out of sight), and nothing of the lobby off the screen.
// Needs the dev server (5081) and Vite (5174).   node tools/check-lobby-seats.mjs [out-dir] [langs] [--shots en,tr]   (SIZE=1280,720)
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const ALL = ['en', 'tr', 'zh-CN', 'zh-TW', 'ru', 'es-ES', 'es-419', 'pt-BR', 'de', 'fr', 'ja', 'ko', 'pl', 'it', 'uk'];
const OUT = process.argv[2] ?? 'art/shots/lobby';
const LANGS = (process.argv[3] ?? ALL.join(',')).split(',');
const SHOTS = (process.argv[4] ?? 'en,tr').split(',');
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/');
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(1500);
    await b.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); await n.addBot('easy'); return 1; })()`);
    await b.waitFor(`!!document.querySelector('.screen.lobby #players li.empty')`, 20);
    await sleep(1200);
    const r = JSON.parse(await b.js(`(() => { const out = { issues: [] };
      for (const li of document.querySelectorAll('#players li.empty')) {
        const p = li.querySelector('.pname'), tags = li.querySelector('.tags');
        const rects = [...p.getClientRects()]; const lh = parseFloat(getComputedStyle(p).lineHeight) || parseFloat(getComputedStyle(p).fontSize) * 1.2;
        if (p.scrollHeight > lh * 1.6) out.issues.push('the seat name breaks over lines: ' + p.textContent.trim());
        if (tags) { const a = p.getBoundingClientRect(), c = tags.getBoundingClientRect();
          for (const btn of tags.querySelectorAll('button, .add-label')) { const q = btn.getBoundingClientRect(); if (q.left < a.right - 1 && q.right > a.left + 1 && q.top < a.bottom - 1 && q.bottom > a.top + 1) out.issues.push('a bot button sits on the name'); }
          if (c.right > li.getBoundingClientRect().right + 1) out.issues.push('the buttons stick out of the row'); }
      }
      const sel = document.querySelector('#fill .kf-select-btn'); if (!sel && !document.querySelector('#fill.hidden')) out.issues.push('the difficulty list is the browser default');
      const nativeShown = document.querySelector('#fill select.kf-select-native'); if (nativeShown && nativeShown.getBoundingClientRect().width > 2 && getComputedStyle(nativeShown).opacity !== '0') out.issues.push('the native select is visible');
      const codeBox = document.querySelector('.share input.share-code'); if (codeBox && codeBox.getBoundingClientRect().width > 4) out.issues.push('the room code box is still visible');
      out.codes = [...document.querySelectorAll('.screen.lobby *')].filter((e) => e.children.length === 0 && /^[A-Z]{6}$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 4).length;
      if (out.codes !== 1) out.issues.push('the room code is shown ' + out.codes + ' times');
      if (!document.querySelector('[data-a="copy"]')) out.issues.push('the copy button is gone');
      const lob = document.querySelector('.screen.lobby'); for (const e of lob.querySelectorAll('button#ready, button#leave, button#start, #players li')) { const q = e.getBoundingClientRect(); if (q.bottom > innerHeight + 1) out.issues.push('off the screen: ' + (e.id || e.className)); }
      return JSON.stringify(out); })()`));
    if (r.issues.length) { bad++; console.log(`FAIL ${lang}: ${r.issues.join(' | ')}`); } else console.log(`ok   ${lang}`);
    if (SHOTS.includes(lang)) await b.shot(`${OUT}/lobby-${lang}.png`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
