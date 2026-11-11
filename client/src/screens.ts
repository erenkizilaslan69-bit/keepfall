import { sfx } from './audio';
import { botMark, clock, COLOR_CSS, esc, fmt } from './format';
import { inIframe, t, tr } from './i18n';
import { isTouch } from './ui/touch';
import { countMatch, newPlayer } from './prefs';
import { emblemHtml } from './ui/emblem';
import type { GameConnection } from './net';
import type { BotLevel, RoomView, SummaryView } from './types';
import { loadGuide, type GuideUnit } from './ui/guide';
import { mountPortrait } from './ui/portraits';
import { endArt } from './ui/tiny-ui';
import { confetti } from './ui/juice';
import { deceptionTimelineHtml } from './ui/deceptions';
import type { PlayerColor } from './types';
import { asset } from './env';
import { bannerUrl, frameClass } from './progress/looks';
import { FEATURE_PRIVATE_ROOM } from './features';
import type { MpLobby, Visibility } from './hosted';

/** The friend-hosted game (desktop build): what the host's lobby offers for inviting; null everywhere else. Set by main.ts before the lobby is shown. */
export interface HostedShare { link: string | null; steam: boolean; invite: () => void | Promise<unknown>; /** the LAN door's port while it is open (0: no port is open on this computer) */ lanPort: number }
let hostedShare: HostedShare | null = null;
/** True for a guest of a friend-hosted game: the room's code is of no use to anybody (the host invites). */
let hostedGuest = false;
export function setHostedShare(share: HostedShare | null, guest = false): void { hostedShare = share; hostedGuest = guest; }
import { crazyActive, crazyInviteLink, crazyVictory } from './crazy';
import { skinSelect } from './ui/select';

// Plain-HTML screens around the game: home, lobby and the end screen, in the same parchment-and-ribbon
// look as the in-game UI (ui/ui.css).
// Each builds its structure once and updates in place, so typing in an input is never interrupted.
// Each screen renders into its own element (and listens there), so when the app clears the page
// the screen and its listeners go away together.

/** Puts a text on the clipboard; inside an iframe the clipboard API may be refused, so the old select-and-copy way is the fallback. */
async function copyText(text: string, fallbackInput: HTMLInputElement): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* refused: try the old way */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;left:-1000px;top:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* no luck */ }
  area.remove();
  if (!ok) fallbackInput.select();
  return ok;
}

function mount(parent: HTMLElement, html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  parent.appendChild(el);
  return el;
}

const dot = (color: string) => `<span class="dot" style="background:${COLOR_CSS[color] ?? '#888'}"></span>`;

const ART = asset('/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/');
const avatar = (seat: number) =>
  `${ART}UI%20Elements/UI%20Elements/Human%20Avatars/Avatars_${String(((seat - 1) % 25) + 1).padStart(2, '0')}.png`;

// ---- home ----------------------------------------------------------------------------------

/**
 * The Keepfall logo. A: the pack's blue castle over the name; B: the name on a wooden plate between two swords (`?logo=b`, or `keepfall_logo` = "b" in
 * the browser's storage). Both use Pixelify Sans for the name, in gold and red.
 */
export function logoHtml(): string {
  let variant = new URLSearchParams(location.search).get('logo') ?? '';
  try { variant ||= localStorage.getItem('keepfall_logo') ?? ''; } catch { /* storage may be blocked */ }
  const word = `<div class="kf-logo-word"><span class="keep" data-t="KEEP">KEEP</span><span class="fall" data-t="FALL">FALL</span></div>`;
  if (variant === 'b') return `<div class="kf-logo" role="img" aria-label="Keepfall"><div class="kf-logo-plate"><i class="ico ico-sword"></i>${word}<i class="ico ico-shield"></i></div></div>`;
  return `<div class="kf-logo" role="img" aria-label="Keepfall"><img class="kf-logo-castle" src="${ART}Buildings/Blue%20Buildings/Castle.png" alt="" draggable="false">${word}</div>`;
}

/** Which entrance is drawn: 'b' unless the other one is asked for (?home=a, or localStorage keepfall_home). */
function homeLayout(): 'a' | 'b' {
  let v = new URLSearchParams(location.search).get('home') ?? '';
  try { v ||= localStorage.getItem('keepfall_home') ?? ''; } catch { /* storage may be blocked */ }
  return v === 'a' ? 'a' : 'b';
}

