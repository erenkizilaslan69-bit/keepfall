// Stage G: status messages: connection lost, version mismatch, host left, a bot took over (the texts are the game's own, shown by its own components).
import { session, take, stage, startSolo } from './tam-tur-lib.mjs';

stage('G', async () => {
  // in a match: "connection lost, reconnecting" (the red ribbon) and the bot that took over for a dropped player
  let s = await session({});
  try {
    await startSolo(s, { kingdom: null }); await s.sleep(2500);
    await take(s, 'baglanti-koptu', async () => { await s.js(`(async () => { const { t } = await import('/src/i18n/index.ts'); keepfallUi.setStatus(t('Bağlantı koptu, yeniden deneniyor…'), false); return 1; })()`); await s.sleep(900); return true; });
    await s.js(`keepfallUi.setStatus('', true); 1`);
    await take(s, 'bot-devraldi', async () => {
      await s.js(`(async () => { const { t } = await import('/src/i18n/index.ts'); const room = JSON.parse(JSON.stringify(keepfallUi.room)); const p = room.players.find((x) => x.seat !== keepfallUi.mySeat && !x.isBot) ?? room.players[1];
        p.connected = false; p.deputy = true; keepfallUi.setRoom(room); keepfallUi.notes.push(p.name + ': ' + t('bağlantı yok, yerine bot oynuyor'), 'danger', 60000); return 1; })()`);
      await s.sleep(900); return true; });
  } finally { s.close(); }

  // the menu: a friend on another version, and the host who has left
  s = await session({ hosted: { lobbies: [] } });
  try {
    await s.waitFor(`!!document.querySelector('#friends-toggle')`, 30); await s.sleep(1500);
    await s.js(`window.keepfallSteam.mp.joinLan = async () => ({ ok: false, error: 'version', host: '0.9+a1b2c3d', mine: '0.9+f4e5d6c' }); 1`);
    await take(s, 'surum-uyusmuyor', async () => {
      await s.click('#friends-toggle'); await s.sleep(400);
      await s.b.js(`document.querySelector('.home-lan').open = true; const c = document.querySelector('#code'); c.value = '192.168.1.24:47800#KQZ7MD'; 1`);
      await s.click('#join'); await s.sleep(1500); return s.js(`/0\\.9\\+/.test(document.querySelector('#error')?.textContent ?? '')`); });
    await take(s, 'ev-sahibi-ayrildi', async () => {
      await s.js(`(async () => { const { t } = await import('/src/i18n/index.ts'); let el = document.getElementById('banner'); if (!el) { el = document.createElement('div'); el.id = 'banner'; el.className = 'banner danger top'; document.body.prepend(el); }
        el.textContent = t('Ev sahibiyle bağlantı koptu: maç onun bilgisayarında çalışıyordu ve sürdürülemiyor. Ana menüye dönmek için tıkla.'); return 1; })()`);
      await s.sleep(700); return true; });
  } finally { s.close(); }
});
