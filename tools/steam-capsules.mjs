// Steam store capsule art DRAFTS (two options for each size), made only of the game's own pictures: real scenes of the game (headless Chrome, dev hooks, no interface) and the game's own
// logo (the Tiny Swords castle + the Pixelify word, drawn by the home screen). No text besides the logo (Steam's capsule rule). Output: art/steam/capsule/ (not committed: it holds Tiny Swords art).
// Needs the dev server (5081) and the Vite dev client (5174). Usage: node tools/steam-capsules.mjs [--skip-capture]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const OUT = resolve('art/steam/capsule');
mkdirSync(OUT, { recursive: true });
const SKIP = process.argv.includes('--skip-capture');
const URL = 'http://localhost:5174/';

if (!SKIP) {
  // ---- the logo, from the home screen, on a transparent background ------------------------------------------------------------------------------------------------------------
  {
    const b = await launch({ width: 1400, height: 900, dpr: 3 });
    await b.goto(URL); await b.waitFor("document.querySelector('.kf-logo')", 40);
    await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    // only a copy of the logo is left on the page (inside a .screen, so that the home screen's own rules for it apply), over nothing at all
    await b.js(`(() => { const logo = document.querySelector('.kf-logo').outerHTML; document.body.innerHTML = '<div class="screen" id="only" style="position:fixed;left:40px;top:40px;margin:0;max-width:none;width:auto;padding:0;background:none;border:0;box-shadow:none">' + logo + '</div>';
      const s = document.createElement('style'); s.textContent = 'html, body { background: transparent !important; } body::before, body::after, html::before, html::after { display: none !important; } #only .kf-logo { margin: 0 !important; } #only .kf-logo-word { font-size: 150px !important; } #only .kf-logo-castle { width: 230px !important; height: auto !important; image-rendering: pixelated; }'; document.head.appendChild(s); return 1; })()`);
    await sleep(800);
    const rect = JSON.parse(await b.js(`JSON.stringify((() => { const r = document.querySelector('#only .kf-logo').getBoundingClientRect(); return { x: r.x - 16, y: r.y - 16, width: r.width + 32, height: r.height + 32 }; })())`));
    const shotClip = async (file, clip) => { const r = await b.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, fromSurface: true, captureBeyondViewport: true }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); };
    await shotClip(`${OUT}/_logo-stacked.png`, rect);
    // the word alone (for the small capsules)
    await b.js(`document.querySelector('.kf-logo-castle').style.display = 'none'; 1`); await sleep(300);
    const r2 = JSON.parse(await b.js(`JSON.stringify((() => { const r = document.querySelector('#only .kf-logo').getBoundingClientRect(); return { x: r.x - 16, y: r.y - 16, width: r.width + 32, height: r.height + 32 }; })())`));
    await shotClip(`${OUT}/_logo-word.png`, r2);
    b.close();
  }

  // ---- two scenes without any interface, at 3840x2160 (1920x1080 at 2x) ---------------------------------------------------------------------------------------------------------------
  {
    const b = await launch({ width: 1920, height: 1080, dpr: 2, init: "try{localStorage.setItem('keepfall_name','Eren')}catch(e){}" });
    await b.goto(URL + '?fx=0'); await b.waitFor("document.querySelector('#quick')", 40);
    await b.js(`(async () => { const n = keepfallNet; let r = await n.createRoom('Eren'); for (const l of ['medium', 'easy', 'medium']) await n.addBot(l); await n.setGuided(true); await n.setReady(true); r = await n.startMatch(); return r.ok; })()`);
    await b.waitFor("document.documentElement.classList.contains('in-game') && !!keepfallScene.state && keepfallScene.ready", 90);
    await sleep(2500);
    await b.js(`(() => { const s = document.createElement('style'); s.textContent = '.ui-root, .notes, .kf-fps, body > pre, body > div[style*="9999"], .tb-speed, #kingdom-decree, .kf-lowfps, .siege-focus { display: none !important; }'; document.head.appendChild(s); return 1; })()`);
    const shot = async (name) => { await sleep(1000); await b.shot(`${OUT}/${name}.png`); console.log('saved', name); };
    // scene A: our castle with every building at level 4, fog off
    await b.js(`(async () => { const s = keepfallScene; const o = s.setState.bind(s); s.setState = (st) => o({ ...st, buildings: st.buildings.map((x) => ({ ...x, level: 4, upgradeRemaining: null })) }); s.setState(s.state);
      s.fog.draw = () => {}; s.fog.setVisible(false); s.cameras.main.removeBounds?.(); s.centerOnCastle(); s.cameras.main.setZoom(1.25); return 1; })()`);
    await shot('_bg-castle');
    // scene B: a siege at a rival's gate (the other regions drawn as a spectator sees them)
    await b.js(`(async () => {
      const s = keepfallScene, { RegionDisplay } = await import('/src/scene/RegionDisplay.ts'), { toWorld } = await import('/src/scene/world.ts'), A = await import('/src/scene/assets.ts');
      await new Promise((r) => A.loadSpectatorAssets(s, s.otherColors, r));
      for (const r of s.layout.regions) { if (r.seat === s.mySeat || r.seat === null) continue; const d = new RegionDisplay(s, s.labels, r.seat, toWorld(r.origin), r.color || 'red', s.color);
        d.sync({ seat: r.seat, buildings: s.state.buildings.map((x) => ({ ...x, level: 3, upgradeRemaining: null })), jobs: [], units: [], eliminated: false }); }
      const now = s.gameNow().now, mk = (side) => ({ seat: side[0], color: side[1], name: side[2], attacker: side[3], soldiers: Array.from({ length: side[4] }, (_, i) => ({ unitId: i % 4 === 0 ? 'okcu' : i % 4 === 1 ? 'mizrakci' : 'kilicli', row: i % 4 === 0 ? 'second' : 'first' })) });
      const region = s.layout.regions.find((r) => r.seat !== s.mySeat && r.seat !== null);
      const gate = region.gate ?? { x: region.origin.x + region.width / 2, y: region.origin.y + region.height };
      const hits = [], deaths = [];
      for (let t = 1; t < 60; t++) for (let i = 0; i < 6; i++) { hits.push(t * 2, i, 14 + ((i + t) % 10)); hits.push(t * 2, 14 + i, (i + t) % 6); }
      deaths.push(30, 2, 34, 15, 40, 1, 48, 17);
      s.playBattle({ id: 'cap1', kind: 'siege', at: gate, facing: { x: 0, y: -1 }, startedAt: now, playback: 1, tickSeconds: 0.5, ticks: 120, fightSeconds: 60,
        sides: [mk([s.mySeat, 'blue', 'Eren', true, 16]), mk([region.seat, 'red', 'Bot', false, 12])], hits, deaths, advances: [], winner: 'attacker' });
      s.cameras.main.removeBounds?.(); s.cameras.main.setZoom(1.7); s.lookAt(gate); return 1; })()`);
    await sleep(3500);
    await shot('_bg-siege');
    b.close();
  }
}