export class HomeScreen {
  constructor(
    parent: HTMLElement,
    defaults: { name: string; code: string; error?: string; hosted?: { steam: boolean } | null },
    actions: { create: (name: string, visibility?: Visibility) => Promise<string | null>; join: (name: string, code: string) => Promise<string | null>; quick: (name: string) => Promise<string | null>; challenges: () => void; progress: () => void;
      joinSteam?: (name: string, lobbyId: string) => Promise<string | null>; lobbies?: () => Promise<MpLobby[]> },
  ) {
    // The desktop build: no official server. "Oyun kur" makes this computer the host; friends join by its address or through Steam.
    const hosted = defaults.hosted ?? null;
    // The desktop build: ONE button "Arkadaşlarla oyna" that unfolds the doors (host a game + who may join, the list of open games); the address box and
    // "join" live only inside the folded "LAN / IP (gelişmiş)" at the bottom. With Steam the name is Steam's (changed in the settings, Game tab).
    const friendsOpen = !!defaults.code;
    const friends = !FEATURE_PRIVATE_ROOM ? '' : hosted ? `<div class="home-friends-wrap">
        <button id="friends-toggle" class="btn wide home-friends-toggle" aria-expanded="${friendsOpen}" aria-controls="friends-body">${t('Arkadaşlarla oyna')}</button>
        <div class="home-friends" id="friends-body"${friendsOpen ? '' : ' hidden'}>
          <div class="join-row host-row">
            ${hosted.steam ? `<label class="field">${t('Kimler katılabilir')} <select id="vis"><option value="friends">${t('Steam: arkadaşlar')}</option><option value="public">${t('Steam: herkese açık')}</option><option value="private">${t('Steam: özel (yalnız davet)')}</option><option value="lan">${t('LAN / IP adresiyle (Steam yok)')}</option></select></label>` : ''}
            <button id="create" class="btn${hosted.steam ? '' : ' wide'}">${hosted.steam ? t('Oyun kur (ev sahibi)') : t('Oyun kur (LAN / IP)')}</button>
            ${hosted.steam ? `<button id="refresh" class="btn">${t('Açık oyunları listele')}</button>` : ''}
          </div>
          ${hosted.steam ? `<div class="mp-lobbies"><ul id="lobbies" class="players"></ul></div>` : ''}
          <details class="home-lan"${friendsOpen || !hosted.steam ? ' open' : ''}>
            <summary>${t('LAN / IP (gelişmiş)')}</summary>
            <div class="join-row">
              <label class="field">${t('Ev sahibinin adresi')} <input id="code" maxlength="80" value="${esc(defaults.code)}" placeholder="192.168.1.5:47800#ABCDEF" autocomplete="off" spellcheck="false"></label>
              <button id="join" class="btn btn-red">${t('Oyuna katıl')}</button>
            </div>
          </details>
        </div>
      </div>`
      : `<div class="or">${t('ya da arkadaşlarınla')}</div>
        <button id="create" class="btn wide">${t('Oda kur')}</button>
        <div class="or">${t('ya da')}</div>
        <div class="join-row">
          <label class="field">${t('Oda kodu')} <input id="code" maxlength="6" value="${esc(defaults.code)}" placeholder="ABCDEF" autocapitalize="characters"></label>
          <button id="join" class="btn btn-red">${t('Odaya katıl')}</button>
        </div>`;
    // The entrance: the living map behind, the logo, ONE plain main button ("Oyna"), the solo doors as second-rank buttons, the doors for friends as a
    // small card of their own, the name and the way out small at the foot. Two layouts were drawn (art/shots/ui-tur/home-*.png): 'b' (in use: no big
    // sheet of paper, the buttons stand on the map itself) and 'a' (everything on the paper panel, as before). 'a' comes back with ?home=a or
    // localStorage keepfall_home = a.
    const layout = homeLayout();
    const steamName = !!hosted?.steam; // (the Steam name is used; no name box here)
    const desktop = !!(window as unknown as { keepfallSteam?: unknown }).keepfallSteam;
    const root = mount(parent, `
      <div class="screen menu paper home home-${layout}">
        ${logoHtml()}
        <p class="muted center kf-logo-sub">${t('Gizli krallıklar. Sahte ordular. Tek savaş.')}</p>
        <button id="quick" class="btn wide kf-btn--green home-play"><span class="home-play-word">${t('Oyna')}</span> <small>${t('(3 bota karşı, hemen)')}</small></button>
        ${friends && hosted ? friends : ''}
        <div class="home-second">
          <button id="challenges" class="btn">${t('Meydan Okuma')} <small>${t('(tek kişilik, hedefli maçlar)')}</small></button>
          <button id="progress" class="btn">${t('Başarımlar ve Ustalık')} <small>${t('(rozetler, flamalar)')}</small></button>
        </div>
        ${friends && !hosted ? `<div class="home-friends">${friends}</div>` : ''}
        <div class="home-foot${steamName ? ' no-name' : ''}">
          ${steamName ? '' : `<label class="field home-name">${t('Adın')} <input id="name" maxlength="16" autocomplete="nickname" value="${esc(defaults.name)}" placeholder="${t('Oyuncu')}"></label>`}
          ${desktop ? `<button id="quit" class="btn small home-quit">${t('Oyundan çık')}</button>` : ''}
        </div>
        <p class="error" id="error">${esc(defaults.error ?? '')}</p>
      </div>`);
    // a soft tick when the pointer comes onto a button (the buttons lift a little: theme.css), at most a few a second
    let lastHover: Element | null = null;
    root.addEventListener('mouseover', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && b !== lastHover && !b.disabled) sfx.play('click', 0.35);
      lastHover = b;
    });
    root.querySelector('#quit')?.addEventListener('click', () => window.close());
    const nameBox = root.querySelector<HTMLInputElement>('#name');
    const name = { get value() { return nameBox ? nameBox.value : defaults.name; } };
    const code = root.querySelector<HTMLInputElement>('#code') ?? nameBox;
    root.querySelectorAll<HTMLSelectElement>('select').forEach(skinSelect); // (the game's own drop-down look, as in the settings)
    const toggle = root.querySelector<HTMLButtonElement>('#friends-toggle');
    toggle?.addEventListener('click', () => {
      const body = root.querySelector<HTMLElement>('#friends-body')!;
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
    });
    const error = root.querySelector<HTMLElement>('#error')!;
    const buttons = root.querySelectorAll<HTMLButtonElement>('button');
    const run = async (action: () => Promise<string | null>) => {
      buttons.forEach((b) => (b.disabled = true));
      error.textContent = tr((await action()) ?? '');
      buttons.forEach((b) => (b.disabled = false));
    };
    root.querySelector('#quick')!.addEventListener('click', () => run(() => actions.quick(name.value)));
    root.querySelector('#challenges')!.addEventListener('click', () => actions.challenges());
    root.querySelector('#progress')!.addEventListener('click', () => actions.progress());
    root.querySelector('#create')?.addEventListener('click', () => run(() => actions.create(name.value, (root.querySelector<HTMLSelectElement>('#vis')?.value as Visibility | undefined))));
    // Steam: the open games (public ones, and friends' as Steam lists them); one click joins.
    const list = root.querySelector<HTMLElement>('#lobbies');
    root.querySelector('#refresh')?.addEventListener('click', async () => {
      if (!list || !actions.lobbies) return;
      list.innerHTML = `<li class="empty"><span class="pname muted">${t('Aranıyor…')}</span></li>`;
      const found = await actions.lobbies();
      list.innerHTML = found.length ? found.map((l) => `
        <li><span class="pname">${esc(l.name || t('Oyuncu'))}</span>
          <span class="tags"><span class="tag">${l.players}/${l.max}</span>
          ${!l.compatible ? `<span class="tag warn">${t('farklı sürüm')}</span>` : l.phase !== 'lobby' ? `<span class="tag">${t('maçta')}</span>` : `<button class="btn small" data-lobby="${esc(l.id)}">${t('Katıl')}</button>`}</span></li>`).join('')
        : `<li class="empty"><span class="pname muted">${t('Açık oyun bulunamadı.')}</span></li>`;
    });
    list?.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lobby]')?.dataset.lobby;
      if (id && actions.joinSteam) void run(() => actions.joinSteam!(name.value, id));
    });
    root.querySelector('#join')?.addEventListener('click', () => run(() => actions.join(name.value, code?.value ?? '')));
    code?.addEventListener('keydown', (e) => { if (e.key === 'Enter') void run(() => actions.join(name.value, code.value)); });
    if (nameBox) (defaults.code ? nameBox : nameBox.value ? code ?? nameBox : nameBox).focus();
  }
}

