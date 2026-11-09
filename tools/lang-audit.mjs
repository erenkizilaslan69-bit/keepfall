// Layout audit of the 15 languages on the desktop: for every language it opens the home screen, the lobby, a match (top bar, the castle window of the blacksmith, the rival's window, the
// kingdom panel, the guide and the settings) and counts where text does not fit its box (a clipped label, a button text wider than the button, a window wider than the screen), then takes
// 1920x1080 pictures of the lobby and of a battle for every language. Needs the dev server (5081, Keepfall__MaxRooms=0) and Vite (5174), like tools/ui-audit.mjs.
//   node tools/lang-audit.mjs [--langs de,ru,zh-CN,ja] [--size 1280,720] [--shots art/shots/langs] [--md docs/lang-audit.md] [--no-shots]
// Pictures go to art/shots/langs (they hold Tiny Swords art: never committed); the report is a markdown table.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const ALL = ['en', 'tr', 'zh-CN', 'zh-TW', 'ru', 'es-ES', 'es-419', 'pt-BR', 'de', 'fr', 'ja', 'ko', 'pl', 'it', 'uk'];
const langs = arg('langs', ALL.join(',')).split(',');
const [W, H] = arg('size', '1280,720').split(',').map(Number);
const SHOTS = resolve(arg('shots', 'art/shots/langs'));
const MD = resolve(arg('md', 'docs/lang-audit.md'));
const SHOT = !process.argv.includes('--no-shots');
const URL = 'http://localhost:5174/';
mkdirSync(SHOTS, { recursive: true });

// what does not fit: an element whose own text is wider/taller than the box that holds it (hidden/clipped overflow, or a nowrap label), and anything cut off by the screen edge
const CHECK = `(() => {
  const out = [], iw = innerWidth, ih = innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const name = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')).slice(0, 60);
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('.kf-fps, .kf-debug, .tb-speed, [data-dev], canvas, svg')) continue;
    { const f = e.closest('.ucard-face'), card = e.closest('.ucard'); if (f && card && (f.classList.contains('back') !== card.classList.contains('flipped'))) continue; } // the turned-away side of a card
    if (!vis(e)) continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(e);
    const clipX = e.scrollWidth > e.clientWidth + 2 && (/(hidden|clip|auto|scroll)/.test(cs.overflowX) || cs.whiteSpace === 'nowrap');
    const clipY = e.scrollHeight > e.clientHeight + 3 && /(hidden|clip)/.test(cs.overflowY);
    if (clipX || clipY) out.push({ kind: 'clipped', el: name(e), text: e.textContent.trim().slice(0, 50), box: [e.clientWidth, e.clientHeight], content: [e.scrollWidth, e.scrollHeight] });
    const r = e.getBoundingClientRect();
    // cut off by a parent that hides its overflow (a card, a window body...)
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const pcs = getComputedStyle(n); if (!/(hidden|clip)/.test(pcs.overflowX + pcs.overflowY)) continue;
      const pr = n.getBoundingClientRect();
      if (r.right > pr.right + 2 || r.left < pr.left - 2 || r.bottom > pr.bottom + 2) { out.push({ kind: 'cut by ' + name(n), el: name(e), text: e.textContent.trim().slice(0, 50), rect: [r.left | 0, r.top | 0, r.right | 0, r.bottom | 0] }); break; }
      if (pcs.overflowX !== 'visible' && pcs.overflowY !== 'visible') break;
    }
    if (r.right > iw + 1 || r.left < -1 || r.bottom > ih + 1 || r.top < -1) { if (!e.closest('.guide-body, .win-body, [style*="overflow"]')) out.push({ kind: 'offscreen', el: name(e), text: e.textContent.trim().slice(0, 50), rect: [r.left | 0, r.top | 0, r.right | 0, r.bottom | 0] }); }
  }
  return JSON.stringify(out);
})()`;

