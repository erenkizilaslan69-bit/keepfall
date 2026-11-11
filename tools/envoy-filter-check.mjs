// The two tiers of the envoy filter, end to end: one sender, two receivers of the same message, one with "filter mild swearing" on (the default) and
// one with it off. Hate speech must be stars for both (the server does that, always); ordinary swearing must be stars only for the one who left the
// filter on (their own game does that). Also: what leaves the server never holds the slur, and the sender cannot switch the hate tier off.
// Needs the dev server (5081, Keepfall__AllowSpeedControl=true) and Vite (5174).   node tools/envoy-filter-check.mjs
import { launch, sleep } from './cdp.mjs';

const URL = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const MESSAGE = 'hello, you shit and you faggot, scheiße, du Kanake';
let bad = 0; const ok = (c, m, extra = '') => { console.log((c ? 'ok   ' : 'FAIL ') + m + (extra ? ' — ' + extra : '')); if (!c) bad++; };
const prefs = (mild) => `try{localStorage.setItem('keepfall.prefs', JSON.stringify({ filterMild: ${mild}, showHints: false }))}catch(e){}`;
const A = await launch({ width: 1280, height: 720 });
const B = await launch({ width: 1280, height: 720, init: prefs(true) });
const C = await launch({ width: 1280, height: 720, init: prefs(false) });
try {
  await A.goto(URL + '/');
  await A.waitFor(`!!document.querySelector('#create')`);
  await sleep(1500);
  await A.js(`document.querySelector('#name').value='Sender'; document.querySelector('#create').click(); 1`);
  await A.waitFor(`!!document.querySelector('.lobby .title-ribbon .code')`, 15);
  const code = await A.js(`document.querySelector('.title-ribbon .code').textContent.trim()`);
  for (const [p, n] of [[B, 'FilterOn'], [C, 'FilterOff']]) {
    await p.goto(`${URL}/?room=${code}`);
    await p.waitFor(`!!document.querySelector('.lobby')`, 20);
    await p.js(`window.keepfallNet.setName('${n}'); 1`);
  }
  for (const p of [B, C, A]) await p.js(`document.querySelector('#ready').click(); 1`);
  await A.waitFor(`!document.querySelector('#start').disabled`, 15);
  await A.js(`document.querySelector('#fillbots') && (document.querySelector('#fillbots').checked = false); document.querySelector('#start').click(); 1`);
  for (const p of [A, B, C]) ok(await p.waitFor(`document.documentElement.classList.contains('in-game')`, 60), 'in the match');
  await sleep(3000);
  for (const p of [A, B, C]) await p.js(`document.querySelector('#kingdom-decree button')?.click(); 1`);
  await A.js(`window.keepfallNet.setSpeed(20); 1`);
  const seats = { B: await B.js(`window.keepfallNet.seat`), C: await C.js(`window.keepfallNet.seat`) };
  // every message the two receivers are sent, as it leaves the server
  for (const p of [B, C]) await p.js(`(() => { window.__letters = []; const hub = window.keepfallNet.hub; hub.on('CastleState', (c) => { const t = JSON.stringify(c); if (/hello, you/.test(t)) window.__letters.push(t.slice(t.indexOf('hello, you'), t.indexOf('hello, you') + 80)); }); return 1; })()`);

  const send = async (seat) => {
    for (let i = 0; i < 60; i++) { const r = await A.js(`window.keepfallNet.sendEnvoy(${seat}, 0, 0, 0, 0, ${JSON.stringify(MESSAGE)}, 'idle')`); if (r?.ok) return true; await sleep(1500); }
    return false;
  };
  ok(await send(seats.B), 'the envoy to the receiver with the filter ON has set out');
  const shown = async (p) => p.waitFor(`!!document.querySelector('.letter-text')`, 90).then(() => p.js(`document.querySelector('.letter-text')?.textContent ?? ''`));
  const atB = await shown(B);
  ok(await send(seats.C), 'the envoy to the receiver with the filter OFF has set out (the first one is home)');
  const atC = await shown(C);
  console.log('     filter on : ' + atB); console.log('     filter off: ' + atC);
  ok(atB.length === MESSAGE.length && atC.length === MESSAGE.length, 'both read a message of the same length (stars, not cuts)');
  ok(!/faggot|kanake/i.test(atB) && !/faggot|kanake/i.test(atC), 'hate speech is stars for BOTH receivers');
  ok(!/shit|scheiße/i.test(atB), 'ordinary swearing is stars for the receiver who kept the filter on');
  ok(/shit/.test(atC) && /scheiße/.test(atC), 'ordinary swearing is readable for the receiver who switched the filter off');
  ok(/^hello, you/.test(atB) && /^hello, you/.test(atC), 'the rest of the text is untouched');
  const wire = [...(await B.js(`window.__letters`)), ...(await C.js(`window.__letters`))];
  ok(wire.length > 0 && wire.every((t) => !/faggot|kanake/i.test(t)) && wire.some((t) => /shit/.test(t)), 'on the wire: the slur never leaves the server, the swearing does (the reader decides)', wire[0]);
  // the setting is the reader's: the same letter, read again by B with the filter switched off in the settings
  await B.js(`(() => { const p = JSON.parse(localStorage.getItem('keepfall.prefs') || '{}'); return p.filterMild; })()`);
  await B.shot('art/shots/ui-tur/envoy-filter-on.png'); await C.shot('art/shots/ui-tur/envoy-filter-off.png');
} catch (e) { ok(false, 'the run finished', e.stack ?? String(e)); }
finally { A.close(); B.close(); C.close(); }
console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