// ---- compose: every size, two options -------------------------------------------------------------------------------------------------------------------------------------------
const SIZES = [
  { id: 'header-920x430', w: 920, h: 430, logo: 'word', lw: 0.62, pos: ['50%', '73%'] },
  { id: 'small-462x174', w: 462, h: 174, logo: 'word', lw: 0.78, pos: ['50%', '56%'] },
  { id: 'main-1232x706', w: 1232, h: 706, logo: 'word', lw: 0.58, pos: ['50%', '74%'] },
  { id: 'vertical-748x896', w: 748, h: 896, logo: 'word', lw: 0.88, pos: ['50%', '82%'] },
  { id: 'library-capsule-600x900', w: 600, h: 900, logo: 'word', lw: 0.9, pos: ['50%', '82%'] },
  { id: 'library-hero-3840x1240', w: 3840, h: 1240, logo: null, lw: 0, pos: null },
];
const OPTS = [
  { id: 'a-siege', bg: '_bg-siege.png', focus: '50% 52%' },
  { id: 'b-castle', bg: '_bg-castle.png', focus: '50% 48%' },
];
const html = (size, opt) => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: #000; } .cap { position: relative; width: ${size.w}px; height: ${size.h}px; overflow: hidden; }
  .bg { position: absolute; inset: 0; background: url('${pathToFileURL(`${OUT}/${opt.bg}`).href}') ${opt.focus} / cover no-repeat; image-rendering: auto; }
  .shade { position: absolute; inset: 0; background: ${size.logo ? 'radial-gradient(ellipse at 50% 50%, rgba(8,14,24,.50) 0%, rgba(8,14,24,.18) 48%, rgba(8,14,24,.36) 100%), linear-gradient(to bottom, rgba(8,14,24,.28), rgba(8,14,24,0) 30%, rgba(8,14,24,0) 66%, rgba(8,14,24,.46))' : 'linear-gradient(to bottom, rgba(8,14,24,.10), rgba(8,14,24,0) 30%, rgba(8,14,24,0) 70%, rgba(8,14,24,.22))'}; }
  .logo { position: absolute; left: ${size.pos?.[0] ?? '50%'}; top: ${size.pos?.[1] ?? '50%'}; width: ${size.lw * 100}%; height: auto; transform: translate(-50%, -50%); filter: drop-shadow(0 4px 0 rgba(30,16,6,.75)) drop-shadow(0 0 18px rgba(0,0,0,.55)); image-rendering: auto; }
