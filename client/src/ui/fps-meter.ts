import type { GameConnection } from '../net';
import { lowGraphics, onShowFpsChange, setLowGraphics, showsFps } from '../prefs';
import { t } from '../i18n';
import { tutorialArmed } from './tutorial';

// "FPS göster": a small counter in the corner (frames a second and the round trip to the server), for whoever wants to see why a game feels slow.
// It also watches the frame rate in a running match: when it stays under 30 for most of half a minute, it offers "Düşük grafik" once.

const SLOW = 30, WINDOW = 30, NEEDED = 20, WARM_UP_SECONDS = 20;
const DISMISSED = 'keepfall.lowfps-offer';

export function startFpsMeter(net: GameConnection): void {
  const el = document.createElement('div');
  el.className = 'kf-fps';
  el.hidden = true;
  document.body.appendChild(el);

  let frames = 0, last = performance.now(), hiddenInside = false, ping: number | null = null, fps = 0, inGame = 0;
  const history: number[] = [];
  const draw = () => {
    el.hidden = !showsFps();
    if (el.hidden) return;
    el.textContent = `${fps} FPS · ${ping === null ? '—' : `${Math.round(ping)} ms`}`;
    el.classList.toggle('slow', fps > 0 && fps < SLOW);
  };
  onShowFpsChange(draw);

  const tick = () => { frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);

  document.addEventListener('visibilitychange', () => { hiddenInside = true; });
  setInterval(() => {
    const now = performance.now();
    fps = Math.round((frames * 1000) / Math.max(1, now - last));
    const clean = !hiddenInside && !document.hidden;
    frames = 0; last = now; hiddenInside = false;
    // Only a running match counts (not the menus, not the first seconds while the map builds, not a tab that was in the background).
    if (document.documentElement.classList.contains('in-game')) inGame++; else { inGame = 0; history.length = 0; }
    if (clean && inGame > WARM_UP_SECONDS) {
      history.push(fps);
      if (history.length > WINDOW) history.shift();
      if (history.length === WINDOW && history.filter((f) => f < SLOW).length >= NEEDED) offerLowGraphics();
    }
    draw();
  }, 1000);

  setInterval(() => {
    if (!showsFps()) return;
    void net.ping().then((ms) => { ping = ms; draw(); });
  }, 3000);
}

function offerLowGraphics(): void {
  let dismissed = false;
  try { dismissed = sessionStorage.getItem(DISMISSED) === '1'; } catch { /* asked again next time */ }
  if (lowGraphics() || dismissed || tutorialArmed() || document.querySelector('.kf-lowfps')) return; // (not while the tutorial is talking)
  const box = document.createElement('div');
  box.className = 'kf-lowfps paper';
  box.setAttribute('role', 'alert');
  box.innerHTML = `
    <p>${t('Oyun yavaş çalışıyor (saniyede 30 kareden az). Ayarlardaki "Düşük grafik" efektleri, haritadaki süsleri ve sis yumuşatmasını azaltır; sayfa yeniden yüklenir, maçına geri dönersin.')}</p>
    <div class="kf-lowfps-buttons"><button class="btn" data-act="on">${t('Düşük grafiğe geç')}</button><button class="btn btn-red" data-act="no">${t('Şimdi değil')}</button></div>`;
  box.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'on') { setLowGraphics(true); location.reload(); }
    else if (act === 'no') { try { sessionStorage.setItem(DISMISSED, '1'); } catch { /* */ } box.remove(); }
  });
  document.body.appendChild(box);
}
