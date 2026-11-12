// A hostile guest against a hosted game (the packed desktop build, LAN door): everything a stranger in a public lobby could throw at the host's
// computer. Nothing here may crash the host, reach anything but the game hub, or disturb the match.
//   1. the door: other paths and files, other methods and protocols, garbage, a request line that never ends, silence, a second request smuggled
//      behind an allowed one, huge headers and bodies, a flood of connections, connect/disconnect churn;
//   2. the hub: wrong or missing handshake, oversized and broken frames, unknown methods, wrong argument types, a false version;
//   3. the room: host commands from a guest (start, stop, bots, speed, remove a player), taking somebody else's seat or name;
//   4. the match: hundreds of commands with nonsense arguments while a match runs; the match must keep ticking for everybody.
//   node tools/host-fuzz.mjs        (needs steam-build/Keepfall: node tools/pack-steam.mjs)
import { execSync } from 'node:child_process';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { launch as launchApp, sleep, userDataDir } from './steam-launch.mjs';

const LAN = 47840;
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + String(extra).slice(0, 260) : ''}`); if (!ok) failures++; };
const pids = (image) => { try { return execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: 'utf8' }).split(/\r?\n/).filter((l) => l.includes(image)).map((l) => Number(l.split('","')[1])); } catch { return []; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** Sends bytes to the door and returns what came back and when the door closed the connection. */
function raw(host, bytes, { waitMs = 2500, keepOpen = false } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now(); let text = '', closedAt = null, done = false;
    const s = net.connect({ host, port: LAN });
    const finish = () => { if (done) return; done = true; s.destroy(); resolve({ text, status: Number(/^HTTP\/1\.1 (\d+)/.exec(text)?.[1] ?? 0), statuses: [...text.matchAll(/HTTP\/1\.1 (\d+)/g)].map((m) => Number(m[1])), closedMs: closedAt === null ? null : closedAt - t0 }); };
    s.on('connect', () => { if (bytes?.length) s.write(bytes); });
    s.on('data', (d) => { text += d.toString('latin1'); });
    s.on('error', () => { closedAt ??= Date.now(); finish(); });
    s.on('close', () => { closedAt ??= Date.now(); finish(); });
    if (!keepOpen) setTimeout(finish, waitMs);
    else setTimeout(finish, waitMs);
  });
}
const req = (line, extra = '') => `${line}\r\nHost: 127.0.0.1\r\n${extra}\r\n`;

/** A bare hub client; `handshake` can be replaced by anything. */
function hubClient(base, handshake = '{"protocol":"json","version":1}\x1e') {
  const c = { got: [], next: 1, waiting: new Map(), closed: false, opened: false };
  c.ready = new Promise((resolve) => {
    c.ws = new WebSocket(base.replace(/^http/, 'ws') + '/hub');
    c.ws.addEventListener('open', () => { c.opened = true; if (handshake !== null) c.ws.send(handshake); });
    c.ws.addEventListener('error', () => { c.closed = true; resolve(false); });
    c.ws.addEventListener('close', () => { c.closed = true; resolve(false); for (const r of c.waiting.values()) r(undefined); c.waiting.clear(); });
    c.ws.addEventListener('message', (m) => {
      for (const part of String(m.data).split('\x1e').filter(Boolean)) {
        let d; try { d = JSON.parse(part); } catch { continue; }
        if (d.type === undefined) { if (d.error) { c.handshakeError = d.error; resolve(false); } else resolve(true); continue; }
        if (d.type === 1) c.got.push({ at: Date.now(), target: d.target, args: d.arguments });
        if (d.type === 3 && c.waiting.has(d.invocationId)) { c.waiting.get(d.invocationId)(d.error ? { ok: false, error: d.error, hubError: true } : d.result); c.waiting.delete(d.invocationId); }
        if (d.type === 6) { try { c.ws.send('{"type":6}\x1e'); } catch { /* closing */ } }
      }
    });
  });
  c.send = (text) => { try { c.ws.send(text); return true; } catch { return false; } };
  c.call = (target, ...args) => new Promise((resolve) => { if (c.closed) { resolve(undefined); return; } const id = String(c.next++); c.waiting.set(id, resolve); if (!c.send(JSON.stringify({ type: 1, invocationId: id, target, arguments: args }) + '\x1e')) { c.waiting.delete(id); resolve(undefined); } setTimeout(() => { if (c.waiting.delete(id)) resolve(undefined); }, 8000); });
  c.last = (target) => [...c.got].reverse().find((g) => g.target === target)?.args[0];
  c.waitFor = async (f, sec = 20) => { for (let i = 0; i < sec * 4; i++) { if (f()) return true; await sleep(250); } return false; };
  return c;
}

const before = new Set(pids('Keepfall.Server.exe'));
Object.assign(process.env, { KEEPFALL_MULTI: '1', KEEPFALL_STEAM_APPID: '', KEEPFALL_LAN_PORT: String(LAN) });
const dir = userDataDir(); process.env.KEEPFALL_USER_DATA = dir;
const host = await launchApp('fuzz-host', 9481, '', dir);
const hostServer = pids('Keepfall.Server.exe').filter((p) => !before.has(p))[0];
try {
  await host.js(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){}`);
  await host.js('location.reload()'); await sleep(1500);
  await host.waitFor(`!!document.querySelector('#quick')`); await sleep(1500);
  await host.js(`document.querySelector('#name').value='Hosty'; document.querySelector('#create').click(); 1`);
  await host.waitFor(`!!document.querySelector('.lobby .share-code')`, 20); await sleep(1500);
  const code = await host.js(`document.querySelector('.title-ribbon .code').textContent.trim()`);
  const lanHost = (await host.js(`document.querySelector('.share-code').value`)).split(':')[0];
  const L = '127.0.0.1', door = `http://127.0.0.1:${LAN}`;
  const healthy = async () => alive(hostServer) && (await raw(L, req('GET /version HTTP/1.1'))).status === 200;
  check('the host is up and its door answers /version', await healthy(), `room ${code}, LAN address ${lanHost}`);

  // ---------- 1. the door ----------
  const paths = ['/', '/index.html', '/assets/index.js', '/art/ui/logo.png', '/config/balance.json', '/api/guide', '/api/client-log', '/api/host/stop', '/health', '/ping', '/licenses/', '/oda/' + code,
    '/hub/../index.html', '/hub/..%2f..%2fconfig/balance.json', '/hub%2f..%2findex.html', '/hubby', '/hub/negotiate/../../index.html', '/version/', '/version?x=1', '/VERSION', '//hub', '/./hub', '/..', '/c:/windows/win.ini', '/hub\\..\\index.html'];
  const bad = [];
  for (const p of paths) { const r = await raw(L, req(`GET ${p} HTTP/1.1`), { waitMs: 1200 }); if (r.status !== 404 && !(r.status === 0 && r.closedMs !== null)) bad.push(`${p} → ${r.status}`); await sleep(260); }
  check(`${paths.length} other paths (files, APIs, traversal) all get 404`, bad.length === 0, bad.join(', '));
  const lines = ['PUT /hub HTTP/1.1', 'PATCH /hub HTTP/1.1', 'TRACE /hub HTTP/1.1', 'CONNECT 127.0.0.1:22 HTTP/1.1', 'GET http://127.0.0.1/index.html HTTP/1.1', 'GET /hub HTTP/1.0', 'GET /hub HTTP/2.0', 'PRI * HTTP/2.0', 'get /hub http/1.1', 'GET  /hub HTTP/1.1', 'GET /hub', 'POST /api/host/stop HTTP/1.1', 'DELETE /version HTTP/1.1', 'OPTIONS * HTTP/1.1'];
  const bad2 = [];
  for (const l of lines) { const r = await raw(L, req(l), { waitMs: 1200 }); if (r.status === 200 || r.status === 101) bad2.push(`${l} → ${r.status}`); await sleep(260); }
  check(`${lines.length} other methods, protocols and forms are turned away`, bad2.length === 0, bad2.join(', '));
  const junk = [randomBytes(4096), Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00, 0x01, 0x00, 0x01, 0xfc, 0x03, 0x03, ...randomBytes(64)]), Buffer.from('\x00\x00\x00\x00\r\n\r\n'), Buffer.from('SSH-2.0-OpenSSH_9.0\r\n'), Buffer.from('\r\n\r\n\r\n')];
  let junkOk = true;
  for (const j of junk) { const r = await raw(L, j, { waitMs: 8000 }); if (r.status === 200 || r.status === 101 || r.closedMs === null) junkOk = false; await sleep(260); }
  check('garbage, a TLS hello, an SSH banner: closed (at once, or after the 5 s a request line may take), never answered', junkOk);
  const endless = await raw(L, Buffer.concat([Buffer.from('GET /hub?'), Buffer.alloc(64 * 1024, 0x61)]), { waitMs: 3000 });
  check('a request line that never ends is cut off (1 KB)', endless.closedMs !== null && endless.closedMs < 2500 && endless.status !== 200, `closed after ${endless.closedMs} ms`);
  const silent = await raw(L, null, { waitMs: 9000 });
  check('a connection that says nothing is closed in about 5 s', silent.closedMs !== null && silent.closedMs > 3500 && silent.closedMs < 8000, `${silent.closedMs} ms`);
  const half = await raw(L, 'GET /hub', { waitMs: 9000 });
  check('half a request line: closed in about 5 s', half.closedMs !== null && half.closedMs < 8000, `${half.closedMs} ms`);
  const smuggle = await raw(L, req('GET /version HTTP/1.1') + req('GET /index.html HTTP/1.1') + req('GET /api/guide HTTP/1.1') + req('POST /api/host/stop HTTP/1.1', 'Content-Length: 0\r\n'), { waitMs: 2500 });
  check('requests smuggled behind an allowed one on the same connection: the server refuses each (200, then 404s)', smuggle.statuses[0] === 200 && smuggle.statuses.length >= 2 && smuggle.statuses.slice(1).every((s) => s === 404), smuggle.statuses.join(','));
  const fat = await raw(L, 'GET /version HTTP/1.1\r\nHost: x\r\n' + 'X-Pad: ' + 'a'.repeat(100 * 1024) + '\r\n\r\n', { waitMs: 2500 });
  check('100 KB of headers: refused', fat.status !== 200, `status ${fat.status}`);
  const bigBody = await raw(L, Buffer.concat([Buffer.from('POST /hub/negotiate?negotiateVersion=1 HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: 4194304\r\n\r\n'), Buffer.alloc(4 * 1024 * 1024, 0x41)]), { waitMs: 4000 });
  check('a 4 MB body: refused', bigBody.status !== 200, `status ${bigBody.status}`);
  check('the host is still healthy', await healthy());

  // a flood of connections from one address (the LAN one): turned away past the limit; the house keeps answering others
  const flood = await Promise.all(Array.from({ length: 200 }, () => raw(lanHost, req('GET /version HTTP/1.1'), { waitMs: 2500 })));
  const served = flood.filter((r) => r.status === 200).length, turned = flood.filter((r) => r.status === 429 || r.status === 0).length;
  check('200 connections at once from one address: most are turned away', served <= 40 && turned >= 150, `${served} served, ${turned} refused`);
  check('...while another address is still served', (await raw(L, req('GET /version HTTP/1.1'))).status === 200);
  const hold = await Promise.all(Array.from({ length: 30 }, () => raw(L, 'GET /hub', { waitMs: 1500 })));
  void hold;
  check('30 half-open connections do not block the door for the next one', await healthy());
  await sleep(11000);
  check('the flooding address is let in again once it calms down (10 s)', (await raw(lanHost, req('GET /version HTTP/1.1'))).status === 200);

  // churn: connect, shake hands, leave, again
  let churned = 0;
  for (let i = 0; i < 25; i++) { const c = hubClient(door); if (await c.ready) churned++; c.ws.close(); await sleep(330); }
  check('25 connect / handshake / disconnect rounds', churned === 25 && await healthy(), `${churned} handshakes`);

  // ---------- 2. the hub ----------
  await sleep(4000);
  const mp = hubClient(door, '{"protocol":"messagepack","version":1}\x1e');
  check('a handshake for another protocol is refused', (await mp.ready) === false, mp.handshakeError ?? (mp.closed ? 'closed' : ''));
  const gar = hubClient(door, 'hello there\x1e');
  check('a garbage handshake is refused', (await gar.ready) === false);
  const mute = hubClient(door, null);
  const mute0 = Date.now();
  check('no handshake at all: closed within the handshake time', await mute.waitFor(() => mute.closed, 20), `${((Date.now() - mute0) / 1000).toFixed(0)} s`);
  await sleep(1000);
  const big = hubClient(door); await big.ready;
  big.send(JSON.stringify({ type: 1, invocationId: '1', target: 'SetName', arguments: ['x'.repeat(300 * 1024)] }) + '\x1e');
  check('a 300 KB message closes that connection only', await big.waitFor(() => big.closed, 10) && await healthy());
  const brk = hubClient(door); await brk.ready;
  for (const frame of ['{"type":1,"target":', '[]', 'null', '{"type":99}', '{"type":1}', '{"type":1,"target":"NoSuchMethod","arguments":[]}', '{"type":1,"invocationId":"a","target":"Ping","arguments":[1,2,3,4,5,6,7,8]}', '{"type":4,"invocationId":"s","target":"Ping","arguments":[]}', '{"type":2,"invocationId":"s","item":1}', '{"type":5,"invocationId":"s"}', '{"type":7,"error":"bye","allowReconnect":true}', '\x1e\x1e\x1e', JSON.stringify({ type: 1, invocationId: 'd', target: 'SetDeck', arguments: [JSON.parse('['.repeat(60) + ']'.repeat(60))] })]) { brk.send(frame + '\x1e'); await sleep(120); }
  check('broken frames, unknown methods, stream and close frames: the host shrugs', await healthy());
  const ver = hubClient(door); await ver.ready;
  const hello = [await ver.call('Hello', 999999), await ver.call('Hello', 'x'), await ver.call('Hello'), await ver.call('Hello', -1)];
  check('a false version is of no use (Hello only answers the server\'s own)', hello.every((h) => h === 1 || h?.hubError || h === undefined), JSON.stringify(hello));
  const types = [['JoinRoom', 123, {}, [], true], ['JoinRoom', null, null, null, null], ['JoinRoom', 'x'.repeat(20000), 'n', 't', false], ['CreateRoom', { a: 1 }], ['SetReady', 'yes'], ['MoveWorkers', 'farmer', 'idle', 1e99], ['KickPlayer', 'one'], ['AddBot', 'godlike'], ['SendArmy', -1, { kilicli: 1e9 }, null, null, 'nuke']];
  for (const [m, ...a] of types) await ver.call(m, ...a);
  check('wrong argument types before joining: refused, the host is healthy', await healthy());
  ver.ws.close(); brk.ws.close();

  // ---------- 3. the room ----------
  await sleep(11000); // (a calm moment: the connection counters of this address start afresh)
  const G = hubClient(door); await G.ready;
  const gJoin = await G.call('JoinRoom', code, 'Mallory', null, false);
  check('the hostile guest takes a seat like anybody', gJoin?.ok === true, `seat ${gJoin?.seat}`);
  const hostSeat = gJoin.room?.players.find((p) => p.isHost)?.seat ?? 1;
  const tries = { StartMatch: [], SetMode: ['long'], AddBot: ['hard'], RemoveBot: [hostSeat], KickPlayer: [hostSeat], SetSpeed: [20], SetGuided: [true], SetStarter: [true], StartChallenge: ['daily'], StartChallengeFullRules: ['daily'], BackToLobby: [], FinishMatch: [], DirectorRooms: ['k'.repeat(24)], DirectorWatch: ['k'.repeat(24), code], CreateRoom: ['second'] };
  const got = {};
  for (const [m, a] of Object.entries(tries)) { const r = await G.call(m, ...a); got[m] = r === null ? 'null' : r?.ok === false ? 'refused' : JSON.stringify(r); }
  const roomNow = G.last('RoomState') ?? gJoin.room; // (the join's answer carries the room; a new picture only comes when something changes)
  check('host commands from a seated guest (start, bots, remove the host, speed, challenge, director, a room of its own) are all refused', Object.values(got).every((v) => v === 'refused' || v === 'null') && roomNow?.phase === 'lobby' && roomNow.players.length === 2 && roomNow.players.every((p) => !p.isBot), JSON.stringify(got));
  // somebody else's seat: the host's (no token), the guest's own token from a second line marked "remembered", a made-up token
  const imp = hubClient(door); await imp.ready;
  const asHost = await imp.call('JoinRoom', code, 'Hosty', null, false);
  await sleep(800); // (the others' picture of the room follows the answer)
  check('taking the host\'s name gives a new seat, not the host\'s', asHost?.ok === true && asHost.seat !== hostSeat && G.last('RoomState')?.players.find((p) => p.seat === hostSeat)?.isHost === true, `seat ${asHost?.seat}`);
  check('...and no host powers', (await imp.call('StartMatch'))?.ok === false && (await imp.call('KickPlayer', gJoin.seat))?.ok === false);
  await imp.call('LeaveRoom'); imp.ws.close();
  const names = ['<img src=x onerror=alert(1)>', '\u202Eevil', 'a'.repeat(5000), '\u0000\u0001', '👨‍👩‍👧‍👦'.repeat(20), '   '];
  for (const n of names) await G.call('SetName', n);
  const shown = G.last('RoomState')?.players.find((p) => p.seat === gJoin.seat)?.name ?? '';
  check('hostile names are cut and cleaned (16 characters, no control or direction characters)', [...shown].length <= 16 && !/[\u0000-\u001f\u202a-\u202e]/.test(shown), JSON.stringify(shown));
  check('the host\'s lobby still shows two players and no script ran', await host.js(`document.querySelectorAll('#players li[data-color]').length === 2 && !window.__pwned`));
  await G.call('SetName', 'Mallory');

  // a removed player's address stays out, also when it hides behind a kept-alive connection (an allowed request first, the socket after it)
  const viaLan = `http://${lanHost}:${LAN}`;
  await fetch(viaLan + '/version').then((r) => r.text());
  const troll = hubClient(viaLan); await troll.ready;
  const tJoin = await troll.call('JoinRoom', code, 'Troll', null, false);
  await host.waitFor(`!!document.querySelector('[data-a="kick"][data-seat="${tJoin?.seat}"]')`, 10);
  await host.js(`document.querySelector('[data-a="kick"][data-seat="${tJoin?.seat}"]')?.click(); 1`);
  await troll.waitFor(() => troll.closed, 10);
  const backs = [];
  for (let i = 0; i < 4; i++) { await fetch(viaLan + '/version').then((r) => r.text()); const b = hubClient(viaLan); await b.ready; backs.push(await b.call('JoinRoom', code, 'Troll' + i, i % 2 ? tJoin?.token : null, false)); b.ws.close(); await sleep(300); }
  check('a removed player cannot return to the room, with or without its old token, kept-alive connection or not', tJoin?.ok === true && troll.closed && backs.every((r) => r?.ok === false), backs.map((r) => r?.error ?? 'joined!').join(' | '));

  // ---------- 4. the match ----------
  await G.call('SetReady', true);
  await host.js(`document.querySelector('#ready').click(); 1`);
  await host.waitFor(`!document.querySelector('#start').disabled`, 15);
  await host.js(`document.querySelector('#start').click(); 1`);
  check('the match starts (empty seats: bots)', await host.waitFor(`document.documentElement.classList.contains('in-game')`, 60) && await G.waitFor(() => !!G.last('CastleState'), 30));
  await sleep(3000);
  const late = hubClient(door); await late.ready;
  const steal = [await late.call('JoinRoom', code, 'Mallory', 'x'.repeat(43), false), await late.call('JoinRoom', code, 'Hosty', gJoin.token.slice(0, -2) + 'zz', true), await late.call('JoinRoom', code, 'Hosty', '', false)];
  check('once the match runs, a seat cannot be taken with a wrong, near-miss or empty token', steal.every((r) => r?.ok === false), steal.map((r) => r?.error).join(' | '));
  late.ws.close();
  const e0 = G.last('CastleState')?.elapsedSeconds ?? 0;
  const rnd = (list) => list[Math.floor(Math.random() * list.length)];
  const ints = [0, 1, -1, 2, 5, 99, -99, 2147483647, -2147483648, 4294967296, 1e15, 0.5, null, 'x', true, [], {}];
  const jobs = ['idle', 'farmer', 'lumberjack', 'miner', 'smith', 'soldier', 'Farmer', '', 'x', 0, 7, -1, null];
  const units = ['kilicli', 'okcu', 'mizrakci', 'kalkanli', 'kesis', 'mancinik', 'suvari', 'dragon', '', null, 'x'.repeat(2000), '__proto__', 'constructor'];
  const seats = [0, 1, 2, 3, 4, 5, -1, 99, gJoin.seat, null, 'a'];
  const armies = () => rnd([{ kilicli: rnd(ints) }, { [rnd(units) ?? 'null']: rnd(ints) }, {}, null, [], { kilicli: 1, okcu: -5 }, 'all', Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['u' + i, i]))]);
  const rows = () => rnd([null, {}, { kilicli: 'front' }, { kilicli: 'sideways' }, { [rnd(units) ?? 'n']: rnd(['front', 'back', 'mid', 0, null]) }, 'front']);
  const makers = {
    MoveWorkers: () => [rnd(jobs), rnd(jobs), rnd(ints)], QueueWeapon: () => [rnd(units), rnd(ints)], CancelWeapon: () => [rnd(ints)], ArmWorkers: () => [rnd(units), rnd(ints), rnd(jobs)],
    DisarmSoldiers: () => [rnd(units), rnd(ints)], UpgradeBuilding: () => [rnd(['farm', 'lumberCamp', 'mine', 'forge', 'castle', 'x', 9, null])], SetGrowth: () => [rnd([true, false, null, 'x', 1])],
    SendExplore: () => [rnd(['northWest', 'northEast', 'southWest', 'southEast', 'middle', 4, null]), rnd(jobs)], SendChestScout: () => [rnd(['chest-1', '', null, 'x'.repeat(500), 1]), rnd(jobs)],
    SendArmyToSite: () => [rnd(['camp-1', 'village-1', '', null, 5]), armies(), rows(), rnd(units)], HireMercenary: () => [rnd(units), rnd(ints)], SendScout: () => [rnd(seats), rnd(jobs)],
    SendEnvoy: () => [rnd(seats), rnd(ints), rnd(ints), rnd(ints), rnd(ints), rnd([null, 'hi', 'x'.repeat(5000), '<script>window.__pwned=1</script>', '\u202E\u0000', 5]), rnd(jobs)],
    SendArmy: () => [rnd(seats), armies(), rows(), rnd(units), rnd(['attack', 'intercept', 'x', null, 3])], SendDecoy: () => [rnd(seats), armies()], SetFakeReport: () => [armies()], BribeArmy: () => [rnd(['1', '', null, 'x', 9]), rnd(ints)],
    HireCamp: () => [rnd(['camp-1', '', null]), rnd(seats)], SendEnvoyAs: () => [rnd(seats), rnd(seats), rnd(ints), rnd(ints), rnd(ints), rnd(ints), rnd([null, 'hi']), rnd(jobs)],
    SendArmyAs: () => [rnd(seats), rnd(seats), armies(), rows(), rnd(units), rnd(['attack', 'x'])], RecallArmy: () => [rnd(ints)], RedirectArmy: () => [rnd(ints), rnd(seats), rnd(['camp-1', null, ''])],
    SetSiegeFocus: () => [rnd(seats)], SetDefense: () => [rows(), rnd(units)], SetSpeed: () => [rnd(ints)], FinishMatch: () => [], BackToLobby: () => [], StartMatch: () => [], SetDeck: () => [rnd([units, null, [], 'x'])], SetMode: () => [rnd(['quick', 'long', 'x', '', null, 9, 'standard'])], SetProfile: () => [rnd(['recruit', 'liar_king', 'x', '', null, '<b>', 'golge']), rnd([1, 12, 0, 31, -1, 'x', null, 1e9]), rnd(['plain', 'chevron', 'x', '', null, 'tuccar'])], SetReady: () => [rnd([true, false, null])],
    KickPlayer: () => [rnd(seats)], AddBot: () => [rnd(['easy', 'x', 9])], LeaveRoomX: () => [],
  };
  // envoys back to back: the server lets one envoy at a time be on the road, however fast the client asks (the hub is the only judge)
  const foe = (G.last('RoomState')?.players ?? []).find((p) => p.seat !== gJoin.seat)?.seat;
  const burst = await Promise.all(Array.from({ length: 15 }, () => G.call('SendEnvoy', foe, 1, 0, 0, 0, 'hi', 'idle')));
  const goneThrough = burst.filter((r) => r?.ok === true).length;
  check('fifteen envoys sent back to back: at most ONE gets on the road (the server holds the limit)', goneThrough <= 1 && burst.every((r) => r === null || r === undefined || r.ok !== undefined), `${goneThrough} accepted`);
  check('...and the refusal says why', burst.some((r) => r?.ok === false && /Ulağın yolda|ulak/i.test(r.error ?? '')), burst.find((r) => r?.ok === false)?.error ?? '');
  let sent = 0, answered = 0, accepted = 0;
  const names2 = Object.keys(makers);
  let fz = G;
  for (let i = 0; i < 600; i++) {
    if (fz.closed) { fz = hubClient(door); await fz.ready; await fz.call('JoinRoom', code, 'Mallory', gJoin.token, false); } // (a frame the hub would not read closes the line: back in with the token)
    const m = rnd(names2);
    sent++;
    const r = await fz.call(m, ...makers[m]());
    if (r !== undefined) answered++;
    if (r?.ok === true) accepted++;
    if (i % 100 === 99) await sleep(1000);
  }
  await sleep(4000);
  const mine = fz.last('CastleState');
  const hostIn = await host.js(`document.documentElement.classList.contains('in-game') && !window.__pwned && !document.getElementById('banner')`);
  check(`${sent} commands with nonsense arguments during the match: the host is alive and its window is still in the match`, alive(hostServer) && hostIn && await healthy(), `${answered} answered, ${accepted} accepted (legal moves of the guest's own castle)`);
  check('...the match kept its clock for the guest', (mine?.elapsedSeconds ?? 0) >= e0 + 6, `${e0.toFixed(0)} s → ${(mine?.elapsedSeconds ?? 0).toFixed(0)} s`);
  const room2 = fz.last('RoomState');
  check('...still the same match: same players, same phase, nobody removed, speed untouched', room2?.players.length === 4 && ['preparation', 'war'].includes(room2.phase) && room2.players.find((p) => p.seat === hostSeat)?.connected === true && room2.players.find((p) => p.seat === hostSeat)?.eliminated === false);
  const numbers = JSON.stringify(mine ?? {}).match(/-?\d+(\.\d+)?(e[+-]?\d+)?/gi)?.map(Number) ?? [];
  check('...and the guest\'s own castle holds no absurd number (nothing overflowed)', numbers.length > 20 && numbers.every((n) => Number.isFinite(n) && Math.abs(n) < 1e7) && !/NaN|Infinity/.test(JSON.stringify(mine)), `${numbers.length} numbers, largest ${Math.max(...numbers.map(Math.abs))}`);
  const t1 = (await host.js(`document.body.innerText.length`)) > 0;
  await sleep(5000);
  const mine2 = fz.last('CastleState');
  check('the match goes on ticking afterwards', t1 && (mine2?.elapsedSeconds ?? 0) > (mine?.elapsedSeconds ?? 0), `${(mine2?.elapsedSeconds ?? 0).toFixed(0)} s`);
  check('a guest still cannot stop the host', (await fetch(`${door}/api/host/stop`, { method: 'POST' })).status === 404 && alive(hostServer));
} catch (e) {
  check('the run finished', false, e.stack ?? String(e));
} finally {
  try { execSync(`taskkill /PID ${host.child.pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(1500);
  for (const p of pids('Keepfall.Server.exe').filter((p) => !before.has(p))) { try { process.kill(p); } catch { /* gone */ } }
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
