// Steam capsule scenes, staged ONE scene at a time (not a screenshot of a match): a burning castle gate, a blue army against a red one, the red King in front, and a faint
// "ghost" army behind the blue (the game's bluff). Few units, drawn big (camera zoom 3 at dpr 2 = 6 device pixels per art pixel, nearest-neighbour), no interface at all.
// Made only of the game's own sprites (Tiny Swords + Warfare, as the game draws them). Output: art/steam/capsule/_bg-hero-*.png (not committed).
// Needs the dev server (5081) and the Vite dev client (5174). Usage: node tools/steam-hero.mjs [--only a,b]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const OUT = resolve('art/steam/capsule');
mkdirSync(OUT, { recursive: true });
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const URL = 'http://localhost:5174/';

const b = await launch({ width: 1920, height: 1080, dpr: 2, init: "try{localStorage.setItem('keepfall_name','Eren');localStorage.setItem('keepfall_lang','en')}catch(e){}" });
await b.goto(URL + '?fx=1'); await b.waitFor("document.querySelector('#quick')", 40);
await b.js(`(async () => { const n = keepfallNet; let r = await n.createRoom('Eren'); for (const l of ['medium', 'easy', 'medium']) await n.addBot(l); await n.setGuided(true); await n.setReady(true); r = await n.startMatch(); return r.ok; })()`);
await b.waitFor("document.documentElement.classList.contains('in-game') && !!keepfallScene.state && keepfallScene.ready", 90);
await sleep(2500);
await b.js(`(() => { const s = document.createElement('style'); s.textContent = '.ui-root, .notes, .kf-fps, body > pre, body > div[style*="9999"], .tb-speed, #kingdom-decree, .kf-lowfps, .siege-focus, .kf-minimap, .minimap, .tut, [class*="tutorial"] { display: none !important; }'; document.head.appendChild(s); return 1; })()`);

// the stage: the rival's castle drawn as a spectator sees it, fog off, everything the castle owner has at level 3
const info = await b.js(`(async () => {
  const s = keepfallScene, { RegionDisplay } = await import('/src/scene/RegionDisplay.ts'), { toWorld } = await import('/src/scene/world.ts'), A = await import('/src/scene/assets.ts');
  await new Promise((r) => A.loadSpectatorAssets(s, Array.from(new Set([...s.otherColors, 'red', 'blue'])), r));
  s.fog.draw = () => {}; s.fog.setVisible(false); s.cameras.main.removeBounds?.();
  const region = s.layout.regions.find((r) => r.seat !== s.mySeat && r.seat !== null && r.color === 'red') ?? s.layout.regions.find((r) => r.seat !== s.mySeat && r.seat !== null);
  const d = new RegionDisplay(s, s.labels, region.seat, toWorld(region.origin), region.color || 'red', s.color);
  d.sync({ seat: region.seat, buildings: s.state.buildings.map((x) => ({ ...x, level: 3, upgradeRemaining: null })), jobs: [], units: [], eliminated: false });
  const img = s.otherCastles.get(region.seat).image;
  const rl = s.regions?.get?.(region.seat)?.lord; rl?.debugSprite?.().setVisible(false);
    for (const o of s.children.list) { const k = o.texture?.key ?? ''; if (/sheep|Sheep|bush|Bush/.test(k)) o.setVisible(false); }
  window.__hero = { seat: region.seat, x: img.x, y: img.y, mine: s.color, theirs: region.color };
  return JSON.stringify({ x: img.x, y: img.y, mine: s.color, theirs: region.color, w: img.displayWidth, h: img.displayHeight });
})()`);
console.log('stage', info);

await b.js(`(async () => { const s = keepfallScene; if (!s.textures.exists('fire3')) { await new Promise((r) => { s.load.spritesheet('fire3', '/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/Particle%20FX/Fire_03.png', { frameWidth: 64, frameHeight: 64 }); s.load.once('complete', r); s.load.start(); }); } return s.textures.get('fire3').frameTotal; })()`).then((n) => console.log('fire3 frames', n));
// helper: one sprite in a colour ('blue' | 'red'), looking left or right
await b.js(`window.__fire = (x, y, sc) => { const s = keepfallScene; for (const [f, k, dx, dy] of [[7, 1.3, 0, -46], [5, 1.15, 4, -28], [4, 1.0, -6, -14], [3, 0.8, 8, -4], [2, 0.55, -2, 4]]) s.add.sprite(x + dx * sc, y + dy * sc, 'fire3', f).setScale(sc * k).setOrigin(0.5, 0.85).setDepth(y + 600); };
window.__add = (color, key, x, y, flip, scale, alpha = 1, tint = null, frame = null) => {
  const s = keepfallScene, own = s.color; const k = color === own ? key : color + '-' + key;
  if (alpha === 1) s.add.ellipse(x, y + 4, 62 * scale / 0.55, 16 * scale / 0.55, color === 'red' ? 0xd23a30 : 0x3a78e0, 0.26).setDepth(y - 1).setData('hero', 1);
  const sp = s.add.sprite(x, y, s.textures.exists(k) ? k : key).setScale(scale).setOrigin(0.5, 0.78).setDepth(y).setFlipX(flip).setAlpha(alpha);
  sp.setData('hero', 1); if (tint) sp.setTint(tint);
  if (frame !== null) sp.setFrame(frame); else try { sp.play({ key: s.anims.exists(k) ? k : key }); } catch (e) { /* single-frame sheets */ }
  return sp;
}; 1`);

