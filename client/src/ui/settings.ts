import { sfx } from '../audio';
import { restartTutorial } from './tutorial';
import { CRAZY } from '../crazy';
import { playsFullRules, setFullRules, lowGraphics, setLowGraphics, setShowHints, showsHints, setReduceEffects, setShowFps, setShowMessages, showsFps, userReducesEffects, userShowsMessages, UI_SCALES, uiScalePref, setUiScalePref, filtersMild, setFilterMild } from '../prefs';
import { toggleGuide } from './guide';
import { setLang, t, type Lang } from '../i18n';
import { loadName, saveName } from '../identity';
import { esc } from '../format';
import { closeOpenSelect, skinSelect } from './select';
import { setShowQuests, showsQuests } from './quests';
import { langLabel, langSelectHtml, langTitle, toggleLangMenu } from './lang-menu';

// The settings window (gear button, in the menus and in the game), in five sections with tabs: Sound (master / music / effects, mute), Display (quality,
// full screen, interface scale, effects, FPS), Language (the 15), Game (tips, envoy messages, rules, the tutorial) and Controls (the keys). Below them: about, privacy, leave.
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

/** The desktop build with Steam has no name box in the menu: the player's name is changed here (Game tab). Called once, with the Steam name (shown when none was chosen). */
let nameFallback: string | null = null;
export function enableNameSetting(steamName: string): void {
  nameFallback = steamName || '';
}

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
  if (e.key === 'Escape') { e.stopPropagation(); if (!closeOpenSelect()) closeSettings(); } // (an open drop-down list closes first)
}

/** The sections of the settings window (tabs along its top); the one last looked at opens again. */
type Tab = 'sound' | 'display' | 'language' | 'game' | 'controls';
let lastTab: Tab = 'sound';

/** The keys of the game, for the "Kontroller" tab (what the map and the windows really listen to). */
const CONTROLS = (): [string, string][] => [
  ['W A S D / ← ↑ → ↓', t('Haritayı kaydır')],
  [t('Fare tekerleği'), t('Yakınlaş / uzaklaş')],
  [t('Sol tık + sürükle'), t('Haritayı sürükle')],
  [t('Sol tık'), t('Bina, kale, ordu ya da orman yerini seç')],
  [t('Boşluk'), t('Kendi kalene dön')],
  ['J', t('Görev listesini aç / kapa')],
  ['Esc', t('Açık pencereyi kapat')],
  ['F11', t('Tam ekran (masaüstü sürümü)')],
];

const fullscreenOn = (): boolean => !!document.fullscreenElement;
async function setFullscreen(on: boolean): Promise<void> {
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch { /* refused (an embedded page): the box shows what is true */ }
}

