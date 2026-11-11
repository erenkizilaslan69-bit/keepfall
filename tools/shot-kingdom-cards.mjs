// The kingdom panel as a card, for each of the four kingdoms and in both layouts ('a' in use, 'b' behind ?kd=b), with a spill check (a tile's or the
// card's text wider than its box). The kingdom is forced in the page (dev handle keepfallUi.kingdom); the drawing is the game's own.
// Needs the dev server (5081) and Vite (5174).   node tools/shot-kingdom-cards.mjs [out-dir] [langs]     → art/shots/ui-tur/kingdom-<layout>-<lang>-<id>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { execSync } from 'node:child_process';

// each kingdom's OWN sentence and abilities, as the server holds them (a made-up kingdom must not keep the real one's words: that was a mix-up of this tool once)
const FACTIONS = JSON.parse(execSync('node tools/kingdom-text-check.mjs --json', { encoding: 'utf8' }));

const OUT = process.argv[2] ?? 'art/shots/ui-tur';
const LANGS = (process.argv[3] ?? 'en,tr').split(',');
const URL = (process.argv[4] ?? 'http://localhost:5174').replace(/\/$/, '');
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const layout of (process.env.LAYOUTS ?? 'a,b').split(',')) for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_kd','${layout}');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }))}catch(e){}` });
  try {
    await b.goto(URL + '/');
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(1500);
    await b.js(`document.querySelector('#quick').click()`);
    await b.waitFor(`!!window.keepfallUi?.kingdom?.castle?.kingdom`, 60);
    await sleep(9000); // (the cloud curtain has parted)
    await b.js(`document.getElementById('kingdom-decree')?.remove(); 1`);
    for (const id of ['golge', 'tuccar', 'kahin', 'entrikaci']) {
      const made = await b.js(`(() => { const k = window.keepfallUi.kingdom, c = k.castle; const cat = c.kingdom.catalog.find((x) => x.id === '${id}'); if (!cat) return 'no catalog entry';
        k.update = () => {}; k.setMap = () => {}; k.tile = 0;
        const own = ${JSON.stringify(FACTIONS.find((f) => f.id === id))}; const fake = { ...c.kingdom, id: '${id}', name: own.name, title: own.title, look: cat.look, decree: own.decree, abilities: own.abilities };
        k.castle = { ...c, kingdom: fake }; k.build(fake, k.castle); try { k.refreshDynamic(fake, k.castle); } catch (e) {} k.panel.classList.remove('hidden'); return 'ok'; })()`);
      await sleep(500);
      for (const tile of [0, 1]) {
        await b.js(`document.querySelector('.kd-tile[data-tile="${tile}"]')?.click(); 1`);
        await sleep(350);
        const spills = await b.js(`(() => { const out = []; const box = document.querySelector('.kingdom-panel'); const r = box.getBoundingClientRect();
          if (r.right > innerWidth + 1 || r.left < 0) out.push('panel off the screen');
          for (const e of box.querySelectorAll('.kd-tile, .kd-tile b, .kd-card-who h3, .kd-card-role, .kd-pane h4, .kd-pane .btn, .kd-pane label, .kd-pane select')) {
            if (e.offsetParent === null) continue; const q = e.getBoundingClientRect();
            if (e.scrollWidth > e.clientWidth + 2) out.push('clipped: ' + (e.textContent || '').trim().slice(0, 28));
            else if (q.right > r.right + 1 || q.left < r.left - 1) out.push('outside: ' + (e.textContent || '').trim().slice(0, 28));
          }
          const active = document.querySelector('.kd-tile.active'); return { out, active: !!active, panes: [...box.querySelectorAll('.kd-pane:not(.hidden)')].length }; })()`);
        const shown = await b.js(`document.querySelector('.kd-card-line')?.textContent ?? ''`);
        if (lang === 'tr' && shown !== FACTIONS.find((f) => f.id === id).decree) { bad++; console.log(`FAIL ${layout} ${lang} ${id}: the card shows another sentence: ${shown}`); }
        if (made !== 'ok' || spills.out.length || !spills.active || spills.panes !== 1) { bad++; console.log(`FAIL ${layout} ${lang} ${id} tile ${tile}: ${made} ${spills.out.join(' | ')} active=${spills.active} panes=${spills.panes}`); }
        else console.log(`ok   ${layout} ${lang} ${id} tile ${tile}`);
        if (tile === 0) await b.shot(`${OUT}/kingdom-${layout}-${lang}-${id}.png`);
      }
    }
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
