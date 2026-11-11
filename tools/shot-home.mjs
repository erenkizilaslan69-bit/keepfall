// The entrance (main menu) in both layouts ('b' in use, 'a' behind ?home=a), with a spill check. Needs the dev server (5081) and Vite (5174).
//   node tools/shot-home.mjs [out-dir] [langs]      → art/shots/ui-tur/home-<layout>-<lang>.png     (SIZE=1920,1080; HOSTED=1 draws the desktop build's friends doors)
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/ui-tur';
const LANGS = (process.argv[3] ?? 'en,tr').split(',');
const URL = (process.argv[4] ?? 'http://localhost:5174').replace(/\/$/, '');
const [w, h] = (process.env.SIZE ?? '1920,1080').split(',').map(Number);
// the desktop build's bridge, made up: the menu then offers "host a game" / "join by address" / the Steam list, as in the packed game
const bridge = process.env.HOSTED === '1' ? `window.keepfallSteam = { shell: 'test', status: async () => ({ available: false, appId: 0 }), mp: { info: async () => ({ build: 't', steam: true, steamName: '', hosting: false, lanPort: 0, addresses: [], lobbyId: null, joined: null, pendingLobby: null }), onEvent() {}, lobbies: async () => [], leave: async () => true } };` : '';
mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const layout of (process.env.LAYOUTS ?? 'b,a').split(',')) for (const lang of LANGS) {
  const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_home','${layout}')}catch(e){};${bridge}` });
  try {
    await b.goto(URL + '/');
    await b.waitFor(`!!document.querySelector('#quick')`);
    await sleep(3500);
    const r = await b.js(`(() => { const out = []; const box = document.querySelector('.screen.home'); const q = box.getBoundingClientRect();
      if (q.left < 0 || q.right > innerWidth + 1) out.push('menu off the screen sideways');
      if (q.bottom > innerHeight + 1 && document.scrollingElement.scrollHeight <= innerHeight + 1) out.push('menu cut at the bottom');
      for (const e of box.querySelectorAll('button, label, input, select, .or, .kf-logo-sub')) { if (e.offsetParent === null) continue; const p = e.getBoundingClientRect();
        if (e.scrollWidth > e.clientWidth + 2 && e.tagName !== 'INPUT') out.push('clipped: ' + (e.textContent || '').trim().slice(0, 28));
        else if (p.right > q.right + 2 || p.left < q.left - 2) out.push('outside: ' + (e.textContent || e.id || '').trim().slice(0, 28)); }
      const play = document.querySelector('#quick').getBoundingClientRect(), second = document.querySelector('#challenges').getBoundingClientRect();
      return { out, playBigger: play.height > second.height && play.width > second.width, scroll: document.scrollingElement.scrollHeight > innerHeight + 1 }; })()`);
    if (r.out.length || !r.playBigger) { bad++; console.log(`FAIL ${layout} ${lang}: ${r.out.join(' | ')} playBigger=${r.playBigger}`); }
    else console.log(`ok   ${layout} ${lang}${r.scroll ? ' (page scrolls)' : ''}`);
    await b.shot(`${OUT}/home-${layout}-${lang}${process.env.HOSTED === '1' ? '-desktop' : ''}.png`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
