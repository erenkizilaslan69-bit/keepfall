import { sfx } from '../audio';
import { restartTutorial } from './tutorial';
import { CRAZY } from '../crazy';
import { playsFullRules, setFullRules, lowGraphics, setLowGraphics, setShowHints, showsHints, setReduceEffects, setShowFps, setShowMessages, showsFps, userReducesEffects, userShowsMessages } from '../prefs';
import { toggleGuide } from './guide';
import { setLang, t, type Lang } from '../i18n';
import { langLabel, langSelectHtml, langTitle, toggleLangMenu } from './lang-menu';

// The settings window (gear button, in the menus and in the game): the two volumes, "reduce effects", a way to the guide and "About the game".
// Sound and effect choices take hold at once and are kept by their own modules.

declare const __BUILD_DATE__: string;
const VERSION = '0.9';

const CREDITS: [string, string][] = [
  [t('Görseller'), 'Tiny Swords & Tiny Swords Warfare by Pixel Frog'],
  [t('Yazı tipleri'), 'Pixelify Sans, Atkinson Hyperlegible Next, Fusion Pixel, Noto Sans (SIL Open Font License)'],
  [t('Sesler'), 'Pixabay (Pixabay Content License), Kenney, OpenGameArt (CC0)'],
  [t('Küfür sözlükleri'), 'LDNOOBW (CC BY 4.0)'],
  [t('Çeviriler'), t('Yapay zekâ yardımıyla')],
  [t('Yazılım'), t('Phaser 3 (MIT), Microsoft SignalR ve ASP.NET Core (MIT).')],
];

let open: HTMLElement | null = null;
let leaveAction: (() => void) | null = null;

/** Set while the player is in a running match: the settings then offer "Ana menüye dön". */
export function setLeaveAction(action: (() => void) | null): void {
  leaveAction = action;
}

