// Hidden-information smoke test against a running dev server (needs AllowSpeedControl, i.e. Development).
//
//   dotnet run --project src/Keepfall.Server
//   node tools/smoke-test.mjs [http://localhost:5080]
//
// Three raw SignalR connections play a short match (×20 / ×5 speed) and check that each one only ever
// receives its own castle, that tokens never leak, that lobby/match commands are refused in the wrong
// phase, that a scout report carries approximate soldiers and building levels only, and that in the
// war the target is warned with the sender only, battle reports reach the two sides only, and the fog
// of war holds: everyone gets the same public map, and another player's army or scout is in a
// MapState exactly when it is inside that player's vision — checked against the owner's own (true)
// positions tick by tick — and then only with position, heading, owner and soldiers, never its
// target, road or arrival time. Finally a second match checks the spectator view: a fallen player gets a
// countdown and then the whole live map, exactly, and nobody still playing ever gets one. Exits with code 1 if any check failed.

const near = (p, c) => Math.hypot(p.x - c.center.x, p.y - c.center.y) <= c.radius + 1e-6;
// What a player can see: their live circles, and the ground their scouts walked over (the trail) except inside
// somebody else's corner. `regions` is the public map's corner list.
let regions = [];
const inForeignRegion = (p, seat) => regions.some((r) => r.seat && r.seat !== seat
  && p.x >= r.origin.x && p.x <= r.origin.x + r.width && p.y >= r.origin.y && p.y <= r.origin.y + r.height);
const inVision = (p, state, seat) => state.vision.some((c) => near(p, c))
  || (state.trail.some((t) => near(p, { center: t.center, radius: t.radius })) && !inForeignRegion(p, seat));

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
await sleep(300);
const layouts = [A, B, C].map((x) => x.of('MapLayout').at(-1));
check('everyone got the map', layouts.every(Boolean));
regions = layouts[0]?.regions ?? [];
check('the map is the same for everyone', layouts.every((l) => JSON.stringify(l) === JSON.stringify(layouts[0])));
check('the map shows whose castle is in which corner', layouts[0]?.regions.filter((r) => r.seat).length === 3);
check('the map carries no token and no castle contents',
  ![ja.token, jb.token, jc.token].some((t) => JSON.stringify(layouts[0]).includes(t))
  && !/soldier|units|wallHp|weapon|food|wood|iron/i.test(JSON.stringify(layouts[0])));
check('lobby command refused in the match', !(await B.call('SetReady', false)).ok);
check('host sets ×20', (await A.call('SetSpeed', 20)).ok);

// ---- B builds an army and keeps bows in storage; A forges swords; A scouts B -----------------
await A.call('MoveWorkers', 'idle', 'blacksmith', 4);
await A.call('QueueWeapon', 'kilicli', 4);
await B.call('MoveWorkers', 'idle', 'blacksmith', 4);
await B.call('QueueWeapon', 'mizrakci', 6);
await B.call('QueueWeapon', 'okcu', 2);
await sleep(3500);
check('B arms 6 spearmen', (await B.call('ArmWorkers', 'mizrakci', 6, 'idle')).ok);
check('A arms 4 swordsmen', (await A.call('ArmWorkers', 'kilicli', 4, 'idle')).ok);
check('attacks refused in preparation', !(await A.call('SendArmy', 2, { kilicli: 1 }, null, null, 'attack')).ok);
check('cannot scout yourself', !(await A.call('SendScout', 1, 'idle')).ok);
check('hiring needs gold, and nobody has any yet', !(await A.call('HireMercenary', 'kilicli', 1)).ok
  && A.of('CastleState').at(-1).resources.gold === 0);
