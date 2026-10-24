// Hidden-information smoke test against a running dev server (needs AllowSpeedControl, i.e. Development).
//
//   dotnet run --project src/Keepfall.Server
//   node tools/smoke-test.mjs [http://localhost:5080]
//
// Two raw SignalR connections play a short match and check that each one only ever receives its own
// castle, that tokens never leak, that lobby/match commands are refused in the wrong phase, and that
// a scout report carries approximate soldiers and building levels only — never the target's real
// storage, workers or resources. Exits with code 1 on the first failed check.

const base = (process.argv[2] ?? 'http://localhost:5080').replace(/\/$/, '');
const RS = '\x1e';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures++;
}

function client() {
  const c = { msgs: [], pending: new Map(), n: 0 };
  c.ready = new Promise((resolve, reject) => {
    c.ws = new WebSocket(base.replace(/^http/, 'ws') + '/hub');
    c.ws.onerror = () => reject(new Error(`cannot connect to ${base}/hub — is the server running?`));
    c.ws.onopen = () => c.ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RS);
    c.ws.onmessage = (e) => {
      for (const part of String(e.data).split(RS).filter(Boolean)) {
        const m = JSON.parse(part);
        if (m.type === undefined) resolve();
        else if (m.type === 3) c.pending.get(m.invocationId)?.(m.result ?? { ok: false, error: m.error });
        else if (m.type === 1) c.msgs.push({ target: m.target, arg: m.arguments[0], raw: part });
      }
    };
  });
  c.call = (target, ...args) => new Promise((resolve) => {
    const id = String(++c.n);
    c.pending.set(id, resolve);
    c.ws.send(JSON.stringify({ type: 1, invocationId: id, target, arguments: args }) + RS);
  });
  c.of = (target) => c.msgs.filter((m) => m.target === target).map((m) => m.arg);
  return c;
}

const A = client(), B = client();
await Promise.all([A.ready, B.ready]);

// ---- lobby -----------------------------------------------------------------------------------
const ja = await A.call('CreateRoom', 'Ali');
const jb = await B.call('JoinRoom', ja.code, 'Bora', null, false);
check('A creates, B joins', ja.ok && jb.ok, ja.error ?? jb.error);
check('economy refused in the lobby', !(await B.call('MoveWorkers', 'idle', 'farmer', 1)).ok);
check('scouting refused in the lobby', !(await A.call('SendScout', 2, 'idle')).ok);
check('only the host starts', !(await B.call('StartMatch')).ok);
await A.call('SetReady', true);
await B.call('SetReady', true);
check('host starts the match', (await A.call('StartMatch')).ok);
check('lobby command refused in the match', !(await B.call('SetReady', false)).ok);
check('host sets ×20', (await A.call('SetSpeed', 20)).ok);

// ---- B builds an army and keeps bows in storage; A scouts B -----------------------------------
await B.call('MoveWorkers', 'idle', 'blacksmith', 4);
await B.call('QueueWeapon', 'mizrakci', 6);
await B.call('QueueWeapon', 'okcu', 2);
await sleep(3500);
check('B arms 6 spearmen', (await B.call('ArmWorkers', 'mizrakci', 6, 'idle')).ok);
check('cannot scout yourself', !(await A.call('SendScout', 1, 'idle')).ok);
check('A sends a scout to B', (await A.call('SendScout', 2, 'idle')).ok);
check('only one scout per target', !(await A.call('SendScout', 2, 'idle')).ok);
await sleep(3500);

// ---- what each side received -----------------------------------------------------------------
const castlesA = A.of('CastleState'), castlesB = B.of('CastleState');
check('A only ever got its own (blue) castle', castlesA.length > 0 && castlesA.every((c) => c.color === 'blue'));
check('B only ever got its own (red) castle', castlesB.length > 0 && castlesB.every((c) => c.color === 'red'));

const rooms = [...A.of('RoomState'), ...B.of('RoomState')].map((r) => JSON.stringify(r));
check('no token in any room state', !rooms.some((r) => r.includes(ja.token) || r.includes(jb.token)));
check("A's traffic never contains B's token", !A.msgs.some((m) => m.raw.includes(jb.token)));

const realB = castlesB.at(-1);
const realSpears = realB.units.find((u) => u.id === 'mizrakci').soldiers;
const report = castlesA.at(-1).scouting.reports.find((r) => r.targetSeat === 2);
check('A has a report on B', !!report);
if (report) {
  check('report has only target, time, soldiers and buildings',
    JSON.stringify(Object.keys(report).sort()) === JSON.stringify(['buildings', 'deliveredAt', 'observedAt', 'soldiers', 'targetColor', 'targetName', 'targetSeat']));
  check('report soldiers have only id, name and count',
    report.soldiers.every((s) => JSON.stringify(Object.keys(s).sort()) === '["count","name","unitId"]'));
  const seen = report.soldiers.find((s) => s.unitId === 'mizrakci').count;
  check(`spearmen within ±20 % (real ${realSpears}, seen ${seen})`, seen >= Math.round(realSpears * 0.8) && seen <= Math.round(realSpears * 1.2));
  check('bows in storage are not reported', report.soldiers.find((s) => s.unitId === 'okcu').count === 0);
  check('building levels are exact', report.buildings.every((b) => b.level === realB.buildings.find((x) => x.type === b.type).level));
  check('report mentions no weapons, workers or resources', !/weapon|job|worker|food|wood|iron|queue|resource/i.test(JSON.stringify(report)));
}
check('B was told about the scout', B.of('Notification').some((t) => t.includes('gözcüsü kaleni gözetledi')));
check('A got no notification', A.of('Notification').length === 0);

A.ws.close();
B.ws.close();
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
