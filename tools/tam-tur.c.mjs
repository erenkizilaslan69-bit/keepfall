// Stage C: the guided match, every tutorial step (the glowing frame is followed and clicked like tools/tutorial-check.mjs does; the wait for the war runs at x20).
import { session, take, stage } from './tam-tur-lib.mjs';

stage('C', async () => {
  const s = await session({ tutorial: true, progress: false });
  await s.waitFor(`!!document.querySelector('#quick')`, 30); await s.sleep(1500);
  await s.click('#quick');
  await s.waitFor(`document.documentElement.classList.contains('in-game')`, 40); await s.sleep(2500);
  await s.click('#kingdom-decree [data-close], #kingdom-decree button'); await s.sleep(1500);
  const read = () => s.js(`(() => { const card = document.querySelector('.tut-card'), frame = document.querySelector('.tut-frame'); if (!card) return null; const fr = frame && !frame.hidden ? frame.getBoundingClientRect() : null;
    return JSON.stringify({ text: card.querySelector('.tut-text').textContent, step: card.querySelector('.tut-step').textContent, hidden: card.hidden, frame: fr ? { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 } : null,
      left: (() => { const c = window.keepfallUi.castle; return c && c.phase === 'preparation' ? Math.max(0, Math.round(c.prepSeconds - c.elapsedSeconds)) : null; })(), done: !!localStorage.getItem('keepfall_tutorial_done') }); })()`);
  const taken = new Set(); let n = 0, last = '', sped = false, lastCountdown = false; const t0 = Date.now();
  while (Date.now() - t0 < 600_000) {
    const raw = await read(); if (!raw) break;
    const st = JSON.parse(raw);
    const countdown = !st.frame && st.left !== null && /\d:\d\d/.test(st.text);
    if (!st.hidden && st.text !== last && !(countdown && lastCountdown)) {
      last = st.text; n++; await s.sleep(700);
      const idx = Number((st.step.match(/\d+/) ?? [0])[0]);
      console.log(`[${st.step}] ${st.text.slice(0, 70)}`);
      if (idx >= 1 && idx <= 7 && (idx === 7 || !taken.has(idx))) { taken.add(idx); await take(s, `rehber-${idx}`); }
    }
    if (countdown) last = st.text; lastCountdown = countdown;
    if (st.done) break;
    // waiting for the war: speed up, and back to x1 a minute before it starts
    const left = countdown ? st.left : null;
    if (left !== null && !sped && left > 60) { sped = true; await s.js('(async () => JSON.stringify(await window.keepfallNet.setSpeed(20)))()'); }
    if (sped && (left === null || left <= 60)) { await s.js('(async () => JSON.stringify(await window.keepfallNet.setSpeed(1)))()'); sped = false; }
    if (st.frame) await s.mouse(st.frame.x, st.frame.y);
    await s.sleep(900);
  }
  console.log('tutorial steps seen:', n);
  s.close();
});