check('units carry their hiring price', A.of('CastleState').at(-1).units.every((u) => u.price > 0 && u.hired === 0));
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
check('the war phase begins', await waitFor(() => A.of('RoomState').some((r) => r.phase === 'war'), 45000));
await A.call('SetSpeed', 5); // 5 game seconds per tick, so the 10 s warning is seen before the battle
const notesBefore = { A: A.of('Notification').length, B: B.of('Notification').length, C: C.of('Notification').length };
const bMsgsBefore = B.msgs.length;
// C's scout is timed to reach B's gate a few seconds into the battle there: C sees that a battle is
// going on, and nothing else.
const tA = A.of('CastleState').at(-1).scouting.targets.find((t) => t.seat === 2).marchSeconds;
const sC = C.of('CastleState').at(-1).scouting.targets.find((t) => t.seat === 2).scoutSeconds;
check('A sends 3 swordsmen at B', (await A.call('SendArmy', 2, { kilicli: 3 }, { kilicli: 'front' }, null, 'attack')).ok);
setTimeout(() => { void C.call('SendScout', 2, 'idle'); }, Math.max(0, (tA + 4 - sC) / 5) * 1000);
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
check("B's castle never lists A's army", castlesBWar.every((c) => c.war.armies.length === 0)
  && !B.msgs.slice(bMsgsBefore).some((m) => !['CastleState', 'MapState', 'RoomState', 'Notification', 'BattleStarted'].includes(m.target)));

// ---- fog of war ------------------------------------------------------------------------------
const mapsA = A.of('MapState'), mapsB = B.of('MapState'), mapsC = C.of('MapState');
const ownArmy = mapsA.flatMap((m) => m.own.filter((o) => o.kind === 'army').map((o) => ({ t: m.elapsedSeconds, o })));
check('A got its own army with its road', ownArmy.length > 0 && ownArmy.every(({ o }) => o.route.length >= 2 && o.targetSeat === 2));
check('A and C (who sent scouts) got trails, B (who never did) never did',
  mapsA.some((m) => m.trail.length > 0) && mapsC.some((m) => m.trail.length > 0) && mapsB.every((m) => m.trail.length === 0));
const allSeen = [...mapsA, ...mapsB, ...mapsC].flatMap((m) => m.seen);
check('a seen mover carries only id, kind, owner, position, heading and units',
  allSeen.every((s) => JSON.stringify(Object.keys(s).sort()) === '["id","kind","ownerColor","ownerSeat","position","units","velocity"]'));
check('nothing seen ever mentions a target, road or arrival',
  !allSeen.some((s) => /target|route|travelled|arriv|remaining|returning/i.test(JSON.stringify(s))));
check('seen ids are random', allSeen.every((s) => /^[0-9a-f]{16}$/.test(s.id)));
check('nobody ever sees their own movers as "seen"',
  [[mapsA, 1], [mapsB, 2], [mapsC, 3]].every(([maps, seat]) => maps.every((m) => m.seen.every((s) => s.ownerSeat !== seat))));
check('whatever is seen is inside the vision or the scouts trail (and never inside a foreign corner through the trail)',
  [[mapsA, 1], [mapsB, 2], [mapsC, 3]].every(([maps, seat]) => maps.every((m) => m.seen.every((s) => inVision(s.position, m, seat)))));
// Ground truth: A's own army position at each tick. B and C must see it exactly when it is in their vision
// (while it is fighting, nobody but the two sides sees it at all).
let compared = 0, mismatches = [];
for (const [name, maps, seat] of [['B', mapsB, 2], ['C', mapsC, 3]]) {
  for (const { t, o } of ownArmy) {
    const m = maps.find((x) => Math.abs(x.elapsedSeconds - t) < 1e-6);
    if (!m) continue;
    compared++;
    const shouldSee = !o.fighting && inVision(o.position, m, seat);
    const sees = m.seen.some((s) => s.id === o.id);
    if (shouldSee !== sees) mismatches.push(`${name}@${t}: ${shouldSee ? 'missing' : 'leaked'}`);
  }
}
check(`others see A's army exactly when it is in their vision (${compared} ticks compared)`, compared > 5 && mismatches.length === 0, mismatches.join(', '));
const bSaw = mapsB.flatMap((m) => m.seen).filter((s) => s.ownerSeat === 1 && s.kind === 'army');
check("B saw A's army coming, with its soldiers", bSaw.length > 0 && bSaw.every((s) => s.units.length === 1 && s.units[0].unitId === 'kilicli' && s.units[0].count === 3));
// (C may see A's army near B's gate through its scout; the tick-by-tick vision check above covers that.)
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