// ---- lobby ---------------------------------------------------------------------------------

export class LobbyScreen {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly net: GameConnection, private readonly mySeat: number, room: RoomView,
    onName: (name: string) => void, onLeave: () => void) {
    const root = this.root = mount(parent, `
      <div class="screen menu paper lobby">
        <div class="lob-grid">
          <div class="lob-left">
            ${logoHtml()}
            <div class="title-ribbon ribbon ribbon-blue">${t('Oda')} <span class="code">${esc(room.code)}</span></div>
            ${hostedShare ? `<div class="share">
              ${hostedShare.link ? `<input class="share-code" readonly value="${esc(hostedShare.link)}" aria-label="${t('Ev sahibinin adresi')}">
              <button class="btn" data-a="copylink">${t('Adresi kopyala')}</button>` : ''}
              ${hostedShare.steam ? `<button class="btn" data-a="invite">${t("Steam'den davet et")}</button>` : ''}
            </div>
            ${hostedShare.steam ? `<p class="muted small invite-hint" id="invite-hint" hidden>${t('Davet penceresi açılmadıysa: Steam arkadaş listesinde arkadaşına sağ tık → Oyuna davet et.')}</p>` : ''}
            ${hostedShare.lanPort ? `<p class="tag warn door-open" id="door-open">${t('Ağ kapısı açık (port {0}): bu ağdaki herkes adresi bilirse katılmayı deneyebilir.', hostedShare.lanPort)}</p>` : ''}
            <p class="muted small">${hostedShare.lanPort
    ? t('Maç bu bilgisayarda çalışır: sen çıkarsan herkes için biter. Arkadaşların bu adresi oyunda "Ev sahibinin adresi"ne yazar.')
    : t('Maç bu bilgisayarda çalışır: sen çıkarsan herkes için biter. Yalnız Steam lobindekiler bağlanabilir; bu bilgisayarda ağa açık port yok.')}</p>`
            : `<div class="share"${FEATURE_PRIVATE_ROOM && !hostedGuest ? '' : ' hidden'}>
              <input class="share-code" readonly value="${esc(`${t('Oda kodu')}: ${room.code}`)}" aria-label="${t('Oda kodu')}">
              <button class="btn" data-a="copy">${t('Oda kodunu kopyala')}</button>
              ${inIframe() && !crazyActive() ? '' : `<button class="btn" data-a="copylink">${t('Bağlantıyı kopyala')}</button>`}
            </div>`}
            <ul class="players" id="players"></ul>
          </div>
          <div class="lob-right">
            <div class="deck" id="deck" hidden>
              <h3>${t('Destem')} <span class="deck-medal" id="deck-count" title="${t('Seçilen birlik')}"></span></h3>
              <p class="muted small">${t("Maçta yalnız seçtiğin 4 birliği üretebilirsin. Kartı çevirmek için tıkla; seçmek için <b>Seç</b>'e bas ya da çift tıkla. Rakip destene yalnız gözcü raporu bakar; seçmezsen rastgele verilir.")}</p>
              <p class="muted small touch-only">${t('Kartı seçmek için dokun, çevirmek için basılı tut.')}</p>
              <div class="deck-cards" id="deck-cards"></div>
            </div>
          </div>
          <div class="lob-bottom">
            <label class="field">${t('Adın')} <input id="myname" maxlength="16"></label>
            <div class="fill hidden" id="fill">
              <label class="check"><input type="checkbox" id="fillbots"> ${t('Boş yerleri botla doldur')}</label>
              <select id="filllevel" aria-label="${t('Bot zorluğu')}"><option value="easy">${t('Kolay')}</option><option value="medium">${t('Orta')}</option><option value="hard">${t('Zor')}</option></select>
            </div>
            <button class="btn" data-a="ready" id="ready"></button>
            <button class="btn" data-a="leave" id="leave">${t('Odadan çık')}</button>
            <div class="start">
              <button data-a="start" id="start" class="btn btn-red wide">${t('Maçı başlat')}</button>
            </div>
            <p class="muted small center" id="start-hint"></p>
          </div>
        </div>
        <p class="error" id="error"></p>
      </div>`);

    const nameInput = this.q<HTMLInputElement>('#myname');
    nameInput.addEventListener('change', async () => {
      onName(nameInput.value);
      this.show(await this.net.setName(nameInput.value));
    });
    root.addEventListener('click', async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]')?.dataset.a;
      if (a === 'copy' || a === 'copylink') {
        // The room code (all that matters inside an iframe such as itch.io) or the address of the room; the button says "Copied!" for two seconds.
        const button = this.q<HTMLButtonElement>(`[data-a="${a}"]`);
        const text = a === 'copy' ? this.room!.code : hostedShare?.link ?? crazyInviteLink(this.room!.code) ?? `${location.origin}/?room=${this.room!.code}`;
        // On a phone the share sheet (messages, chats) is the natural way to send a link; where it is missing or refused, the link is copied.
        if (a === 'copylink' && isTouch() && typeof navigator.share === 'function') {
          try { await navigator.share({ title: 'Keepfall', text: t('Keepfall odama katıl: {0}', this.room!.code), url: text }); return; } catch (err) { if ((err as DOMException)?.name === 'AbortError') return; }
        }
        const done = await copyText(text, this.q<HTMLInputElement>('.share input'));
        const label = button.textContent;
        button.textContent = done ? t('Kopyalandı!') : t('Kopyalanamadı');
        setTimeout(() => { button.textContent = label; }, 2000);
      } else if (a === 'kick') {
        this.show(await this.net.kickPlayer(Number((e.target as HTMLElement).closest<HTMLElement>('[data-seat]')!.dataset.seat)));
      } else if (a === 'invite') {
        // the overlay cannot be asked whether it opened: when the shell says no (or the dialog stays shut), the hint with the friends-list way is shown
        const hint = this.q<HTMLElement>('#invite-hint');
        let opened = false;
        try { opened = (await hostedShare?.invite()) === true; } catch { opened = false; }
        if (hint) { hint.hidden = false; hint.classList.toggle('warn', !opened); }
      } else if (a === 'ready') {
        this.show(await this.net.setReady(!this.me(this.room!)?.ready));
      } else if (a === 'deckpick') {
        await this.toggleDeck((e.target as HTMLElement).closest<HTMLElement>('[data-unit]')!.dataset.unit!);
      } else if (a === 'flip') {
        (e.target as HTMLElement).closest<HTMLElement>('.ucard')!.classList.toggle('flipped');
      } else if (a === 'leave') {
        onLeave();
      } else if (a === 'start') {
        // The host starts the match; empty seats are filled with computer players of the chosen level first (when that is switched on).
        const room = this.room!;
        if (this.fill().on) {
          for (let n = room.players.length; n < room.maxPlayers; n++) {
            const added = await this.net.addBot(this.fill().level);
            if (!added.ok) { this.show(added); return; }
          }
        }
        const started = await this.net.startMatch();
        if (started.ok) countMatch();
        this.show(started);
      } else if (a === 'addbot') {
        const level = (e.target as HTMLElement).closest<HTMLElement>('[data-level]')?.dataset.level as BotLevel;
        this.show(await this.net.addBot(level));
      } else if (a === 'rmbot') {
        this.show(await this.net.removeBot(Number((e.target as HTMLElement).closest<HTMLElement>('[data-seat]')!.dataset.seat)));
      }
    });
    // A click on the card itself turns it over; a double click picks it.
    // On a touch screen the little Flip / Select buttons are too small for a finger (they are hidden there): a tap picks the card, a long press turns it over.
    let held: number | undefined, longPressed = false;
    this.q('#deck-cards').addEventListener('pointerdown', (e) => {
      longPressed = false;
      const card = (e.target as HTMLElement).closest<HTMLElement>('.ucard');
      if (!card || !isTouch() || e.pointerType !== 'touch') return;
      held = window.setTimeout(() => { longPressed = true; card.classList.toggle('flipped'); }, 450);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.q('#deck-cards').addEventListener(ev, () => window.clearTimeout(held));
    this.q('#deck-cards').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button')) return;
      const card = t.closest<HTMLElement>('.ucard');
      if (!card) return;
      if (isTouch()) { if (!longPressed) void this.toggleDeck(card.dataset.unit!); return; }
      card.classList.toggle('flipped');
    });
    this.q('#deck-cards').addEventListener('dblclick', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.ucard');
      if (!card || (e.target as HTMLElement).closest('button')) return;
      card.classList.toggle('flipped'); // the two clicks of the double click turned it twice already: put it as it was
      void this.toggleDeck(card.dataset.unit!);
    });
    try {
      const saved = JSON.parse(localStorage.getItem('keepfall.fill') ?? 'null') as { on?: boolean; level?: string } | null;
      this.q<HTMLInputElement>('#fillbots').checked = saved?.on !== false;
      if (saved?.level === 'easy' || saved?.level === 'hard') this.q<HTMLSelectElement>('#filllevel').value = saved.level;
      else this.q<HTMLSelectElement>('#filllevel').value = newPlayer() ? 'easy' : 'medium';
    } catch { this.q<HTMLInputElement>('#fillbots').checked = true; this.q<HTMLSelectElement>('#filllevel').value = newPlayer() ? 'easy' : 'medium'; }
    this.q('#fill').addEventListener('change', () => {
      try { localStorage.setItem('keepfall.fill', JSON.stringify(this.fill())); } catch { /* fine */ }
      if (this.room) this.update(this.room);
    });
    this.update(room);
    void this.setupDeck();
  }

  /** "Fill empty seats with bots" (the host's choice, remembered in this browser). */
  private fill(): { on: boolean; level: BotLevel } {
    return { on: this.q<HTMLInputElement>('#fillbots').checked, level: this.q<HTMLSelectElement>('#filllevel').value as BotLevel };
  }

  private room: RoomView | null = null;
  private deckUnits: GuideUnit[] = [];
  private deckSize = 4;
  private deck: string[] = [];

  /** The deck picker: the seven units as cards, four to be picked. The choice is remembered in this browser. */
  private async setupDeck(): Promise<void> {
    try {
      const guide = await loadGuide();
      if (!guide.deckEnabled) return;
      this.deckUnits = guide.units;
      this.deckSize = guide.deckSize;
      try {
        const saved = JSON.parse(localStorage.getItem('keepfall.deck') ?? '[]') as string[];
        if (Array.isArray(saved)) this.deck = saved.filter((id) => this.deckUnits.some((u) => u.id === id)).slice(0, this.deckSize);
      } catch { /* no memory of it */ }
      this.q('#deck').hidden = false;
      this.renderDeck();
      if (this.deck.length === this.deckSize) this.show(await this.net.setDeck(this.deck));
    } catch { /* the guide could not be read: the server hands out a random deck */ }
  }

  private async toggleDeck(id: string): Promise<void> {
    const at = this.deck.indexOf(id);
    if (at >= 0) this.deck.splice(at, 1);
    else if (this.deck.length < this.deckSize) this.deck.push(id);
    else return;
    try { localStorage.setItem('keepfall.deck', JSON.stringify(this.deck)); } catch { /* fine */ }
    this.renderDeck();
    if (this.deck.length === this.deckSize) this.show(await this.net.setDeck(this.deck));
  }

  /** What a unit does, in words, for the back of its card. */
  private static role(u: GuideUnit): string {
    if (u.heal) return t("Saldırmaz; her {0} sn'de en yaralı dostuna {1} can verir. Arka sırada durur.", u.healInterval ?? 0, u.heal);
    if (u.backFirst) return t('Düşmanın arka sırasını döver, iki hedefe sıçrar. Kuşanırken {0} kişi harcar.', u.people ?? 2);
    if (u.flank) return t('Arkadaki okçu, mancınık ve keşişe dalar. ×{0} hızlı; tek başına tarla yakar.', u.speedFactor ?? 2);
    if (u.back) return t('Arka sıradan ateş eder; öndekiler onu korur.');
    return t('Ön sırada dövüşür ve arkadakileri korur.');
  }

  private renderDeck(): void {
    const box = this.q('#deck-cards');
    const full = this.deck.length >= this.deckSize;
    if (box.childElementCount === 0) {
      const color = this.room?.players.find((p) => p.seat === this.mySeat)?.color ?? 'blue';
      box.innerHTML = this.deckUnits.map((u) => `
        <div class="ucard" data-unit="${u.id}">
          <div class="ucard-inner">
            <div class="ucard-face front">
              <span class="ucard-check" aria-hidden="true">✓</span>
              <button class="ucard-flip" type="button" data-a="flip" aria-label="${t('Kartı çevir')}" title="${t('Kartı çevir')}">↻</button>
              <div class="ucard-art"><canvas width="128" height="112"></canvas></div>
              <b class="ucard-name">${esc(tr(u.name))}</b>
              <span class="ucard-tag">${u.heal ? t('destek') : u.flank ? t('baskıncı') : u.backFirst ? t('kuşatma') : u.back ? t('menzilli') : t('yakın dövüş')}</span>
              <span class="ucard-btns"><button class="btn small" data-a="flip" title="${t('Kartı çevir')}">${t('Çevir')}</button><button class="btn small ucard-pick" data-a="deckpick" aria-pressed="false">${t('Seç')}</button></span>
            </div>
            <div class="ucard-face back">
              <b class="ucard-name">${esc(tr(u.name))}</b>
              <dl>
                <dt>${t('Can')}</dt><dd>${u.hp}</dd>
                <dt>${u.heal ? t('İyileştirme') : t('Hasar')}</dt><dd>${u.heal ? t('{0} / {1} sn', u.heal, u.healInterval ?? 0) : t('{0} / sn', Math.round(u.dps * 10) / 10)}</dd>
              </dl>
              <p class="ucard-role">${esc(LobbyScreen.role(u))}</p>
              <p class="ucard-vs"><span class="good">${t('Yener')}</span> ${esc(u.strong.map(tr).join(', ') || '—')}</p>
              <p class="ucard-vs"><span class="bad">${t('Korkar')}</span> ${esc(u.weak.map(tr).join(', ') || '—')}</p>
              <span class="ucard-btns"><button class="btn small" data-a="flip" title="${t('Kartı çevir')}">${t('Geri')}</button><button class="btn small ucard-pick" data-a="deckpick" aria-pressed="false">${t('Seç')}</button></span>
            </div>
          </div>
        </div>`).join('');
      box.querySelectorAll<HTMLElement>('.ucard').forEach((card) => mountPortrait(card.querySelector('canvas')!, card.dataset.unit!, color));
    }
    this.q('#deck-count').textContent = `${this.deck.length}/${this.deckSize}`;
    this.q('#deck-count').classList.toggle('done', full);
    box.querySelectorAll<HTMLElement>('.ucard').forEach((card) => {
      const on = this.deck.includes(card.dataset.unit!);
      card.classList.toggle('on', on);
      card.classList.toggle('dim', full && !on);
      card.querySelectorAll<HTMLButtonElement>('.ucard-pick').forEach((b) => { b.textContent = on ? t('Seçili') : t('Seç'); b.setAttribute('aria-pressed', String(on)); b.disabled = full && !on; });
    });
  }

  update(room: RoomView): void {
    this.room = room;
    const me = this.me(room);
    const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players.find((p) => p.seat === i + 1));
    this.q('#players').innerHTML = seats.map((p, i) => p ? `
      <li class="${p.connected ? '' : 'offline'}" data-color="${p.color}">
        <i class="avatar${frameClass(p.frame)}" style="background-image:url('${avatar(p.seat)}')"></i>
        <span class="pname">${botMark(p.seat)}${esc(tr(p.name))}${p.seat === this.mySeat ? ` <span class="muted">${t('(sen)')}</span>` : ''}</span>
        <span class="tags">
          ${p.isBot ? `<span class="tag">${t('bot · {0}', p.botLevel === 'easy' ? t('kolay') : p.botLevel === 'hard' ? t('zor') : t('orta'))}</span>` : ''}
          ${p.isBot && me?.isHost ? `<button class="btn small" data-a="rmbot" data-seat="${p.seat}">${t('Bot çıkar')}</button>` : ''}
          ${!p.isBot && me?.isHost && p.seat !== this.mySeat ? `<button class="btn small" data-a="kick" data-seat="${p.seat}">${t('Çıkar')}</button>` : ''}
          ${p.isHost ? `<span class="tag">${t('oda sahibi')}</span>` : ''}
          ${p.isBot ? '' : !p.connected ? `<span class="tag warn">${t('bağlantı yok')}</span>` : p.ready ? `<span class="tag ok">${t('hazır')}</span>` : `<span class="tag">${t('bekliyor')}</span>`}
        </span>
      </li>` : `<li class="empty"><i class="avatar"></i><span class="pname muted">${t('Boş yer {0}', i + 1)}</span>
        ${me?.isHost ? `<span class="tags">${t('Bot ekle:')}
          <button class="btn small" data-a="addbot" data-level="easy">${t('Kolay')}</button>
          <button class="btn small" data-a="addbot" data-level="medium">${t('Orta')}</button>
          <button class="btn small" data-a="addbot" data-level="hard">${t('Zor')}</button></span>` : ''}</li>`).join('')
      // A host alone in the room (nobody else, no bot yet) learns how to test on their own.
      + (me?.isHost && room.players.length === 1 ? `<li class="lobby-tip" role="note">💡 ${t('Tek başına mı test ediyorsun? Boş yerlerin yanındaki <b>Kolay / Orta / Zor</b> düğmeleriyle bot (yapay zekâ) ekleyebilirsin!')}</li>` : '');

    const nameInput = this.q<HTMLInputElement>('#myname');
    if (me && document.activeElement !== nameInput) nameInput.value = me.name;
    const ready = this.q<HTMLButtonElement>('#ready');
    ready.textContent = me?.ready ? t('Hazırım ✓') : t('Hazırım');
    ready.classList.toggle('btn-red', !!me?.ready);

    const isHost = !!me?.isHost;
    const start = this.q<HTMLButtonElement>('#start');
    start.classList.toggle('hidden', !isHost);
    this.q('#fill').classList.toggle('hidden', !isHost);
    const notReady = room.players.filter((p) => !p.isBot && (!p.ready || !p.connected)).length;
    const filling = isHost && this.fill().on && room.players.length < room.maxPlayers;
    start.disabled = !(room.canStart || (filling && notReady === 0));
    this.q('#start-hint').textContent = !isHost
      ? t('Herkes hazır olunca oda sahibi maçı başlatır.')
      : filling && notReady === 0 ? t('Boş yerler botla dolacak.')
      : room.players.length < room.minPlayers
        ? t('En az {0} oyuncu gerekiyor. Oda kodunu paylaş.', room.minPlayers)
        : notReady > 0 ? t('{0} oyuncu henüz hazır değil.', notReady) : t('Herkes hazır.');
  }

  private me(room: RoomView) { return room.players.find((p) => p.seat === this.mySeat); }

  private show(result: { ok: boolean; error: string | null }) {
    // The screen may already be gone (e.g. the match started while the call was in flight).
    const error = this.root.querySelector('#error');
    if (error) error.textContent = result.ok ? '' : tr(result.error ?? t('Olmadı.'));
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }
}

