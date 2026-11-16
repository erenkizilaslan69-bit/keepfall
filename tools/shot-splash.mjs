// Pictures of the loading screen (public/splash.html: the page the desktop shell shows while the server starts; the game page draws the same one):
// the screen half way (server ready, pictures loading), then the error with "Try again". Also checks that the game page fades it out by itself.
//   node tools/shot-splash.mjs <out-prefix> [langs=en,tr] [sizes=1920x1080,1280x720]      (URL=http://localhost:5176, Vite + dev server)
// Pictures: art/shots/<out-prefix>-*.png (git-ignored: Tiny Swords art).
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const PREFIX = process.argv[2] ?? 'splash';
const LANGS = (process.argv[3] ?? 'en,tr').split(',');
const SIZES = (process.argv[4] ?? '1920x1080,1280x720').split(',').map((s) => s.split('x').map(Number));
const BASE = (process.env.URL ?? 'http://localhost:5176').replace(/\/$/, '');
mkdirSync('art/shots', { recursive: true });
let bad = 0;

for (const [w, h] of SIZES) for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.removeItem('keepfall_lang')}catch(e){}` }); // (the shell's page has no saved language: ?lang= speaks)
  try {
    await b.goto(`${BASE}/splash.html?lang=${lang}&stage=server`);
    await b.waitFor(`!!window.kfSplash`, 20); await sleep(1500); // (the meadow's pictures)
    await b.js(`kfSplash.step('server', 1, 1); kfSplash.step('images', 14, 22); 1`); await sleep(600);
    await b.shot(`art/shots/${PREFIX}-${lang}-${w}.png`);
    const tip = await b.js(`document.querySelector('.kfs-tip span').textContent`);
    const status = await b.js(`document.querySelector('.kfs-status').textContent`);
    console.log(`${w}x${h} ${lang}: status "${status}", tip "${tip.slice(0, 60)}…"`);
    await b.js(`kfSplash.fail('timeout 20s', true); 1`); await sleep(400);
    await b.shot(`art/shots/${PREFIX}-${lang}-${w}-error.png`);
  } finally { b.close(); }
}

// the game page: the screen is there at once and goes away by itself when the menu is up (no waiting of its own)
for (const lang of LANGS) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}')}catch(e){}` });
  try {
    const t0 = Date.now();
    await b.send('Page.navigate', { url: `${BASE}/` }); // (not goto: it waits 2.5 s)
    let early = false;
    for (let i = 0; i < 60 && !early; i++) { await sleep(50); try { early = await b.js(`!!document.querySelector('#kf-splash .kfs-logo') && !document.querySelector('#play')`); } catch { /* loading */ } }
    const seenAt = Date.now() - t0;
    const gone = await b.waitFor(`!document.getElementById('kf-splash') && !!document.querySelector('#play')`, 30);
    console.log(`page ${lang}: loading screen up before the menu ${early} (at ${seenAt} ms), menu up and the screen gone ${gone} after ${Date.now() - t0} ms`);
    if (!early || !gone) bad++;
  } finally { b.close(); }
}
process.exit(bad ? 1 : 0);