// ---- the battle itself: the record goes to the two sides only ----------------------------------
const startedA = A.of('BattleStarted'), startedB = B.of('BattleStarted');
check('both sides got the battle record', startedA.length === 1 && startedB.length === 1 && startedA[0].id === startedB[0].id);
if (startedA[0]) {
  const b = startedA[0];
  check('the record has both armies soldier by soldier', b.sides.length === 2
    && b.sides[0].soldiers.length === 3 && b.sides[1].soldiers.length === 6 && b.sides[0].attacker && !b.sides[1].attacker);
  check('the record has hits and deaths', b.hits.length > 0 && b.hits.length % 3 === 0 && b.deaths.length % 2 === 0);
  check('the battle takes its time', b.fightSeconds > 1 && b.kind === 'siege');
}
check('C never gets a battle record', C.of('BattleStarted').length === 0);
const markersC = C.of('MapState').flatMap((m) => m.battles);
check('C saw that a battle was going on at B (its scout was there)', markersC.length > 0, 'scout timing missed the battle');
check('a battle C sees is only where it is', markersC.every((x) => JSON.stringify(Object.keys(x).sort()) === '["at","id"]')
  && (!startedA[0] || markersC.every((x) => x.id === startedA[0].id)));
check('C only sees the battle inside its vision',
  C.of('MapState').every((m) => m.battles.every((x) => inVision(x.at, m, 3))));

// ---- recall ------------------------------------------------------------------------------------
await A.call('SetSpeed', 1);
const armyCount = () => A.of('CastleState').at(-1).war.armies.length;
const sent = await A.call('SendArmy', 3, { kilicli: 1 }, null, null, 'intercept'); // the swordsman kept at home
if (sent.ok) {
  await waitFor(() => armyCount() > 0, 3000);
  const army = A.of('CastleState').at(-1).war.armies.at(-1);
  check('the army is sent in intercept mode', army.mode === 'intercept');
  check('B cannot recall A\'s army', !(await B.call('RecallArmy', army.id)).ok);
  check('A recalls its army', (await A.call('RecallArmy', army.id)).ok);
  check('the recalled army is on its way home', await waitFor(() => A.of('CastleState').at(-1).war.armies.find((x) => x.id === army.id)?.state === 'returning', 3000));
  check('C never learns the mode', !C.msgs.some((m) => m.raw.includes('intercept')));
} else {
  check('A had soldiers left for the recall test', false, sent.error);
}

// ---- the fallen watch the whole map, late; nobody else does -----------------------------------------
check('players still in the match never got a spectator picture or countdown',
  [A, B, C].every((x) => x.of('SpectatorState').length === 0 && x.of('SpectatorWait').length === 0));
A.ws.close();
B.ws.close();
C.ws.close();

// A second match: X forges swords and besieges Y (an empty castle) until it falls; Z stays out of it.
// Y then watches: first a countdown, then the whole world live.
const WAIT = 5, DELAY = 0; // match.spectatorWaitSeconds and match.spectatorDelaySeconds in config/balance.json
const X = client(), Y = client(), Z = client();
await Promise.all([X.ready, Y.ready, Z.ready]);
const jx = await X.call('CreateRoom', 'Xaver');
await Y.call('JoinRoom', jx.code, 'Yeter', null, false);
await Z.call('JoinRoom', jx.code, 'Zeki', null, false);
for (const c of [X, Y, Z]) await c.call('SetReady', true);
check('second match starts', (await X.call('StartMatch')).ok);
await X.call('SetSpeed', 20);
await X.call('MoveWorkers', 'idle', 'blacksmith', 4);
await X.call('QueueWeapon', 'kilicli', 6);
await sleep(4500);
check('X arms 6 swordsmen', (await X.call('ArmWorkers', 'kilicli', 6, 'idle')).ok);

