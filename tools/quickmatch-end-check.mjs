// One Quick Match from the home screen to the end screen (played at x1 to its natural end, about 18 minutes), with the console watched: no errors allowed. Total limit 25 minutes.
// Needs the dev server (5081) + Vite (crazy flags off on 5175 is the real setting). Usage: node tools/quickmatch-end-check.mjs [http://localhost:5175/] [out.png]
import { launch, sleep } from './cdp.mjs';
const URL = process.argv[2] ?? 'http://localhost:5175/', OUT = process.argv[3] ?? 'art/shots/quickmatch-end.png';
setTimeout(() => { console.log('FAIL total time limit (25 min)'); process.exit(2); }, 25 * 60_000).unref();
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const b = await launch({ width: 1366, height: 768 });
try {
  await b.goto(URL);
  await b.js("document.querySelector('#name').value='Desk'; document.querySelector('#quick').click(); 1");
  ok(await b.waitFor("document.documentElement.classList.contains('in-game')", 90), 'Quick Match: the match started');
  // Real time (x1): an 18-minute match ends by the clock (or the player's fall); nothing is forced. A human in the room cannot be finished by FinishMatch.
  ok(await b.waitFor("document.querySelector('#ranking') && document.querySelector('#ranking').children.length > 0", 23 * 60), 'the end screen shows a ranking (match played to its end at x1)');
  await sleep(3000);
  await b.shot(OUT);
  const errs = b.events.filter((e) => (e.method === 'Runtime.exceptionThrown') || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'));
  ok(errs.length === 0, `no console errors (${errs.length})`);
  for (const e of errs.slice(0, 5)) console.log('   ', JSON.stringify(e.params).slice(0, 300));
} finally { b.close(); }
process.exit(bad ? 1 : 0);
