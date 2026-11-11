// The settings window, tab by tab, in several languages: a picture of each and a check that nothing spills (a tab's or a row's text wider than its
// box, the window wider than the screen). Needs the dev server (5081) and Vite (5174).
//   node tools/shot-settings-tabs.mjs [out-dir] [langs]      e.g. art/shots/ui-tur/settings en,tr,de,ru,pl,zh-CN,ja,ko   (SIZE=1280,720)
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/ui-tur/settings';
const LANGS = (process.argv[3] ?? 'en,tr,de,ru,pl,zh-CN,ja,ko').split(',');
const URL = process.argv[4] ?? 'http://localhost:5174/';
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}')}catch(e){}` });
  try {
    await b.goto(URL);
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(1800);
    await b.js(`document.querySelector('.settings-fab').click(); 1`);
    await b.waitFor(`!!document.querySelector('.settings .set-tab')`, 10);
    for (const tab of ['sound', 'display', 'language', 'game', 'controls']) {
      await b.js(`document.querySelector('.set-tab[data-tab="${tab}"]').click(); 1`);
      await sleep(350);
      const spills = await b.js(`(() => { const out = []; const box = document.querySelector('.settings'); const r = box.getBoundingClientRect();
        if (r.left < 0 || r.right > innerWidth + 1 || r.top < 0) out.push('window off the screen');
        for (const e of box.querySelectorAll('.set-tab, .set-row label, .set-row, .set-keys dd, .set-keys kbd, .btn, .guide-title, select, .kf-select-btn')) {
          if (e.offsetParent === null) continue;
          const q = e.getBoundingClientRect();
          if (e.scrollWidth > e.clientWidth + 2) out.push('clipped: ' + (e.textContent || '').trim().slice(0, 30));
          else if (q.right > r.right + 1 || q.left < r.left - 1) out.push('outside: ' + (e.textContent || '').trim().slice(0, 30));
        }
        const rows = [...box.querySelectorAll('.set-tab')].map((t) => Math.round(t.getBoundingClientRect().top / 12));
        return { spills: out, tabRows: new Set(rows).size, body: document.querySelector('.settings-body').scrollHeight > document.querySelector('.settings-body').clientHeight + 2 }; })()`);
      if (spills.spills.length) { bad += spills.spills.length; console.log(`FAIL ${lang} ${tab}: ${spills.spills.join(' | ')}`); }
      else console.log(`ok   ${lang} ${tab}${spills.tabRows > 1 ? ` (tabs on ${spills.tabRows} rows)` : ''}${spills.body ? ' (body scrolls)' : ''}`);
      await b.shot(`${OUT}/${lang}-${tab}.png`);
    }
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} spill(s)` : '\nNo spills');
process.exit(bad ? 1 : 0);