// ---- the scout's trail (in preparation, while nothing else is going on) -------------------------------------
check('X sends a scout to Z', (await X.call('SendScout', 3, 'idle')).ok);
check('the scout leaves a trail', await waitFor(() => X.of('MapState').some((m) => m.trail.length > 0), 10000));
check('the scout comes home', await waitFor(() => X.of('MapState').at(-1).own.length === 0, 20000));
const trailNow = X.of('MapState').at(-1).trail;
check('the trail stays open after the scout is home', trailNow.length > 0);
const X2 = client(); // a page reload: same token, new connection
await X2.ready;
const rejoin = await X2.call('JoinRoom', jx.code, 'Xaver', jx.token, false);
await sleep(700);
const firstMap = X2.of('MapState')[0];
check('a reload rejoins the same seat', rejoin.ok && rejoin.seat === 1, rejoin.error);
check('a reload gets the open trail back', !!firstMap && firstMap.trail.length > 0
  && firstMap.trail.every((t) => X.of('MapState').some((m) => m.trail.some((u) => u.center.x === t.center.x && u.center.y === t.center.y))));
X2.ws.close();
const allTrail = X.of('MapState').flatMap((m) => m.trail);
const scoutRoute = X.of('MapState').flatMap((m) => m.own).find((o) => o.kind === 'scout')?.route ?? [];
const toSegment = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
};
check('a trail circle carries only centre, radius and fade, with the scouts sight',
  allTrail.every((t) => JSON.stringify(Object.keys(t).sort()) === '["center","fade","radius"]' && t.radius === 10 && t.fade >= 0 && t.fade <= 1));
check('the trail lies along the scouts own road',
  scoutRoute.length >= 2 && allTrail.every((t) => scoutRoute.slice(1).some((p, i) => toSegment(t.center, scoutRoute[i], p) < 1e-6)));
check('nobody but the scouts owner gets a trail',
  [Y, Z].every((c) => c.of('MapState').every((m) => m.trail.length === 0)));
check('the trail closes again after its time', await waitFor(() => X.of('MapState').at(-1).trail.length === 0, 30000));

// ---- the forest: what a scout finds is its owner's alone -----------------------------------------------------
const quarters = X.of('CastleState').at(-1).scouting.quarters;
check('four quarters to explore, one of them X own', quarters.length === 4 && quarters.filter((q) => q.seat === 1).length === 1
  && quarters.every((q) => !q.explored && !q.busy && q.seconds > 20));
const own = quarters.find((q) => q.seat === 1);
const noSites = () => [X, Y, Z].every((c) => c.of('MapState').every((m) => m.sites.length === 0));
check('nobody knows a place of the forest before a scout was there', noSites());
check('X explores its own quarter', (await X.call('SendExplore', own.corner, 'idle')).ok);
check('one scout per quarter', !(await X.call('SendExplore', own.corner, 'idle')).ok);
check('the tour ends and the quarter counts as explored', await waitFor(() => {
  const c = X.of('CastleState').at(-1);
  return c.scouting.missions.length === 0 && c.scouting.quarters.find((q) => q.corner === own.corner).explored;
}, 20000));
const found = X.of('MapState').at(-1).sites;
check('X found places', found.length > 1);
check('only its own quarter and the big camp', found.every((x) => x.quarter === own.corner || x.kind === 'bigCamp') && found.some((x) => x.kind === 'bigCamp'));
check('a place carries what a visitor sees', found.every((x) => JSON.stringify(Object.keys(x).sort()) === '["bandits","discoveredAt","gone","id","kind","minSoldiers","position","quarter","seenAt","spur"]'
  && /^[0-9a-f]{16}$/.test(x.id) && x.spur.length === (x.kind === 'bigCamp' ? 0 : 2) && x.gone === false));
