// Hidden-information smoke test against a running dev server (needs AllowSpeedControl, i.e. Development).
//
//   dotnet run --project src/Keepfall.Server
//   node tools/smoke-test.mjs [http://localhost:5080]
//
// Three raw SignalR connections play a short match (×20 / ×5 speed) and check that each one only ever
// receives its own castle, that tokens never leak, that lobby/match commands are refused in the wrong
// phase, that a scout report carries approximate soldiers and building levels only, and that in the
// war the target is warned with the sender only (no size, no units), nobody sees another player's army
// on the road, and battle reports reach the two sides only. Exits with code 1 if any check failed.

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

const A = client(), B = client(), C = client();
await Promise.all([A.ready, B.ready, C.ready]);

// ---- lobby -----------------------------------------------------------------------------------
const ja = await A.call('CreateRoom', 'Ali');
const jb = await B.call('JoinRoom', ja.code, 'Bora', null, false);
const jc = await C.call('JoinRoom', ja.code, 'Cem', null, false);
check('A creates, B and C join', ja.ok && jb.ok && jc.ok, ja.error ?? jb.error ?? jc.error);
check('economy refused in the lobby', !(await B.call('MoveWorkers', 'idle', 'farmer', 1)).ok);
check('scouting refused in the lobby', !(await A.call('SendScout', 2, 'idle')).ok);
check('only the host starts', !(await B.call('StartMatch')).ok);
await A.call('SetReady', true);
await B.call('SetReady', true);
await C.call('SetReady', true);
check('host starts the match', (await A.call('StartMatch')).ok);
check('lobby command refused in the match', !(await B.call('SetReady', false)).ok);
check('host sets ×20', (await A.call('SetSpeed', 20)).ok);

// ---- B builds an army and keeps bows in storage; A forges swords; A scouts B -----------------
await A.call('MoveWorkers', 'idle', 'blacksmith', 4);
await A.call('QueueWeapon', 'kilicli', 3);
await B.call('MoveWorkers', 'idle', 'blacksmith', 4);
await B.call('QueueWeapon', 'mizrakci', 6);
await B.call('QueueWeapon', 'okcu', 2);
await sleep(3500);
check('B arms 6 spearmen', (await B.call('ArmWorkers', 'mizrakci', 6, 'idle')).ok);
check('A arms 3 swordsmen', (await A.call('ArmWorkers', 'kilicli', 3, 'idle')).ok);
check('attacks refused in preparation', !(await A.call('SendArmy', 2, { kilicli: 1 }, null, null)).ok);
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
  const spread = Math.max(realSpears * 0.2, 1);
  check(`spearmen within ±max(20 %, 1) (real ${realSpears}, seen ${seen})`,
    seen >= Math.max(1, Math.round(realSpears - spread)) && seen <= Math.round(realSpears + spread));
  check('bows in storage are not reported', report.soldiers.find((s) => s.unitId === 'okcu').count === 0);
  check('building levels are exact', report.buildings.every((b) => b.level === realB.buildings.find((x) => x.type === b.type).level));
  check('report mentions no weapons, workers or resources', !/weapon|job|worker|food|wood|iron|queue|resource/i.test(JSON.stringify(report)));
}
check('B was told about the scout', B.of('Notification').some((t) => t.includes('gözcüsü kaleni gözetledi')));
check('A got no notification', A.of('Notification').length === 0);

// ---- war: A attacks B; C watches nothing ----------------------------------------------------
const waitFor = async (pred, ms) => { for (let t = 0; t < ms; t += 250) { if (pred()) return true; await sleep(250); } return false; };
check('the war phase begins', await waitFor(() => A.of('RoomState').some((r) => r.phase === 'war'), 30000));
await A.call('SetSpeed', 5); // 5 game seconds per tick, so the 10 s warning is seen before the battle
const notesBefore = { A: A.of('Notification').length, B: B.of('Notification').length, C: C.of('Notification').length };
const bMsgsBefore = B.msgs.length;
check('A sends 3 swordsmen at B', (await A.call('SendArmy', 2, { kilicli: 3 }, { kilicli: 'front' }, null)).ok);
check('A sees its own army', await waitFor(() => (A.of('CastleState').at(-1)?.war.armies.length ?? 0) === 1, 3000));
check('the battle happens', await waitFor(() => (B.of('CastleState').at(-1)?.war.battles.length ?? 0) === 1, 15000));
await sleep(1200);

const warnB = B.of('Notification').slice(notesBefore.B).filter((t) => t.includes('ordu yaklaşıyor'));
check('B is warned', warnB.length === 1, JSON.stringify(warnB));
check('the warning names the sender only', warnB.length === 1 && warnB[0] === "Mavi'den bir ordu yaklaşıyor!" && !/\d/.test(warnB[0]));
check('A and C are not warned',
  !A.of('Notification').slice(notesBefore.A).some((t) => t.includes('yaklaşıyor'))
  && !C.of('Notification').slice(notesBefore.C).some((t) => t.includes('yaklaşıyor')));

const castlesBWar = B.of('CastleState');
const incoming = castlesBWar.flatMap((c) => c.war.incoming);
check("B's castle showed the countdown", incoming.length > 0);
check('an incoming warning carries only who and when',
  incoming.every((w) => JSON.stringify(Object.keys(w).sort()) === '["arrivesInSeconds","fromColor","fromName","fromSeat"]'));
check("B never received A's army", castlesBWar.every((c) => c.war.armies.length === 0)
  && !B.msgs.slice(bMsgsBefore).some((m) => m.target !== 'CastleState' && m.target !== 'RoomState' && m.target !== 'Notification'));
check('C never sees a warning, an army or a battle',
  C.of('CastleState').every((c) => c.war.incoming.length === 0 && c.war.armies.length === 0 && c.war.battles.length === 0));
check('C only ever got its own (yellow) castle', C.of('CastleState').every((c) => c.color === 'yellow'));

const battleA = A.of('CastleState').at(-1).war.battles[0];
const battleB = B.of('CastleState').at(-1).war.battles[0];
check('both sides got the battle report', !!battleA && !!battleB && battleA.id === battleB.id);
if (battleA) {
  check('the attacker sees the defending army', battleA.defenderUnits.some((u) => u.unitId === 'mizrakci' && u.count === 6));
  check('the report has losses and castle damage', battleA.attackerUnits.every((u) => 'lost' in u) && 'castleDamage' in battleA);
}
check('A was told about the battle, B too',
  A.of('Notification').slice(notesBefore.A).some((t) => t.includes('saldır'))
  && B.of('Notification').slice(notesBefore.B).some((t) => t.includes('saldır')));
check('no CastleState ever went to the wrong player',
  A.of('CastleState').every((c) => c.color === 'blue') && B.of('CastleState').every((c) => c.color === 'red'));

A.ws.close();
B.ws.close();
C.ws.close();
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
