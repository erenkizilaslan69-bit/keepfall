// Private room → invitation link → join → match (empty seat filled with a bot) → one player's line is cut and comes back. Three separate browsers (the third is a phone).
// Needs the dev servers (5081 + Vite 5174; for the CrazyGames build Vite with VITE_PLATFORM=crazygames). Usage: node tools/invite-check.mjs [http://localhost:5174] [out-prefix]
import { launch, sleep } from './cdp.mjs';
const URL = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, ''), OUT = process.argv[3] ?? 'invite';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const host = await launch({ width: 1280, height: 720 });
const guest = await launch({ width: 1280, height: 720 });
const phone = await launch({ width: 844, height: 390, mobile: true, ua: PHONE, dpr: 2 });
try {
  await host.goto(URL + '/');
  await host.js("document.querySelector('#name').value='Hosty'; document.querySelector('#create').click(); 1");
  ok(await host.waitFor("document.querySelector('.lobby') && document.querySelector('.title-ribbon .code')", 15), 'host: private room lobby is up');
  const code = await host.js("document.querySelector('.title-ribbon .code').textContent.trim()");
  ok(/^[A-Z]{6}$/.test(code), `room code has 6 letters: ${code}`);
  await host.shot(`${OUT}-host-lobby.png`);
  // wrong code first
  await guest.goto(URL + '/');
  await guest.js("document.querySelector('#name').value='Gus'; document.querySelector('#code').value='AAAAAA'; document.querySelector('#join').click(); 1");
  await sleep(1500);
  ok(/not found/i.test(await guest.js("document.body.innerText")), 'unknown code: "Room not found" is shown in English');
  // the invitation link: ?room=CODE opens straight into the room
  await guest.goto(`${URL}/?room=${code}`);
  ok(await guest.waitFor("document.querySelector('.lobby')", 15), 'guest: ?room= link joined the lobby directly');
  await phone.goto(`${URL}/?room=${code}`);
  ok(await phone.waitFor("document.querySelector('.lobby')", 15), 'phone: ?room= link joined the lobby directly');
  await sleep(1000);
  await phone.shot(`${OUT}-phone-lobby.png`);
  // a fifth person: the room is full after the fourth seat (here: three humans + one bot seat free) -> check "full" by a 4th browser later
  for (const b of [guest, phone]) await b.js("document.querySelector('#ready').click(); 1");
  await host.js("document.querySelector('#ready').click(); 1");
  await sleep(1500);
  ok(await host.js("!document.querySelector('#start').disabled"), 'host: Start is enabled (one empty seat will get a bot)');
  await host.shot(`${OUT}-host-ready.png`);
  await host.js("document.querySelector('#start').click(); 1");
  for (const [n, b] of [['host', host], ['guest', guest], ['phone', phone]]) ok(await b.waitFor("document.documentElement.classList.contains('in-game')", 40), `${n}: in the match`);
  ok((await host.js("keepfallNet.seat")) === 1, 'host has seat 1');
  const players = await host.js("document.querySelectorAll('.tb-players > *, .tb-players .chip').length");
  console.log('players in the top bar:', players);
  // the phone's line is cut, the room goes on, it comes back to the same seat
  const seat = await phone.js('keepfallNet.seat');
  await phone.js("keepfallNet.hub.connection.stop(new Error('cut')); 1");
  await sleep(4000);
  ok(await phone.waitFor("keepfallNet.hub.state === 'Connected'", 25), 'phone: reconnected');
  ok((await phone.js('keepfallNet.seat')) === seat && (await phone.js("document.documentElement.classList.contains('in-game')")), `phone: same seat ${seat}, still in the match`);
  await phone.shot(`${OUT}-phone-game.png`);
  // a late joiner: the match has started
  const late = await launch({ width: 1280, height: 720 });
  await late.goto(`${URL}/?room=${code}`);
  const seen = await late.waitFor("/already started|full/i.test(document.body.innerText)", 25);
  ok(seen, 'late joiner: "match already started" / "room full" is shown');
  await late.shot(`${OUT}-late.png`);
  late.close();
} finally { host.close(); guest.close(); phone.close(); }
process.exit(bad ? 1 : 0);
