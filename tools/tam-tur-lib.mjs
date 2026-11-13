// The full screen tour (for showing the game to friends): every screen of the game, 1920x1080, one language per run, numbered files + a manifest.
// Needs a Development server and the Vite client:  KEEPFALL_SERVER=http://localhost:5083 KEEPFALL_CLIENT_PORT=5176 npm --prefix client run dev
//   node tools/tam-tur.mjs <tr|en> <stages: A,B,C,D,E,F,G or ALL> [out-root]        (URL=http://localhost:5176)
// Pictures go to art/shots/tam-tur/<date>/<lang>/NN-slug.png (git-ignored: they hold Tiny Swords art). manifest-<lang>.json lists what was taken and what could not be.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

export const LANG = process.argv[2] ?? 'tr';
export const STAGES = (process.argv[3] ?? 'ALL').toUpperCase() === 'ALL' ? 'ABCDEFG' : process.argv[3].toUpperCase().replace(/[^A-G]/g, '');
const ROOT = process.argv[4] ?? `art/shots/tam-tur/${new Date().toLocaleDateString('sv')}`;
const BASE = (process.env.URL ?? 'http://localhost:5176').replace(/\/$/, '');
const OUT = `${ROOT}/${LANG}`;
mkdirSync(OUT, { recursive: true });
const MANIFEST = `${ROOT}/manifest-${LANG}.json`;
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { shots: {}, failed: {} };
export const PLAYER = LANG === 'tr' ? 'Aslan' : 'Lion';

// ---- the picture book: a fixed, numbered list, the same in every language (a missing one keeps its number) ----
export const CATALOG = JSON.parse(readFileSync(new URL('./tam-tur.catalog.json', import.meta.url), 'utf8'));
const numberOf = (slug) => { const i = CATALOG.findIndex((c) => c.slug === slug); if (i < 0) throw new Error('not in the catalog: ' + slug); return String(i + 1).padStart(2, '0'); };

const BRIDGE = (opts = {}) => `window.keepfallSteam = { shell: 'test', status: async () => ({ available: false, appId: 0 }), mp: { info: async () => ({ build: 't', steam: true, steamName: '${PLAYER}', hosting: ${opts.hosting ? 'true' : 'false'}, lanPort: ${opts.hosting ? 47800 : 0}, addresses: ${opts.hosting ? "['192.168.1.24']" : '[]'}, lobbyId: null, joined: null, pendingLobby: null }),
  onEvent() {}, lobbies: async () => ${JSON.stringify(opts.lobbies ?? [])}, hostOpen: async () => ({ ok: true, lanPort: 47800, addresses: ['192.168.1.24'], steam: false, lobbyId: null }), hostUpdate: async () => true, leave: async () => true } };`;

const SAVE = JSON.stringify({
  v: 1, matches: 23, wins: 11,
  kingdoms: { golge: { played: 4, won: 1 }, tuccar: { played: 9, won: 6 }, kahin: { played: 6, won: 3 }, entrikaci: { played: 4, won: 1 } },
  achievements: { first_win: 1, village_raid: 1, camp_clear: 1, early_win: 1, scout_report: 1, bribe: 1, wins_10: 1, matches_10: 1, ghost_win: 1, envoy: 1, challenge_win: 1, flawless: 1 },
  picks: { frame: 'silver', banners: { tuccar: 'b' }, title: 'liar_king', pattern: 'chevron' }, xp: 2600, moments: { fake_report: 4, decoy: 1, felled: 3 },
});

/** One browser: the language, a player who has played a few matches (no hints popping up), the desktop bridge when asked. */
export async function session({ experienced = true, hosted = null, extra = '', progress = true, path = '/', tutorial = false } = {}) {
  const init = `try{localStorage.setItem('keepfall_lang','${LANG}');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall.name','${PLAYER}');`
    + `sessionStorage.setItem('keepfall.lowfps-offer','1');localStorage.setItem('keepfall.matches','${experienced ? 12 : 0}');localStorage.setItem('keepfall.normalMatches','${experienced ? 12 : 0}');localStorage.removeItem('keepfall.soloBots');`
    + `localStorage.setItem('keepfall.prefs', JSON.stringify({ showHints: false, fullRules: true }));` + (progress ? `localStorage.setItem('keepfall_progress_v1', ${JSON.stringify(SAVE)});` : '') + (tutorial ? `localStorage.removeItem('keepfall_tutorial_done');localStorage.removeItem('keepfall_tutorial_seen');localStorage.setItem('keepfall.matches','0');localStorage.setItem('keepfall.normalMatches','0');` : '') + `}catch(e){};${hosted ? BRIDGE(hosted) : ''}${extra}`;
  const b = await launch({ width: 1920, height: 1080, init });
  await b.goto(BASE + path);
  const s = { b, js: (e) => b.js(e), sleep, waitFor: (e, sec) => b.waitFor(e, sec), close: async () => { try { await b.js(`window.keepfallLeave && window.keepfallLeave()`); await sleep(400); } catch { /* not in a match */ } b.close(); } };
  s.click = (sel) => b.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  s.mouse = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); };
  s.exists = (sel) => b.js(`!!document.querySelector(${JSON.stringify(sel)})`);
  return s;
}

