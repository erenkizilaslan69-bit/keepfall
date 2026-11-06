// Screenshots of the card a fallen player is offered (the three variants). The state is forced in the page (the dev handle `keepfallUi`), because a real
// fall comes at a time nobody controls; what the server does on a fall is covered by tools/smoke-test.mjs and the C# tests.
// Usage: node tools/shot-fall.mjs <out-prefix> [http://localhost:5174/]   (SIZE=800,450, KFLANG=tr|en)
// Needs a Development server and the Vite client: KEEPFALL_SERVER=http://localhost:5081 KEEPFALL_CLIENT_PORT=5174 npm --prefix client run dev
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/elenme/shot';
const URL = process.argv[3] ?? 'http://localhost:5174/';
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const lang = process.env.KFLANG ?? 'tr';
mkdirSync(dirname(OUT), { recursive: true });
const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','1');localStorage.setItem('keepfall_tutorial_seen','true');localStorage.removeItem('keepfall_challenges')}catch(e){}` });
const shot = (name) => b.shot(`${OUT}-${name}.png`);
const variant = (name, f) => b.js(`(() => { const ui = window.keepfallUi; ui.update = () => {}; ui.setRoom = () => {}; ui.eliminated = true; ui.finishDismissed = false; ui.finish.dataset.key = ''; ui.room = ${f}; ui.updateFinish(); return ui.finish.textContent; })()`);
try {
  await b.goto(URL);
  await b.waitFor(`!!document.querySelector('#quick')`);
  await sleep(1500);
  await b.js(`document.querySelector('#quick').click()`);
  await b.waitFor(`!!document.querySelector('canvas')`, 40);
  await sleep(4000);
  await b.js(`document.querySelector('#kingdom-decree button')?.click()`);
  await sleep(500);
  const mk = (extra) => `(() => { const r = JSON.parse(JSON.stringify(window.keepfallUi.room)); Object.assign(r, ${extra}); return r; })()`;
  console.log('solo, only bots left:', await variant('solo', mk('{ allHumansOut: true }')));
  await sleep(700); await shot('solo');
  console.log('people still playing:', await variant('multi', mk(`{ allHumansOut: false, players: r.players.map((p, i) => i === 1 ? { ...p, isBot: false } : p) }`)));
  await sleep(700); await shot('multi');
  console.log('all out, not the host:', await variant('guest', mk(`{ allHumansOut: true, players: r.players.map((p) => ({ ...p, isHost: false })) }`)));
  await sleep(700); await shot('guest');
  await b.js(`document.querySelector('.bot-end [data-a="watch"]').click()`);
  await sleep(300);
  console.log('hidden after "Maçı izle":', await b.js(`window.keepfallUi.finish.classList.contains('hidden')`));
} catch (e) {
  console.log('ERROR', e.message);
  await shot('error').catch(() => undefined);
}
for (const ev of b.events) if (ev.method === 'Runtime.exceptionThrown') console.log('EXC', ev.params.exceptionDetails.exception?.description ?? ev.params.exceptionDetails.text);
b.close();
process.exit(0);
