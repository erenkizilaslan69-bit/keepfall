// The player's OWN kingdom button at the top left, in each way a match can start: a quick match after the first three (kingdoms on), the same match from the lobby, and a
// starter / guided match (no kingdoms by design: a note takes the button's place). Only the own kingdom is ever shown. Needs the dev server (5081) and Vite (5174).
//   node tools/shot-kingdom-badge.mjs [out-dir] [langs]    → badge-<case>-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/badge'; const LANGS = (process.argv[3] ?? 'en,tr').split(',');
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };
for (const lang of LANGS) for (const kase of ['quick', 'lobby', 'starter']) {
  const matches = kase === 'starter' ? '0' : '10';
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','${matches}');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    if (kase === 'lobby') {
      await b.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); for (const l of ['medium','medium','easy']) await n.addBot(l); return 1; })()`);
      await b.waitFor(`!!document.querySelector('.screen.lobby')`, 20); await sleep(800);
      await b.js(`document.querySelector('#ready').click(); 1`); await sleep(500); await b.js(`document.querySelector('#start').click(); 1`);
    } else await b.js(`document.querySelector('#quick').click()`);
    await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90); await sleep(7000);
    await b.js(`document.getElementById('kingdom-decree')?.remove(); 1`);
    const st = JSON.parse(await b.js(`JSON.stringify({ fab: document.querySelector('.kingdom-fab:not(.hidden)')?.textContent?.trim() ?? null, chip: document.querySelector('.starter-chip')?.textContent ?? null })`));
    if (kase === 'starter') check(!st.fab && !!st.chip, `${lang} ${kase}: no kingdom, the starter note is there`, JSON.stringify(st));
    else check(!!st.fab && !st.chip, `${lang} ${kase}: the own kingdom button is shown`, JSON.stringify(st));
    await b.shot(`${OUT}/badge-${kase}-${lang}.png`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems'); process.exit(bad ? 1 : 0);
