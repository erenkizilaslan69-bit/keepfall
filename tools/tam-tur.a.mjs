// Stage A: the menus (main menu closed/open, language picker, the five settings tabs, about, privacy).
import { session, take, stage } from './tam-tur-lib.mjs';

stage('A', async () => {
  // the packed game's menu has the friends doors; the web page's has not: the desktop bridge is made up for "closed / open"
  const s = await session({ hosted: { lobbies: [] } });
  await s.waitFor(`!!document.querySelector('#play')`, 30); await s.sleep(2500);
  await take(s, 'menu-ana');
  await take(s, 'menu-arkadaslarla', async () => { await s.click('#friends-toggle'); await s.sleep(500); return s.exists('#friends-body'); });
  await s.click('#friends-toggle'); await s.sleep(300);
  await take(s, 'dil-secici', async () => { await s.mouse(1760, 32); await s.sleep(700);
    // (in the dev client a later `.paper { position: relative }` beats `.lang-menu { position: fixed }` and the list lands below the screen: the picture shows it as designed)
    await s.js(`(() => { const m = document.querySelector('.lang-menu'); if (m) m.style.position = 'fixed'; return 1; })()`); await s.sleep(300); return s.exists('.lang-menu'); });
  await s.b.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`); await s.sleep(300);
  await s.click('.settings-fab'); await s.waitFor(`!!document.querySelector('.settings .set-tab')`, 10);
  for (const [tab, slug] of [['sound', 'ayarlar-ses'], ['display', 'ayarlar-goruntu'], ['language', 'ayarlar-dil'], ['game', 'ayarlar-oyun'], ['controls', 'ayarlar-kontroller']])
    await take(s, slug, async () => { await s.click(`.set-tab[data-tab="${tab}"]`); await s.sleep(400); return true; });
  await take(s, 'hakkinda', async () => { await s.click('[data-act="about"]'); await s.sleep(500); await s.b.js(`document.querySelector('[data-f="about"]')?.scrollIntoView({ block: 'start' }); 1`); return true; });
  await take(s, 'gizlilik', async () => { await s.click('[data-act="privacy"]'); await s.sleep(500); await s.b.js(`document.querySelector('[data-f="privacy"]')?.scrollIntoView({ block: 'center' }); 1`); return true; });
  s.close();
});
