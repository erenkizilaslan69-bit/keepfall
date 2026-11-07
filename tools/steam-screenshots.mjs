// Steam store media in ONE command: 1920x1080 screenshots (TR and EN) and the store's graphical assets (capsules, hero, logo, ...).
//   node tools/steam-screenshots.mjs [--lang tr|en|both] [--shoot] [--only stills|menus|store] [--contact]
// Outputs (all git-ignored: they contain Tiny Swords art): art/shots/steam/<lang>/NN-name.png, art/shots/steam/store/*.png|jpg
// How it works:
//  * in-game stills are frames of the 60 fps GPU clips tools/promo shoots (art/video/clips-<lang>/cNN-ui-t1.mp4: the game as played, no debug layer);
//    --shoot (re)shoots missing clips first (a headed Chrome takes over the primary screen for ~30 min: do not use the PC meanwhile);
//  * menu screens (main menu, challenges, achievements, lobby with the deck picker, end-screen "who deceived whom") come from headless Chrome against a
//    private game stack (tools/steam-media-stack.mjs: ports 5083/5176, never 5080/5081/5090/5174). Achievements and the end-screen result use a
//    MADE-UP save/result (same technique as tools/shot-progress.mjs / shot-deceptions.mjs): say so if a caption ever claims otherwise;
//  * store assets are composed in headless Chrome (tools/steam-render.mjs) from clean clip frames + art/promo/keepfall-logo-transparent.png.
//  --contact writes contact sheets of every clip (art/shots/steam/contact-*.png) to pick still times; the times live in STILLS below.
// Licence: commercial use of Tiny Swords is free, credit recommended (Pixel Frog), the pack itself is not distributed on its own; the output is publishable (docs/steam-paketleme.md).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startStack, root } from './steam-media-stack.mjs';
import { openRenderer, fileUrl } from './steam-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const langArg = opt('--lang', 'both');
const LANGS = langArg === 'both' ? ['tr', 'en'] : [langArg];
const only = opt('--only', 'all');
const want = (p) => only === 'all' || only === p;
const OUT = join(root, 'art', 'shots', 'steam');
const VIDEO = join(root, 'art', 'video');
const LOGO = join(root, 'art', 'promo', 'keepfall-logo-transparent.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (a) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...a], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('ffmpeg failed: ' + a.join(' ')); };
const clipFile = (lang, clip, tag) => { const f = join(VIDEO, `clips-${lang}`, `${clip}-${tag}-t1.mp4`); return !existsSync(f) && tag === 'clean' ? join(VIDEO, 'clips-en', `${clip}-${tag}-t1.mp4`) : f; };

// [file name, clip, variant, second of the frame]: chosen by looking at the contact sheets (--contact).
const STILLS = [
  // The interface-free ("clean") frames carry no text, so one set serves every language; the "ui" clips show a red dev diagnostics strip and are not store-clean.
  ['01-castle-at-work', 'c01', 'clean', 3.0],
  ['02-forge-and-arming', 'c03', 'clean', 2.6],
  ['03-fog-and-scout', 'c04', 'clean', 3.0],
  ['04-phantom-army-forest', 'c07', 'clean', 3.0],
];
const CLIPS_WANTED = [...new Set(STILLS.map((s) => s[1]))];

if (args.includes('--contact')) {
  mkdirSync(OUT, { recursive: true });
  for (const lang of LANGS) for (const c of CLIPS_WANTED) {
    for (const v of ['clean', 'ui']) { const f = clipFile(lang, c, v); if (!existsSync(f)) continue;
    ff(['-i', f, '-vf', 'fps=1/0.5,scale=480:270,drawtext=fontfile=/Windows/Fonts/arial.ttf:text=%{pts}:x=6:y=6:fontcolor=white:box=1:boxcolor=black@0.6:fontsize=18,tile=4x4', '-frames:v', '1', join(OUT, `contact-${lang}-${c}-${v}.png`)]); }
  }
  process.exit(0);
}

const END_SCREEN = `(async()=>{
  const { EndScreen } = await import('/src/screens.ts');
  document.querySelectorAll('.screen').forEach((e) => e.remove());
  document.documentElement.classList.add('in-menu');
  const e = new EndScreen(document.getElementById('app') ?? document.body, { backToLobby: async () => ({ ok: true }) }, 1);
  const ranking = [
    { seat: 0, name: 'Aylin', color: 'red', place: 1, population: 91, eliminated: false, kingdom: 'kahin' },
    { seat: 1, name: 'Eren', color: 'blue', place: 2, population: 40, eliminated: true, kingdom: 'golge' },
    { seat: 2, name: 'Cem', color: 'yellow', place: 3, population: 22, eliminated: true, kingdom: 'tuccar' }];
  const sum = { durationSeconds: 1100, startPopulation: 10, finalPopulation: 91, peakPopulation: 95, peopleBorn: 120, workers: [{ name: 'Çiftçi', count: 20 }, { name: 'Oduncu', count: 14 }], units: [{ name: 'Kılıçlı', soldiers: 12, weapons: 3 }, { name: 'Okçu', soldiers: 8, weapons: 0 }],
    weaponsMade: 60, produced: { food: 900, wood: 700, iron: 400, gold: 0 }, final: { food: 100, wood: 50, iron: 20, gold: 0 }, starvingSeconds: 0, idleWorkerSeconds: 30, buildings: [{ name: 'Tarla', level: 3 }, { name: 'Demirhane', level: 2 }], war: { attacksLaunched: 3, enemiesKilled: 40, soldiersLost: 12, eliminated: false }, samples: Array.from({ length: 12 }, (_, i) => ({ seconds: i * 100, population: 10 + i * 7, soldiers: i * 2, food: 100 + i * 30, wood: 50, iron: 20 })) };
  e.update({ code: 'X', phase: 'ended', players: [{ seat: 0, name: 'Aylin', color: 'red', isHost: true, connected: true }, { seat: 1, name: 'Eren', color: 'blue', isHost: false, connected: true }],
    result: { winners: [0], byElimination: true, ranking, deceptions: [
    { at: 95.2, kind: 'FakeReportSet', actorSeat: 1, targetSeat: null, asSeat: null, count: 40, detail: null },
    { at: 131, kind: 'FakeReportRead', actorSeat: 1, targetSeat: 2, asSeat: null, count: 0, detail: null },
    { at: 212, kind: 'DecoySent', actorSeat: 1, targetSeat: 0, asSeat: null, count: 12, detail: null },
    { at: 240, kind: 'DecoySighted', actorSeat: 1, targetSeat: 0, asSeat: null, count: 0, detail: null },
    { at: 262, kind: 'DecoyFaded', actorSeat: 1, targetSeat: 0, asSeat: null, count: 0, detail: null },
    { at: 301, kind: 'Bribed', actorSeat: 2, targetSeat: 0, asSeat: null, count: 8, detail: null },
    { at: 330, kind: 'ArmyAsSent', actorSeat: 2, targetSeat: 1, asSeat: 0, count: 14, detail: null },
    { at: 372, kind: 'DisguisedFought', actorSeat: 2, targetSeat: 1, asSeat: 0, count: 0, detail: 'fell' },
    { at: 492, kind: 'Unmasked', actorSeat: 2, targetSeat: 1, asSeat: 0, count: 0, detail: 'time' },
    { at: 520, kind: 'OracleSawIncoming', actorSeat: 1, targetSeat: 0, asSeat: null, count: 0, detail: 'decoy' }],
    summaries: [{ seat: 0, name: 'Aylin', color: 'red', summary: sum }, { seat: 1, name: 'Eren', color: 'blue', summary: sum }] } });
  await new Promise((r) => setTimeout(r, 1200)); document.querySelector('.deceptions')?.scrollIntoView({ block: 'start' }); return 1; })()`;

let stack = null;
const needStack = want('menus') || args.includes('--shoot');
try {
  if (needStack) stack = await startStack();

  // ---- 0. clips (only with --shoot)
  if (args.includes('--shoot')) {
    for (const lang of LANGS) {
      const missing = CLIPS_WANTED.filter((c) => !existsSync(clipFile(lang, c, 'ui')));
      if (!missing.length) continue;
      console.log(`shooting ${lang}: ${missing.join(' ')} (the screen is taken over meanwhile)`);
      const env = { ...process.env, KF_PROMO_URL: stack.url, KF_PROMO_LANG: lang, KF_PROMO_CLIPS: join(VIDEO, `clips-${lang}`), KF_PROMO_TAGS: 'ui' };
      const r = spawnSync('node', [join(root, 'tools', 'promo', 'clips.mjs'), ...missing, '--takes', '1'], { stdio: 'inherit', env });
      if (r.status !== 0) throw new Error('clip shoot failed');
    }
  }

  // ---- 1. stills from the clips
  if (want('stills')) for (const lang of LANGS) {
    const dir = join(OUT, lang); mkdirSync(dir, { recursive: true });
    for (const [name, clip, tag, t] of STILLS) {
      const f = clipFile(lang, clip, tag);
      if (!existsSync(f)) { console.log(`skip ${lang}/${name}: ${f} missing (use --shoot)`); continue; }
      ff(['-ss', String(t), '-i', f, '-frames:v', '1', join(dir, `${name}.png`)]);
      console.log('wrote', `${lang}/${name}.png`);
    }
  }

  // ---- 2. menu screens (headless Chrome, private stack)
  if (want('menus')) for (const lang of LANGS) {
    const dir = join(OUT, lang); mkdirSync(dir, { recursive: true });
    const r = await openRenderer();
    const js = async (e) => { const x = await r.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (x.result?.exceptionDetails) throw new Error(x.result.exceptionDetails.exception?.description ?? 'js error'); return x.result?.result?.value; };
    const waitFor = async (e, s = 20) => { for (let i = 0; i < s * 4; i++) { try { if (await js(e)) return true; } catch { /* */ } await sleep(250); } return false; };
    const shot = async (name) => { const x = await r.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(dir, `${name}.png`), Buffer.from(x.result.data, 'base64')); console.log('wrote', `${lang}/${name}.png`); };
    try {
      await r.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      const save = JSON.stringify({ v: 1, matches: 23, wins: 11,
        kingdoms: { golge: { played: 4, won: 1 }, tuccar: { played: 9, won: 6 }, kahin: { played: 6, won: 3 }, entrikaci: { played: 4, won: 1 } },
        achievements: { first_win: 1, village_raid: 1, camp_clear: 1, early_win: 1, scout_report: 1, bribe: 1, wins_10: 1, matches_10: 1, ghost_win: 1, envoy: 1, challenge_win: 1, flawless: 1 },
        picks: { frame: 'silver', banners: { tuccar: 'b' } } });
      await r.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_name','Eren');localStorage.setItem('keepfall.matches','9');localStorage.setItem('keepfall_progress_v1', ${JSON.stringify(save)})}catch(e){}` });
      await r.send('Page.navigate', { url: stack.url });
      await waitFor(`!!document.querySelector('#quick')`, 40); await sleep(2500);
      await shot('20-main-menu');
      await js(`document.querySelector('#challenges')?.click()`);
      if (await waitFor(`!!document.querySelector('.screen.challenges .ch-card')`)) { await sleep(1200); await shot('21-challenges'); }
      await js(`document.querySelector('[data-back]')?.click()`); await waitFor(`!!document.querySelector('#progress')`);
      await js(`document.querySelector('#progress')?.click()`); await sleep(1800); await shot('22-achievements-mastery');
      await js(`document.querySelector('[data-back]')?.click()`); await waitFor(`!!document.querySelector('#quick')`);
      // the lobby with the deck picker: a room with three bots (no match started)
      await js(`(async () => { const n = keepfallNet; if (n.roomCode) { try { await n.leaveRoom(); } catch (e) {} } let x = await n.createRoom('Eren'); for (const l of ['easy','medium','easy']) x = await n.addBot(l); return 1; })()`);
      await sleep(3500); await shot('23-lobby-deck');
      // end screen "who deceived whom" (made-up result: tools/shot-deceptions.mjs)
      await js(`(async () => { const n = keepfallNet; try { await n.leaveRoom(); } catch (e) {} return 1; })()`);
      await js(END_SCREEN);
      await sleep(600); await shot('24-who-deceived-whom');
    } finally { r.close(); }
  }

  // ---- 3. store assets (headless Chrome compositions; text-free: the logo carries the name)
  if (want('store')) {
    const dir = join(OUT, 'store'); mkdirSync(dir, { recursive: true });
    const frame = (c, t, name) => { const f = clipFile('en', c, 'clean'); if (!existsSync(f)) throw new Error('clean clip missing: ' + f); const o = join(dir, `_${name}.png`); ff(['-ss', String(t), '-i', f, '-frames:v', '1', o]); return o; };
    const bg = { main: frame('c09', 2.0, 'bg-kingdoms'), alt: frame('c10', 3.5, 'bg-march'), fall: frame('c13', 2.5, 'bg-fall'), home: frame('c01', 3.0, 'bg-home') };
    const r = await openRenderer();
    const logo = fileUrl(LOGO);
    const cap = async (name, w, h, bgFile, { logoW = 0.7, logoY = 0.5, pos = '50% 50%', ext = 'png' } = {}) => {
      const lw = Math.round(w * logoW); const lh = Math.round(lw * 1100 / 2488);
      const html = `<div style="position:absolute;inset:0;background:url('${fileUrl(bgFile)}') ${pos}/cover no-repeat"></div>
        <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% ${logoY * 100}%,rgba(8,12,20,.55),rgba(8,12,20,0) 62%),linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.45))"></div>
        <img src="${logo}" style="position:absolute;left:${(w - lw) / 2}px;top:${Math.round(h * logoY - lh / 2)}px;width:${lw}px;height:${lh}px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.55))">`;
      await r.render(html, w, h, join(dir, `${name}.${ext}`), { format: ext === 'jpg' ? 'jpeg' : 'png' }); console.log('wrote store/' + name + '.' + ext);
    };
    try {
      await cap('header-capsule-920x430', 920, 430, bg.main, { logoW: 0.78, logoY: 0.52 });
      await cap('library-header-920x430', 920, 430, bg.alt, { logoW: 0.78, logoY: 0.52 });
      await cap('small-capsule-462x174', 462, 174, bg.main, { logoW: 0.8, logoY: 0.5 });
      await cap('main-capsule-1232x706', 1232, 706, bg.alt, { logoW: 0.72, logoY: 0.5 });
      await cap('vertical-capsule-748x896', 748, 896, bg.fall, { logoW: 0.9, logoY: 0.42, pos: '40% 50%' });
      await cap('library-capsule-600x900', 600, 900, bg.fall, { logoW: 0.9, logoY: 0.4, pos: '40% 50%' });
      await cap('community-icon-184x184', 184, 184, bg.home, { logoW: 0.96, logoY: 0.5, ext: 'jpg' });
      // library hero: 3840x1240, no logo; the 1920x1080 frame at 2x (pixel art: nearest), a slice of it
      await r.render(`<div style="position:absolute;inset:0;background:url('${fileUrl(bg.alt)}') 50% 45%/3840px 2160px no-repeat;image-rendering:pixelated"></div>`, 3840, 1240, join(dir, 'library-hero-3840x1240.png'));
      console.log('wrote store/library-hero-3840x1240.png');
      // page background 1438x810: a darkened frame
      await r.render(`<div style="position:absolute;inset:0;background:url('${fileUrl(bg.home)}') center/cover"></div><div style="position:absolute;inset:0;background:rgba(10,14,22,.62)"></div>`, 1438, 810, join(dir, 'page-background-1438x810.jpg'), { format: 'jpeg' });
      console.log('wrote store/page-background-1438x810.jpg');
      // library logo: transparent, 1280 wide (at most 1280x720)
      await r.render(`<img src="${logo}" style="position:absolute;left:0;top:0;width:1280px;height:566px">`, 1280, 566, join(dir, 'library-logo-1280x566.png'), { transparent: true });
      console.log('wrote store/library-logo-1280x566.png');
    } finally { r.close(); }
  }
} finally { if (stack) stack.stop(); }
