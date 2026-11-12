// The match-mode picker: on the main menu and in the lobby (host's view; a guest's view is the same row disabled), EN + TR. Also plays the three modes through the hub and
// checks that the match really has the mode's lengths. Needs the dev server (5081) and Vite (5174).
//   node tools/shot-modes.mjs [out-dir] [langs]      → art/shots/modes/{home,lobby}-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/modes';
const LANGS = (process.argv[3] ?? 'en,tr').split(',');
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.removeItem('keepfall.matchMode');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/');
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(3000);
    await b.js(`document.querySelector('#home-mode .mode-btn[data-mode="standard"]')?.click(); 1`);
    await sleep(300);
    check(await b.js(`document.querySelector('#home-mode .mode-btn.on')?.dataset.mode === 'standard' && localStorage.getItem('keepfall.matchMode') === 'standard'`), `${lang}: the menu picker keeps the choice`);
    await b.shot(`${OUT}/home-${lang}.png`);
    await b.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); await n.addBot('easy'); return 1; })()`);
    await b.waitFor(`!!document.querySelector('.screen.lobby .mode-btn')`, 20);
    await sleep(1500);
    check(await b.js(`document.querySelector('#modebox .mode-btn.on')?.dataset.mode === 'standard'`), `${lang}: the host's saved choice is offered in the lobby`);
    await b.js(`document.querySelector('#modebox .mode-btn[data-mode="long"]')?.click(); 1`);
    await sleep(1200);
    check(await b.js(`document.querySelector('#modebox .mode-btn.on')?.dataset.mode === 'long'`), `${lang}: the host changes it in the lobby`);
    await b.shot(`${OUT}/lobby-${lang}.png`);
    // the match follows the mode: preparation length in the castle view
    await b.js(`(async () => { const n = keepfallNet; await n.setReady(true); const r = await n.startMatch(); return r.ok; })()`);
    await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90);
    await sleep(2500);
    const prep = await b.js(`keepfallScene.state.prepSeconds`);
    check(prep === 900, `${lang}: a Long match has a 900 s preparation (got ${prep})`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
