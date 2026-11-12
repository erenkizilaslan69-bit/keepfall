// The castle window's four tabs in German, before (the rule switched off) and after: all four must sit on ONE row. Needs the dev server (5081) and Vite (5174).
//   node tools/shot-castle-de.mjs [out-dir]    → castle-de-before.png, castle-de-after.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/ui-tur';
mkdirSync(OUT, { recursive: true });
const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','de');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }));localStorage.setItem('keepfall_tutorial_done','true')}catch(e){}` });
let bad = 0;
try {
  await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
  await b.js(`document.querySelector('#quick').click()`); await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90); await sleep(6000);
  await b.js(`document.getElementById('kingdom-decree')?.remove(); keepfallScene.select({ kind: 'castle' }); 1`); await sleep(900);
  const rows = () => b.js(`new Set([...document.querySelectorAll('.win .tab')].map((t) => Math.round(t.getBoundingClientRect().top))).size`);
  await b.js(`(() => { const s = document.createElement('style'); s.id = 'off'; s.textContent = 'html[lang="de"] .tabs .tab { font-size: inherit !important; padding-left: 4px !important; padding-right: 4px !important; }'; document.head.appendChild(s); 1 })()`); await sleep(300);
  const before = await rows(); await b.shot(`${OUT}/castle-de-before.png`);
  await b.js(`document.getElementById('off').remove(); 1`); await sleep(300);
  const after = await rows(); await b.shot(`${OUT}/castle-de-after.png`);
  console.log(`rows before: ${before}, after: ${after}`);
  if (after !== 1) { bad++; console.log('FAIL: the four tabs do not sit on one row'); }
} finally { b.close(); }
process.exit(bad ? 1 : 0);