const results = [];
const run = async (lang) => {
  const row = { lang, screens: {} };
  const bl = await launch({ width: W, height: H, dpr: 1, init: `try{localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_name','Eren')}catch(e){}` });
  const audit = async (name) => { await sleep(700); const r = JSON.parse(await bl.js(CHECK)); row.screens[name] = r; return r; };
  const shot = async (name, w = W, h = H) => { if (SHOT) { await bl.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(900); await bl.shot(`${SHOTS}/${lang}-${name}.png`); await bl.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }); } };
  try {
    await bl.goto(URL); await bl.waitFor("document.querySelector('#quick')", 40);
    await audit('home');
    await bl.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); for (const l of ['medium', 'easy', 'hard']) await n.addBot(l); return 1; })()`);
    await bl.waitFor("document.querySelector('.screen.lobby')", 20); await sleep(1200);
    await audit('lobby'); await shot('lobby', 1920, 1080);
    await bl.js(`(async () => { const n = keepfallNet; await n.setGuided(true); await n.setReady(true); const r = await n.startMatch(); return r.ok; })()`);
    await bl.waitFor("document.documentElement.classList.contains('in-game') && !!keepfallScene.state && keepfallScene.ready", 90); await sleep(2500);
    await bl.js(`(() => { const s = document.createElement('style'); s.textContent = '.kf-fps, .kf-debug, .tb-speed, .kf-lowfps, .tut-root, [class*="tutorial"] { display: none !important; }'; document.head.appendChild(s); return 1; })()`);
    await audit('match');
    await bl.js(`keepfallScene.centerOnCastle(); keepfallScene.select({ kind: 'building', type: 'forge' }); 1`); await sleep(900); await audit('forge-window');
    await bl.js(`keepfallUi.windows.close(true); keepfallScene.select({ kind: 'building', type: 'farm' }); 1`); await sleep(900); await audit('farm-window');
    await bl.js(`keepfallUi.windows.close(true); document.querySelector('.kingdom-fab')?.click(); 1`); await sleep(900); await audit('kingdom-panel');
    await bl.js(`document.querySelector('.kingdom-panel .kd-x')?.click(); 1`);
    await bl.js(`(async () => { document.querySelector('[data-guide]')?.click(); return 1; })()`); await sleep(1500); await audit('guide');
    await bl.js(`document.querySelector('.guide-close, [data-act=close]')?.click(); 1`);
    await bl.js(`document.querySelector('[data-settings]')?.click(); 1`); await sleep(900); await audit('settings');
    await bl.js(`document.querySelector('.settings-overlay [data-act=close]')?.click(); 1`);
    await bl.js(`(() => { const s = document.createElement('style'); s.textContent = '#kingdom-decree, .kf-diag, body > pre, body > div[style*="9999"], .guide-overlay { display: none !important; }'; document.head.appendChild(s); return 1; })()`);
    // a battle at a rival's gate (the same staging as the Steam pictures), for the picture
    if (SHOT) {
      await bl.js(`(async () => {
        const s = keepfallScene, { RegionDisplay } = await import('/src/scene/RegionDisplay.ts'), { toWorld } = await import('/src/scene/world.ts'), A = await import('/src/scene/assets.ts');
        await new Promise((r) => A.loadSpectatorAssets(s, s.otherColors, r));
        for (const r of s.layout.regions) { if (r.seat === s.mySeat || r.seat === null) continue; const d = new RegionDisplay(s, s.labels, r.seat, toWorld(r.origin), r.color || 'red', s.color); d.sync({ seat: r.seat, buildings: s.state.buildings.map((x) => ({ ...x, level: 3, upgradeRemaining: null })), jobs: [], units: [], eliminated: false }); }
        s.fog.draw = () => {}; s.fog.setVisible(false);
        const now = s.gameNow().now, mk = (side) => ({ seat: side[0], color: side[1], name: side[2], attacker: side[3], soldiers: Array.from({ length: side[4] }, (_, i) => ({ unitId: i % 4 === 0 ? 'okcu' : i % 4 === 1 ? 'mizrakci' : 'kilicli', row: i % 4 === 0 ? 'second' : 'first' })) });
        const region = s.layout.regions.find((r) => r.seat !== s.mySeat && r.seat !== null);
        const gate = region.gate ?? { x: region.origin.x + region.width / 2, y: region.origin.y + region.height };
        const hits = [], deaths = [];
        for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 14 + ((i + t) % 10)); hits.push(t * 2, 14 + i, (i + t) % 6); }
        s.playBattle({ id: 'la1', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60, sides: [mk([s.mySeat, 'blue', 'Eren', true, 16]), mk([region.seat, 'red', 'Bot', false, 12])], hits, deaths, advances: [], winner: 'attacker' });
        s.cameras.main.removeBounds?.(); s.cameras.main.setZoom(1.6); s.lookAt(gate); return 1; })()`);
      await sleep(3500); await shot('battle', 1920, 1080);
    }
    await bl.js(`keepfallNet.leaveRoom?.(); 1`);
  } catch (e) { row.error = String(e.message ?? e).slice(0, 200); }
  bl.close();
  return row;
};
for (const l of langs) { const row = await run(l); results.push(row); const n = Object.values(row.screens).reduce((a, x) => a + x.length, 0); console.log(l, n, 'problems', row.error ?? ''); }

// the report: a problem that English has too is the design as it is; what counts is what a language adds to it
const SCREENS = ['home', 'lobby', 'match', 'forge-window', 'farm-window', 'kingdom-panel', 'guide', 'settings'];
const base = results.find((r) => r.lang === 'en');
const key = (x) => x.kind + '|' + x.el;
const baseKeys = (scr) => new Set((base?.screens[scr] ?? []).map(key));
const fresh = (r, scr) => (r.screens[scr] ?? []).filter((x) => r.lang === 'en' || !baseKeys(scr).has(key(x)));
const lines = ['# Dil yerleşim denetimi (masaüstü ' + W + 'x' + H + ')', '', 'Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).', '', '| Dil | ' + SCREENS.join(' | ') + ' |', '|---|' + '---|'.repeat(SCREENS.length)];
for (const r of results) lines.push(`| ${r.lang}${r.lang === 'en' ? ' (taban)' : ''}${r.error ? ' (hata: ' + r.error + ')' : ''} | ` + SCREENS.map((sc) => (r.screens[sc] ? fresh(r, sc).length : '–')).join(' | ') + ' |');
lines.push('', '## Ayrıntı (dilin eklediği)', '');
for (const r of results) for (const sc of SCREENS) { const list = fresh(r, sc); if (list.length && r.lang !== 'en') { lines.push(`### ${r.lang} · ${sc}`); for (const x of list.slice(0, 14)) lines.push(`- ${x.kind}: \`${x.el}\` "${x.text}" ` + (x.box ? `kutu ${x.box.join('x')} içerik ${x.content.join('x')}` : `konum ${x.rect.join(',')}`)); if (list.length > 14) lines.push(`- … ${list.length - 14} tane daha`); lines.push(''); } }
writeFileSync(MD, lines.join('\r\n'), 'utf8');
console.log('wrote', MD);
process.exit(0);