// ---- end of the match ----------------------------------------------------------------------

/** Winner, ranking and everyone's summary (the match is over, nothing is hidden any more). */
export class EndScreen {
  private summary: SummaryView | null = null;
  private resultShown = false;
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly net: GameConnection, private readonly mySeat: number) {
    const root = this.root = mount(parent, `
      <div class="screen menu paper end">
        <div class="title-ribbon ribbon ribbon-blue" id="end-title">${t('Maç bitti')}</div>
        <div class="end-scroll">
          <div class="end-art" id="end-art"></div>
          <p class="muted center" id="end-reason"></p>
          <div id="challenge"></div>
          <div id="progress-panel"></div>
          <div id="ranking"></div>
          <div id="deceptions"></div>
          <div id="summary"><p class="muted">${t('Özet hazırlanıyor…')}</p></div>
          <div id="others"></div>
        </div>
        <div class="start end-foot">
          <button data-a="again" id="again" class="btn wide kf-btn--green hidden">${t('Aynı oyuncularla yeni maç')}</button>
          <button data-a="lobby" id="lobby" class="btn wide hidden">${t('Lobiye dön')}</button>
          <p class="muted small center" id="lobby-hint"></p>
          <div class="ch-foot hidden" id="ch-foot">
            <button data-a="ch-retry" class="btn wide kf-btn--green">${t('Tekrar dene')}</button>
            <button data-a="ch-next" class="btn wide hidden">${t('Sonraki meydan okuma')}</button>
            <button data-a="ch-list" class="btn wide">${t('Meydan okumalar')}</button>
          </div>
        </div>
        <p class="error" id="error"></p>
      </div>`);
    root.addEventListener('click', async (e) => {
      const act = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a^="ch-"]')?.dataset.a;
      if (act && this.challenge) {
        const error = this.root.querySelector('#error');
        root.querySelectorAll<HTMLButtonElement>('.ch-foot button').forEach((b) => (b.disabled = true));
        const message = act === 'ch-retry' ? await this.challenge.retry() : act === 'ch-next' ? await this.challenge.next() : (this.challenge.list(), null);
        root.querySelectorAll<HTMLButtonElement>('.ch-foot button').forEach((b) => (b.disabled = false));
        if (error) error.textContent = tr(message ?? '');
        return;
      }
      if ((e.target as HTMLElement).closest('button[data-a="again"]')) {
        // Back to the lobby with the same players (bots stay), everybody ready, and straight into the next match.
        const error = this.root.querySelector('#error');
        let r = await this.net.backToLobby();
        // Alone with bots: straight into the next match. With other people: everybody meets in the lobby (the host starts it there; seats of people who do not come
        // back are filled with bots by "fill empty seats with bots").
        if (r.ok && this.endRoom && this.endRoom.players.filter((p) => !p.isBot).length <= 1) {
          r = await this.net.setReady(true);
          if (r.ok) r = await this.net.startMatch();
        }
        if (error) error.textContent = r.ok ? '' : tr(r.error ?? '');
      } else if ((e.target as HTMLElement).closest('button[data-a="lobby"]')) {
        const r = await this.net.backToLobby();
        const error = this.root.querySelector('#error');
        if (error) error.textContent = r.ok ? '' : tr(r.error ?? '');
      }
    });
  }

  /** The victory picture (crowned castle) for a winner, the defeat picture (ruin) for everybody else, both with the blue flags in the player's own colour. */
  private async showEndArt(won: boolean, color: PlayerColor): Promise<void> {
    const box = this.root.querySelector<HTMLElement>('#end-art');
    if (!box) return;
    try {
      const src = await endArt(won, color);
      if (!src) { box.replaceChildren(); return; }
      const out = new Image();
      out.src = src;
      out.alt = won ? t('Zafer') : t('Yenilgi');
      out.className = won ? 'end-victory' : 'end-defeat';
      out.style.width = 'calc(300px * var(--u, 1))';
      box.replaceChildren(out);
    } catch { box.replaceChildren(); /* the picture is a decoration: the result stands without it */ }
  }

  setSummary(summary: SummaryView): void {
    if (this.summary) return;
    this.summary = summary;
    this.root.querySelector('#summary')!.innerHTML = `<h2>${t('Senin özetin')}</h2>${summaryHtml(summary)}`;
  }

  private endRoom: RoomView | null = null;

  /** Set by the page when the room plays a challenge: what the foot buttons do (each returns an error text, or null). */
  challenge: { retry: () => Promise<string | null>; next: () => Promise<string | null>; list: () => void } | null = null;

  /** The progress block (mastery, new achievements and unlocks), built by ui/progress.ts. */
  setProgressHtml(html: string): void {
    this.root.querySelector('#progress-panel')!.innerHTML = html;
  }

  /** The goals and stars of the finished challenge (HTML built by ui/challenges.ts); `hasNext` shows the "next" button. */
  setChallengeResult(html: string, hasNext: boolean): void {
    this.root.querySelector('#challenge')!.innerHTML = html;
    this.root.querySelector('.screen.end')?.classList.add('ch-mode');
    this.root.querySelector('[data-a="ch-next"]')!.classList.toggle('hidden', !hasNext);
  }

  update(room: RoomView): void {
    this.endRoom = room;
    const r = room.result;
    if (r && !this.resultShown) {
      this.resultShown = true;
      const won = r.winners.includes(this.mySeat);
      sfx.play(won ? 'win' : 'lose');
      if (won) crazyVictory();
      // victory: the winner's colour (the ranking carries it); defeat: our own
      const winnerColor = r.ranking.find((x) => r.winners.includes(x.seat))?.color;
      confetti(this.root.querySelector<HTMLElement>('.screen') ?? this.root, won);
      void this.showEndArt(won, (won ? winnerColor : undefined) ?? room.players.find((p) => p.seat === this.mySeat)?.color ?? r.ranking.find((x) => x.seat === this.mySeat)?.color ?? 'blue');
      const names = r.ranking.filter((x) => r.winners.includes(x.seat)).map((x) => `${dot(x.color)}${esc(tr(x.name))}`).join(', ');
      const title = this.root.querySelector<HTMLElement>('#end-title')!;
      title.innerHTML = won
        ? (r.winners.length > 1 ? t('Berabere — zaferi paylaştın!') : t('Kazandın!'))
        : t('Kazanan: {0}', names || '—');
      title.classList.remove('ribbon-blue');
      title.classList.add(won ? (r.winners.length > 1 ? 'ribbon-yellow' : 'ribbon-blue') : 'ribbon-red');
      this.root.querySelector('#end-reason')!.textContent = r.byElimination
        ? t('Son ayakta kalan kale kazandı.')
        : t('Süre bitti: en yüksek nüfus kazandı.');
      this.root.querySelector('#ranking')!.innerHTML = `
        <ol class="ranking">${r.ranking.map((x) => `
          <li class="${r.winners.includes(x.seat) ? 'winner' : ''}" data-color="${x.color}">
            <span class="place">${x.place}.</span><i class="avatar${frameClass(x.frame)}" style="background-image:url('${avatar(x.seat)}')"></i>
            ${emblemHtml(x.kingdom, 'emblem-rank')}${rankBanner(x.kingdom, x.banner)}<span class="pname">${r.winners.includes(x.seat) ? `<i class="ico ico-crown" title="${t('Kazanan')}"></i>` : ''}${botMark(x.seat)}${esc(tr(x.name))}${x.seat === this.mySeat ? ` <span class="muted">${t('(sen)')}</span>` : ''}</span>
            <span class="muted small">${x.eliminated ? t('elendi') : t('nüfus {0}', x.population)}</span>
          </li>`).join('')}</ol>`;
      this.root.querySelector('#deceptions')!.innerHTML = deceptionTimelineHtml(r);
      const mine = r.summaries.find((x) => x.seat === this.mySeat);
      if (mine) this.setSummary(mine.summary);
      this.root.querySelector('#others')!.innerHTML = r.summaries.filter((x) => x.seat !== this.mySeat).map((x) => `
        <details class="other-summary"><summary>${dot(x.color)}${esc(tr(x.name))} · ${t('özet')}</summary>${summaryHtml(x.summary)}</details>`).join('');
    }
    const isHost = !!room.players.find((p) => p.seat === this.mySeat)?.isHost;
    const solo = !!room.challengeId && !!this.challenge;
    this.root.querySelector('#ch-foot')!.classList.toggle('hidden', !solo);
    this.root.querySelector('#lobby')!.classList.toggle('hidden', solo || !isHost || !FEATURE_PRIVATE_ROOM);
    this.root.querySelector('#again')!.classList.toggle('hidden', solo || !isHost);
    this.root.querySelector('#lobby-hint')!.textContent = solo ? '' : isHost
      ? t('Aynı oyuncularla yeni bir hazırlık için lobiye dön.')
      : t('Oda sahibi lobiye dönünce yeni maç kurulabilir.');
  }
}

