// Screens as a phone shows them (touch + mobile emulation): home, lobby, the map with the castle / building / rival windows, settings, guide, and the portrait "rotate" screen.
// Usage: node tools/mobile-shots.mjs <out-prefix> [WxH=844x390] [http://localhost:5174]   (DPR=2 for a retina phone)
import { launch, sleep } from './cdp.mjs';
const OUT = process.argv[2] ?? 'mob';
const [W, H] = (process.argv[3] ?? '844x390').split('x').map(Number);
const URL = (process.argv[4] ?? 'http://localhost:5174').replace(/\/$/, '');
const PHONE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const b = await launch({ width: W, height: H, mobile: true, ua: PHONE, dpr: Number(process.env.DPR ?? 2) });
const tag = `${OUT}-${W}x${H}`;
try {
  await b.goto(URL + '/');
  await b.shot(`${tag}-1home.png`);
  await b.js("document.querySelector('#name').value='Aylin'; document.querySelector('#create').click(); 1");
  await b.waitFor("document.querySelector('.lobby')", 20);
  await sleep(1500);
  await b.shot(`${tag}-2lobby.png`);
  await b.js("(async()=>{const n=keepfallNet; for (const l of ['easy','medium','hard']) await n.addBot(l); await n.setReady(true); return 1})()");
  await sleep(800);
  await b.js("document.querySelector('#start').click(); 1");
  await b.waitFor("document.documentElement.classList.contains('in-game')", 40);
  await sleep(5000);
  await b.shot(`${tag}-3decree.png`);
  await b.js("document.querySelector('#kingdom-decree [data-close]')?.click(); 1");
  await sleep(800);
  await b.shot(`${tag}-3map.png`);
  const open = async (name, expr) => { await b.js(`keepfallScene.${expr}; 1`); await sleep(900); await b.shot(`${tag}-${name}.png`); await b.js("keepfallUi.windows.close(true); 1").catch(() => {}); await sleep(300); };
  await open('4castle', "select({ kind: 'castle' })");
  await open('5farm', "select({ kind: 'building', type: 'farm' })");
  await open('6forge', "select({ kind: 'building', type: 'forge' })");
  await open('7enemy', "select({ kind: 'enemy', seat: 2 })");
  await b.js("document.querySelector('.settings-fab').click(); 1");
  await sleep(700);
  await b.shot(`${tag}-8settings.png`);
  await b.js("document.querySelector('.settings-fab').click(); 1");
  await b.js("document.querySelector('.guide-fab').click(); 1");
  await sleep(700);
  await b.shot(`${tag}-8guide.png`);
  await b.js("document.querySelector('.guide-fab').click(); 1");
  await sleep(300);
  // portrait: the "rotate your device" screen
  await b.send('Emulation.setDeviceMetricsOverride', { width: H, height: W, deviceScaleFactor: 2, mobile: true });
  await sleep(1200);
  await b.shot(`${tag}-9portrait.png`);
} finally { b.close(); }
