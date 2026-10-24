import { clock, COLOR_CSS, esc, fmt } from './format';
import type { GameConnection } from './net';
import type { RoomView, SummaryView } from './types';

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

export class HomeScreen {
  constructor(
    parent: HTMLElement,
    defaults: { name: string; code: string; error?: string },
    actions: { create: (name: string) => Promise<string | null>; join: (name: string, code: string) => Promise<string | null> },
  ) {
    const root = mount(parent, `
      <div class="screen menu paper home">
        <img class="hero" src="${ART}Buildings/Blue%20Buildings/Castle.png" alt="" onerror="this.remove()">
        <div class="title-ribbon ribbon ribbon-blue">Keepfall</div>
        <p class="muted center">2–4 kişilik kale savunma ve fetih oyunu</p>
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
    onName: (name: string) => void) {
    const link = `${location.origin}/oda/${room.code}`;
    const root = this.root = mount(parent, `
      <div class="screen menu paper lobby">
        <div class="title-ribbon ribbon ribbon-blue">Oda <span class="code">${esc(room.code)}</span></div>
        <div class="share">
          <input readonly value="${esc(link)}" aria-label="Oda linki">
          <button class="btn" data-a="copy">Linki kopyala</button>
        </div>
        <ul class="players" id="players"></ul>
        <div class="me">
          <label class="field">Adın <input id="myname" maxlength="16"></label>
          <button class="btn" data-a="ready" id="ready"></button>
        </div>
        <div class="start">
          <button data-a="start" id="start" class="btn btn-red wide">Maçı başlat</button>
          <p class="muted small center" id="start-hint"></p>
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
      } else if (a === 'start') {
        this.show(await this.net.startMatch());
      }
    });
    this.update(room);
  }

  private room: RoomView | null = null;

  update(room: RoomView): void {
    this.room = room;
    const me = this.me(room);
    const seats = Array.from({ length: room.maxPlayers }, (_, i) => room.players.find((p) => p.seat === i + 1));
    this.q('#players').innerHTML = seats.map((p, i) => p ? `
      <li class="${p.connected ? '' : 'offline'}" data-color="${p.color}">
        <i class="avatar" style="background-image:url('${avatar(p.seat)}')"></i>
        <span class="pname">${esc(p.name)}${p.seat === this.mySeat ? ' <span class="muted">(sen)</span>' : ''}</span>
        <span class="tags">
          ${p.isHost ? '<span class="tag">oda sahibi</span>' : ''}
          ${!p.connected ? '<span class="tag warn">bağlantı yok</span>' : p.ready ? '<span class="tag ok">hazır</span>' : '<span class="tag">bekliyor</span>'}
        </span>
      </li>` : `<li class="empty"><i class="avatar"></i><span class="pname muted">Boş yer ${i + 1}</span></li>`).join('');

    const nameInput = this.q<HTMLInputElement>('#myname');
    if (me && document.activeElement !== nameInput) nameInput.value = me.name;
    const ready = this.q<HTMLButtonElement>('#ready');
    ready.textContent = me?.ready ? 'Hazırım ✓' : 'Hazırım';
    ready.classList.toggle('btn-red', !!me?.ready);

    const isHost = !!me?.isHost;
    const start = this.q<HTMLButtonElement>('#start');
    start.classList.toggle('hidden', !isHost);
    start.disabled = !room.canStart;
    const notReady = room.players.filter((p) => !p.ready || !p.connected).length;
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
            <span class="pname">${esc(x.name)}${x.seat === this.mySeat ? ' <span class="muted">(sen)</span>' : ''}</span>
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
      <div>Kale</div><div>${fmt(s.war.castleDamageDealt)} hasar verdin · ${fmt(s.war.castleDamageTaken)} hasar aldın · ${s.war.eliminated ? 'kale düştü' : `can ${fmt(s.war.wallHp)} / ${fmt(s.war.maxWallHp)}`}</div>
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
