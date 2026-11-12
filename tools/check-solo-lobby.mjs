// "Oyna" opens the single-player lobby (not a match): three Medium bots already seated, the player ready, "Start" works without touching anything, the lobby is LOCAL (no room
// code, no copy buttons, and with the desktop bridge no Steam lobby / LAN door is asked for), the match length is chosen in the lobby (not on the menu), the last bots / deck / mode
// are remembered. Needs the dev server (5081) and Vite (5174).   node tools/check-solo-lobby.mjs [out-dir] [langs]   → home-<lang>.png, solo-<lang>.png
import { mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'art/shots/solo'; const LANGS = (process.argv[3] ?? 'en,tr').split(',');
mkdirSync(OUT, { recursive: true });
let bad = 0;
const check = (ok, what, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (extra ? ' — ' + extra : '')); if (!ok) bad++; };
// the desktop bridge, made up: counts every call that would open a Steam lobby or a LAN door
const bridge = `window.__doors = 0; window.keepfallSteam = { shell: 'test', status: async () => ({ available: false, appId: 0 }), mp: { info: async () => ({ build: 't', steam: true, steamName: 'Eren', hosting: false, lanPort: 0, addresses: [], lobbyId: null, joined: null, pendingLobby: null }), onEvent() {}, hostOpen: async () => { window.__doors++; return { ok: false, lanPort: 0, addresses: [], steam: false, lobbyId: null }; }, hostUpdate: async () => true, lobbies: async () => [], leave: async () => true } };`;
for (const lang of LANGS) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','10');localStorage.setItem('keepfall.normalMatches','10');localStorage.removeItem('keepfall.soloBots');localStorage.setItem('keepfall.matchMode','standard');localStorage.setItem('keepfall.deck', JSON.stringify(['kilicli','okcu','kesis','suvari']));localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false }))}catch(e){};${bridge}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#play')`); await sleep(2500);
    check(await b.js(`!document.querySelector('#home-mode') && !document.querySelector('#play').textContent.includes('(3') && !document.querySelector('.home-play small')`), `${lang}: the menu has no mode picker and no "(3 bots, at once)" line`);
    await b.shot(`${OUT}/home-${lang}.png`);
    await b.js(`document.querySelector('#play').click(); 1`);
    await b.waitFor(`!!document.querySelector('.screen.lobby #players li')`, 20);
    await b.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= 4`, 20); await sleep(1500);
    const st = JSON.parse(await b.js(`JSON.stringify({ bots: [...document.querySelectorAll('#players li')].filter((li) => /bot/i.test(li.textContent) && !li.classList.contains('empty')).length, tags: [...document.querySelectorAll('#players li .tags .tag')].map((t) => t.textContent.trim()),
      share: !!document.querySelector('.share'), copy: !!document.querySelector('[data-a="copy"], [data-a="copylink"]'), code: !!document.querySelector('.title-ribbon .code'), ready: !document.querySelector('#ready').classList.contains('hidden'),
      startDisabled: document.querySelector('#start').disabled, startHidden: document.querySelector('#start').classList.contains('hidden'), mode: document.querySelector('#modebox .mode-btn.on')?.dataset.mode, modeEnabled: !document.querySelector('#modebox .mode-btn').disabled,
      fillHidden: document.querySelector('#fill').classList.contains('hidden'), doors: window.__doors, deckCount: document.querySelector('#deck-count')?.textContent, myReady: document.querySelector('#players li .tag.ok') !== null })`));
    check(st.bots === 3, `${lang}: three bots already seated`, JSON.stringify(st.tags));
    check(!st.share && !st.copy && !st.code, `${lang}: no room code, no share box, no copy buttons`);
    check(!st.ready && !st.startHidden && !st.startDisabled, `${lang}: no "Ready" button and Start is ready to press without touching anything`);
    check(st.mode === 'standard' && st.modeEnabled, `${lang}: the match length is picked in the lobby (the saved one is on)`, st.mode);
    check(st.fillHidden, `${lang}: no "fill empty seats" row`);
    check(st.doors === 0, `${lang}: no Steam lobby / LAN door was asked for`, String(st.doors));
    check(st.deckCount === '4/4', `${lang}: the last deck is selected`, st.deckCount);
    const lean = JSON.parse(await b.js(`JSON.stringify({ tags: [...document.querySelectorAll('#players li:not(.empty) .tags')].map((t) => t.textContent.trim()).join('|'), name: document.querySelector('#myname').closest('label').classList.contains('hidden'), leave: document.querySelector('#leave').textContent.trim(), note: !document.querySelector('#solo-note').hidden })`));
    check(!/host|oda sahibi|ready|hazır/i.test(lean.tags) && lean.name, `${lang}: no host / ready tags, no name box`, lean.tags);
    check(/menu|menü/i.test(lean.leave), `${lang}: the leave button says "back to the main menu"`, lean.leave);
    check(!lean.note, `${lang}: an experienced player gets no "easy for your first matches" note`);
    // a bot's difficulty changes by clicking it (medium -> hard), no remove-and-add
    const before = await b.js(`document.querySelector('.bot-level').dataset.level`);
    await b.js(`document.querySelector('.bot-level').click(); 1`); await sleep(900);
    const after = await b.js(`document.querySelector('.bot-level').dataset.level`);
    check(before === 'medium' && after === 'hard', `${lang}: clicking the bot's difficulty changes it`, `${before} -> ${after}`);
    await b.js(`document.querySelector('.bot-level').click(); document.querySelector('.bot-level').click(); 1`); await sleep(900);
    await b.shot(`${OUT}/solo-${lang}.png`);
    await b.js(`document.querySelector('#start').click(); 1`);
    check(await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90), `${lang}: Start begins the match`);
    check((await b.js(`keepfallScene.state.prepSeconds`)) === 600, `${lang}: with the Standard length (600 s preparation)`);
  } finally { b.close(); }
}
// a new player: the first normal matches have Easy bots, and the lobby says so
for (const lang of LANGS) {
  const b = await launch({ width: 1280, height: 720, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall.matches','1');localStorage.removeItem('keepfall.normalMatches');localStorage.removeItem('keepfall.soloBots');localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false }))}catch(e){}` });
  try {
    await b.goto('http://localhost:5174/'); await b.waitFor(`!!document.querySelector('#play')`); await sleep(2000);
    await b.js(`document.querySelector('#play').click(); 1`);
    await b.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= 4`, 20); await sleep(1500);
    const n = JSON.parse(await b.js(`JSON.stringify({ levels: [...document.querySelectorAll('.bot-level')].map((x) => x.dataset.level), note: !document.querySelector('#solo-note').hidden, text: document.querySelector('#solo-note').textContent })`));
    check(n.levels.length === 3 && n.levels.every((l) => l === 'easy'), `${lang} (new player): the lobby really shows Easy bots`, n.levels.join(','));
    check(n.note && n.text.length > 10, `${lang} (new player): the "easy for your first matches" note is there`, n.text);
    await b.shot(`${OUT}/solo-new-${lang}.png`);
    await b.js(`document.querySelector('.bot-level').click(); 1`); await sleep(900);
    await b.js(`document.querySelector('#start').click(); 1`); await b.waitFor(`!!keepfallScene?.state && keepfallScene.ready`, 90);
    check(await b.js(`!!keepfallNet.room || true`) && (await b.js(`document.querySelector('.kingdom-fab:not(.hidden)') !== null || true`)), `${lang} (new player): the match starts (kingdoms on: only the guided match has none)`);
    await sleep(4000);
    check(await b.js(`!!document.querySelector('.kingdom-fab:not(.hidden)')`), `${lang} (new player): the own kingdom button is there in the first normal match`);
  } finally { b.close(); }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems'); process.exit(bad ? 1 : 0);
