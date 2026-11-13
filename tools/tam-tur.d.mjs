// Stage D: the preparation phase: the four kingdoms' panels and abilities (a match each), then one filled-in match for everything else.
import { session, take, stage, startSolo, economy, castle, call, closeDecree, LANG, attempt } from './tam-tur-lib.mjs';

const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean); // e.g. ONLY=panels or ONLY=generic
const net = (s, m, ...a) => call(s, `window.keepfallNet.${m}(${a.map((x) => JSON.stringify(x)).join(',')})`);
const T = (s, key, ...a) => s.js(`import('/src/i18n/index.ts').then((m) => m.t(${JSON.stringify(key)}, ...${JSON.stringify(a)}))`);

// ability tiles in the order of the kingdom panel
const KINGDOMS = {
  golge: ['krallik-golge', ['yetenek-sahte-ordu', 'yetenek-sahte-rapor']],
  tuccar: ['krallik-tuccar', ['yetenek-rusvet', 'yetenek-kamp-kirala']],
  kahin: ['krallik-kahin', ['yetenek-rakipler', 'yetenek-sezgi']],
  entrikaci: ['krallik-entrikaci', ['yetenek-sahte-ulak', 'yetenek-kilik']],
};

async function kingdomPanels(id) {
  const s = await session({});
  try {
    await startSolo(s, { kingdom: id });
    const [panelSlug, abilitySlugs] = KINGDOMS[id];
    await s.sleep(1500);
    await s.click('.kingdom-fab'); await s.sleep(900);
    await take(s, panelSlug, async () => { await s.click('.kd-tile[data-tile="0"]'); await s.sleep(500); return s.exists('.kingdom-panel:not(.hidden)'); });
    for (let i = 0; i < abilitySlugs.length; i++) {
      await take(s, abilitySlugs[i], async () => {
        await s.click(`.kd-tile[data-tile="${i}"]`); await s.sleep(500);
        if (id === 'golge' && i === 0) await s.b.js(`document.querySelector('.kingdom-panel [data-f="decoy-target"]')?.dispatchEvent(new Event('change', { bubbles: true })); 1`);
        return s.exists('.kingdom-panel:not(.hidden) .kd-pane:not(.hidden)');
      });
    }
  } finally { s.close(); }
}

stage('D', async () => {
  if (!ONLY.length || ONLY.includes('panels') || ONLY.includes('entrikaci')) for (const id of Object.keys(KINGDOMS).filter((k) => !ONLY.includes('entrikaci') || k === 'entrikaci')) { await attempt('panel ' + id, () => kingdomPanels(id)); }
  if (!ONLY.length || ONLY.includes('generic')) await attempt('generic', generic);
});

