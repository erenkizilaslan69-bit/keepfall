// XP, level, title and pattern: the lobby row, the profile screen, the end-screen XP block (an example match drawn with the game's own function) and the mission list in a
// running match. Needs the dev server (5081) and Vite (5174).   node tools/shot-xp.mjs [out-dir] [langs]   → art/shots/xp/{lobby,profile,endxp,quests}-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/xp';
const LANGS = (process.argv[3] ?? 'en,tr').split(',');
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
const progress = { v: 1, matches: 24, wins: 11, kingdoms: { golge: { played: 8, won: 4 }, tuccar: { played: 6, won: 3 }, kahin: { played: 5, won: 2 }, entrikaci: { played: 5, won: 2 } },
  achievements: { first_win: 1, village_raid: 1, castle_felled: 1 }, picks: { frame: null, banners: {}, title: 'liar_king', pattern: 'chevron' }, xp: 2600, moments: { fake_report: 4, decoy: 1, felled: 3 } };
for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_progress_v1', ${JSON.stringify(JSON.stringify(progress))});localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }));localStorage.setItem('keepfall_tutorial_done','1')}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/');
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(2500);
    // lobby row: level, pattern and title go with the room
    await b.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); await n.addBot('easy'); return 1; })()`);
    await b.waitFor(`!!document.querySelector('.screen.lobby #players li')`, 20);
    await sleep(1800);
    const row = await b.js(`document.querySelector('#players li .pf')?.textContent ?? ''`);
    check(/\d/.test(row) && row.length > 4, `${lang}: the lobby row shows level and title (${row})`);
    check(await b.js(`!!document.querySelector('#players li .pf-pattern')`), `${lang}: the lobby row shows the banner pattern`);
    await b.shot(`${OUT}/lobby-${lang}.png`);
    await b.js(`keepfallNet.leaveRoom?.(); 1`);
    await sleep(800);
    await b.goto('http://localhost:5174/');
    await b.waitFor(`!!document.querySelector('#progress')`);
    await sleep(1500);
    // profile screen
    await b.js(`document.querySelector('#progress')?.click(); 1`);
    await b.waitFor(`!!document.querySelector('.pf-section')`, 20);
    await sleep(1000);
    await b.shot(`${OUT}/profile-${lang}.png`);
    const picked = await b.js(`(async () => { document.querySelector('[data-title="warlord"]')?.click(); await new Promise(r => setTimeout(r, 300)); return JSON.parse(localStorage.getItem('keepfall_progress_v1')).picks.title; })()`);
    check(picked === 'warlord', `${lang}: a title can be picked (${picked})`);
    const locked = await b.js(`document.querySelector('[data-title="grandmaster"]')?.disabled === true`);
    check(locked, `${lang}: a title that is not earned stays locked`);
    // the end-screen XP block, drawn with the game's own function and the example below
    await b.js(`(async () => {
      const { xpBlockHtml, animateXpBars } = await import('/src/ui/progress.ts');
      const L = await import('/src/progress/level.ts');
      const x = { match: 40, win: 60, modeFactor: 1.4, moments: [{ id: 'fake_report', xp: 40 }, { id: 'felled', xp: 60 }], goals: 0, firstClear: 0, total: 224, before: 2600, after: 2824,
        levelBefore: L.levelOf(2600), levelAfter: L.levelOf(2824), titles: [L.TITLES.find(t => t.id === 'castle_breaker')], patterns: [] };
      const box = document.createElement('div'); box.className = 'screen menu paper'; box.style.cssText = 'position:fixed;left:30%;top:6%;width:40%;z-index:99999;padding:12px';
      box.innerHTML = xpBlockHtml(x); document.body.appendChild(box); animateXpBars(box); return 1; })()`);
    await sleep(2600);
    await b.shot(`${OUT}/endxp-${lang}.png`);
  } finally { b.close(); }
}
// the mission list in a running match
for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }));localStorage.setItem('keepfall_tutorial_done','1')}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/');
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(2000);
    await b.js(`document.querySelector('#quick').click()`);
    await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90);
    await sleep(7000);
    await b.js(`document.getElementById('kingdom-decree')?.remove(); 1`);
    check(await b.js(`!!document.querySelector('.quests li')`), `${lang}: the mission list is there in a match`);
    await b.shot(`${OUT}/quests-${lang}.png`);
    await b.js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); 1`);
    await sleep(300);
    check(await b.js(`document.querySelector('.quests')?.classList.contains('folded') === true`), `${lang}: J folds it`);
    await b.js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'J' })); 1`);
    await sleep(300);
    check(await b.js(`document.querySelector('.quests')?.classList.contains('folded') === false`), `${lang}: J unfolds it`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