const shot = async (name) => { await sleep(1400); await b.shot(`${OUT}/_bg-hero-${name}.png`); console.log('saved', name); };
const want = (n) => !only.length || only.includes(n);

if (process.env.FRAMES) {
  await b.js(`(() => { const s = keepfallScene, { x, y } = window.__hero; s.children.list.forEach((o) => { if (o.setVisible && !o.getData?.('hero')) {} });
    let row = 0; for (const [k, n] of [['lord-attack', 12], ['swordsman-attack', 16], ['lancer-attack', 9]]) { for (let f = 0; f < n; f++) { const sp = s.add.sprite(x - 520 + (f % 8) * 120, y + 200 + (row + Math.floor(f / 8)) * 130, 'red-' + k, f).setScale(0.6).setDepth(99999).setData('hero', 1); s.add.text(sp.x - 10, sp.y + 40, String(f), { color: '#fff', backgroundColor: '#000', fontSize: '20px' }).setDepth(100000); } row += 2; }
    s.cameras.main.setZoom(1.5); s.cameras.main.centerOn(x, y + 400); return 1; })()`);
  await shot('frames'); process.exit(0);
}
// ---- scene 1: the clash at the burning gate ----------------------------------------------------------------------------------------------------
if (want('gate')) {
  await b.js(`(() => { const s = keepfallScene, { x, y } = window.__hero, A = window.__add;
    // the castle burns: the Tiny Swords fire effect (Particle FX/Fire_03, single frames stacked into a flame) on the towers, the roof and the doorway
    for (const [dx, dy, sc] of [[-100, -140, 1.2], [112, -150, 1.3], [-4, -100, 0.9], [-26, -58, 0.8]]) window.__fire(x + dx, y + dy, sc);
    for (const o of s.children.list) if (/lord/.test(o.texture?.key ?? '') && !o.getData?.('hero')) o.setVisible(false);
    const gy = y + 58;
    // the bluff: a faint blue ghost army (semi-transparent, blue, with a thin light outline) behind the blue one
    const ghost = (gx, gyy) => { for (const [ox, oy] of [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]]) s.add.sprite(gx + ox, gyy + oy, 'swordsman-run', 2).setScale(0.62).setOrigin(0.5, 0.78).setDepth(gyy - 2).setAlpha(0.38).setTint(0xe6f6ff).setData('hero', 1);
      s.add.sprite(gx, gyy, 'swordsman-run', 2).setScale(0.62).setOrigin(0.5, 0.78).setDepth(gyy - 1).setAlpha(0.45).setTint(0x4f9bff).setData('hero', 1); };
    for (const [dx, dy] of [[-235, -55], [-290, -5], [-245, 55], [-335, 40]]) ghost(x + dx, gy + dy);
    // the red side (defenders): the King in front of the gate with two swordsmen (frames without the big swing trail)
    A('red', 'lord-attack', x + 10, gy + 6, true, 0.78, 1, null, 5);
    A('red', 'swordsman-attack', x + 118, gy + 34, true, 0.62, 1, null, 4);
    A('red', 'swordsman-attack', x + 92, gy - 40, true, 0.62, 1, null, 3);
    // the blue side (attackers) from the left
    A('blue', 'swordsman-attack', x - 98, gy + 28, false, 0.62, 1, null, 6);
    A('blue', 'lancer-attack', x - 160, gy - 30, false, 0.7, 1, null, 3);
    A('blue', 'swordsman-attack', x - 150, gy + 70, false, 0.62, 1, null, 4);
    s.cameras.main.setZoom(3.6); s.cameras.main.centerOn(x - 40, y - 5); return 1; })()`);
  await shot('gate');
}
// ---- scene 2: the same moment, the King close in front, the blue wave coming in behind him ----------------------------------------------------------
if (want('king')) {
  await b.js(`(() => { const s = keepfallScene, { x, y } = window.__hero; s.cameras.main.setZoom(3.6); s.cameras.main.centerOn(x + 14, y + 36); return 1; })()`);
  await shot('king');
}
await b.close?.();
process.exit(0);