check('the quarter holds two chests, a village and a camp',
  JSON.stringify(found.filter((x) => x.quarter === own.corner).map((x) => x.kind).sort()) === '["camp","chest","chest","village"]');
const ids = found.map((x) => x.id);
check('Y and Z never get a place or a trail to one', [Y, Z].every((c) => c.of('MapState').every((m) => m.sites.length === 0)));
check('no id of a found place shows up in Y or Z traffic', ![Y, Z].some((c) => c.msgs.some((m) => ids.some((id) => m.raw.includes(id)))));
check('the public map does not mention any place', !ids.some((id) => JSON.stringify(layouts[0]).includes(id)));
const X3 = client(); // a reload
await X3.ready;
await X3.call('JoinRoom', jx.code, 'Xaver', jx.token, false);
await sleep(700);
check('a reload gets the found places back', (X3.of('MapState')[0]?.sites.length ?? 0) === found.length);
X3.ws.close();

// ---- loot: gold comes home with the scout, and what others have emptied stays unknown until you look ---------
const siteOf = (c, id) => c.of('MapState').at(-1).sites.find((x) => x.id === id);
const chest = found.find((x) => x.kind === 'chest');
const village = found.find((x) => x.kind === 'village');
check('Y tours X quarter and sees the chest full', (await Y.call('SendExplore', own.corner, 'idle')).ok
  && await waitFor(() => siteOf(Y, chest.id) !== undefined, 15000) && siteOf(Y, chest.id).gone === false);
check('Y is back and its trail closed', await waitFor(() => Y.of('CastleState').at(-1).scouting.missions.length === 0
  && Y.of('MapState').at(-1).trail.length === 0, 40000));
check('X sends a scout for the chest', (await X.call('SendChestScout', chest.id, 'idle')).ok);
check('Z (who never found it) cannot', !(await Z.call('SendChestScout', chest.id, 'idle')).ok);
check('the gold arrives with the scout', await waitFor(() => X.of('CastleState').at(-1).resources.gold >= 14, 25000));
const chestGold = X.of('CastleState').at(-1).resources.gold;
check('a chest holds 14 to 28 gold', chestGold >= 14 && chestGold <= 28, String(chestGold));
check('X knows the chest is empty', siteOf(X, chest.id).gone === true);
check('Y, who has not looked since, still thinks it is full', siteOf(Y, chest.id).gone === false);
check('nobody else got any gold', [Y, Z].every((c) => c.of('CastleState').at(-1).resources.gold === 0));

check('X plunders the village with three soldiers', (await X.call('SendArmyToSite', village.id, { kilicli: 3 }, null, null)).ok);
check('two soldiers are not enough', !(await X.call('SendArmyToSite', village.id, { kilicli: 2 }, null, null)).ok);
check('the army is home with the loot', await waitFor(() => {
  const c = X.of('CastleState').at(-1);
  return c.war.armies.length === 0 && c.resources.gold > chestGold;
}, 30000));
const afterVillage = X.of('CastleState').at(-1);
const villageGold = afterVillage.resources.gold - chestGold;
check('a village gives 21 to 35 gold', villageGold >= 21 && villageGold <= 35, String(villageGold));
check('the village is gone for X, all soldiers came home', siteOf(X, village.id).gone === true
  && afterVillage.units.find((u) => u.id === 'kilicli').soldiers === 6);
check('the raid shows in nobody elses castle state, and Z never hears of the village at all',
  ![Y, Z].some((c) => c.msgs.some((m) => m.target === 'CastleState' && m.raw.includes(village.id)))
  && !Z.msgs.some((m) => m.raw.includes(village.id)));
check('Y explores again and learns about the empty chest', (await Y.call('SendExplore', own.corner, 'idle')).ok
  && await waitFor(() => siteOf(Y, chest.id).gone === true, 20000));
