// The castle window's tab row (Soldiers / Hire / Growth / Defence) in a few languages, "after" (the game's CSS) and "before" (the old overflow-wrap: anywhere rule injected).
// Needs the dev server (5081) and Vite (5174).   node tools/shot-castle-tabs.mjs [out-dir] [langs]
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/ui-tur'; const LANGS = (process.argv[3] ?? 'tr,de,pl').split(',');
mkdirSync(OUT, { recursive: true });
for (const lang of LANGS) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1200);
    await b.js(`document.querySelector('#quick').click()`); await b.waitFor(`!!window.keepfallScene?.ready && !!keepfallScene.state`, 90); await sleep(6000);
    await b.js(`document.getElementById('kingdom-decree')?.remove(); keepfallScene.select({ kind: 'castle' }); 1`); await sleep(900);
    const clip = await b.js(`(() => { const r = document.querySelector('.win').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 230) }; })()`);
    await b.shot(`${OUT}/castle-tabs-after-${lang}.png`);
    await b.js(`(() => { const s = document.createElement('style'); s.textContent = '.tabs{flex-wrap:nowrap!important} .tab{flex:1 1 0!important;min-width:0!important;overflow-wrap:anywhere!important;hyphens:auto!important}'; document.head.appendChild(s); 1 })()`); await sleep(400);
    await b.shot(`${OUT}/castle-tabs-before-${lang}.png`); console.log(lang, JSON.stringify(clip));
  } finally { b.close(); }
}
