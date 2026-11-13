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
const URL = (process.env.URL ?? 'http://localhost:5174').replace(/\/?$/, '/');
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
    // a raw unit / kingdom id printed for the player ("kesis, suvari"): every name must come through the translation, in every language, English too
    { const raw = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').match(/\\b(kilicli|mizrakci|kalkanli|okcu|kesis|mancinik|suvari|golge|tuccar|kahin|entrikaci|lumberCamp)\\b/); if (raw) out.push({ kind: 'raw-id', el: name(e), text: e.textContent.trim().slice(0, 50), id: raw[1] }); }
    const cs = getComputedStyle(e);
    const clipX = e.scrollWidth > e.clientWidth + 2 && (/(hidden|clip|auto|scroll)/.test(cs.overflowX) || cs.whiteSpace === 'nowrap');
    const clipY = e.scrollHeight > e.clientHeight + 3 && /(hidden|clip)/.test(cs.overflowY);
    if (clipX || clipY) out.push({ kind: 'clipped', el: name(e), text: e.textContent.trim().slice(0, 50), box: [e.clientWidth, e.clientHeight], content: [e.scrollWidth, e.scrollHeight] });
    // a word split across two lines (the box was too narrow for it and the text broke in the middle of the word, or at a hyphen the browser added): the last letter on the next line.
    // (Chinese / Japanese have no spaces: a line may end anywhere there, so those words are skipped.)
    for (const n of e.childNodes) {
      if (n.nodeType !== 3) continue;
      for (const m of n.textContent.matchAll(/[^\\s]{3,}/g)) {
        if (/[-\\u2013\\u2014/]/.test(m[0])) continue; // (a line may end after a hyphen, a dash or a slash: that is not a split word)
        if (/[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]/.test(m[0])) continue;
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const rects = [...rg.getClientRects()].filter((q) => q.width > 1);
        if (rects.length > 1 && rects[rects.length - 1].top - rects[0].top > rects[0].height * 0.6) { out.push({ kind: 'word-split', el: name(e), text: m[0], rect: [rects[0].left | 0, rects[0].top | 0, rects[0].right | 0, rects[0].bottom | 0] }); break; }
      }
    }
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
    // counted texts: "1 village" / "5 villages" in every language (the plural marker of the dictionary), no leftover braces or bars, and, where the language has plural forms, a different
    // text for 1 and for 5 (a text that reads the same for both is the "at least 1 villages" mistake)
    row.screens['plural'] = JSON.parse(await bl.js(`(async () => { const { t, lang } = await import('/src/i18n/index.ts'); const KEYS = ["En çok {0} asker kaybet", "En çok {0} savaş kaybet", "En az {0} savaş kazan", "En az {0} kale düşür", "En az {0} düşman öldür", "En az {0} köy yağmala", "En az {0} haydut kampı temizle", "En az {0} sandık al", "En az {0} gözcü gönder", "En az {0} gözcü raporu al", "En az {0} ulak ulaştır", "En az {0} hayalet ordu gönder", "En az {0} askere rüşvet ver", "En az {0} haydut kampı kirala", "Kılık değiştirerek en az {0} kez gönder", "{0} yıldız kazandın.", "Gözcün döndü: {0} raporu", "En az {0} oyuncu gerekiyor. Oda kodunu paylaş.", "En az {0} oyuncu gerekiyor (botlar da sayılır).", "Hayalet ordu en fazla {0} kişilik olabilir.", "Aynı anda en fazla {0} hayalet ordu yürüyebilir.", "Savaşa en az {1} asker lazım ({0}/{1}): demirhaneye tıkla, silah sırala."]; const out = [];
      const FORMS = ['zh-CN', 'zh-TW', 'ja', 'ko', 'tr'].includes(lang) ? 0 : 1;
      for (const k of KEYS) {
        for (const n of [0, 1, 2, 5, 11, 21, 22]) { const s = t(k, n, n); if (/[{}|]|undefined/.test(s)) out.push({ kind: 'plural', el: 'n=' + n, text: s.slice(0, 80) }); }
        const strip = (s) => s.replace(/\\d+/g, 'N');
        if (FORMS && strip(t(k, 1, 1)) === strip(t(k, 5, 5)) && !/^Zum Start|Banditenlager|Späher|Boten|-mal|au moins 1 fois/.test(t(k, 1, 1)) /* nouns that do not change */) out.push({ kind: 'plural', el: '1 = 5', text: t(k, 1, 1).slice(0, 80) });
      }
      return JSON.stringify(out); })()`));
    await bl.js(`(async () => { const n = keepfallNet; await n.createRoom('Eren'); for (const l of ['medium', 'easy', 'hard']) await n.addBot(l); return 1; })()`);
    await bl.waitFor("document.querySelector('.screen.lobby')", 20); await sleep(1200);
    await audit('lobby'); await shot('lobby', 1920, 1080);
    await bl.js(`(async () => { const n = keepfallNet; await n.setGuided(true); await n.setReady(true); const r = await n.startMatch(); return r.ok; })()`);
    await bl.waitFor("document.documentElement.classList.contains('in-game') && !!keepfallScene.state && keepfallScene.ready", 90); await sleep(2500);
    await bl.js(`(() => { const s = document.createElement('style'); s.textContent = '.kf-fps, .kf-debug, .tb-speed, .kf-lowfps, .tut-root, [class*="tutorial"] { display: none !important; }'; document.head.appendChild(s); return 1; })()`);
    await audit('match');
    await bl.js(`keepfallScene.centerOnCastle(); keepfallScene.select({ kind: 'building', type: 'forge' }); 1`); await sleep(900); await audit('forge-window');
    // the castle window with each of its four tabs (Soldiers / Hire / Growth / Defence): the tab row is where a narrow box splits a word
    await bl.js(`keepfallUi.windows.close(true); keepfallScene.select({ kind: 'castle' }); 1`); await sleep(900);
    for (const [i, nm] of ['soldiers', 'hire', 'growth', 'defense'].entries()) { await bl.js(`document.querySelectorAll('.win .tab')[${i}]?.click(); 1`); await sleep(400); await audit('castle-' + nm); }
    await bl.js(`keepfallUi.windows.close(true); keepfallScene.select({ kind: 'building', type: 'farm' }); 1`); await sleep(900); await audit('farm-window');
    await bl.js(`keepfallUi.windows.close(true); document.querySelector('.kingdom-fab')?.click(); 1`); await sleep(900); await audit('kingdom-panel');
    // the Oracle's panel with a rival whose deck holds units ours does not: their names must be words, not ids
    await bl.js(`(() => { const k = keepfallUi.kingdom, c = k.castle; const cat = c.kingdom.catalog.find((x) => x.id === 'kahin'); if (!cat) return 0; k.update = () => {}; k.setMap = () => {};
      const fake = { ...c.kingdom, id: 'kahin', look: cat.look }; k.castle = { ...c, units: c.units.filter((u) => !['kesis', 'suvari'].includes(u.id)), kingdom: fake, rivals: [{ seat: 9, faction: 'golge', deck: ['kesis', 'suvari', 'mancinik', 'kalkanli'] }] };
      k.build(fake, k.castle); k.refreshDynamic(fake, k.castle); k.panel.classList.remove('hidden'); document.querySelectorAll('.kd-tile').forEach((t) => t.dataset.tile === '1' && t.click()); return 1; })()`); await sleep(500); await audit('oracle-deck');
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
const SCREENS = ['home', 'lobby', 'match', 'forge-window', 'castle-soldiers', 'castle-hire', 'castle-growth', 'castle-defense', 'farm-window', 'kingdom-panel', 'oracle-deck', 'guide', 'settings', 'plural'];
const base = results.find((r) => r.lang === 'en');
const key = (x) => x.kind + '|' + x.el;
const baseKeys = (scr) => new Set((base?.screens[scr] ?? []).map(key));
const fresh = (r, scr) => (r.screens[scr] ?? []).filter((x) => x.kind === 'raw-id' || x.kind === 'word-split' || x.kind === 'plural' || r.lang === 'en' || !baseKeys(scr).has(key(x))); // (a raw id is never "the design as it is")
const lines = ['# Dil yerleşim denetimi (masaüstü ' + W + 'x' + H + ')', '', 'Otomatik: `node tools/lang-audit.mjs`. Sayılar: İngilizcede olmayan, o dilin eklediği taşma/kırpılma sayısı (kutuya sığmayan metin, üst kutu tarafından kesilen öğe, ekran dışı). İngilizcenin kendi sayıları tasarım tabanı olarak ayrı satırdadır. Ekran görüntüleri `art/shots/langs/` (git dışı).', '', '| Dil | ' + SCREENS.join(' | ') + ' |', '|---|' + '---|'.repeat(SCREENS.length)];
for (const r of results) lines.push(`| ${r.lang}${r.lang === 'en' ? ' (taban)' : ''}${r.error ? ' (hata: ' + r.error + ')' : ''} | ` + SCREENS.map((sc) => (r.screens[sc] ? fresh(r, sc).length : '–')).join(' | ') + ' |');
lines.push('', '## Ayrıntı (dilin eklediği)', '');
for (const r of results) for (const sc of SCREENS) { const list = fresh(r, sc); if (list.length && r.lang !== 'en') { lines.push(`### ${r.lang} · ${sc}`); for (const x of list.slice(0, 14)) lines.push(`- ${x.kind}: \`${x.el}\` "${x.text}" ` + (x.kind === 'plural' ? `çoğul: ${x.el}` : x.kind === 'word-split' ? `bölünen kelime` : x.id ? `ham kimlik: ${x.id}` : x.box ? `kutu ${x.box.join('x')} içerik ${x.content.join('x')}` : `konum ${x.rect.join(',')}`)); if (list.length > 14) lines.push(`- … ${list.length - 14} tane daha`); lines.push(''); } }
writeFileSync(MD, lines.join('\r\n'), 'utf8');
console.log('wrote', MD);
process.exit(0);
