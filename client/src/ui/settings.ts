import { sfx } from '../audio';
import { setReduceEffects, userReducesEffects } from '../prefs';
import { toggleGuide } from './guide';
import { lang, t, toggleLang } from '../i18n';

// The settings window (gear button, in the menus and in the game): the two volumes, "reduce effects", a way to the guide and "About the game".
// Sound and effect choices take hold at once and are kept by their own modules.

declare const __BUILD_DATE__: string;
const VERSION = '0.9';

const CREDITS: [string, string][] = [
  [t('Görseller'), t('Tiny Swords (Free Pack) — Pixel Frog (pixelfrog-assets.itch.io/tiny-swords). Lisansı yeniden dağıtıma izin vermediği için oyunun deposunda yoktur. Sur taşı ve tabelalar aynı yapımcının CC0 paketinden. Krallık kaleleri ve binaları, arayüz çerçeveleri, orman yerleri, harita süsleri, süvari atı ve mancınık yapay zekâ (Google Gemini) ile üretilip bu oyun için düzenlendi; kamp ateşi koddan çizildi.')],
  [t('Sesler'), t('Kenney — Interface Sounds ve Impact Sounds (CC0). Müzik: RandomMind — "The Old Tower Inn" ve "Medieval: Minstrel Dance" (CC0).')],
  [t('Yazı tipleri'), t('Pixelify Sans ve Atkinson Hyperlegible Next — SIL Open Font License 1.1.')],
  [t('Yazılım'), t('Phaser 3 (MIT), Microsoft SignalR ve ASP.NET Core (MIT).')],
];

let open: HTMLElement | null = null;
let leaveAction: (() => void) | null = null;

/** Set while the player is in a running match: the settings then offer "Ana menüye dön". */
export function setLeaveAction(action: (() => void) | null): void {
  leaveAction = action;
}

/** Asks before leaving a running match (the castle stays behind undefended). */
function confirmLeave(): void {
  const box = document.createElement('div');
  box.className = 'guide-overlay settings-overlay';
  box.innerHTML = `
    <div class="guide settings paper" role="alertdialog" aria-label="${t('Maçtan ayrıl')}">
      <div class="ribbon ribbon-red guide-title">${t('Maçtan ayrılıyorsun')}</div>
      <div class="guide-body settings-body">
        <p>${t('Maçtan ayrılırsan kalen savunmasız kalır. Aynı oda koduyla istediğin zaman geri dönebilirsin.')}</p>
        <section class="set-links">
          <button class="btn btn-red" data-act="yes">${t('Ayrıl')}</button>
          <button class="btn" data-act="no">${t('Vazgeç')}</button>
        </section>
      </div>
    </div>`;
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'yes') { box.remove(); leaveAction?.(); }
    else if (act === 'no' || t === box) box.remove();
  });
  document.body.appendChild(box);
}

export function closeSettings(): void {
  open?.remove();
  open = null;
  window.removeEventListener('keydown', onKey, true);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); }
}

