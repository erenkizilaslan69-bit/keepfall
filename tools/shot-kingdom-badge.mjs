// The player's OWN kingdom button at the top left, in each way a match can start: a quick match after the first three (kingdoms on), the same match from the lobby, and a
// starter / guided match (no kingdoms by design: a note takes the button's place). Only the own kingdom is ever shown. Needs the dev server (5081) and Vite (5174).
//   node tools/shot-kingdom-badge.mjs [out-dir] [langs]    → badge-<case>-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/badge'; const LANGS = (process.argv[3] ?? 'en,tr').split(',');
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };
for (const lang of LANGS) for (const kase of ['quick', 'lobby', 'newplayer', 'guided']) {
  const matches = kase === 'newplayer' || kase === 'guided' ? '0' : '10';
  const tut = kase === 'guided' ? "localStorage.removeItem('keepfall_tutorial_done');" : "localStorage.setItem('keepfall_tutorial_done','true');";
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');${tut}localStorage.setItem('keepfall.matches','${matches}');localStorage.setItem('keepfall.normalMatches','${matches}');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: ${kase === 'newplayer'} }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    if (kase === 'lobby') {
      await b.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); for (const l of ['medium','medium','easy']) await n.addBot(l); return 1; })()`);
      await b.waitFor(`!!document.querySelector('.screen.lobby')`, 20); await sleep(800);
      await b.js(`document.querySelector('#ready').click(); 1`); await sleep(500); await b.js(`document.querySelector('#start').click(); 1`);
    } else await b.js(`document.querySelector('#quick').click()`);
    await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90); await sleep(7000);
    await b.js(`document.querySelector('#kingdom-decree [data-close]')?.click(); document.getElementById('kingdom-decree')?.remove(); 1`); await sleep(2500); // (the decree is closed like a player does: the tip held behind it comes out)
    const st = JSON.parse(await b.js(`JSON.stringify({ fab: document.querySelector('.kingdom-fab:not(.hidden)')?.textContent?.trim() ?? null, chip: document.querySelector('.starter-chip')?.textContent ?? null, tip: [...document.querySelectorAll('.hint, .toast, [class*=hint]')].map((e) => e.textContent).join('|').slice(0, 120) })`));
    if (kase === 'newplayer') check(await b.js(`/This is your kingdom|Bu senin krallığın/.test(document.body.innerText)`), `${lang} ${kase}: the first kingdom match shows the one-time kingdom tip`);
    if (kase === 'guided') check(!st.fab && !st.chip, `${lang} ${kase}: the guided match has no kingdoms (and no note)`, JSON.stringify(st));
    else check(!!st.fab && !st.chip, `${lang} ${kase}: the own kingdom button is shown`, JSON.stringify(st));
    await b.shot(`${OUT}/badge-${kase}-${lang}.png`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems'); process.exit(bad ? 1 : 0);