/** Takes a picture under its catalog number. `prep` runs first; when it throws (or returns false) the shot goes on the "could not be taken" list with the reason. */
export async function take(s, slug, prep) {
  const n = numberOf(slug), file = `${n}-${slug}.png`;
  try {
    if (prep) { const r = await prep(); if (r === false) throw new Error('screen not reached'); }
    await s.b.js(`document.querySelectorAll('.kf-lowfps').forEach((e) => e.remove()); 1`).catch(() => {});
    await s.sleep(450);
    await s.b.shot(`${OUT}/${file}`);
    manifest.shots[slug] = file; delete manifest.failed[slug];
    console.log('shot', file);
  } catch (e) {
    manifest.failed[slug] = String(e.message ?? e).split('\n')[0].slice(0, 200);
    console.log('FAILED', slug, manifest.failed[slug]);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
}

const stages = {};
export const stage = (letter, fn) => { stages[letter] = fn; };
export async function runStages() {
  for (const letter of STAGES) {
    if (!stages[letter]) continue;
    console.log(`=== stage ${letter} (${LANG})`);
    try { await stages[letter](); } catch (e) { console.log(`stage ${letter} stopped:`, e.message); }
  }
}


// ---- running a real match (for the game screens) ----
const NET = `window.keepfallNet`;
export const call = (s, expr) => s.js(`(async () => JSON.stringify(await ${expr}))()`).then((r) => { try { return JSON.parse(r); } catch { return r; } });
export const castle = (s) => s.js(`JSON.stringify(window.keepfallUi?.castle ?? null)`).then((r) => JSON.parse(r));
export const closeDecree = async (s) => { await s.click('#kingdom-decree [data-close], #kingdom-decree button'); await s.sleep(600); };

/** A solo match from the lobby ("Oyna" → three Medium bots → Start), played again until the player's kingdom is the wanted one (null: any). */
export async function startSolo(s, { kingdom = null, tries = 14, bots = null } = {}) {
  for (let i = 0; i < tries; i++) {
    await s.waitFor(`!!document.querySelector('#play')`, 40); await s.sleep(1200);
    await s.click('#play'); await s.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= 4`, 30); await s.sleep(900);
    if (bots) for (let k = 0; k < 3; k++) { await s.b.js(`document.querySelectorAll('.bot-level')[${k}] && (() => { const e = document.querySelectorAll('.bot-level')[${k}]; let g = 0; while (e.dataset.level !== '${bots}' && g++ < 3) e.click(); })(); 1`); await s.sleep(500); }
    await s.click('#start'); await s.waitFor(`document.documentElement.classList.contains('in-game') && !!window.keepfallUi?.castle`, 60); await s.sleep(1500);
    const c = await castle(s);
    if (!kingdom || c?.kingdom?.id === kingdom) { await closeDecree(s); return c; }
    console.log(`   kingdom ${c?.kingdom?.id}, wanted ${kingdom}: again`);
    await s.js(`window.keepfallLeave && window.keepfallLeave()`); await s.sleep(2500);
  }
  throw new Error('could not get the kingdom ' + kingdom);
}

/** Work, weapons and soldiers through the game's own commands (what a player clicks), then time forward until `untilSeconds` of the match have passed. */
export async function economy(s, { untilSeconds = 200, soldiers = 8, speed = 5, hook = null } = {}) {
  const c0 = await castle(s); const deck = c0.deck ?? c0.units.map((u) => u.id);
  const net = (m, ...a) => call(s, `${NET}.${m}(${a.map((x) => JSON.stringify(x)).join(',')})`);
  await net('moveWorkers', 'idle', 'farmer', 4); await net('moveWorkers', 'idle', 'lumberjack', 2); await net('moveWorkers', 'idle', 'miner', 3); await net('moveWorkers', 'idle', 'blacksmith', 2);
  await net('setSpeed', speed);
  const t0 = Date.now(); let step = 0, up = 0;
  for (;;) {
    const c = await castle(s); if (!c || c.phase !== 'preparation' && c.phase !== 'war' || c.elapsedSeconds >= untilSeconds || Date.now() - t0 > 300_000) break;
    step++;
    if (hook) await hook(c, step);
    for (const u of c.units) if (u.weapons > 0 && c.resources.food > 60 && c.soldiers + (u.arming ?? 0) < soldiers) await net('armWorkers', u.id, Math.min(u.weapons, 2), 'idle');
    if (c.queue.length < 2) await net('queueWeapon', deck[step % deck.length], 2);
    const idle = c.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    const farmers = c.jobs.find((j) => j.job === 'farmer')?.count ?? 0;
    // food first: a farm needs its workers, and nobody goes hungry in the preparation (a made-up famine would show in every picture)
    if (idle > 0 && (c.resources.food < 120 || c.starving)) await net('moveWorkers', 'idle', 'farmer', 1);
    else if (c.starving && farmers < 6) await net('moveWorkers', 'miner', 'farmer', 1);
    else if (idle > 3) await net('moveWorkers', 'idle', ['miner', 'lumberjack'][step % 2], 1);
    if (c.resources.wood > 160 && c.resources.iron > 110) await net('upgradeBuilding', ['farm', 'mine', 'forge', 'lumberCamp'][up++ % 4]);
    await s.sleep(900);
  }
  await net('setSpeed', 1);
  return castle(s);
}

/** Runs a stage part again (a fresh browser) when the page was lost half way (the headless browser sometimes reloads under load). */
export async function attempt(name, fn, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); } catch (e) { console.log(`   ${name}: attempt ${i} failed: ${String(e.message).slice(0, 160)}`); }
  }
  console.log(`   ${name}: gave up`);
}
