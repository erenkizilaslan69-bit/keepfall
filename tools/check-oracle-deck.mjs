// The Oracle panel's rival decks must name every unit in the player's language, also units the player's own deck does not hold (never the raw id such as
// "kesis, suvari"). The panel is forced in the page (dev handle keepfallUi.kingdom) with a rival whose deck is those units. Needs 5081 and 5174.
//   node tools/check-oracle-deck.mjs [langs]      → art/shots/cila3/oracle-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const LANGS = (process.argv[2] ?? 'en,tr').split(',');
const RAW = /\b(kilicli|mizrakci|kalkanli|okcu|kesis|mancinik|suvari)\b/;
mkdirSync('art/shots/cila3', { recursive: true });
let bad = 0;
for (const lang of LANGS) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/');
    await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    await b.js(`document.querySelector('#quick').click()`);
    await b.waitFor(`!!window.keepfallUi?.kingdom?.castle?.kingdom`, 60); await sleep(9000);
    await b.js(`document.getElementById('kingdom-decree')?.remove(); 1`);
    const text = await b.js(`(() => { const k = window.keepfallUi.kingdom, c = k.castle; const cat = c.kingdom.catalog.find((x) => x.id === 'kahin');
      k.update = () => {}; k.setMap = () => {}; k.tile = 0;
      const mine = c.units.filter((u) => !['kesis', 'suvari'].includes(u.id)).slice(0, 4);
      const fake = { ...c.kingdom, id: 'kahin', look: cat.look }; const seat = (k.room?.players.find((p) => p.seat !== c.seat) ?? { seat: 9 }).seat;
      k.castle = { ...c, units: mine, kingdom: fake, rivals: [{ seat, faction: 'golge', deck: ['kesis', 'suvari', 'mancinik', 'kalkanli'] }] };
      k.build(fake, k.castle); k.refreshDynamic(fake, k.castle); k.panel.classList.remove('hidden');
      document.querySelectorAll('.kd-tile').forEach((t) => t.dataset.tile === '1' && t.click());
      return document.querySelector('.kd-oracle')?.textContent ?? 'no oracle box'; })()`);
    await sleep(400); await b.shot(`art/shots/cila3/oracle-${lang}.png`);
    const ok = text !== 'no oracle box' && !RAW.test(text);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${lang}: ${text.slice(0, 120)}`); if (!ok) bad++;
  } finally { b.close(); }
}
process.exit(bad ? 1 : 0);