/** A player's banner on the end screen: the design they picked for the kingdom they played (the match is over, so the kingdom is public). */
function rankBanner(kingdom: string | null | undefined, design: string | null | undefined): string {
  const src = bannerUrl(kingdom, design);
  return src ? `<img class="rank-banner" src="${src}" alt="" draggable="false">` : '';
}

function summaryHtml(s: SummaryView): string {
  const minutes = s.durationSeconds / 60;
  const workers = s.workers.map((w) => `${esc(tr(w.name))} ${w.count}`).join(' · ');
  const army = s.units.filter((u) => u.soldiers + u.weapons > 0)
    .map((u) => t('{0}: {1} asker, {2} silah depoda', esc(tr(u.name)), u.soldiers, u.weapons)).join('<br>') || t('Asker yok.');
  const buildings = s.buildings.map((b) => t('{0} Sv {1}', esc(tr(b.name)), b.level)).join(' · ');
  return `
    <div class="grid">
      <div>${t('Nüfus')}</div><div><b>${s.startPopulation} → ${s.finalPopulation}</b> ${t('(en yüksek {0}, {1} doğum)', s.peakPopulation, s.peopleBorn)}</div>
      <div>${t('Üretilen')}</div><div>${t('{0} yemek · {1} odun · {2} demir', fmt(s.produced.food), fmt(s.produced.wood), fmt(s.produced.iron))}</div>
      <div>${t('Elde kalan')}</div><div>${t('{0} yemek · {1} odun · {2} demir', fmt(s.final.food), fmt(s.final.wood), fmt(s.final.iron))}</div>
      <div>${t('Silah')}</div><div>${t('{0} üretildi', s.weaponsMade)}</div>
      <div>${t('Ordu')}</div><div>${army}</div>
      <div>${t('Meslekler')}</div><div>${workers}</div>
      <div>${t('Binalar')}</div><div>${buildings}</div>
      <div>${t('Açlık')}</div><div>${t('{0} sn', Math.round(s.starvingSeconds))}</div>
      <div>${t('Boşta')}</div><div>${t('{0} işçi-dakika (ortalama {1} kişi boşta)', (s.idleWorkerSeconds / 60).toFixed(1), (s.idleWorkerSeconds / 60 / Math.max(minutes, 1e-9)).toFixed(1))}</div>
      <div>${t('Savaş')}</div><div>${t('{0} saldırı · {1} düşman öldürüldü · {2} asker kaybı', s.war.attacksLaunched, s.war.enemiesKilled, s.war.soldiersLost)}</div>
      <div>${t('Kale')}</div><div>${s.war.eliminated ? t('kale düştü') : t('kale ayakta')}</div>
    </div>
    ${chart(s)}`;
}

