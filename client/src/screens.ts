import { sfx } from './audio';
import { botMark, clock, COLOR_CSS, esc, fmt } from './format';
import { emblemHtml } from './ui/emblem';
import type { GameConnection } from './net';
import type { BotLevel, RoomView, SummaryView } from './types';
import { loadGuide, type GuideUnit } from './ui/guide';
import { mountPortrait } from './ui/portraits';

// Plain-HTML screens around the game: home, lobby and the end screen, in the same parchment-and-ribbon
// look as the in-game UI (ui/ui.css).
// Each builds its structure once and updates in place, so typing in an input is never interrupted.
// Each screen renders into its own element (and listens there), so when the app clears the page
// the screen and its listeners go away together.

function mount(parent: HTMLElement, html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  parent.appendChild(el);
  return el;
}

const dot = (color: string) => `<span class="dot" style="background:${COLOR_CSS[color] ?? '#888'}"></span>`;

const ART = '/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/';
const avatar = (seat: number) =>
  `${ART}UI%20Elements/UI%20Elements/Human%20Avatars/Avatars_${String(((seat - 1) % 25) + 1).padStart(2, '0')}.png`;

// ---- home ----------------------------------------------------------------------------------

/** The Keepfall logo (the generated picture, public/art/ui/logo-half.png). */
export const logoHtml = (): string => `
  <div class="kf-logo" role="img" aria-label="Keepfall"><img class="kf-logo-img" src="/art/ui/logo-half.png" alt="" draggable="false"></div>`;

export class HomeScreen {
  constructor(
    parent: HTMLElement,
    defaults: { name: string; code: string; error?: string },
    actions: { create: (name: string) => Promise<string | null>; join: (name: string, code: string) => Promise<string | null> },
  ) {
    const root = mount(parent, `
      <div class="screen menu paper home">
        ${logoHtml()}
        <p class="muted center kf-logo-sub">2–4 kişilik kale savunma ve fetih oyunu</p>
        <label class="field">Adın <input id="name" maxlength="16" autocomplete="nickname" value="${esc(defaults.name)}" placeholder="Oyuncu"></label>
        <button id="create" class="btn wide">Oda kur</button>
        <div class="or">ya da</div>
        <div class="join-row">
          <label class="field">Oda kodu <input id="code" maxlength="4" value="${esc(defaults.code)}" placeholder="ABCD" autocapitalize="characters"></label>
          <button id="join" class="btn btn-red">Odaya katıl</button>
        </div>
        <p class="error" id="error">${esc(defaults.error ?? '')}</p>
      </div>`);
    const name = root.querySelector<HTMLInputElement>('#name')!;
    const code = root.querySelector<HTMLInputElement>('#code')!;
    const error = root.querySelector<HTMLElement>('#error')!;
    const buttons = root.querySelectorAll<HTMLButtonElement>('button');
    const run = async (action: () => Promise<string | null>) => {
      buttons.forEach((b) => (b.disabled = true));
      error.textContent = (await action()) ?? '';
      buttons.forEach((b) => (b.disabled = false));
    };
    root.querySelector('#create')!.addEventListener('click', () => run(() => actions.create(name.value)));
    root.querySelector('#join')!.addEventListener('click', () => run(() => actions.join(name.value, code.value)));
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') void run(() => actions.join(name.value, code.value)); });
    (defaults.code ? name : name.value ? code : name).focus();
  }
}

// ---- lobby ---------------------------------------------------------------------------------