check('Y finds the village plundered too', siteOf(Y, village.id).gone === true);
check('Z knows nothing of all this', Z.of('MapState').every((m) => m.sites.length === 0));

// ---- gold buys soldiers; a camp is fought in full view of its attackers only ------------------------------------
const goldNow = X.of('CastleState').at(-1).resources.gold;
const mercs = Math.floor(goldNow / 32);
check('X hires mercenaries with the loot', mercs >= 1 && (await X.call('HireMercenary', 'kilicli', mercs)).ok);
const hiredView = X.of('CastleState').at(-1);
check('the hired are soldiers on top of the people, and cost gold', hiredView.units.find((u) => u.id === 'kilicli').hired === mercs
  && Math.abs(hiredView.resources.gold - (goldNow - 32 * mercs)) < 1e-6);
check('hired soldiers cannot be turned into workers', !(await X.call('DisarmSoldiers', 'kilicli', 6 + mercs)).ok);
check('nobody else can hire without gold', !(await Y.call('HireMercenary', 'kilicli', 1)).ok);
const camp = found.find((x) => x.kind === 'camp');
const battlesBefore = { Y: Y.of('BattleStarted').length, Z: Z.of('BattleStarted').length };
check('X sends three soldiers at the camp', (await X.call('SendArmyToSite', camp.id, { kilicli: 3 }, null, null)).ok);
check('the fight is replayed for X, against black bandits', await waitFor(() => X.of('BattleStarted').some((b) => b.kind === 'camp'), 30000));
const campBattle = X.of('BattleStarted').find((b) => b.kind === 'camp');
check('the camp record has both sides soldier by soldier', campBattle.sides.length === 2 && campBattle.sides[0].soldiers.length === 3
  && campBattle.sides[1].color === 'black' && campBattle.sides[1].name === 'Haydutlar' && campBattle.sides[1].soldiers.length === 7);
check('Y and Z get no record of it', Y.of('BattleStarted').length === battlesBefore.Y && Z.of('BattleStarted').length === battlesBefore.Z);
check('the army is home again', await waitFor(() => X.of('CastleState').at(-1).war.armies.length === 0, 40000));
const campReport = X.of('CastleState').at(-1).war.battles.find((b) => b.kind === 'camp');
check('X got a report against the bandits', !!campReport && campReport.opponentName === 'Haydutlar' && campReport.opponentColor === 'black');
check('X sees roughly who is left at the camp', siteOf(X, camp.id).bandits.every((u) => u.count >= 1));
check('Y, who has not looked, still sees the first numbers and Z never hears of the report',
  siteOf(Y, camp.id).bandits.reduce((n, u) => n + u.count, 0) >= 4 && ![Y, Z].some((c) => c.msgs.some((m) => m.target === 'CastleState' && m.raw.includes('Haydutlar'))));
check('the second war begins', await waitFor(() => X.of('RoomState').some((r) => r.phase === 'war'), 60000));
const fallen = () => Y.of('CastleState').at(-1)?.eliminated === true;
for (let i = 0; i < 160 && !fallen(); i++) {
  const x = X.of('CastleState').at(-1);
  const home = x.units.find((u) => u.id === 'kilicli').soldiers;
  if (x.war.armies.length === 0 && home > 0) await X.call('SendArmy', 2, { kilicli: home }, null, null, 'attack');
  await sleep(500);
}
check("Y's castle falls", fallen());
await X.call('SetSpeed', 5);
const fellAt = Y.of('CastleState').find((c) => c.eliminated).elapsedSeconds;
check('a countdown comes before the first picture', await waitFor(() => Y.of('SpectatorWait').length > 0, 8000));
check('the countdown is at most the wait', Y.of('SpectatorWait').every((w) => w.startsIn >= 0 && w.startsIn <= WAIT + DELAY + 1e-6));
check('the picture arrives', await waitFor(() => Y.of('SpectatorState').length >= 2, 30000), 'wait is 5 game seconds');
const frames = Y.of('SpectatorState');
const live = Math.max(...X.of('CastleState').map((c) => c.elapsedSeconds));
check('the view starts after the wait, not before', frames[0].elapsedSeconds >= fellAt + WAIT - 1e-6);
check('every picture is of the live game (no delay)', frames.every((f) => f.elapsedSeconds <= live + 1e-6)
  && frames.every((f) => X.of('CastleState').some((c) => Math.abs(c.elapsedSeconds - f.elapsedSeconds) < 1e-6)),
  'a picture with a time X never had');