/** Population and food over time as a small inline SVG (two lines, own scales). */
function chart(s: SummaryView): string {
  const pts = s.samples;
  if (pts.length < 2) return '';
  const w = 420, h = 140, pad = 24;
  const maxT = pts[pts.length - 1].seconds || 1;
  const maxPop = Math.max(...pts.map((p) => p.population), 1);
  const maxFood = Math.max(...pts.map((p) => p.food), 1);
  const x = (t: number) => pad + ((w - 2 * pad) * t) / maxT;
  const y = (v: number, max: number) => h - pad - ((h - 2 * pad) * v) / max;
  const line = (f: (p: (typeof pts)[number]) => number, max: number) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.seconds).toFixed(1)},${y(f(p), max).toFixed(1)}`).join(' ');
  return `
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${t('Nüfus ve yemek grafiği')}">
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="axis"/>
      <path d="${line((p) => p.population, maxPop)}" class="pop"/>
      <path d="${line((p) => p.food, maxFood)}" class="food"/>
      <text x="${pad}" y="14" class="pop-label">${t('nüfus (en çok {0})', maxPop)}</text>
      <text x="${w - pad}" y="14" text-anchor="end" class="food-label">${t('yemek (en çok {0})', fmt(maxFood))}</text>
      <text x="${w - pad}" y="${h - 6}" text-anchor="end" class="axis-label">${clock(maxT)}</text>
    </svg>`;
}