/** Asks before leaving a running match (the castle stays behind undefended). */
export function confirmLeave(): void {
  if (document.querySelector('.settings-overlay')) return;
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
          <h3>${t('Dil')} · Language</h3>
          <div class="set-row"><label for="set-lang">${t('Dil')}</label>${langSelectHtml()}</div>
        </section>
        <section>
          <h3>${t('Görünüm')}</h3>
          <div class="set-row"><label for="set-fx">${t('Efektleri azalt')} <small>${t('(kamera sarsıntısı, kıvılcım ve ok izleri)')}</small></label><input id="set-fx" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-low">${t('Düşük grafik')} <small>${t('(parçacık efektleri, duman, harita süsleri ve sis yumuşatması azalır; yavaş bilgisayarlar için)')}</small></label><input id="set-low" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-fps">${t('FPS göster')} <small>${t('(köşede kare hızı ve sunucu gecikmesi)')}</small></label><input id="set-fps" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-msg">${t('Ulak mesajlarını göster')} <small>${t('(kapalıyken gelen mesajlar gizlenir ve mesaj kutusu çıkmaz)')}</small></label><input id="set-msg" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-hints">${t('İpuçlarını göster')} <small>${t('(boşta işçi, yemek azalması, yaklaşan ordu gibi anlarda kısa uyarılar)')}</small></label><input id="set-hints" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-full">${t('Tam kurallarla oyna')} <small>${t('(ilk maçlarda ve ilk meydan okumalarda da krallık yetenekleri ve savaş sırası seçimi açık olur)')}</small></label><input id="set-full" type="checkbox" class="set-check"></div>
        </section>
        <section class="set-links">
          <button class="btn" data-act="guide">${t('Nasıl oynanır?')}</button>
          <button class="btn" data-act="about">${t('Oyun hakkında')}</button>
          <button class="btn" data-act="privacy">${t('Gizlilik')}</button>
          <button class="btn" data-act="tutorial">${t('Rehberi tekrar başlat')}</button>
        </section>
        <p class="muted small hidden" data-f="tut-note"></p>
        ${leaveAction ? `<section class="set-links"><button class="btn btn-red" data-act="leave">${t('Ana menüye dön')}</button></section>` : ''}
        <section class="set-about hidden" data-f="privacy">
          <h3>${t('Gizlilik')}</h3>
          <p>${t('Oyun hesap ya da e-posta adresi toplamaz.')}</p>
          <p>${t('Oyuncu adın ve maç verisi yalnızca maç sürdüğü kadar sunucuda tutulur.')}</p>
          <p>${t('Hata kayıtları anonim cihaz bilgisi (tarayıcı ve ekran gibi) içerir.')}</p>
          <p>${t('Tarayıcında yalnızca ayarların ve rehber durumun saklanır.')}</p>
        </section>
        <section class="set-about hidden" data-f="about">
          <h3>${t('Oyun hakkında')}</h3>
          <p><b>Keepfall</b> — ${t('sürüm')} ${VERSION} (${typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : ''})</p>
          <p>${t('Yapımcı:')} <b>Red Lion Games</b></p>
          <h4>${t('Kaynaklar ve lisanslar')}</h4>
          <dl>${CREDITS.map(([k, v]) => `<dt>${k}</dt><dd>${CRAZY ? v.replace(/\s*\(pixelfrog-assets\.itch\.io\/tiny-swords\)/, '') : v}</dd>`).join('')}</dl>
        </section>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(sel: string) => overlay.querySelector<T>(sel)!;
  const music_ = q<HTMLInputElement>('#set-music'), sfx_ = q<HTMLInputElement>('#set-sfx'), mute = q<HTMLInputElement>('#set-mute'), fx = q<HTMLInputElement>('#set-fx'), low = q<HTMLInputElement>('#set-low'), fps = q<HTMLInputElement>('#set-fps'), msg = q<HTMLInputElement>('#set-msg'), hintsBox = q<HTMLInputElement>('#set-hints'), fullBox = q<HTMLInputElement>('#set-full');
  q<HTMLSelectElement>('#set-lang').addEventListener('change', (e) => { setLang((e.target as HTMLSelectElement).value as Lang); });
  const show = () => {
    music_.value = String(Math.round(sfx.musicVolume * 100));
    sfx_.value = String(Math.round(sfx.volume * 100));
    mute.checked = sfx.muted;
    fx.checked = userReducesEffects();
    low.checked = lowGraphics();
    fps.checked = showsFps();
    msg.checked = userShowsMessages();
    hintsBox.checked = showsHints();
    music_.disabled = sfx_.disabled = sfx.muted;
    q('[data-o="music"]').textContent = `${music_.value}%`;
    q('[data-o="sfx"]').textContent = `${sfx_.value}%`;
  };
  music_.addEventListener('input', () => { sfx.setMusicVolume(Number(music_.value) / 100); show(); });
  sfx_.addEventListener('input', () => { sfx.setVolume(Number(sfx_.value) / 100); show(); });
  sfx_.addEventListener('change', () => sfx.play('sword')); // a sample at the new level
  mute.addEventListener('change', () => { sfx.setMuted(mute.checked); show(); });
  fx.addEventListener('change', () => setReduceEffects(fx.checked));
  fps.addEventListener('change', () => setShowFps(fps.checked));
  msg.addEventListener('change', () => setShowMessages(msg.checked));
  hintsBox.addEventListener('change', () => setShowHints(hintsBox.checked));
  fullBox.checked = playsFullRules();
  fullBox.addEventListener('change', () => setFullRules(fullBox.checked));
  // The map's ornaments and fog are built with the map: in a running match the page loads again (the same seat comes back), in the menus it just applies to the next map.
  low.addEventListener('change', () => {
    setLowGraphics(low.checked);
    if (document.documentElement.classList.contains('in-game')) location.reload();
  });
  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (target === overlay || act === 'close') closeSettings();
    else if (act === 'guide') { closeSettings(); toggleGuide(); }
    else if (act === 'leave') { closeSettings(); confirmLeave(); }
    else if (act === 'about') q('[data-f="about"]').classList.toggle('hidden');
    else if (act === 'privacy') q('[data-f="privacy"]').classList.toggle('hidden');
    else if (act === 'tutorial') {
      const now = restartTutorial();
      const note = q('[data-f="tut-note"]');
      note.textContent = now ? t('Rehber yeniden başladı.') : t('Rehber, bir sonraki "Hızlı oyna" ile başlar.');
      note.classList.remove('hidden');
      if (now) window.setTimeout(closeSettings, 700);
    }
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

/** The language button for the menus (in the game it sits in the top bar): shows the current language and opens the list of the 15. */
export function mountLangButton(): void {
  const b = document.createElement('button');
  b.className = 'btn-round lang-fab';
  b.dataset.lang = '';
  b.title = langTitle();
  b.setAttribute('aria-label', b.title);
  b.innerHTML = `<b>${langLabel()}</b>`;
  b.addEventListener('click', () => toggleLangMenu(b));
  document.body.appendChild(b);
}

export function gearSvg(): string {
  return '<i class="ico ico-gear" aria-hidden="true"></i>';
}
