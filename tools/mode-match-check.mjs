// One full match in each match mode against 3 bots, through the hub at ×20 (a dev server started with Keepfall__AllowSpeedControl=true and Keepfall__MaxRooms=0, port 5081):
// the preparation, the war length and the economy speed follow the mode, the match ends, and the human gets XP that grows with the mode.
//   node tools/mode-match-check.mjs [http://localhost:5081]
const base = (process.argv[2] ?? 'http://localhost:5081').replace(/\/$/, '');
const RS = '\u001e';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };

function client() {
  const c = { msgs: [], pending: new Map(), n: 0 };
  c.ready = new Promise((resolve, reject) => {
    c.ws = new WebSocket(base.replace(/^http/, 'ws') + '/hub');
    c.ws.onerror = () => reject(new Error(`cannot connect to ${base}/hub`));
    c.ws.onopen = () => c.ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
    c.ws.onmessage = (e) => {
      for (const part of String(e.data).split(RS).filter(Boolean)) {
        const m = JSON.parse(part);
        if (m.type === undefined) resolve();
        else if (m.type === 3) c.pending.get(m.invocationId)?.(m.result ?? { ok: false, error: m.error });
        else if (m.type === 1) c.msgs.push({ target: m.target, arg: m.arguments[0] });
      }
    };
  });
  c.call = (target, ...args) => new Promise((resolve) => { const id = String(++c.n); c.pending.set(id, resolve); c.ws.send(JSON.stringify({ type: 1, invocationId: id, target, arguments: args }) + RS); });
  c.of = (target) => c.msgs.filter((m) => m.target === target).map((m) => m.arg);
  return c;
}

const EXPECT = { quick: { prep: 300, speed: 1.6 }, standard: { prep: 600, speed: 1 }, long: { prep: 900, speed: 1 } };
const xps = {};
for (const mode of ['quick', 'standard', 'long']) {
  const H = client(); await H.ready;
  const j = await H.call('CreateRoom', 'Eren');
  for (let i = 0; i < 3; i++) await H.call('AddBot', i === 0 ? 'easy' : 'medium');
  await H.call('SetMode', mode);
  await H.call('SetReady', true);
  const go = await H.call('StartMatch');
  check(go.ok, `${mode}: the match starts`, go.error ?? '');
  await H.call('SetSpeed', 20);
  await sleep(1500);
  const castle = H.of('CastleState').at(-1) ?? H.of('Castle').at(-1);
  const prep = castle?.prepSeconds;
  check(prep === EXPECT[mode].prep, `${mode}: the preparation is ${EXPECT[mode].prep} s`, String(prep));
  let ended = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 420000) {
    const r = H.of('RoomState').at(-1);
    if (r?.phase === 'ended') { ended = r; break; }
    await sleep(500);
  }
  check(!!ended, `${mode}: the match ends`);
  const last = H.of('CastleState').at(-1) ?? H.of('Castle').at(-1);
  check(last && Math.abs((last.elapsedSeconds ?? 0) - (EXPECT[mode].prep + 600)) < 700, `${mode}: it ran about ${(EXPECT[mode].prep + 600) / 60} minutes at most (preparation + 10 min war)`, `elapsed ${Math.round(last?.elapsedSeconds ?? 0)}`);
  await sleep(1500);
  const prog = H.of('ProgressResult').at(-1);
  check(!!prog?.xp && prog.xp.total >= 25, `${mode}: the human got XP`, JSON.stringify(prog?.xp));
  xps[mode] = prog?.xp ?? null;
  if (prog?.xp) check(Math.abs(prog.xp.modeFactor - ({ quick: 1, standard: 1.4, long: 1.8 })[mode]) < 1e-9, `${mode}: the mode factor of the XP is ×${prog.xp.modeFactor}`);
  H.ws.close();
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad ? 1 : 0);
