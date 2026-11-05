// The CrazyGames layer against a MOCK of the SDK (the real one only works on the site): Vite must run the crazy platform
// (cd client && VITE_PLATFORM=crazygames KEEPFALL_SERVER=http://localhost:5081 npx vite --port 5175).
// FLAGS=on (default): the invitation layer is expected to work (itch/local-like). FLAGS=off: the crazy build's real setting (add VITE_FEATURE_PRIVATE_ROOM=0 VITE_FEATURE_CRAZY_INVITE=0 to the vite command):
// no private room / code / invite / instant multiplayer; Quick Match + the rest of the SDK layer still work.
// Usage: [FLAGS=off] node tools/crazy-sdk-check.mjs [http://localhost:5175]
import { launch, sleep } from './cdp.mjs';
const URL = (process.argv[2] ?? 'http://localhost:5175').replace(/\/$/, '');
const OFF = process.env.FLAGS === 'off';
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const MOCK = (invite, instant) => `window.__cg = []; window.CrazyGames = { SDK: { environment: 'local', init: async () => { __cg.push('init'); },
  user: { getUser: async () => ({ username: 'CrazyPlayer' }) },
  game: { loadingStart: () => __cg.push('loadingStart'), loadingStop: () => __cg.push('loadingStop'), gameplayStart: () => __cg.push('gameplayStart'), gameplayStop: () => __cg.push('gameplayStop'), happytime: () => __cg.push('happytime'),
    updateRoom: (d) => __cg.push('updateRoom:' + JSON.stringify(d)), leftRoom: () => __cg.push('leftRoom'), inviteLink: (p) => 'https://www.crazygames.com/game/keepfall?room=' + p.room,
    showInviteButton: (p) => { __cg.push('showInviteButton:' + p.room); return 'link'; }, hideInviteButton: () => __cg.push('hideInviteButton'),
    getInviteParam: (n) => ${invite ? `'${invite}'` : 'null'}, inviteParams: ${invite ? `{ room: '${invite}' }` : 'null'}, isInstantMultiplayer: ${instant},
    settings: { disableChat: false, muteAudio: false }, addSettingsChangeListener: (f) => { window.__settingsCb = f; }, addJoinRoomListener: (f) => { window.__joinCb = f; } } } };`;
const calls = (b) => b.js('window.__cg ? window.__cg.join(" | ") : "(no sdk)"');

if (OFF) {
  // Even with the site asking for instant multiplayer and an invite parameter, nothing of the invitation layer shows up.
  const a = await launch({ init: MOCK('ABCDEF', true) });
  await a.goto(URL + '/');
  ok(await a.waitFor("document.querySelector('#quick')", 25), 'flags off: the home screen comes up (no instant room, no invited join)');
  await sleep(1500);
  ok(await a.js("!document.querySelector('.lobby') && !document.querySelector('#create') && !document.querySelector('#join') && !document.querySelector('#code')"), 'flags off: no Oda kur / join by code on the home screen');
  let c = await calls(a);
  ok(c.includes('loadingStart') && c.includes('loadingStop'), 'loadingStart ... loadingStop around the load');
  ok(!/updateRoom|showInviteButton|leftRoom|hideInviteButton/.test(c), 'flags off: no room / invite call reached the SDK');
  ok(await a.js("typeof window.__joinCb !== 'function'"), 'flags off: no join listener registered');
  await a.js("document.querySelector('#name').value='Crazy'; document.querySelector('#quick').click(); 1");
  ok(await a.waitFor("document.documentElement.classList.contains('in-game')", 60), 'Quick Match: a match with bots started');
  await sleep(2000);
  c = await calls(a);
  ok(c.includes('gameplayStart') && !/updateRoom|showInviteButton|leftRoom|hideInviteButton/.test(c), 'match start: gameplayStart, still no room / invite call');
  await a.js("window.CrazyGames.SDK.game.settings.muteAudio = true; window.__settingsCb(); 1");
  await sleep(300);
  ok(await a.js("keepfallAudio.sfx.silent === true && keepfallAudio.sfx.muted === false"), "site mute silences the game without overwriting the player's own setting");
  // a won match: gameplayStop (the end of play) and the site's happytime; a lost match sends no happytime (the end screen only calls crazyVictory for a winner)
  await a.js("window.__cg.length = 0; keepfallCrazy.victory(); 1"); await sleep(200);
  c = await calls(a);
  ok(c.includes('gameplayStop') && c.includes('happytime'), 'victory: gameplayStop + happytime reached the SDK');
  a.close();
  const n = await launch({ init: '' });
  await n.goto(URL + '/?room=ABCDEF');
  ok(await n.waitFor("document.querySelector('#quick')", 25), 'no SDK, ?room= ignored: home screen');
  await n.js("document.querySelector('#name').value='NoSdk'; document.querySelector('#quick').click(); 1");
  ok(await n.waitFor("document.documentElement.classList.contains('in-game')", 60), 'no SDK: Quick Match works');
  ok((await calls(n)) === '(no sdk)', 'no SDK: nothing was called');
  ok(await n.js("keepfallCrazy.victory(); true"), 'no SDK: victory is a silent no-op');
  n.close();
  process.exit(bad ? 1 : 0);
}