/** Opens the settings (or closes them if they are open). */
export function toggleSettings(): void {
  if (open) { closeSettings(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay settings-overlay';
  overlay.innerHTML = `
    <div class="guide settings paper" role="dialog" aria-label="${t('Ayarlar')}">
      <div class="ribbon ribbon-blue guide-title">${t('Ayarlar')}</div>
      <button class="btn-round btn-red guide-close" data-act="close" title="${t('Kapat (Esc)')}" aria-label="${t('Kapat')}"><i class="ico ico-close"></i></button>
      <div class="guide-body settings-body">
        <section>
          <h3>${t('Ses')}</h3>
          <div class="set-row"><label for="set-music">${t('Müzik')}</label><input id="set-music" type="range" min="0" max="100" step="5"><output data-o="music"></output></div>
          <div class="set-row"><label for="set-sfx">${t('Efektler')}</label><input id="set-sfx" type="range" min="0" max="100" step="5"><output data-o="sfx"></output></div>
          <div class="set-row"><label for="set-mute">${t('Sesi kapat')}</label><input id="set-mute" type="checkbox" class="set-check"></div>
        </section>
        <section>
          <h3>${t('Görünüm')}</h3>
          <div class="set-row"><label for="set-fx">${t('Efektleri azalt')} <small>${t('(kamera sarsıntısı, kıvılcım ve ok izleri)')}</small></label><input id="set-fx" type="checkbox" class="set-check"></div>
        </section>
        <section class="set-links">
          <button class="btn" data-act="guide">${t('Nasıl oynanır?')}</button>
          <button class="btn" data-act="about">${t('Oyun hakkında')}</button>
        </section>
        ${leaveAction ? `<section class="set-links"><button class="btn btn-red" data-act="leave">${t('Ana menüye dön')}</button></section>` : ''}
        <section class="set-about hidden" data-f="about">
          <h3>${t('Oyun hakkında')}</h3>
          <p><b>Keepfall</b> — ${t('sürüm')} ${VERSION} (${typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : ''})</p>
          <p>${t('Yapımcı:')} <b>Eren</b></p>
          <h4>${t('Kaynaklar ve lisanslar')}</h4>
          <dl>${CREDITS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        </section>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => overlay.querySelector<T>(sel)!;
  const music_ = q<HTMLInputElement>('#set-music'), sfx_ = q<HTMLInputElement>('#set-sfx'), mute = q<HTMLInputElement>('#set-mute'), fx = q<HTMLInputElement>('#set-fx');
  const show = () => {
    music_.value = String(Math.round(sfx.musicVolume * 100));
    sfx_.value = String(Math.round(sfx.volume * 100));
    mute.checked = sfx.muted;
    fx.checked = userReducesEffects();
    music_.disabled = sfx_.disabled = sfx.muted;
    q('[data-o="music"]').textContent = `${music_.value}%`;
    q('[data-o="sfx"]').textContent = `${sfx_.value}%`;
  };
  music_.addEventListener('input', () => { sfx.setMusicVolume(Number(music_.value) / 100); show(); });
  sfx_.addEventListener('input', () => { sfx.setVolume(Number(sfx_.value) / 100); show(); });
  sfx_.addEventListener('change', () => sfx.play('sword')); // a sample at the new level
  mute.addEventListener('change', () => { sfx.setMuted(mute.checked); show(); });
  fx.addEventListener('change', () => setReduceEffects(fx.checked));
  overlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (t === overlay || act === 'close') closeSettings();
    else if (act === 'guide') { closeSettings(); toggleGuide(); }
    else if (act === 'leave') { closeSettings(); confirmLeave(); }
    else if (act === 'about') q('[data-f="about"]').classList.toggle('hidden');
  });
  document.body.appendChild(overlay);
  open = overlay;
  window.addEventListener('keydown', onKey, true);
  show();
}

/** The gear button for the menus (in the game it sits in the top bar). */
export function mountSettingsButton(): void {
  const b = document.createElement('button');
  b.className = 'btn-round settings-fab';
  b.title = t('Ayarlar');
  b.setAttribute('aria-label', t('Ayarlar'));
  b.innerHTML = gearSvg();
  b.addEventListener('click', toggleSettings);
  document.body.appendChild(b);
}

/** The language switch for the menus (TR / EN; in the game it sits in the top bar): shows the language it switches to. */
export function mountLangButton(): void {
  const b = document.createElement('button');
  b.className = 'btn-round lang-fab';
  b.title = lang === 'tr' ? 'English' : 'Türkçe';
  b.setAttribute('aria-label', b.title);
  b.innerHTML = `<b>${lang === 'tr' ? 'EN' : 'TR'}</b>`;
  b.addEventListener('click', toggleLang);
  document.body.appendChild(b);
}

export function gearSvg(): string {
  return '<i class="ico ico-gear" aria-hidden="true"></i>';
}
