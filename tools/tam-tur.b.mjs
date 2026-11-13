// Stage B: the lobbies (single-player new / experienced, deck card front and back, host lobby, open games, join by address), challenges, achievements, profile.
import { session, take, stage } from './tam-tur-lib.mjs';

const openSolo = async (s) => { await s.waitFor(`!!document.querySelector('#play')`, 30); await s.sleep(1500); await s.click('#play'); await s.waitFor(`document.querySelectorAll('#players li:not(.empty)').length >= 4`, 30); await s.sleep(1500); };

stage('B', async () => {
  // single-player lobby, a new player (the bots are Easy, with the note) and an experienced one
  let s = await session({ experienced: false, progress: false });
  await openSolo(s);
  await take(s, 'lobi-tek-yeni');
  s.close();
  s = await session({ experienced: true });
  await openSolo(s);
  await s.b.js(`document.querySelector('.bot-level')?.click(); 1`); await s.sleep(900); // (one bot made Hard by a click: the picture shows the difficulty differing)
  await take(s, 'lobi-tek-deneyimli');
  await take(s, 'deste-on', async () => { await s.b.js(`document.querySelectorAll('#deck-cards .ucard').forEach((c) => c.classList.remove('flipped')); document.querySelector('#deck-cards').scrollIntoView({ block: 'center' }); 1`); return s.exists('#deck-cards .ucard'); });
  await take(s, 'deste-arka', async () => { await s.b.js(`document.querySelectorAll('#deck-cards .ucard').forEach((c) => c.classList.add('flipped')); 1`); await s.sleep(900); return true; });
  s.close();

  // the host lobby of the packed game (no Steam: the LAN door), made from a web room with the desktop game's share box
  s = await session({ extra: '' });
  await s.waitFor(`!!document.querySelector('#create')`, 30); await s.sleep(1500);
  await s.b.js(`import('/src/screens.ts').then((m) => m.setHostedShare({ link: '192.168.1.24:47800#KQZ7MD', steam: false, invite() {}, lanPort: 47800 })); 1`); await s.sleep(500);
  await take(s, 'lobi-ev-sahibi', async () => {
    await s.click('#create'); await s.waitFor(`!!document.querySelector('.screen.lobby #players li')`, 30); await s.sleep(800);
    await s.click('[data-a="addbot"], #addbot'); await s.sleep(600); await s.click('[data-a="addbot"], #addbot'); await s.sleep(900);
    return true;
  });
  s.close();

  // the open games list (Steam rows made up) and join by address
  s = await session({ hosted: { lobbies: [
    { id: '1', name: LANGNAME('Deniz', 'Mia'), players: 2, max: 4, phase: 'lobby', compatible: true, build: 't', mode: 'standard' },
    { id: '2', name: LANGNAME('Kaan', 'Noah'), players: 3, max: 4, phase: 'lobby', compatible: true, build: 't', mode: 'quick' },
    { id: '3', name: LANGNAME('Selin', 'Emma'), players: 4, max: 4, phase: 'match', compatible: true, build: 't', mode: 'long' },
    { id: '4', name: LANGNAME('Orhan', 'Liam'), players: 1, max: 4, phase: 'lobby', compatible: false, build: 'x', mode: 'standard' }] } });
  await s.waitFor(`!!document.querySelector('#friends-toggle')`, 30); await s.sleep(1500);
  await take(s, 'acik-oyunlar', async () => { await s.click('#friends-toggle'); await s.sleep(400); await s.click('#refresh'); await s.sleep(900); return s.exists('#lobbies [data-lobby]'); });
  await take(s, 'adresle-katil', async () => {
    await s.b.js(`document.querySelector('.home-lan').open = true; const c = document.querySelector('#code'); c.value = '192.168.1.24:47800#KQZ7MD'; c.dispatchEvent(new Event('input', { bubbles: true })); 1`); await s.sleep(500); return true; });
  s.close();

  // challenges, achievements, profile
  s = await session({ progress: true });
  await s.waitFor(`!!document.querySelector('#challenges')`, 30); await s.sleep(1500);
  await take(s, 'meydan-okuma', async () => {
    await s.b.js(`localStorage.setItem('keepfall_challenges', JSON.stringify({'ilk-zafer':3,'gozcu-ve-rapor':1}))`);
    await s.click('#challenges'); await s.waitFor(`!!document.querySelector('.screen.challenges .ch-card')`, 20); await s.sleep(900); return true; });
  await s.click('[data-back]'); await s.sleep(900);
  await take(s, 'basarimlar', async () => { await s.click('#progress'); await s.waitFor(`!!document.querySelector('.screen.progress, #progress-panel, .pg-swatch, .progress')`, 20); await s.sleep(1200); return true; });
  await take(s, 'profil', async () => { const ok = await s.b.js(`(() => { const p = document.querySelector('.pf-section'); if (!p) return false; p.scrollIntoView({ block: 'start' }); return true; })()`); await s.sleep(500); return ok; });
  s.close();
});

function LANGNAME(tr, en) { return process.argv[2] === 'tr' ? tr : en; }