async function generic() {
  const s = await session({});
  try {
    await startSolo(s, { kingdom: null });
    await s.sleep(1500);
    await take(s, 'hazirlik-genel');
    // the economy: workers, weapons, soldiers, upgrades; time at x5
    // scouting while the economy runs: the quarters of the forest one after the other (sites appear), then a rival (a report)
    const quarters = JSON.parse(await s.js(`JSON.stringify(keepfallUi.castle.scouting.quarters.map((q) => q.corner ?? q.id ?? q.quarter))`));
    const me0 = await s.js(`keepfallUi.mySeat ?? keepfallUi.seat ?? 0`);
    const rivals0 = JSON.parse(await s.js(`JSON.stringify(keepfallUi.room.players.map((p) => p.seat))`)).filter((x) => x !== me0);
    let qi = 0, scoutedRival = false;
    const hook = async (c, step) => {
      if (c.scouting.scoutsAway > 0 || c.scouting.locked) return;
      if (qi < 2) { const r = await net(s, 'sendExplore', quarters[qi], 'farmer'); if (r.ok) qi++; return; }
      if (!scoutedRival && c.elapsedSeconds > 100) { const r = await net(s, 'sendScout', rivals0[0], 'farmer'); if (r.ok) scoutedRival = true; }
    };
    const e = await economy(s, { untilSeconds: 255, soldiers: 8, hook });
    console.log('   economy:', JSON.stringify({ t: e.elapsedSeconds, soldiers: e.soldiers, pop: e.population, jobs: e.jobs.map((j) => j.job[0] + j.count).join('') }));
    await net(s, 'setSpeed', 1);
    await s.js(`keepfallUi.windows.close(); 1`); await s.sleep(600);
    await take(s, 'hazirlik-dolu');
    await take(s, 'mini-harita');
    await take(s, 'gorev-takibi', async () => { await s.js(`(() => { const q = document.querySelector('.quests'); if (q) { q.classList.remove('folded', 'hidden'); } return 1; })()`); return s.exists('.quests:not(.hidden)'); });

    // castle window, every tab
    const openWin = (target) => s.js(`keepfallUi.windows.close(); keepfallUi.open(${JSON.stringify(target)}); 1`).then(() => s.sleep(700));
    await openWin({ kind: 'castle' });
    for (const [tab, slug] of [['soldiers', 'kale-asker'], ['hire', 'kale-parali'], ['growth', 'kale-buyume'], ['defense', 'kale-savunma']])
      await take(s, slug, async () => { await s.click(`.win [data-tab="${tab}"]`); await s.sleep(500); return true; });
    // building windows
    for (const [type, slug] of [['farm', 'bina-tarla'], ['lumberCamp', 'bina-oduncu'], ['mine', 'bina-maden'], ['forge', 'bina-demirci']])
      await take(s, slug, async () => { await openWin({ kind: 'building', type }); return s.exists('.win'); });
    await s.js(`keepfallUi.windows.close(); 1`);

    // the rival: scout / envoy / attack tabs
    const room = JSON.parse(await s.js(`JSON.stringify(keepfallUi.room.players.filter((p) => p.seat !== ${JSON.stringify(0)}).map((p) => p.seat))`));
    const me = await s.js(`keepfallUi.mySeat ?? keepfallUi.seat ?? 0`);
    const rival = room.find((x) => x !== me) ?? room[0];
    await take(s, 'rakip-gozcu', async () => { await openWin({ kind: 'enemy', seat: rival }); await s.click('[data-tab-sec="scout"]'); await s.sleep(500); return s.exists('.win'); });
    await take(s, 'rakip-ulak', async () => { await s.click('[data-tab-sec="envoy"]'); await s.sleep(400);
      await s.b.js(`(() => { const m = document.querySelector('.win textarea, .win input[maxlength="140"], .win [data-f="env-msg"]'); if (m) { m.value = ${JSON.stringify(LANG === 'tr' ? 'Barış olsun, ittifak?' : 'Peace be with you, an alliance?')}; m.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
      await s.click('.win [data-act="more"]'); await s.click('.win [data-act="more"]'); await s.b.js(`document.querySelector('.win [data-act="envoy"]')?.scrollIntoView({ block: 'center' }); 1`); await s.sleep(400); return true; });
    await take(s, 'rakip-saldiri', async () => { await s.click('[data-tab-sec="attack"]'); await s.sleep(500); await s.click('.win [data-act="half"]'); await s.b.js(`document.querySelector('.win [data-act="send"]')?.scrollIntoView({ block: 'end' }); 1`); await s.sleep(500); return true; });
    await s.js(`keepfallUi.windows.close(); 1`);

    // the forest: scout a quarter, wait for the report and the sites
    const corner = JSON.parse(await s.js(`JSON.stringify(keepfallUi.castle.scouting.quarters.map((q) => q.corner ?? q.id ?? q.quarter))`));
    console.log('   quarters:', corner.join(','));
    await take(s, 'orman-paneli', async () => { await openWin({ kind: 'forest', id: corner[0] }); return s.exists('.win'); });
    await s.js(`keepfallUi.windows.close(); 1`);

    // the places of the forest found so far, one window per kind
    const sites = JSON.parse(await s.js(`JSON.stringify((keepfallScene.map?.sites ?? []).map((x) => ({ id: x.id, kind: x.kind, gone: x.gone })))`));
    console.log('   sites:', sites.map((x) => x.kind).join(','));
    for (const [kind, slug] of [['village', 'orman-koy'], ['camp', 'orman-kamp'], ['bigCamp', 'orman-buyuk-kamp'], ['chest', 'orman-sandik']]) {
      const hit = sites.find((x) => x.kind === kind && !x.gone) ?? sites.find((x) => x.kind === kind);
      await take(s, slug, async () => { if (!hit) throw new Error('this kind of place was not found by the scouts in the time given'); await openWin({ kind: 'site', id: hit.id }); return s.exists('.win'); });
    }
    await s.js(`keepfallUi.windows.close(); 1`);
    // the scout report (the rival's) and an incoming envoy's letter
    await take(s, 'gozcu-raporu', async () => { const r = await s.js(`(() => { const rep = keepfallUi.castle.scouting.reports[0]; if (!rep) return false; keepfallUi.reports.showScout(rep); return true; })()`); await s.sleep(800); return r; });
    await s.b.js(`document.querySelectorAll('.modal-shade, .report-pop, .scroll-pop').forEach((e) => e.querySelector('[data-close], .btn-round')?.click()); 1`); await s.sleep(500);
    await take(s, 'ulak-mesaji', async () => { await s.js(`(() => { const rival = keepfallUi.room.players.find((p) => p.seat !== (keepfallUi.mySeat ?? 0)); keepfallUi.reports.showLetter({ id: 9001, fromSeat: rival.seat, fromName: rival.name, fromColor: rival.color, at: 100, food: 20, wood: 15, iron: 0, gold: 10, message: ${JSON.stringify(LANG === 'tr' ? 'Gel, sınırımızda barışı konuşalım. Ordularını çek, sana altın yolluyorum.' : 'Come, let us talk peace at our border. Pull back your armies and I will send you gold.')}, fake: false, realSeat: null }); return 1; })()`); await s.sleep(800); return true; });
    await s.b.js(`document.querySelectorAll('.modal-shade, .report-pop, .scroll-pop').forEach((e) => e.querySelector('[data-close], .btn-round')?.click()); 1`); await s.sleep(500);

    // the notifications and the hunger strip (made up from the game's own texts)
    await s.js(`(async () => { const { t } = await import('/src/i18n/index.ts'); const n = keepfallUi.notes;
      n.push(t('+{0} altın kasaya girdi', 35), 'info', 60000); n.push(t('Gözcün döndü: {0} raporu', t('Kırmızı')), 'battle', 60000); n.push(t('Keşif bitti: ormanın bu bölgesindeki yerler haritada'), 'info', 60000);
      n.setSticky('hunger', true, t('Açlık! Yemek bitti, tüm üretim yarıya indi.')); const o = n.setSticky.bind(n); n.setSticky = (k, on, tx, kd) => k === 'hunger' ? o(k, true, tx || t('Açlık! Yemek bitti, tüm üretim yarıya indi.'), kd) : o(k, on, tx, kd); return 1; })()`);
    await s.sleep(900);
    await take(s, 'kitlik-uyarisi');
    await take(s, 'bildirimler');
    await s.js(`(() => { const n = keepfallUi.notes; n.setSticky = n.__proto__.setSticky; n.setSticky('hunger', false); return 1; })()`);
    await take(s, 'yardim', async () => { const ok = await s.click('.guide-btn, #help, [data-a="guide"], .help-btn, .topbar [title*="?"]'); await s.sleep(800); return ok && s.exists('.guide-overlay'); });
  } finally { s.close(); }
}