export class LobbyScreen {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, private readonly net: GameConnection, private readonly mySeat: number, room: RoomView,
    onName: (name: string) => void, onLeave: () => void) {
    const link = `${location.origin}/oda/${room.code}`;
    const root = this.root = mount(parent, `
      <div class="screen menu paper lobby">
        <div class="lob-grid">
          <div class="lob-left">
            ${logoHtml()}
            <div class="title-ribbon ribbon ribbon-blue">Oda <span class="code">${esc(room.code)}</span></div>
            <div class="share">
              <input readonly value="${esc(link)}" aria-label="Oda linki">
              <button class="btn" data-a="copy">Linki kopyala</button>
            </div>
            <ul class="players" id="players"></ul>
          </div>
          <div class="lob-right">
            <div class="deck" id="deck" hidden>
              <h3>Destem <span class="deck-medal" id="deck-count" title="Seçilen birlik"></span></h3>
              <p class="muted small">Maçta yalnız seçtiğin 4 birliği üretebilirsin. Kartı çevirmek için tıkla; seçmek için <b>Seç</b>'e bas ya da çift tıkla. Rakip destene yalnız gözcü raporu bakar; seçmezsen rastgele verilir.</p>
              <div class="deck-cards" id="deck-cards"></div>
            </div>
          </div>
          <div class="lob-bottom">
            <label class="field">Adın <input id="myname" maxlength="16"></label>
            <button class="btn" data-a="ready" id="ready"></button>
            <button class="btn" data-a="leave" id="leave">Odadan çık</button>
            <div class="start">
              <button data-a="start" id="start" class="btn btn-red wide">Maçı başlat</button>
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
      if (a === 'copy') {
        const input = this.q<HTMLInputElement>('.share input');
        try { await navigator.clipboard.writeText(input.value); this.q('[data-a="copy"]').textContent = 'Kopyalandı'; }
        catch { input.select(); }
      } else if (a === 'ready') {
        this.show(await this.net.setReady(!this.me(this.room!)?.ready));
      } else if (a === 'deckpick') {
        await this.toggleDeck((e.target as HTMLElement).closest<HTMLElement>('[data-unit]')!.dataset.unit!);
      } else if (a === 'flip') {
        (e.target as HTMLElement).closest<HTMLElement>('.ucard')!.classList.toggle('flipped');
      } else if (a === 'leave') {
        onLeave();
      } else if (a === 'start') {
        this.show(await this.net.startMatch());
      } else if (a === 'addbot') {
        const level = (e.target as HTMLElement).closest<HTMLElement>('[data-level]')?.dataset.level as BotLevel;
        this.show(await this.net.addBot(level));
      } else if (a === 'rmbot') {
        this.show(await this.net.removeBot(Number((e.target as HTMLElement).closest<HTMLElement>('[data-seat]')!.dataset.seat)));
      }
    });
    // A click on the card itself turns it over; a double click picks it.
    this.q('#deck-cards').addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button')) return;
      t.closest<HTMLElement>('.ucard')?.classList.toggle('flipped');
    });
    this.q('#deck-cards').addEventListener('dblclick', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.ucard');
      if (!card || (e.target as HTMLElement).closest('button')) return;
      card.classList.toggle('flipped'); // the two clicks of the double click turned it twice already: put it as it was
      void this.toggleDeck(card.dataset.unit!);
    });
    this.update(room);
    void this.setupDeck();
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
    if (u.heal) return `Saldırmaz; her ${u.healInterval} sn'de en yaralı dostuna ${u.heal} can verir. Arka sırada durur.`;
    if (u.backFirst) return 'Düşmanın arka sırasını döver, iki hedefe sıçrar. Kuşanırken ' + (u.people ?? 2) + ' kişi harcar.';
    if (u.flank) return `Arkadaki okçu, mancınık ve keşişe dalar. ×${u.speedFactor ?? 2} hızlı; tek başına tarla yakar.`;
    if (u.back) return 'Arka sıradan ateş eder; öndekiler onu korur.';
    return 'Ön sırada dövüşür ve arkadakileri korur.';
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
              <div class="ucard-art"><canvas width="128" height="112"></canvas></div>
              <b class="ucard-name">${esc(u.name)}</b>
              <span class="ucard-tag">${u.heal ? 'destek' : u.flank ? 'baskıncı' : u.backFirst ? 'kuşatma' : u.back ? 'menzilli' : 'yakın dövüş'}</span>
              <span class="ucard-btns"><button class="btn small" data-a="flip" title="Kartı çevir">Çevir</button><button class="btn small ucard-pick" data-a="deckpick" aria-pressed="false">Seç</button></span>
            </div>
            <div class="ucard-face back">
              <b class="ucard-name">${esc(u.name)}</b>
              <dl>
                <dt>Can</dt><dd>${u.hp}</dd>
                <dt>${u.heal ? 'İyileştirme' : 'Hasar'}</dt><dd>${u.heal ? `${u.heal} / ${u.healInterval} sn` : `${Math.round(u.dps * 10) / 10} / sn`}</dd>
              </dl>
              <p class="ucard-role">${esc(LobbyScreen.role(u))}</p>
              <p class="ucard-vs"><span class="good">Yener</span> ${esc(u.strong.join(', ') || '—')}</p>
              <p class="ucard-vs"><span class="bad">Korkar</span> ${esc(u.weak.join(', ') || '—')}</p>
              <span class="ucard-btns"><button class="btn small" data-a="flip" title="Kartı çevir">Geri</button><button class="btn small ucard-pick" data-a="deckpick" aria-pressed="false">Seç</button></span>
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
      card.querySelectorAll<HTMLButtonElement>('.ucard-pick').forEach((b) => { b.textContent = on ? 'Seçili' : 'Seç'; b.setAttribute('aria-pressed', String(on)); b.disabled = full && !on; });
    });
  }

  update(room: RoomView): void {
    this.room = room;
    const me = this.me(room);
    const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players.find((p) => p.seat === i + 1));
    this.q('#players').innerHTML = seats.map((p, i) => p ? `
      <li class="${p.connected ? '' : 'offline'}" data-color="${p.color}">
        <i class="avatar" style="background-image:url('${avatar(p.seat)}')"></i>
        <span class="pname">${botMark(p.seat)}${esc(p.name)}${p.seat === this.mySeat ? ' <span class="muted">(sen)</span>' : ''}</span>
        <span class="tags">
          ${p.isBot ? `<span class="tag">bot · ${p.botLevel === 'easy' ? 'kolay' : p.botLevel === 'hard' ? 'zor' : 'orta'}</span>` : ''}
          ${p.isBot && me?.isHost ? `<button class="btn small" data-a="rmbot" data-seat="${p.seat}">Bot çıkar</button>` : ''}
          ${p.isHost ? '<span class="tag">oda sahibi</span>' : ''}
          ${p.isBot ? '' : !p.connected ? '<span class="tag warn">bağlantı yok</span>' : p.ready ? '<span class="tag ok">hazır</span>' : '<span class="tag">bekliyor</span>'}
        </span>
      </li>` : `<li class="empty"><i class="avatar"></i><span class="pname muted">Boş yer ${i + 1}</span>
        ${me?.isHost ? `<span class="tags">Bot ekle:
          <button class="btn small" data-a="addbot" data-level="easy">Kolay</button>
          <button class="btn small" data-a="addbot" data-level="medium">Orta</button>
          <button class="btn small" data-a="addbot" data-level="hard">Zor</button></span>` : ''}</li>`).join('');

    const nameInput = this.q<HTMLInputElement>('#myname');
    if (me && document.activeElement !== nameInput) nameInput.value = me.name;
    const ready = this.q<HTMLButtonElement>('#ready');
    ready.textContent = me?.ready ? 'Hazırım ✓' : 'Hazırım';
    ready.classList.toggle('btn-red', !!me?.ready);

    const isHost = !!me?.isHost;
    const start = this.q<HTMLButtonElement>('#start');
    start.classList.toggle('hidden', !isHost);
    start.disabled = !room.canStart;
    const notReady = room.players.filter((p) => !p.isBot && (!p.ready || !p.connected)).length;
    this.q('#start-hint').textContent = !isHost
      ? 'Herkes hazır olunca oda sahibi maçı başlatır.'
      : room.players.length < room.minPlayers
        ? `En az ${room.minPlayers} oyuncu gerekiyor. Linki paylaş.`
        : notReady > 0 ? `${notReady} oyuncu henüz hazır değil.` : 'Herkes hazır.';
  }

  private me(room: RoomView) { return room.players.find((p) => p.seat === this.mySeat); }

  private show(result: { ok: boolean; error: string | null }) {
    // The screen may already be gone (e.g. the match started while the call was in flight).
    const error = this.root.querySelector('#error');
    if (error) error.textContent = result.ok ? '' : result.error ?? 'Olmadı.';
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
        <div class="title-ribbon ribbon ribbon-blue" id="end-title">Maç bitti</div>
        <p class="muted center" id="end-reason"></p>
        <div id="ranking"></div>
        <div id="summary"><p class="muted">Özet hazırlanıyor…</p></div>
        <div id="others"></div>
        <div class="start">
          <button data-a="lobby" id="lobby" class="btn wide hidden">Lobiye dön</button>
          <p class="muted small center" id="lobby-hint"></p>
        </div>
        <p class="error" id="error"></p>
      </div>`);
    root.addEventListener('click', async (e) => {
      if ((e.target as HTMLElement).closest('button[data-a="lobby"]')) {
        const r = await this.net.backToLobby();
        const error = this.root.querySelector('#error');
        if (error) error.textContent = r.ok ? '' : r.error ?? '';
      }
    });
  }

  setSummary(summary: SummaryView): void {
    if (this.summary) return;
    this.summary = summary;
    this.root.querySelector('#summary')!.innerHTML = `<h2>Senin özetin</h2>${summaryHtml(summary)}`;
  }

  update(room: RoomView): void {
    const r = room.result;
    if (r && !this.resultShown) {
      this.resultShown = true;
      const won = r.winners.includes(this.mySeat);
      sfx.play(won ? 'win' : 'lose');
      const names = r.ranking.filter((x) => r.winners.includes(x.seat)).map((x) => `${dot(x.color)}${esc(x.name)}`).join(', ');
      const title = this.root.querySelector<HTMLElement>('#end-title')!;
      title.innerHTML = won
        ? (r.winners.length > 1 ? 'Berabere — zaferi paylaştın!' : 'Kazandın!')
        : `Kazanan: ${names || '—'}`;
      title.classList.remove('ribbon-blue');
      title.classList.add(won ? (r.winners.length > 1 ? 'ribbon-yellow' : 'ribbon-blue') : 'ribbon-red');
      this.root.querySelector('#end-reason')!.textContent = r.byElimination
        ? 'Son ayakta kalan kale kazandı.'
        : 'Süre bitti: en yüksek nüfus kazandı.';
      this.root.querySelector('#ranking')!.innerHTML = `
        <ol class="ranking">${r.ranking.map((x) => `
          <li class="${r.winners.includes(x.seat) ? 'winner' : ''}" data-color="${x.color}">
            <span class="place">${x.place}.</span><i class="avatar" style="background-image:url('${avatar(x.seat)}')"></i>
            ${emblemHtml(x.kingdom, 'emblem-rank')}<span class="pname">${r.winners.includes(x.seat) ? '<i class="ico ico-crown" title="Kazanan"></i>' : ''}${botMark(x.seat)}${esc(x.name)}${x.seat === this.mySeat ? ' <span class="muted">(sen)</span>' : ''}</span>
            <span class="muted small">${x.eliminated ? 'elendi' : `nüfus ${x.population}`}</span>
          </li>`).join('')}</ol>`;
      const mine = r.summaries.find((x) => x.seat === this.mySeat);
      if (mine) this.setSummary(mine.summary);
      this.root.querySelector('#others')!.innerHTML = r.summaries.filter((x) => x.seat !== this.mySeat).map((x) => `
        <details class="other-summary"><summary>${dot(x.color)}${esc(x.name)} · özet</summary>${summaryHtml(x.summary)}</details>`).join('');
    }
    const isHost = !!room.players.find((p) => p.seat === this.mySeat)?.isHost;
    this.root.querySelector('#lobby')!.classList.toggle('hidden', !isHost);
    this.root.querySelector('#lobby-hint')!.textContent = isHost
      ? 'Aynı oyuncularla yeni bir hazırlık için lobiye dön.'
      : 'Oda sahibi lobiye dönünce yeni maç kurulabilir.';
  }
}

function summaryHtml(s: SummaryView): string {
  const minutes = s.durationSeconds / 60;
  const workers = s.workers.map((w) => `${esc(w.name)} ${w.count}`).join(' · ');
  const army = s.units.filter((u) => u.soldiers + u.weapons > 0)
    .map((u) => `${esc(u.name)}: ${u.soldiers} asker, ${u.weapons} silah depoda`).join('<br>') || 'Asker yok.';
  const buildings = s.buildings.map((b) => `${esc(b.name)} Sv ${b.level}`).join(' · ');
  return `
    <div class="grid">
      <div>Nüfus</div><div><b>${s.startPopulation} → ${s.finalPopulation}</b> (en yüksek ${s.peakPopulation}, ${s.peopleBorn} doğum)</div>
      <div>Üretilen</div><div>${fmt(s.produced.food)} yemek · ${fmt(s.produced.wood)} odun · ${fmt(s.produced.iron)} demir</div>
      <div>Elde kalan</div><div>${fmt(s.final.food)} yemek · ${fmt(s.final.wood)} odun · ${fmt(s.final.iron)} demir</div>
      <div>Silah</div><div>${s.weaponsMade} üretildi</div>
      <div>Ordu</div><div>${army}</div>
      <div>Meslekler</div><div>${workers}</div>
      <div>Binalar</div><div>${buildings}</div>
      <div>Açlık</div><div>${Math.round(s.starvingSeconds)} sn</div>
      <div>Boşta</div><div>${(s.idleWorkerSeconds / 60).toFixed(1)} işçi-dakika (ortalama ${(s.idleWorkerSeconds / 60 / Math.max(minutes, 1e-9)).toFixed(1)} kişi boşta)</div>
      <div>Savaş</div><div>${s.war.attacksLaunched} saldırı · ${s.war.enemiesKilled} düşman öldürüldü · ${s.war.soldiersLost} asker kaybı</div>
      <div>Kale</div><div>${s.war.eliminated ? 'kale düştü' : 'kale ayakta'}</div>
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
    <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Nüfus ve yemek grafiği">
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="axis"/>
      <path d="${line((p) => p.population, maxPop)}" class="pop"/>
      <path d="${line((p) => p.food, maxFood)}" class="food"/>
      <text x="${pad}" y="14" class="pop-label">nüfus (en çok ${maxPop})</text>
      <text x="${w - pad}" y="14" text-anchor="end" class="food-label">yemek (en çok ${fmt(maxFood)})</text>
      <text x="${w - pad}" y="${h - 6}" text-anchor="end" class="axis-label">${clock(maxT)}</text>
    </svg>`;
}