</style><div class="cap"><div class="bg"></div><div class="shade"></div>${size.logo ? `<img class="logo" src="${pathToFileURL(`${OUT}/_logo-${size.logo}.png`).href}">` : ''}</div>`;

const b = await launch({ width: 920, height: 430, dpr: 1 });
const results = [];
for (const size of SIZES) for (const opt of OPTS) {
  const file = `${OUT}/_page.html`; writeFileSync(file, html(size, opt));
  await b.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false });
  await b.send('Page.navigate', { url: pathToFileURL(file).href }); await sleep(1200);
  const name = `${size.id}-${opt.id}.png`;
  await b.shot(`${OUT}/${name}`); results.push({ size, opt, name }); console.log('saved', name);
}
// the library logo: the transparent logo alone on a 1280x720 canvas (the Library draws it over the hero)
{
  const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}.c{width:1280px;height:720px;display:flex;align-items:center;justify-content:center}img{max-width:1100px;max-height:620px;filter:drop-shadow(0 4px 0 rgba(30,16,6,.75))}</style><div class="c"><img src="${pathToFileURL(`${OUT}/_logo-stacked.png`).href}"></div>`;
  const file = `${OUT}/_page.html`; writeFileSync(file, page);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await b.send('Page.navigate', { url: pathToFileURL(file).href }); await sleep(1200);
  const r = await b.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(`${OUT}/library-logo-1280x720.png`, Buffer.from(r.result.data, 'base64')); console.log('saved library-logo-1280x720.png');
}
b.close();

// ---- one page to compare them --------------------------------------------------------------------------------------------------------------------------------------------------
const cmp = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 24px; background: #1d232d; color: #e8edf5; font: 14px/1.3 system-ui, sans-serif; width: 1900px; }
  h1 { font-size: 20px; margin: 0 0 14px; } h2 { font-size: 15px; margin: 22px 0 8px; color: #9fb4d0; font-weight: 600; }
  .row { display: flex; gap: 24px; align-items: flex-start; } .row figure { margin: 0; } figcaption { margin-top: 4px; color: #9fb4d0; font-size: 12px; }
  img { display: block; border: 1px solid #3a4658; background: #0e1218; } .tr { background: repeating-conic-gradient(#2a3140 0% 25%, #202632 0% 50%) 50% / 24px 24px; }
</style><h1>Keepfall — Steam capsule drafts (2 options per size; game's own pictures only; no AI art)</h1>
${SIZES.map((sz) => `<h2>${sz.id}</h2><div class="row">${OPTS.map((o) => { const sc = Math.min(1, sz.w > 1500 ? 920 / sz.w : sz.h > 800 ? 0.62 : sz.w > 1000 ? 0.62 : 1); return `<figure><img src="${pathToFileURL(`${OUT}/${sz.id}-${o.id}.png`).href}" width="${Math.round(sz.w * sc)}"><figcaption>${o.id} (${sz.w}x${sz.h}${sc < 1 ? `, shown at ${Math.round(sc * 100)}%` : ''})</figcaption></figure>`; }).join('')}
  ${sz.id.startsWith('small') ? `<figure><img src="${pathToFileURL(`${OUT}/${sz.id}-a-siege.png`).href}" width="462"><figcaption>real size 1:1 (a) — the name must read here</figcaption></figure>` : ''}</div>`).join('')}
<h2>library-logo-1280x720 (transparent)</h2><div class="row"><figure><img class="tr" src="${pathToFileURL(`${OUT}/library-logo-1280x720.png`).href}" width="640"><figcaption>transparent PNG, 1280x720</figcaption></figure></div>`;
const cb = await launch({ width: 1950, height: 800, dpr: 1 });
writeFileSync(`${OUT}/_compare.html`, cmp);
await cb.send('Page.navigate', { url: pathToFileURL(`${OUT}/_compare.html`).href }); await sleep(2500);
const h = await cb.js('document.documentElement.scrollHeight');
await cb.send('Emulation.setDeviceMetricsOverride', { width: 1950, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(800);
await cb.shot(`${OUT}/comparison.png`); console.log('saved comparison.png', h);
cb.close();
process.exit(0);
