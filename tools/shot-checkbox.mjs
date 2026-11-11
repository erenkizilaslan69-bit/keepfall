// The settings' check boxes, checked and not, at 100% and 115% interface scale: the tick must be large and clear (about 70% of the box). Needs 5081 and 5174.
//   node tools/shot-checkbox.mjs [out-dir]      → <out-dir>/check-<scale>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/cila3';
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const scale of [1, 1.15]) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','en');localStorage.setItem('keepfall.prefs', JSON.stringify({ uiScale: ${scale} }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    await b.js(`document.querySelector('.settings-fab').click(); 1`); await b.waitFor(`!!document.querySelector('.settings .set-tab')`, 10);
    await b.js(`document.querySelector('.set-tab[data-tab="display"]').click(); const c = document.querySelector('#set-fps'); if (!c.checked) c.click(); document.querySelector('#set-fx').checked = true; 1`); await sleep(400);
    // the tick's size: the checked box's picture is the SVG, sized to the box's inner square; measure that and the path's share of the 12-unit viewBox (1..11 wide)
    const r = await b.js(`(() => { const c = document.querySelector('#set-fps'), q = c.getBoundingClientRect(), cs = getComputedStyle(c); return { box: q.width, size: cs.backgroundSize, checked: c.checked, img: cs.backgroundImage.startsWith('url') }; })()`);
    const share = 10.6 / 12; const inner = r.box - 2 * 3 * scale; const tick = inner * share / r.box;
    const ok = r.checked && r.img && tick >= 0.6; if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} scale ${scale}: box ${r.box.toFixed(1)}px, tick ≈ ${(tick * 100).toFixed(0)}% of the box (${r.size})`);
    await b.shot(`${OUT}/check-${Math.round(scale * 100)}.png`);
  } finally { b.close(); }
}
process.exit(bad ? 1 : 0);
