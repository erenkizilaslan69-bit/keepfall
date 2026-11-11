// The friend-hosted game of the desktop build, end to end over the LAN door (no Steam needed): one host and three guests on this machine.
//   host    the packed desktop game (steam-build/Keepfall, node tools/pack-steam.mjs)
//   guest B a second copy of the packed game, its line slowed (150 ± 50 ms each way, 2 % of the packets a resend later)
//   guest C a bare hub client (it drops and comes back with its token)
//   guest D a bare hub client behind the same slow line: it writes down every message it is sent (the leak check) and measures the answers
// Checked: the doors, a guest cannot make rooms or stop the host, a guest with another build is told before joining, a 4-player match starts,
// commands and pictures over the slow line, a guest that drops is played by a stand-in after the grace time and gets the seat back, nothing of the
// other players reaches a guest, the host's load, and the host quitting: everybody gets the end screen and the summary.
//   node tools/host-check.mjs [out-prefix]         (screenshots: art/shots/host/…; the grace time is 20 s here, 60 s in the game)
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { launch as launchApp, sleep, root, userDataDir } from './steam-launch.mjs';

const require = createRequire(import.meta.url);
const { lagPipe } = require('./steam/shell/tunnel.js');
const OUT = process.argv[2] ?? join(root, 'art', 'shots', 'host', 'check');
mkdirSync(dirname(OUT), { recursive: true });
const LAN = 47810, GRACE = 20;
const LAG = { ms: 150, jitter: 50, loss: 0.02 };
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };
const pids = (image) => { try { return execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: 'utf8' }).split(/\r?\n/).filter((l) => l.includes(image)).map((l) => Number(l.split('","')[1])); } catch { return []; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const prep = `try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}`;

async function desktop(label, cdp, env) {
  const saved = { ...process.env };
  Object.assign(process.env, { KEEPFALL_MULTI: '1', KEEPFALL_STEAM_APPID: '', ...env });
  const dir = userDataDir();
  process.env.KEEPFALL_USER_DATA = dir;
  try {
    const app = await launchApp(label, cdp, '', dir, OUT);
    await app.js(prep); await app.js('location.reload()'); await sleep(1500);
    await app.waitFor(`!!document.querySelector('#quick')`);
    await sleep(1500);
    return app;
  } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}

/** A bare hub client (SignalR's JSON protocol over one WebSocket), as tools/smoke-test.mjs does it. */
function hubClient(base) {
  const c = { got: [], raw: [], next: 1, waiting: new Map(), on: {} };
  c.ready = new Promise((resolve, reject) => {
    c.ws = new WebSocket(base.replace(/^http/, 'ws') + '/hub');
    c.ws.addEventListener('open', () => c.ws.send('{"protocol":"json","version":1}\x1e'));
    c.ws.addEventListener('error', () => reject(new Error('no connection')));
    c.ws.addEventListener('close', () => { c.closed = true; });
    c.ws.addEventListener('message', (m) => {
      for (const part of String(m.data).split('\x1e').filter(Boolean)) {
        const d = JSON.parse(part);
        if (d.type === undefined) { resolve(); continue; }
        if (d.type === 1) { c.got.push({ at: Date.now(), target: d.target, args: d.arguments }); c.raw.push(part); c.on[d.target]?.(...d.arguments); }
        if (d.type === 3 && c.waiting.has(d.invocationId)) { c.waiting.get(d.invocationId)(d.result); c.waiting.delete(d.invocationId); }
        if (d.type === 6) c.ws.send('{"type":6}\x1e');
      }
    });
  });
  c.call = (target, ...args) => new Promise((resolve) => { const id = String(c.next++); c.waiting.set(id, resolve); c.ws.send(JSON.stringify({ type: 1, invocationId: id, target, arguments: args }) + '\x1e'); setTimeout(() => { if (c.waiting.delete(id)) resolve(undefined); }, 15000); });
  c.last = (target) => [...c.got].reverse().find((g) => g.target === target)?.args[0];
  c.waitFor = async (f, sec = 30) => { for (let i = 0; i < sec * 4; i++) { if (f()) return true; await sleep(250); } return false; };
  return c;
}

const before = new Set(pids('Keepfall.Server.exe'));
const apps = [];
let slowDoor = null, C = null;
try {
  // ---- the host ----
  const host = await desktop('host', 9451, { KEEPFALL_LAN_PORT: String(LAN), KEEPFALL_TAKEOVER_SECONDS: String(GRACE) });
  apps.push(host);
  const hostServer = pids('Keepfall.Server.exe').filter((p) => !before.has(p))[0];
  check('host: the menu offers hosting and joining by address', await host.js(`!!document.querySelector('#create') && !!document.querySelector('#code') && /host|LAN/i.test(document.querySelector('#create').textContent)`));
  await host.shot('host-menu');
  await host.js(`document.querySelector('#name').value='Hosty'; document.querySelector('#create').click(); 1`);
  check('host: the lobby is up', await host.waitFor(`!!document.querySelector('.lobby .title-ribbon .code') && !!document.querySelector('.share-code')`, 20));
  await sleep(1500);
  const code = await host.js(`document.querySelector('.title-ribbon .code').textContent.trim()`);
  const link = await host.js(`document.querySelector('.share-code').value`);
  const info = await host.js(`window.keepfallSteam.mp.info()`);
  check('host: the lobby shows the address for friends', new RegExp(`^[0-9.]+:${LAN}#${code}$`).test(link), link);
  check('host: the LAN door is open, and the lobby says so', info?.hosting === true && info.lanPort === LAN && await host.js(`/${LAN}/.test(document.querySelector('#door-open')?.textContent ?? '')`), JSON.stringify({ lanPort: info?.lanPort, build: info?.build }));
  await host.shot('host-lobby');
  const lanHost = link.split(':')[0];
  const door = `http://127.0.0.1:${LAN}`;
  const version = await (await fetch(`http://${lanHost}:${LAN}/version`)).json().catch(() => null);
  check('the door answers on the LAN address with the build name', version?.hosted === true && version.build === info.build, JSON.stringify(version));

  // ---- what a guest may not do ----
  const stranger = hubClient(door); await stranger.ready;
  const made = await stranger.call('CreateRoom', 'Sneak');
  check('a guest cannot make a room on the host', made?.ok === false, made?.error);
  check('a guest cannot use the director', (await stranger.call('DirectorRooms', 'x'.repeat(24))) === null);
  check('a guest cannot stop the host', (await fetch(`${door}/api/host/stop`, { method: 'POST' })).status === 404);
  const closedPaths = ['/', '/index.html', '/assets/', '/api/guide', '/health', '/ping', '/licenses/', '/hubx', '/version/x'];
  const answers = [];
  for (const path of closedPaths) answers.push(await fetch(door + path).then((r) => r.status, () => 0));
  check('nothing but the hub and /version is served to a guest (no game files, no APIs)', answers.every((s) => s === 404 || s === 0), closedPaths.map((p, i) => `${p} ${answers[i]}`).join(', '));
  check('host commands from a guest that sits nowhere are refused', (await Promise.all(['StartMatch', 'FinishMatch', 'BackToLobby'].map((m) => stranger.call(m)))).every((r) => r?.ok === false) && (await stranger.call('KickPlayer', 1))?.ok === false && (await stranger.call('AddBot', 'easy'))?.ok === false);
  stranger.ws.close();

  // ---- the host puts a player out: the line is closed and that address cannot come back to the room ----
  const viaLan = `http://${lanHost}:${LAN}`; // (another address than the other test guests', which come from 127.0.0.1)
  const troll = hubClient(viaLan); await troll.ready;
  const tJoin = await troll.call('JoinRoom', code, 'Troll', null, false);
  check('a player joins from the LAN address', tJoin?.ok === true, `seat ${tJoin?.seat}`);
  check('the host sees a "remove" button next to the player', await host.waitFor(`!!document.querySelector('[data-a="kick"][data-seat="${tJoin?.seat}"]')`, 10));
  check('a guest cannot remove anybody', (await troll.call('KickPlayer', 1))?.ok === false);
  await host.js(`document.querySelector('[data-a="kick"][data-seat="${tJoin?.seat}"]').click(); 1`);
  check('removed: the player is told and its line is closed', await troll.waitFor(() => troll.got.some((g) => g.target === 'Kicked') && troll.closed === true, 10));
  check('...the seat is free again', await host.waitFor(`document.querySelectorAll('#players li[data-color]').length === 1`, 10));
  const again = hubClient(viaLan); await again.ready;
  const tAgain = await again.call('JoinRoom', code, 'Troll', tJoin?.token, false);
  check('...and the same address cannot join that room again', tAgain?.ok === false && /çıkardı/.test(tAgain.error ?? ''), tAgain?.error);
  again.ws.close();
  const idle = hubClient(door); await idle.ready;
  const idleFrom = Date.now();

  // ---- a guest with another build is told before joining ----
  const old = await desktop('old', 9453, { KEEPFALL_BUILD: '0.0.9+old' });
  await old.js(`document.querySelector('#name').value='Oldie'; document.querySelector('#code').value='127.0.0.1:${LAN}#${code}'; document.querySelector('#join').click(); 1`);
  check('another build: "version mismatch" with both names, and no seat taken', await old.waitFor(`/version mismatch|Sürüm uyuşmuyor/i.test(document.querySelector('#error').textContent) && /0\\.0\\.9\\+old/.test(document.querySelector('#error').textContent)`, 15), await old.js(`document.querySelector('#error').textContent`));
  await old.shot('guest-version');
  await old.js(`document.querySelector('#code').value='127.0.0.1:1#${code}'; document.querySelector('#join').click(); 1`);
  check('a dead address: "could not be reached"', await old.waitFor(`/could not be reached|ulaşılamadı/i.test(document.querySelector('#error').textContent)`, 15));
  execSync(`taskkill /PID ${old.child.pid} /T /F`, { stdio: 'ignore' });

  // ---- the guests ----
  const B = await desktop('guest', 9452, { KEEPFALL_LAG: `${LAG.ms},${LAG.jitter},${LAG.loss}` });
  apps.push(B);
  await B.js(`document.querySelector('#name').value='Bee'; document.querySelector('#code').value='127.0.0.1:${LAN}#${code}'; document.querySelector('#join').click(); 1`);
  check('guest B (desktop, slow line): in the host\'s lobby', await B.waitFor(`!!document.querySelector('.lobby .title-ribbon .code') && document.querySelector('.title-ribbon .code').textContent.trim()==='${code}'`, 25), await B.js(`document.querySelector('#error')?.textContent ?? ''`));
  C = hubClient(door); await C.ready;
  const cJoin = await C.call('JoinRoom', code, 'Cee', null, false);
  check('guest C (bare client): seated', cJoin?.ok === true && typeof cJoin.token === 'string', `seat ${cJoin?.seat}`);
  // D behind a slow line of its own
  slowDoor = net.createServer((s) => { const up = net.connect({ host: '127.0.0.1', port: LAN }); lagPipe(s, up, LAG); lagPipe(up, s, LAG); s.on('error', () => up.destroy()); up.on('error', () => s.destroy()); s.on('close', () => up.destroy()); up.on('close', () => s.destroy()); });
  await new Promise((r) => slowDoor.listen(0, '127.0.0.1', r));
  const D = hubClient(`http://127.0.0.1:${slowDoor.address().port}`); await D.ready;
  const dJoin = await D.call('JoinRoom', code, 'Dee', null, false);
  check('guest D (bare client, slow line): seated', dJoin?.ok === true && dJoin.seat >= 2, `seat ${dJoin?.seat}`);
  check('a connection that takes no seat is closed by the host (20 s)', await idle.waitFor(() => idle.closed === true, 30), `${((Date.now() - idleFrom) / 1000).toFixed(0)} s`);
  await sleep(1500);
  check('host: four players in the lobby', (await host.js(`document.querySelectorAll('#players li[data-color]').length`)) === 4);
  await B.shot('guest-lobby');

  // ---- the match ----
  await D.call('SetReady', true);
  await C.call('SetReady', true);
  for (const p of [B, host]) await p.js(`document.querySelector('#ready').click(); 1`);
  check('host: Start becomes available', await host.waitFor(`!document.querySelector('#start').disabled`, 15));
  await host.js(`document.querySelector('#start').click(); 1`);
  for (const [n, p] of [['host', host], ['guest B', B]]) check(`${n}: in the match`, await p.waitFor(`document.documentElement.classList.contains('in-game')`, 60));
  check('guest C: gets its castle and the map', await C.waitFor(() => !!C.last('CastleState') && !!C.last('MapState') && !!C.last('MapLayout'), 30));
  check('guest D: gets its castle and the map', await D.waitFor(() => !!D.last('CastleState') && !!D.last('MapState') && !!D.last('MapLayout'), 30));
  await sleep(6000);
  await B.shot('guest-match');
  await host.shot('host-match');

  // ---- the slow line: answers and pictures ----
  const trips = [];
  for (let i = 0; i < 20; i++) { const t0 = Date.now(); await D.call('Ping'); trips.push(Date.now() - t0); await sleep(120); }
  trips.sort((a, b) => a - b);
  const cmd = [];
  for (let i = 0; i < 8; i++) { const t0 = Date.now(); const r = await D.call('MoveWorkers', i % 2 ? 'farmer' : 'idle', i % 2 ? 'idle' : 'farmer', 1); if (r) cmd.push({ ms: Date.now() - t0, ok: r.ok }); await sleep(300); }
  const mark = D.got.length; await sleep(20000);
  const pics = D.got.slice(mark).filter((g) => g.target === 'CastleState').map((g) => g.at);
  const gaps = pics.slice(1).map((t, i) => t - pics[i]).sort((a, b) => a - b);
  const p95 = (a) => a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
  console.log(`      slow line (${LAG.ms}±${LAG.jitter} ms each way, ${LAG.loss * 100}% resent): ping median ${trips[10]} ms, p95 ${p95(trips)} ms; a command answered in ${Math.round(cmd.reduce((s, c) => s + c.ms, 0) / Math.max(1, cmd.length))} ms (worst ${Math.max(...cmd.map((c) => c.ms))}); castle pictures every ${gaps[Math.floor(gaps.length / 2)]} ms (p95 ${p95(gaps)}, worst ${gaps[gaps.length - 1]})`);
  check('slow line: every command is answered, within a second', cmd.length === 8 && cmd.every((c) => c.ok && c.ms < 1500));
  check('slow line: the pictures keep coming (no gap over 3 s)', gaps.length >= 12 && gaps[gaps.length - 1] < 3000, `${gaps.length} pictures in 20 s`);
  check('guest B (slow line) is still in the match and connected', await B.js(`document.documentElement.classList.contains('in-game') && !document.getElementById('banner')`));

  // ---- the host's load ----
  const load = (pid) => { try { const [cpu, ws] = execSync(`powershell -NoProfile -Command "$p=Get-Process -Id ${pid}; '{0};{1}' -f $p.CPU,$p.WorkingSet64"`, { encoding: 'utf8' }).trim().replace(/,/g, '.').split(';').map(Number); return { cpu, mb: ws / 1048576 }; } catch { return null; } };
  const l0 = load(hostServer), t0 = Date.now();

  // ---- a guest drops: the seat is kept, then a stand-in plays, and the guest gets it back ----
  const seatOf = (name) => D.last('RoomState')?.players.find((p) => p.name === name);
  const cName = 'Cee';
  const droppedAt = Date.now();
  C.ws.close(); // the guest's line is gone (its game crashed, its network dropped)
  const seenGone = await D.waitFor(() => seatOf(cName)?.connected === false, 30);
  check('a dropped guest is shown as disconnected to the others', seenGone, `after ${((Date.now() - droppedAt) / 1000).toFixed(0)} s`);
  const goneAt = Date.now();
  check('...and keeps the seat (no stand-in) during the grace time', seatOf(cName)?.deputy !== true);
  const taken = await D.waitFor(() => seatOf(cName)?.deputy === true, GRACE + 15);
  check(`after the grace time (${GRACE} s here) a stand-in plays the castle`, taken && Date.now() - goneAt >= (GRACE - 3) * 1000, `${((Date.now() - goneAt) / 1000).toFixed(0)} s after the drop was seen`);
  await host.shot('host-standin');
  // somebody else cannot take the empty-looking seat; the guest's own token can
  const thief = hubClient(door); await thief.ready;
  const stolen = await thief.call('JoinRoom', code, 'Cee', 'not-the-token-' + 'x'.repeat(30), false);
  check('a stranger cannot take the dropped guest\'s seat (the match has started, the token is wrong)', stolen?.ok === false, stolen?.error);
  thief.ws.close();
  C = hubClient(door); await C.ready;
  const cBack = await C.call('JoinRoom', code, 'Cee', cJoin.token, false);
  const back = await D.waitFor(() => seatOf(cName)?.connected === true && seatOf(cName)?.deputy !== true, 30);
  check('the guest comes back with its token: the seat is theirs again, the stand-in is gone', cBack?.ok === true && cBack.seat === cJoin.seat && back && await C.waitFor(() => !!C.last('CastleState'), 10));

  const l1 = load(hostServer), secs = (Date.now() - t0) / 1000;
  const shellMb = pids('Keepfall.exe').map((p) => load(p)).filter(Boolean);
  if (l0 && l1) console.log(`      host load over ${secs.toFixed(0)} s of a 4-player match: game server ${(100 * (l1.cpu - l0.cpu) / secs).toFixed(1)} % of one core, ${l1.mb.toFixed(0)} MB; all desktop windows on this machine (host + guest B, ${shellMb.length} processes) ${shellMb.reduce((s, x) => s + x.mb, 0).toFixed(0)} MB`);
  check('host load: the game server stays under a quarter of one core', !!l0 && !!l1 && (l1.cpu - l0.cpu) / secs < 0.25);

  // ---- nothing of the others reaches a guest ----
  const secrets = [];
  for (const [n, p] of [['host', host], ['B', B]]) {
    const store = await p.js(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))`);
    for (const m of store.matchAll(/[A-Za-z0-9_-]{20,}/g)) secrets.push([n, m[0]]);
  }
  secrets.push(['C', cJoin.token]);
  const all = D.raw.join('\n');
  const leaked = secrets.filter(([, s]) => all.includes(s));
  check(`leak: none of the other players' secrets (${secrets.length} tokens from their storage) is in the ${D.raw.length} messages a guest got`, secrets.length >= 3 && leaked.length === 0, leaked.map(([n]) => n).join(','));
  const mySeat = dJoin.seat;
  const castles = D.got.filter((g) => g.target === 'CastleState');
  check('leak: every castle picture is the guest\'s own', castles.length > 10 && castles.every((g) => g.args[0].seat === undefined || g.args[0].seat === mySeat) && castles.every((g) => g.args[0].color === castles[0].args[0].color));
  check('leak: a guest that has not fallen never gets the whole-map (spectator / director) pictures', !D.got.some((g) => g.target === 'SpectatorState'));
  const kingdoms = D.got.filter((g) => g.target === 'MapState').map((g) => Object.keys(g.args[0].kingdoms ?? {}).length);
  check('leak: no rival\'s kingdom, deck or token in the room and map pictures', !/"token"/i.test(D.raw.filter((r) => r.includes('"RoomState"')).join('')) && !/"deck"/i.test(D.raw.filter((r) => r.includes('"RoomState"') || r.includes('"MapLayout"')).join('')) && Math.max(0, ...kingdoms) <= 1, `kingdoms seen at most ${Math.max(0, ...kingdoms)}`);
  writeFileSync(`${OUT}-guest-messages.jsonl`, D.raw.join('\n'));

  // ---- the host quits: everybody gets the end and the summary ----
  const mark2 = D.got.length;
  // the player closes the window (ABRUPT=1: the host's computer just dies instead; then there is no goodbye and guests find the host gone)
  const ABRUPT = process.env.ABRUPT === '1';
  if (ABRUPT) execSync(`taskkill /PID ${host.child.pid} /T /F`, { stdio: 'ignore' }); else execSync(`powershell -NoProfile -Command "(Get-Process -Id ${host.child.pid}).CloseMainWindow()"`, { stdio: 'ignore' }); // (as the X button does)
  if (ABRUPT) {
    check('host dies without a word: guest B is told the host is gone (within half a minute)', await B.waitFor(`/connection to the host was lost|Ev sahibiyle bağlantı koptu/i.test(document.getElementById('banner')?.textContent ?? '')`, 40), await B.js(`document.getElementById('banner')?.textContent ?? ''`));
    await sleep(12000);
    check('...and the words stay (no endless "reconnecting")', await B.js(`/connection to the host was lost|Ev sahibiyle bağlantı koptu/i.test(document.getElementById('banner')?.textContent ?? '')`), await B.js(`(document.getElementById('banner')?.textContent ?? '') + ' | ' + document.body.innerText.slice(0, 200)`));
    await B.shot('guest-host-lost');
    await B.js(`document.getElementById('banner').click(); 1`);
    check('guest B is back at its own menu and can play alone again', await B.waitFor(`!!document.querySelector('#quick')`, 20));
    await B.js(`document.querySelector('#quick').click(); 1`);
    check('...a quick match on its own server starts', await B.waitFor(`document.documentElement.classList.contains('in-game')`, 60));
    throw { done: true };
  }
  await sleep(3000);
  console.log('      host shell log: ' + readFileSync(host.log, 'utf8').trim().split(String.fromCharCode(10)).slice(-4).map((l) => l.trim()).join(' | '));
  console.log('      guest D got after the close: ' + D.got.slice(mark2).map((g) => g.target).join(',').slice(0, 300) + (D.closed ? ' (line closed)' : ''));
  const told = await D.waitFor(() => D.got.slice(mark2).some((g) => g.target === 'HostLeft') && D.got.slice(mark2).some((g) => g.target === 'MatchEnded'), 20);
  const ended = D.got.slice(mark2).find((g) => g.target === 'MatchEnded')?.args[0];
  const room = D.last('RoomState');
  check('host quits: guests are told, the match ends with a result', told && room?.phase === 'ended' && !!room.result, D.got.slice(mark2).find((g) => g.target === 'HostLeft')?.args[0]);
  check('host quits: the summary (with the "who fooled whom" data) is delivered', !!ended && typeof ended === 'object', ended ? Object.keys(ended).slice(0, 8).join(',') : '');
  check('guest B shows the end screen and why', await B.waitFor(`!!document.querySelector('.screen.end') && /host has left|Ev sahibi oyundan ayr/i.test(document.getElementById('banner')?.textContent ?? '')`, 25), await B.js(`document.getElementById('banner')?.textContent ?? ''`));
  check('guest C (back on its seat) gets the end and the summary too', await C.waitFor(() => C.got.some((g) => g.target === 'HostLeft') && C.got.some((g) => g.target === 'MatchEnded'), 10));
  await sleep(1500);
  await B.shot('guest-end');
  for (let i = 0; i < 30 && alive(hostServer); i++) await sleep(300);
  check('the host\'s server is gone with it', !alive(hostServer));
  await sleep(14000);
  check('guest B does not hang on "reconnecting": the banner still says the host left', await B.js(`/host has left|Ev sahibi oyundan ayr/i.test(document.getElementById('banner')?.textContent ?? '')`), await B.js(`(document.getElementById('banner')?.textContent ?? '') + ' | ' + document.body.innerText.slice(0, 200)`));
  await B.js(`document.getElementById('banner').click(); 1`);
  check('guest B is back at its own menu and can play alone again', await B.waitFor(`!!document.querySelector('#quick')`, 20));
  D.ws.close();
} catch (e) {
  if (!e?.done) check('the run finished', false, e.stack ?? String(e));
} finally {
  for (const a of apps) { try { execSync(`taskkill /PID ${a.child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ } }
  try { C?.ws.close(); } catch { /* gone */ }
  slowDoor?.close();
  await sleep(1500);
  for (const p of pids('Keepfall.Server.exe').filter((p) => !before.has(p))) { try { process.kill(p); } catch { /* gone */ } }
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
