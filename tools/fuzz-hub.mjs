// Sends bad, odd and hostile input to a running server and checks that it stays up and answers sensibly.
//   node tools/fuzz-hub.mjs [http://localhost:5081]   (a Production-mode server shows the real limits: no speed control, no solo start)
const base = (process.argv[2] ?? 'http://localhost:5081').replace(/\/$/, '');
const RS = '\x1e';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`); if (!ok) failures++; };

function client() {
  const c = { n: 0, pending: new Map(), closed: false };
  c.ready = new Promise((resolve, reject) => {
    c.ws = new WebSocket(base.replace(/^http/, 'ws') + '/hub');
    c.ws.onerror = () => reject(new Error('cannot connect'));
    c.ws.onopen = () => c.ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
    c.ws.onclose = () => { c.closed = true; for (const p of c.pending.values()) p({ error: 'closed' }); };
    c.ws.onmessage = (e) => {
      for (const part of String(e.data).split(RS).filter(Boolean)) {
        const m = JSON.parse(part);
        if (m.type === undefined && !m.error) resolve();
        else if (m.type === 6) c.ws.send(JSON.stringify({ type: 6 }) + RS);
        else if (m.type === 3 && c.pending.has(m.invocationId)) { c.pending.get(m.invocationId)(m); c.pending.delete(m.invocationId); }
      }
    };
  });
  c.call = (target, ...args) => new Promise((res) => {
    const id = String(++c.n); c.pending.set(id, res);
    c.ws.send(JSON.stringify({ type: 1, invocationId: id, target, arguments: args }) + RS);
    setTimeout(() => { if (c.pending.delete(id)) res({ error: 'timeout' }); }, 5000);
  });
  c.raw = (s) => c.ws.send(s);
  return c;
}
const val = (m) => m.result;
const healthy = async () => { try { return (await (await fetch(base + '/health')).text()) === 'ok'; } catch { return false; } };

const a = client(); await a.ready;
// Commands before joining.
for (const t of ['SetReady', 'StartMatch', 'SendArmy', 'MoveWorkers', 'SetSpeed', 'LeaveRoom']) {
  const r = await a.call(t, ...(t === 'SetReady' ? [true] : t === 'SendArmy' ? [2, {}, null, null, 0] : t === 'MoveWorkers' ? [0, 1, 1] : t === 'SetSpeed' ? [20] : []));
  check(`${t} before joining is refused, not a crash`, val(r)?.ok === false || !!r.error, JSON.stringify(r).slice(0, 120));
}
// Names.
const long = 'x'.repeat(20000);
for (const name of [null, '', '   ', long, '<script>alert(1)</script>', '\u0000‮\ud800', 'a\nb\r\nc']) {
  const c = client(); await c.ready;
  const r = await c.call('CreateRoom', name);
  const shown = val(r)?.room?.players?.[0]?.name;
  check(`name ${JSON.stringify(String(name).slice(0, 18))} gives a short clean name`, r.error ? String(name).includes(String.fromCharCode(0xd800)) && r.error.includes('Failed to invoke') : (!val(r)?.ok || (typeof shown === 'string' && shown.length <= 40 && !/[\r\n\u0000]/.test(shown))), JSON.stringify(shown)?.slice(0, 60) ?? JSON.stringify(r).slice(0, 100));
  c.ws.close();
}
// Room codes.
for (const code of [null, '', 'ZZZZ', 'a'.repeat(5000), '%%%']) {
  const c = client(); await c.ready;
  const r = await c.call('JoinRoom', code, 'x', null, false);
  check(`JoinRoom(${JSON.stringify(String(code).slice(0, 8))}) refused cleanly`, val(r)?.ok === false, JSON.stringify(r).slice(0, 100));
  c.ws.close();
}
// A real room: host + bots, then start, then hostile commands.
const h = client(); await h.ready;
const join = val(await h.call('CreateRoom', 'Fuzz'));
check('create room', join?.ok === true);
check('second CreateRoom on the same connection refused', val(await h.call('CreateRoom', 'x'))?.ok === false);
console.log('info  SetDeck junk ->', JSON.stringify(val(await h.call('SetDeck', ['nope', 'nope', 'nope', 'nope', 'nope', 'nope', 'nope', 'nope']))));
check('SetDeck(null) does not crash', !(await h.call('SetDeck', null)).error);
check('SetDeck(2000 items) does not crash', !(await h.call('SetDeck', Array(2000).fill('swordsman'))).error);
check('AddBot with a wrong difficulty does not crash', !(await h.call('AddBot', 99)).error && !h.closed);
check('Start alone refused', val(await h.call('StartMatch'))?.ok === false);
check('speed refused before the match', val(await h.call('SetSpeed', 20))?.ok === false);
check('RemoveBot(-5) / RemoveBot(999) do not crash', !(await h.call('RemoveBot', -5)).error && !(await h.call('RemoveBot', 999)).error);
for (let i = 0; i < 2; i++) await h.call('AddBot', 1);
await h.call('SetReady', true);
const st = val(await h.call('StartMatch'));
check('start with bots', st?.ok === true, JSON.stringify(st));
check('SetSpeed(20) refused (not a Development server)', val(await h.call('SetSpeed', 20))?.ok === false);
await sleep(500);
const bad = [
  ['MoveWorkers', 'farmer', 'woodcutter', -5], ['MoveWorkers', 0, 1, 2147483647], ['MoveWorkers', 99, 99, 1], ['MoveWorkers', 0, 0, 1],
  ['QueueWeapon', 'nope', 3], ['QueueWeapon', 'swordsman', -1], ['QueueWeapon', 'swordsman', 2147483647], ['QueueWeapon', null, 1],
  ['CancelWeapon', -1], ['CancelWeapon', 9999],
  ['ArmWorkers', 'swordsman', -3, 0], ['ArmWorkers', 'swordsman', 2147483647, 0], ['ArmWorkers', null, 1, 0],
  ['DisarmSoldiers', 'swordsman', -1], ['DisarmSoldiers', 'swordsman', 2147483647],
  ['UpgradeBuilding', 99], ['UpgradeBuilding', -1],
  ['SendExplore', 99, 0], ['SendChestScout', null, 0], ['SendChestScout', 'zzz', 0],
  ['SendArmyToSite', 'zzz', { swordsman: -4 }, null, null], ['SendArmyToSite', null, null, null, null],
  ['HireMercenary', 'swordsman', 2147483647], ['HireMercenary', 'nope', 1], ['HireMercenary', 'swordsman', -9],
  ['SendScout', 99, 0], ['SendScout', -1, 0], ['SendScout', 1, 0],
  ['SendEnvoy', 2, -5, 0, 0, 0, null, 0], ['SendEnvoy', 2, 2147483647, 0, 0, 0, 'x'.repeat(20000), 0], ['SendEnvoy', 99, 0, 0, 0, 0, 'hi', 0],
  ['SendArmy', 99, {}, null, null, 0], ['SendArmy', 2, { swordsman: -1 }, null, null, 0], ['SendArmy', 2, { swordsman: 2147483647 }, null, null, 0], ['SendArmy', 2, null, null, null, 0],
  ['SendArmy', 2, { swordsman: 1 }, { swordsman: 'sideways' }, 'nope', 99],
  ['SendDecoy', 2, {}], ['SetFakeReport', { swordsman: -1 }], ['SetFakeReport', null], ['BribeArmy', null, 5], ['BribeArmy', 'zzz', -5], ['HireCamp', null, 99],
  ['SendEnvoyAs', 2, 99, 0, 0, 0, 0, 'hi', 0], ['SendArmyAs', 2, 99, { swordsman: 1 }, null, null, 0],
  ['RecallArmy', -1], ['RecallArmy', 99999], ['RedirectArmy', 1, null, null], ['RedirectArmy', 1, 2, 'zzz'], ['RedirectArmy', -4, 99, null],
  ['SetDefense', null, null], ['SetDefense', { swordsman: 'sideways' }, 'nope'], ['SetGrowth', true], ['NoSuchMethod', 1], ['CreateRoom'], ['AddBot', 'hard'],
];
let answered = 0;
for (const [t, ...args] of bad) {
  const r = await h.call(t, ...args);
  if (h.closed) { check(`${t}(${JSON.stringify(args).slice(0, 60)}) kept the connection`, false); break; }
  answered++;
  if (r.error === 'timeout') check(`${t} answered`, false, 'timeout');
}
check(`${bad.length} hostile commands answered, connection alive`, !h.closed && answered === bad.length);
check('server still healthy', await healthy());
// Garbage on the wire.
const g = client(); await g.ready;
g.raw('not json' + RS); g.raw('{"type":1}' + RS); g.raw('{"type":1,"target":"CreateRoom","arguments":[{"a":1}],"invocationId":"x"}' + RS); g.raw('\x1e\x1e\x1e');
await sleep(500);
check('server healthy after garbage frames', await healthy());
// Many connections / rooms.
const t0 = Date.now(), many = [];
for (let i = 0; i < 60; i++) { const c = client(); try { await c.ready; await c.call('CreateRoom', 'r' + i); many.push(c); } catch { /* ignore */ } }
check(`60 rooms created in ${Date.now() - t0} ms, server healthy`, await healthy());
many.forEach((c) => c.ws.close());
// Client log endpoint.
const post = (body, type = 'application/json') => fetch(base + '/api/client-log', { method: 'POST', headers: { 'content-type': type }, body });
check('client-log: huge body refused', (await post(JSON.stringify({ message: 'x'.repeat(20000) }))).status === 413);
check('client-log: not json refused', (await post('{{{')).status === 400);
// The live match is still fine for its owner.
await sleep(1500);
check('match survived all of it', !h.closed && (await h.call('SetDefense', {}, null)).result !== undefined);
console.log(failures ? `\n${failures} FAILED` : '\nall ok');
process.exit(failures ? 1 : 0);