/** Opens the settings (or closes them if they are open). */
export function toggleSettings(): void {
  if (open) { closeSettings(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'guide-overlay settings-overlay';
  const tab = (id: Tab, label: string) => `<button class="set-tab" role="tab" data-tab="${id}" aria-selected="false">${label}</button>`;
  overlay.innerHTML = `
    <div class="guide settings paper" role="dialog" aria-label="${t('Ayarlar')}">
      <div class="ribbon ribbon-blue guide-title">${t('Ayarlar')}</div>
      <button class="btn-round btn-red guide-close" data-act="close" title="${t('Kapat (Esc)')}" aria-label="${t('Kapat')}"><i class="ico ico-close"></i></button>
      <div class="set-tabs" role="tablist">
        ${tab('sound', t('Ses'))}${tab('display', t('Görüntü'))}${tab('language', t('Dil'))}${tab('game', t('Oyun'))}${tab('controls', t('Kontroller'))}
      </div>
      <div class="guide-body settings-body">
        <section data-pane="sound">
          <div class="set-row"><label for="set-master">${t('Ana ses')}</label><input id="set-master" type="range" min="0" max="100" step="5"><output data-o="master"></output></div>
          <div class="set-row"><label for="set-music">${t('Müzik')}</label><input id="set-music" type="range" min="0" max="100" step="5"><output data-o="music"></output></div>
          <div class="set-row"><label for="set-sfx">${t('Efektler')}</label><input id="set-sfx" type="range" min="0" max="100" step="5"><output data-o="sfx"></output></div>
          <div class="set-row"><label for="set-mute">${t('Sesi kapat')}</label><input id="set-mute" type="checkbox" class="set-check"></div>
        </section>
        <section data-pane="display">
          <div class="set-row"><label for="set-quality">${t('Grafik kalitesi')} <small>${t('(düşükte parçacık efektleri, duman, harita süsleri ve sis yumuşatması azalır; yavaş bilgisayarlar için)')}</small></label>
            <select id="set-quality" class="set-select"><option value="high">${t('Yüksek')}</option><option value="low">${t('Düşük')}</option></select></div>
          <div class="set-row"><label for="set-fullscreen">${t('Tam ekran')}</label><input id="set-fullscreen" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-scale">${t('Arayüz ölçeği')} <small>${t('(düğmelerin, pencerelerin ve yazıların boyutu)')}</small></label>
            <select id="set-scale" class="set-select">${UI_SCALES.map((v) => `<option value="${v}">${Math.round(v * 100)}%</option>`).join('')}</select></div>
          <div class="set-row"><label for="set-fx">${t('Efektleri azalt')} <small>${t('(kamera sarsıntısı, kıvılcım ve ok izleri)')}</small></label><input id="set-fx" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-fps">${t('FPS göster')} <small>${t('(köşede kare hızı ve sunucu gecikmesi)')}</small></label><input id="set-fps" type="checkbox" class="set-check"></div>
          <p class="muted small">${t('Haritaya yakınlaşmak için fare tekerleğini ya da sağ alttaki + / − düğmelerini kullan.')}</p>
        </section>
        <section data-pane="language">
          <div class="set-row"><label for="set-lang">${t('Dil')} · Language</label>${langSelectHtml()}</div>
          <p class="muted small">${t('Dil değişince sayfa yenilenir; süren maça aynı koltukla dönersin.')}</p>
        </section>
        <section data-pane="game">
          ${nameFallback !== null ? `<div class="set-row"><label for="set-name">${t('Adın')} <small>${t('(sonraki oyunda geçerli; boş bırakırsan Steam adın kullanılır)')}</small></label><input id="set-name" class="set-input" maxlength="16" autocomplete="nickname" placeholder="${esc(nameFallback)}"></div>` : ''}
          <div class="set-row"><label for="set-hints">${t('İpuçlarını göster')} <small>${t('(boşta işçi, yemek azalması, yaklaşan ordu gibi anlarda kısa uyarılar)')}</small></label><input id="set-hints" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-quests">${t('Görev takibini göster')} <small>${t('(köşede hedeflerin ve ilerlemen; J tuşu açıp kapatır)')}</small></label><input id="set-quests" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-msg">${t('Ulak mesajlarını göster')} <small>${t('(kapalıyken gelen mesajlar gizlenir ve mesaj kutusu çıkmaz)')}</small></label><input id="set-msg" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-mild">${t('Hafif küfürleri filtrele')} <small>${t('(ulak mesajlarındaki küfürler yıldızla gösterilir; nefret söylemi bu ayardan bağımsız, her zaman filtrelenir)')}</small></label><input id="set-mild" type="checkbox" class="set-check"></div>
          <div class="set-row"><label for="set-full">${t('Tam kurallarla oyna')} <small>${t('(ilk maçlarda ve ilk meydan okumalarda da krallık yetenekleri ve savaş sırası seçimi açık olur)')}</small></label><input id="set-full" type="checkbox" class="set-check"></div>
          <div class="set-links">
            <button class="btn" data-act="tutorial">${t('Rehberi tekrar başlat')}</button>
            <button class="btn" data-act="guide">${t('Nasıl oynanır?')}</button>
          </div>
          <p class="muted small hidden" data-f="tut-note"></p>
        </section>
        <section data-pane="controls">
          <dl class="set-keys">${CONTROLS().map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl>
        </section>
        <section class="set-links set-foot">
          <button class="btn small" data-act="about">${t('Oyun hakkında')}</button>
          <button class="btn small" data-act="privacy">${t('Gizlilik')}</button>
          ${leaveAction ? `<button class="btn small btn-red" data-act="leave">${t('Ana menüye dön')}</button>` : ''}
        </section>
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
  const pick = (id: Tab) => {
    lastTab = id;
    overlay.querySelectorAll<HTMLElement>('.set-tab').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    overlay.querySelectorAll<HTMLElement>('[data-pane]').forEach((s) => s.classList.toggle('hidden', s.dataset.pane !== id));
  };
  const master = q<HTMLInputElement>('#set-master'), music_ = q<HTMLInputElement>('#set-music'), sfx_ = q<HTMLInputElement>('#set-sfx'), mute = q<HTMLInputElement>('#set-mute'), fx = q<HTMLInputElement>('#set-fx'), quality = q<HTMLSelectElement>('#set-quality'), fps = q<HTMLInputElement>('#set-fps'), msg = q<HTMLInputElement>('#set-msg'), hintsBox = q<HTMLInputElement>('#set-hints'), fullBox = q<HTMLInputElement>('#set-full'), full = q<HTMLInputElement>('#set-fullscreen'), scale = q<HTMLSelectElement>('#set-scale');
  // the drop-downs wear the game's own look (ui/select.ts); `redraw` repaints their faces after the code sets a value
  const redraw = [...overlay.querySelectorAll<HTMLSelectElement>('select.set-select')].map(skinSelect);
  q<HTMLSelectElement>('#set-lang').addEventListener('change', (e) => { setLang((e.target as HTMLSelectElement).value as Lang); });
  const show = () => {
    master.value = String(Math.round(sfx.masterVolume * 100));
    music_.value = String(Math.round(sfx.musicVolume * 100));
    sfx_.value = String(Math.round(sfx.volume * 100));
    mute.checked = sfx.muted;
    fx.checked = userReducesEffects();
    quality.value = lowGraphics() ? 'low' : 'high';
    fps.checked = showsFps();
    msg.checked = userShowsMessages();
    hintsBox.checked = showsHints();
    q<HTMLInputElement>('#set-quests').checked = showsQuests();
    full.checked = fullscreenOn();
    scale.value = String(uiScalePref());
    master.disabled = music_.disabled = sfx_.disabled = sfx.muted;
    q('[data-o="master"]').textContent = `${master.value}%`;
    q('[data-o="music"]').textContent = `${music_.value}%`;
    q('[data-o="sfx"]').textContent = `${sfx_.value}%`;
    redraw.forEach((f) => f());
  };
  master.addEventListener('input', () => { sfx.setMasterVolume(Number(master.value) / 100); show(); });
  master.addEventListener('change', () => sfx.play('sword'));
  music_.addEventListener('input', () => { sfx.setMusicVolume(Number(music_.value) / 100); show(); });
  sfx_.addEventListener('input', () => { sfx.setVolume(Number(sfx_.value) / 100); show(); });
  sfx_.addEventListener('change', () => sfx.play('sword')); // a sample at the new level
  mute.addEventListener('change', () => { sfx.setMuted(mute.checked); show(); });
  fx.addEventListener('change', () => setReduceEffects(fx.checked));
  fps.addEventListener('change', () => setShowFps(fps.checked));
  msg.addEventListener('change', () => setShowMessages(msg.checked));
  hintsBox.addEventListener('change', () => setShowHints(hintsBox.checked));
  q<HTMLInputElement>('#set-quests').addEventListener('change', (e) => setShowQuests((e.target as HTMLInputElement).checked));
  const nameBox = overlay.querySelector<HTMLInputElement>('#set-name');
  if (nameBox) {
    nameBox.value = loadName();
    nameBox.addEventListener('change', () => saveName(nameBox.value.trim()));
  }
  const mild = q<HTMLInputElement>('#set-mild');
  mild.checked = filtersMild();
  mild.addEventListener('change', () => setFilterMild(mild.checked));
  fullBox.checked = playsFullRules();
  fullBox.addEventListener('change', () => setFullRules(fullBox.checked));
  full.addEventListener('change', () => { void setFullscreen(full.checked).then(show); });
  const onFull = () => { if (open === overlay) show(); else document.removeEventListener('fullscreenchange', onFull); };
  document.addEventListener('fullscreenchange', onFull);
  scale.addEventListener('change', () => setUiScalePref(Number(scale.value)));
  // The map's ornaments and fog are built with the map: in a running match the page loads again (the same seat comes back), in the menus it just applies to the next map.
  quality.addEventListener('change', () => {
    setLowGraphics(quality.value === 'low');
    if (document.documentElement.classList.contains('in-game')) location.reload();
  });
  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const tabId = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
    if (tabId) pick(tabId);
    else if (target === overlay || act === 'close') closeSettings();
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
  pick(lastTab);
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
