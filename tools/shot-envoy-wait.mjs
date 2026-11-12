// The envoy's waiting state: with an envoy on the road the send button is off, says how long until it is home, and tells the player a new one can go when it is back;
// the server also refuses a second one. Needs the dev server (5081) and Vite (5174).   node tools/shot-envoy-wait.mjs [out-dir] [langs]  → envoy-wait-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/envoy'; const LANGS = (process.argv[3] ?? 'en,tr').split(',');
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };
for (const lang of LANGS) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.prefs', JSON.stringify({ fullRules: true, showHints: false }));localStorage.setItem('keepfall_tutorial_done','true')}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
    await b.js(`document.querySelector('#quick').click()`); await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90); await sleep(6000);
    await b.js(`document.getElementById('kingdom-decree')?.remove(); 1`);
    const seat = await b.js(`keepfallNet.seat === 1 ? 2 : 1`);
    const first = await b.js(`keepfallNet.sendEnvoy(${seat}, 1, 0, 0, 0, 'selam', 'idle')`);
    check(first?.ok === true, `${lang}: the first envoy goes`, JSON.stringify(first));
    const second = await b.js(`keepfallNet.sendEnvoy(${seat}, 1, 0, 0, 0, 'tekrar', 'idle')`);
    check(second?.ok === false && /yolda|road/i.test(second.error ?? ''), `${lang}: the server refuses a second one`, second?.error ?? '');
    await b.js(`keepfallScene.select({ kind: 'enemy', seat: ${seat} }); 1`); await sleep(1500);
    const st = await b.js(`(() => { const btn = document.querySelector('[data-act="envoy"]'); return { disabled: btn?.disabled, label: btn?.textContent, info: document.querySelector('[data-f="env-info"]')?.textContent }; })()`);
    check(st.disabled === true && /\d/.test(st.label ?? '') && (st.info ?? '').length > 10, `${lang}: button off, time shown, hint shown`, JSON.stringify(st));
    // the scout button shows the SCOUT's state only: with an envoy on the road a scout can still go, and the button does not say "Envoy ..."
    const sc = await b.js(`(() => { const btn = document.querySelector('[data-act="scout"]'); return { disabled: btn?.disabled, label: btn?.textContent }; })()`);
    check(sc.disabled === false && !/Envoy|Ulak/.test(sc.label ?? ''), `${lang}: the scout button is on and says nothing of the envoy`, JSON.stringify(sc));
    const sent = await b.js(`keepfallNet.sendScout(${seat}, 'idle')`);
    check(sent?.ok === true, `${lang}: the server lets a scout go while the envoy is out`, JSON.stringify(sent));
    await b.shot(`${OUT}/envoy-wait-${lang}.png`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems'); process.exit(bad ? 1 : 0);
