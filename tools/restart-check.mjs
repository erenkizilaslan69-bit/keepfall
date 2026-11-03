// The server is restarted in the middle of a match: the page says so clearly and goes to the main menu by itself. Needs the dev server on 5081 + Vite 5174. It stops and starts the
// 5081 server itself. Usage: node tools/restart-check.mjs
import { spawn, execSync } from 'node:child_process';
import { launch, sleep } from './cdp.mjs';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const stop = () => { try { for (const l of execSync('netstat -ano', { encoding: 'utf8' }).split('\n')) if (/:5081\s.*LISTENING/.test(l)) execSync(`taskkill /PID ${l.trim().split(/\s+/).pop()} /F`, { stdio: 'ignore' }); } catch { /* */ } };
const start = () => spawn('dotnet', ['run', '--no-build', '-c', 'Release', '--project', 'src/Keepfall.Server', '--urls', 'http://localhost:5081'], { env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'Development' }, stdio: 'ignore', detached: true }).unref();
const b = await launch({ width: 852, height: 393, mobile: true, dpr: 2 });
try {
  await b.goto('http://localhost:5174/');
  await b.js("document.querySelector('#name').value='R'; document.querySelector('#quick').click(); 1");
  ok(await b.waitFor("document.documentElement.classList.contains('in-game')", 60), 'in a match');
  await sleep(4000);
  stop(); await sleep(1500); start();
  ok(await b.waitFor("/restarted|server restarted/i.test(document.body.innerText)", 120), 'the message "The server restarted and the match is over" is shown');
  ok(await b.waitFor("!!document.querySelector('#quick') && !document.documentElement.classList.contains('in-game')", 30), 'the main menu comes by itself (no tap)');
  ok(!/Room not found|Could not join/.test(await b.js('document.body.innerText')), 'no "room not found" error on the way');
} finally { b.close(); }
process.exit(bad ? 1 : 0);
