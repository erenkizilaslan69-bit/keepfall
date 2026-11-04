// Desktop check of the windows-vs-notes layout: a window open + the notes that come while it is open, 1366x768 and 1920x1080, EN and TR; also reports whether any note
// overlaps the window's cross and whether the "?" button is inside the screen. Usage: PW_DIR=<playwright> node tools/desktop-notes-shots.mjs <out-prefix> [http://localhost:5174]
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.PW_DIR}/package.json`);
const { chromium } = require('playwright');
const OUT = process.argv[2] ?? 'dn';
const URL = (process.argv[3] ?? 'http://localhost:5174').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome' });
let bad = 0;
for (const [W, H] of [[1366, 768], [1920, 1080]]) for (const lang of ['en', 'tr']) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(`try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall.matches','5')}catch(e){}`);
  const page = await ctx.newPage();
  await page.goto(URL + '/'); await sleep(2500);
  await page.fill('#name', 'Desk'); await page.click('#quick');
  await page.waitForFunction("typeof window.keepfallScene === 'object' && !!keepfallScene.state", null, { timeout: 90000 });
  await sleep(4000);
  await page.evaluate("document.querySelector('#kingdom-decree [data-close]')?.click()"); await sleep(500);
  const notes = lang === 'en' ? ['9 idle workers: they eat but produce nothing. Assign them with + in a building.', 'Food is running low - add workers to the farm or hunger will hit.'] : ['9 işçi boşta: yiyorlar ama üretmiyorlar. Bir binada + ile işe ver.', 'Yemek azalıyor - çiftliğe işçi ekle yoksa açlık vurur.'];
  for (const target of ["{ kind: 'building', type: 'forge' }", "{ kind: 'castle' }"]) {
    await page.evaluate(`keepfallScene.select(${target})`); await sleep(900);
    await page.evaluate(`${JSON.stringify(notes)}.forEach((t) => keepfallUi.notes.push(t, 'info', 60000))`); await sleep(900);
    const r = await page.evaluate(`(() => { const x = document.querySelector('.win .win-close'); const q = document.querySelector('.tb-r [aria-label], .tb-r .btn-round:nth-child(3)');
      const rc = (e) => e ? e.getBoundingClientRect() : null; const xr = rc(x); const hits = [...document.querySelectorAll('.notes .ribbon')].filter((n) => { const b = n.getBoundingClientRect(); return xr && b.right > xr.left && b.left < xr.right && b.bottom > xr.top && b.top < xr.bottom; }).length;
      const help = [...document.querySelectorAll('.tb-r .btn-round')].map(rc).filter(Boolean).map((b) => ({ r: Math.round(b.right), t: Math.round(b.top) }));
      return { xr: xr && { l: Math.round(xr.left), t: Math.round(xr.top) }, hits, help, notesAt: rc(document.querySelector('.notes'))?.left }; })()`);
    const name = `${OUT}-${W}-${lang}-${target.includes('forge') ? 'forge' : 'castle'}.png`;
    await page.screenshot({ path: name });
    console.log(name, JSON.stringify(r));
    if (r.hits) bad++;
    if (r.help.some((h) => h.r > W)) { console.log('help/top-right button outside the screen'); bad++; }
    await page.evaluate('keepfallUi.windows.close(true)'); await sleep(400);
  }
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
