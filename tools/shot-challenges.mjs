// Screenshots of challenge mode: home (with the new button), the list (fresh, then with progress), and the end screen of a challenge.
// Usage: node tools/shot-challenges.mjs <out-prefix> [http://localhost:5174/]   (SIZE=800,450 for the small screen, KFLANG=tr|en)
// Needs a Development server (speed control) and the Vite client: KEEPFALL_SERVER=http://localhost:5081 KEEPFALL_CLIENT_PORT=5174 npm --prefix client run dev
// The end screen needs the player to lose or win a whole match: it runs at ×20 with the player doing nothing (or `WIN=1`: a big army is sent by the console).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const OUT = process.argv[2] ?? 'art/shots/meydan/shot';
const URL = process.argv[3] ?? 'http://localhost:5174/';
const [w, h] = (process.env.SIZE ?? '1280,720').split(',').map(Number);
const lang = process.env.KFLANG ?? 'en';
mkdirSync(dirname(OUT), { recursive: true });
const b = await launch({ width: w, height: h, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.removeItem('keepfall_challenges')}catch(e){}` });
const errors = [];
const shot = (name) => b.shot(`${OUT}-${name}.png`);
try {
  await b.goto(URL);
  await b.waitFor(`!!document.querySelector('#quick')`);
  await sleep(2500);
  await shot('home');
  if (!(await b.js(`!!document.querySelector('#challenges')`))) { console.log('no challenge button on this page (the "before" picture)'); b.close(); process.exit(0); }
  await b.js(`document.querySelector('#challenges').click()`);
  await b.waitFor(`!!document.querySelector('.screen.challenges .ch-card')`);
  await sleep(800);
  await shot('list-fresh');
  console.log('cards:', await b.js(`document.querySelectorAll('.ch-card').length`), 'locked:', await b.js(`document.querySelectorAll('.ch-card.locked').length`));
  // progress: the first two done
  await b.js(`localStorage.setItem('keepfall_challenges', JSON.stringify({'ilk-zafer':3,'gozcu-ve-rapor':1}))`);
  await b.js(`document.querySelector('[data-back]').click()`);
  await sleep(600);
  await b.js(`document.querySelector('#challenges').click()`);
  await b.waitFor(`!!document.querySelector('.screen.challenges .ch-card')`);
  await sleep(800);
  await shot('list-progress');
  console.log('locked after progress:', await b.js(`document.querySelectorAll('.ch-card.locked').length`));
  await b.js(`document.querySelector('.ch-list').scrollTop = 600`);
  await sleep(300);
  await shot('list-scrolled');
  // play the first one
  await b.js(`document.querySelector('[data-play="ilk-zafer"]').click()`);
  await b.waitFor(`!!document.querySelector('canvas')`, 30);
  await sleep(4000);
  await shot('game');
  await b.js(`window.keepfallNet.setSpeed(20)`);
  const ended = await b.waitFor(`!!document.querySelector('.screen.end .ch-result')`, 260);
  if (!ended) {
    // the player is out and the bots play on: the host ends it
    await b.js(`window.keepfallNet.finishMatch()`);
    await b.waitFor(`!!document.querySelector('.screen.end .ch-result')`, 30);
  }
  await sleep(2500);
  await shot('end');
  console.log('end screen:', await b.js(`JSON.stringify({stars:document.querySelectorAll('.ch-result .ch-star.on').length, goals:document.querySelectorAll('.ch-goal-results li').length, buttons:[...document.querySelectorAll('.ch-foot button:not(.hidden)')].map(x=>x.textContent.trim()), scroll:{h:document.querySelector('.screen.end').scrollHeight, c:document.querySelector('.screen.end').clientHeight}})`));
  console.log('saved:', await b.js(`localStorage.getItem('keepfall_challenges')`));
} catch (e) {
  console.log('ERROR', e.message);
  await shot('error').catch(() => undefined);
}
for (const ev of b.events) if (ev.method === 'Runtime.exceptionThrown') errors.push(ev.params.exceptionDetails.exception?.description ?? ev.params.exceptionDetails.text);
console.log(errors.length ? 'EXCEPTIONS:\n' + errors.join('\n') : 'no exceptions');
b.close();
process.exit(0);