// 1. instant multiplayer: a private room at once, invite button shown, username filled
const a = await launch({ init: MOCK(null, true) });
await a.goto(URL + '/');
ok(await a.waitFor("document.querySelector('.lobby')", 25), 'instant multiplayer: a private room lobby opened by itself');
const code = await a.js("document.querySelector('.title-ribbon .code').textContent.trim()");
let c = await calls(a);
ok(c.includes('loadingStart') && c.includes('loadingStop'), 'loadingStart ... loadingStop around the load');
ok(c.includes(`showInviteButton:${code}`) && c.includes(`"isJoinable":true`), `invite button shown for room ${code} (updateRoom isJoinable true)`);
ok(await a.js("document.querySelector('#myname').value") === 'CrazyPlayer', 'the CrazyGames user name is the default player name');
await a.js("document.querySelector('[data-a=copylink]').click(); 1");
await sleep(500);
// 2. a friend opens the invitation: getInviteParam('room') joins directly
const b = await launch({ init: MOCK(code, false) });
await b.goto(URL + '/');
ok(await b.waitFor("document.querySelector('.lobby')", 25), 'invited friend: joined the room straight from the invite parameter');
// 3. the match starts: the invite button goes away, gameplayStart
await a.js("document.querySelector('#ready').click(); 1"); await b.js("document.querySelector('#ready').click(); 1");
await sleep(1500);
await a.js("document.querySelector('#start').click(); 1");
ok(await a.waitFor("document.documentElement.classList.contains('in-game')", 40), 'match started');
await sleep(1500);
c = await calls(a);
ok(c.includes('hideInviteButton') && c.includes('"isJoinable":false') && c.includes('gameplayStart'), 'match start: hideInviteButton, isJoinable false, gameplayStart');
// 4. site mute
await a.js("window.CrazyGames.SDK.game.settings.muteAudio = true; window.__settingsCb(); 1");
await sleep(300);
ok(await a.js("keepfallAudio.sfx.silent === true && keepfallAudio.sfx.muted === false"), "site mute silences the game without overwriting the player's own setting");
// 5. back to the menu: gameplayStop + leftRoom
await a.js("document.querySelector('[data-act=leave], #leave')?.click(); 1");
a.close(); b.close();

// 6. no SDK at all: the same private-room flow works
const n = await launch({});
await n.goto(URL + '/');
await n.js("document.querySelector('#name').value='NoSdk'; document.querySelector('#create').click(); 1");
ok(await n.waitFor("document.querySelector('.lobby')", 25), 'no SDK: private room still works');
ok((await calls(n)) === '(no sdk)', 'no SDK: nothing was called');
n.close();
process.exit(bad ? 1 : 0);