check('pictures arrive in order', frames.every((f, i) => i === 0 || f.elapsedSeconds > frames[i - 1].elapsedSeconds));
check('a picture has every castle, inside', frames.every((f) => f.castles.length === 3
  && f.castles.every((c) => c.buildings.length > 0 && c.jobs.length > 0 && c.units.length > 0)));
check('a picture shows every place of the forest with its true state', frames.every((f) => f.sites.length === 17)
  && frames.at(-1).sites.find((x) => x.id === chest.id)?.gone === true && frames.at(-1).sites.find((x) => x.id === village.id)?.gone === true);
check('a picture says who has fallen', frames.at(-1).castles.find((c) => c.seat === 2).eliminated
  && !frames.at(-1).castles.find((c) => c.seat === 1).eliminated);
const exact = frames.filter((f) => X.of('CastleState').some((c) => c.elapsedSeconds === f.elapsedSeconds));
check(`pictures match X's real castle at that moment (${exact.length} compared)`, exact.length > 0 && exact.every((f) => {
  const real = X.of('CastleState').find((c) => c.elapsedSeconds === f.elapsedSeconds);
  const seen = f.castles.find((c) => c.seat === 1);
  return real.units.every((u) => seen.units.find((v) => v.id === u.id)?.soldiers === u.soldiers)
    && Math.abs(seen.wallHp - real.war.wallHp) < 1e-6;
}));
check('movers in a picture carry no route, target or arrival',
  frames.every((f) => f.movers.every((m) => !/route|target|arriv|mode/i.test(JSON.stringify(Object.keys(m))))));
check('nobody still playing got a spectator picture or countdown',
  [X, Z].every((c) => c.of('SpectatorState').length === 0 && c.of('SpectatorWait').length === 0));
check("X's and Z's traffic never mentions the other castles' insides",
  !Z.msgs.some((m) => m.target === 'CastleState' && m.arg.color !== 'yellow'));
check('Y only ever got its own castle state', Y.of('CastleState').every((c) => c.color === 'red'));

// ---- a bot takes a seat: public facts only, no token, no castle sent to anyone ----------------------------------
const P = client(), Q = client();
await Promise.all([P.ready, Q.ready]);
const jp = await P.call('CreateRoom', 'Pınar');
const jq = await Q.call('JoinRoom', jp.code, 'Quentin', null, false);
check('a guest cannot add a bot', !(await Q.call('AddBot', 'easy')).ok);
check('the host seats a bot', (await P.call('AddBot', 'easy')).ok);
await sleep(300);
const botRoom = Q.of('RoomState').at(-1);
const botSeat = botRoom.players.find((x) => x.isBot);
check('everyone sees the bot as a bot, with its colour name and level',
  !!botSeat && botSeat.seat === 3 && botSeat.name === 'Bot Sarı' && botSeat.botLevel === 'easy' && botSeat.ready && botSeat.connected);
