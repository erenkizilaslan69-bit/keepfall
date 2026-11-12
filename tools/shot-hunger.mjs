// The "Hunger" strip against the castle's name tag: in a match the strip is made to show (the notes' sticky 'hunger'), the castle labels are measured and the strip must not touch any of them.
// Needs the dev server (5081) and Vite (5174).   node tools/shot-hunger.mjs [out-dir] [langs]   (SIZES=1280x720,1920x1080)
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/hunger'; const LANGS = (process.argv[3] ?? 'tr,en').split(',');
const SIZES = (process.env.SIZES ?? '1280x720,1920x1080').split(',').map((s) => s.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const [w, h] of SIZES) for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','10');localStorage.setItem('keepfall.normalMatches','10');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    await b.js(`document.querySelector('#quick').click(); 1`);
    await b.waitFor(`typeof window.keepfallUi === 'object' && !!keepfallScene.state`, 90); await sleep(3000);
    await b.js(`document.querySelectorAll('[data-close], .kingdom-decree button').forEach((x) => x.click()); 1`); await sleep(1200);
    // the real game turns the strip off whenever the economy is fine: here it stays on (the notes' own setter is wrapped)
    await b.js(`(() => { const n = keepfallUi.notes, o = n.setSticky.bind(n), text = ${JSON.stringify(lang === 'tr' ? 'Açlık! Yemek bitti, tüm üretim yarıya indi.' : 'Hunger! The food has run out, all production is halved.')};
      n.setSticky = (k, on, t, kd) => k === 'hunger' ? o(k, true, text, kd) : o(k, on, t, kd); o('hunger', true, text); return 1; })()`); await sleep(1500);
    const r = JSON.parse(await b.js(`(() => { const strip = [...document.querySelectorAll('.notes .ribbon, .notes > *')].find((e) => /Hunger|Açlık/.test(e.textContent)); if (!strip) return JSON.stringify({ none: true });
      const s = strip.getBoundingClientRect();
      // every other piece of text drawn on the canvas layer / HTML labels that could sit under the strip
      const labels = [...document.querySelectorAll('.army-label, .label, [class*="label"], [class*="sign"], [class*="tag"]')].filter((e) => e.offsetParent && !strip.contains(e)).map((e) => ({ c: e.className, t: e.textContent.trim().slice(0, 20), r: e.getBoundingClientRect() }))
        .filter((o) => o.r.width > 0 && o.r.right > s.left && o.r.left < s.right && o.r.bottom > s.top && o.r.top < s.bottom).map((o) => ({ c: String(o.c).slice(0, 30), t: o.t }));
      return JSON.stringify({ s: { l: Math.round(s.left), t: Math.round(s.top), r: Math.round(s.right), b: Math.round(s.bottom) }, over: labels }); })()`));
    console.log(`${lang} ${w}x${h}`, JSON.stringify(r));
    if (!r.none && r.over.length) bad++;
    await b.shot(`${OUT}/hunger-${lang}-${w}x${h}.png`);
  } finally { b.close(); }
}
process.exit(bad ? 1 : 0);
