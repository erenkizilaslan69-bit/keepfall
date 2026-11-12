// The mission list never sits on top of an open panel: with the rival window, the castle window, a building window or the kingdom panel open it is out of the way,
// and it comes back when they close. Checked at 1280x720 and 1920x1080. Needs the dev server (5081) and Vite (5174).   node tools/check-quests-panels.mjs [out-dir]
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/quests'; mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };
for (const [w, h] of [[1280, 720], [1920, 1080]]) for (const lang of ['en', 'tr']) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','10');localStorage.setItem('keepfall.normalMatches','10');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    await b.js(`document.querySelector('#quick').click()`); await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90); await sleep(6000);
    await b.js(`document.getElementById('kingdom-decree')?.remove(); 1`);
    const shown = () => b.js(`(() => { const q = document.querySelector('.quests'); return !!q && getComputedStyle(q).display !== 'none' && q.getBoundingClientRect().width > 0; })()`);
    const seat = await b.js(`keepfallNet.seat === 1 ? 2 : 1`);
    check(await shown(), `${w}x${h} ${lang}: the list is shown with nothing open`);
    for (const [name, open, close] of [
      ['rival window', `keepfallScene.select({ kind: 'enemy', seat: ${seat} })`, `keepfallUi.windows.close(true)`],
      ['castle window', `keepfallScene.select({ kind: 'castle' })`, `keepfallUi.windows.close(true)`],
      ['building window', `keepfallScene.select({ kind: 'building', type: 'forge' })`, `keepfallUi.windows.close(true)`],
      ['kingdom panel', `document.querySelector('.kingdom-fab')?.click()`, `document.querySelector('.kingdom-panel .kd-x')?.click()`],
    ]) {
      await b.js(`${open}; 1`); await sleep(900);
      check(!(await shown()), `${w}x${h} ${lang}: ${name} open: the list is out of the way`);
      if (lang === 'en' && name === 'rival window') await b.shot(`${OUT}/panel-${w}x${h}.png`);
      await b.js(`${close}; 1`); await sleep(700);
      check(await shown(), `${w}x${h} ${lang}: ${name} closed: the list is back`);
    }
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems'); process.exit(bad ? 1 : 0);