check('a guest cannot remove the bot', !(await Q.call('RemoveBot', 3)).ok);
check('the host cannot remove a human', !(await P.call('RemoveBot', 2)).ok);
check('the host removes and seats it again', (await P.call('RemoveBot', 3)).ok && (await P.call('AddBot', 'medium')).ok);
await P.call('SetReady', true);
await Q.call('SetReady', true);
check('a match starts with a bot in it', (await P.call('StartMatch')).ok);
await sleep(1500);
check('no bot can be added or removed once the match is on', !(await P.call('AddBot', 'easy')).ok && !(await P.call('RemoveBot', 3)).ok);
check('the match cannot be "finished" while a human is still in it', !(await P.call('FinishMatch')).ok);
check('P and Q only ever got their own castles, never the bots',
  P.of('CastleState').length > 0 && P.of('CastleState').every((c) => c.color === 'blue')
  && Q.of('CastleState').length > 0 && Q.of('CastleState').every((c) => c.color === 'red'));
check('no token in anything the room sent about the bot',
  ![P, Q].some((c) => c.of('RoomState').some((r) => /token/i.test(JSON.stringify(r)))));
check('nobody was sent the bots castle (yellow)',
  ![P, Q].some((c) => c.msgs.some((m) => m.target === 'CastleState' && m.arg.color === 'yellow')));
P.ws.close();
Q.ws.close();

// ---- every human falls: the host may end the match and the bots play the rest out at once ----------------------
// The bots decide for themselves when to attack, so some matches end on time with an idle human still standing: try up to three rooms.
let H, K, seatsOk = false, started = false, fast = false, allOut = null;
for (let attempt = 1; attempt <= 3 && !allOut?.allHumansOut; attempt++) {
  H?.ws.close();
  K?.ws.close();
  H = client();
  K = client();
  await Promise.all([H.ready, K.ready]);
  const jh = await H.call('CreateRoom', 'Hasan');
  const jk = await K.call('JoinRoom', jh.code, 'Kemal', null, false);
  seatsOk = jh.ok && jk.ok && (await H.call('AddBot', 'medium')).ok && (await H.call('AddBot', 'medium')).ok;
  await H.call('SetReady', true);
  await K.call('SetReady', true);
  started = (await H.call('StartMatch')).ok;
  fast = (await H.call('SetSpeed', 20)).ok;
  // The humans do nothing; the bots scout them, find them undefended and take their gates.
  allOut = await (async () => {
    for (let i = 0; i < 300; i++) {
      const r = H.of('RoomState').at(-1);
      if (r?.allHumansOut || r?.phase === 'ended') return r;
      await sleep(500);
    }
    return null;
  })();
}
check('two humans and two bots take their seats', seatsOk);
check('the match starts', started);
check('the host sets ×20', fast);
check('once every human has fallen the room says so', !!allOut?.allHumansOut, JSON.stringify(allOut?.phase));
if (allOut?.allHumansOut) {
  check('the guest cannot end the match', !(await K.call('FinishMatch')).ok);
  await sleep(1500); // the last one to fall first waits a few game seconds, then gets its pictures
  check('both fallen humans were shown the whole world, and only them', H.of('SpectatorState').length > 0 && K.of('SpectatorState').length > 0
    && H.of('SpectatorState').every((f) => f.castles.length === 4),
    `H ${H.of('SpectatorState').length} frames, K ${K.of('SpectatorState').length}, castles per frame ${[...new Set(H.of('SpectatorState').map((f) => f.castles.length))]}`);
  check('the host ends it: the bots play the rest at once', (await H.call('FinishMatch')).ok);
  await sleep(500);
  const end = H.of('RoomState').at(-1);
  check('the room is over with a result, won by a bot', end.phase === 'ended' && !!end.result && end.result.winners.every((w) => end.players.find((x) => x.seat === w)?.isBot));
  check('both humans got their summary, and the bots got no connection', H.of('MatchEnded').length === 1 && K.of('MatchEnded').length === 1);
  check('it cannot be ended twice', !(await H.call('FinishMatch')).ok);
}
check('the humans only ever got their own castles, never a bot castle', H.of('CastleState').every((c) => c.color === 'blue') && K.of('CastleState').every((c) => c.color === 'red'));
H.ws.close();
K.ws.close();

X.ws.close();
Y.ws.close();
Z.ws.close();
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
