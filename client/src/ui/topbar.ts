import { gearSvg, toggleSettings } from './settings';
import { guideClicked, markGuideClicked, toggleGuide } from './guide';
import { lang, t, toggleLang, tr } from '../i18n';
import { botMark, clock, esc, fmt, rate } from '../format';
import type { CastleView, PlayerView, RoomView } from '../types';

// The strip along the top that is always there: resources with their rates, population, the clock and
// phase, the castle's health and who is playing. Built once and updated in place.

const AVATAR_ROOT = '/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/UI%20Elements/UI%20Elements/Human%20Avatars/';

export interface TopBarEvents {
  /** The host's speed buttons (development only). */
  speed: (n: number) => void;
  /** A player chip was clicked (opens that castle's window). */
  player: (seat: number) => void;
  /** A rival's name was clicked: <paramref name="at"/> is where the chip is (the scout report scroll opens under it). */
  rival: (seat: number, at: DOMRect) => void;
}

export class TopBar {
  private readonly el: HTMLElement;
  private playersKey = '';
  private room: RoomView | null = null;
  private mySeat = 0;

  constructor(parent: HTMLElement, private readonly events: TopBarEvents) {
    this.el = document.createElement('div');
    this.el.className = 'topbar';
    this.el.innerHTML = `
      <div class="tb-l">
        <div class="strip hit tb-res">
          <span class="res" data-r="food" title=""><i class="ico ico-meat"></i><b></b><small></small></span>
          <span class="res" data-r="wood" title=""><i class="ico ico-wood"></i><b></b><small></small></span>
          <span class="res" data-r="iron" title=""><i class="ico ico-iron"></i><b></b><small></small></span>
          <span class="res" data-r="gold" title="${t('Altın: ormandan gelir; kale penceresinde asker kiralanır')}"><i class="ico ico-coin"></i><b></b><small></small></span>
        </div>
        <div class="strip hit tb-pop" title="${t('Nüfus ve asker sayısı')}">
          <span class="pop"><i class="ico ico-people"></i><span class="lbl">${t('Nüfus')}</span><b data-f="pop"></b></span>
          <span class="pop"><i class="ico ico-sword"></i><b data-f="soldiers"></b></span>
          <span class="idle-warn ribbon ribbon-sm ribbon-red hidden" data-f="idle" title="${t('Boştaki işçiler yemek yer ama üretmez')}"></span>
        </div>
      </div>
      <div class="tb-c">
      </div>
      <div class="tb-p"><div class="strip hit tb-players" data-f="players"></div></div>
      <div class="tb-k">
        <div class="ribbon tb-clock hit ribbon-blue" data-f="clock"><b></b><small></small></div>
        <div class="strip hit tb-icons">
          <button class="btn-round" data-settings title="${t('Ayarlar')}" aria-label="${t('Ayarlar')}">${gearSvg()}</button>
          <button class="btn-round" data-lang title="${lang === 'tr' ? 'English' : 'Türkçe'}" aria-label="${lang === 'tr' ? 'English' : 'Türkçe'}"><b>${lang === 'tr' ? 'EN' : 'TR'}</b></button>
          <button class="btn-round" data-guide title="${t('Nasıl oynanır?')}" aria-label="${t('Nasıl oynanır?')}"><b>?</b></button>
        </div>
        <div class="strip hit tb-speed hidden" data-f="speed"></div>
      </div>`;
    parent.appendChild(this.el);
    const guideBtn = this.q('[data-guide]');
    // Until the "?" is clicked for the first time (or for the first 15 s of the match) it glows, so a new player finds the guide.
    if (!guideClicked()) {
      guideBtn.classList.add('kf-pulse');
      const stop = () => guideBtn.classList.remove('kf-pulse');
      setTimeout(stop, 15_000);
      guideBtn.addEventListener('click', () => { markGuideClicked(); stop(); });
    }
    guideBtn.addEventListener('click', () => toggleGuide());
    this.q('[data-settings]').addEventListener('click', toggleSettings);
    this.q('[data-lang]').addEventListener('click', toggleLang);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const speed = t.closest<HTMLElement>('[data-speed]');
      if (speed) this.events.speed(Number(speed.dataset.speed));
      const player = t.closest<HTMLElement>('[data-seat]');
      if (!player) return;
      const seat = Number(player.dataset.seat);
      if (seat === this.mySeat) this.events.player(seat);
      else this.events.rival(seat, player.getBoundingClientRect());
    });
  }

  /** Where under the bar things (ribbons) may start: the bar's bottom edge. */
  get element(): HTMLElement { return this.el; }

  setSeat(seat: number): void {
    this.mySeat = seat;
  }

  setRoom(room: RoomView): void {
    this.room = room;
    this.renderPlayers();
  }

  update(s: CastleView): void {
    const set = (key: string, value: string, hint: string, cls = '') => {
      const r = this.q(`[data-r="${key}"]`);
      r.querySelector('b')!.textContent = value;
      const small = r.querySelector('small')!;
      small.textContent = hint;
      small.className = cls;
    };
    const foodNet = s.rates.foodIn - s.rates.foodOut;
    set('food', fmt(s.resources.food), `${rate(foodNet)}`, foodNet < 0 ? 'down' : 'up');
    set('wood', fmt(s.resources.wood), `${rate(s.rates.wood)}`, 'up');
    set('iron', fmt(s.resources.iron), `${rate(s.rates.iron)}`, 'up');
    set('gold', fmt(s.resources.gold), '', 'up');
    this.q('[data-r="food"]').title = t('Yemek: +{0} üretim, −{1} tüketim (dakikada)', s.rates.foodIn.toFixed(1), s.rates.foodOut.toFixed(1))
      + (s.starving ? `\n${t('Açlık: üretim yarıya indi!')}` : '');
    this.q('[data-r="food"]').classList.toggle('starving', s.starving);
    this.q('[data-r="wood"]').title = t('Odun: {0} /dk', rate(s.rates.wood));
    this.q('[data-r="iron"]').title = t('Demir: {0} /dk', rate(s.rates.iron));

    this.q('[data-f="pop"]').textContent = String(s.population);
    this.q('[data-f="soldiers"]').textContent = String(s.soldiers);
    const idle = s.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    const warn = this.q('[data-f="idle"]');
    warn.classList.toggle('hidden', idle === 0 || s.eliminated);
    warn.textContent = t('{0} boşta!', idle);

    const clockEl = this.q('[data-f="clock"]');
    clockEl.querySelector('b')!.textContent = clock(s.remainingSeconds);
    clockEl.querySelector('small')!.textContent = s.eliminated ? t('izleyici')
      : s.phase === 'war' ? (s.war.famine ? t('savaş · kıtlık') : t('savaş')) : t('hazırlık');
    clockEl.classList.toggle('ribbon-blue', s.phase === 'preparation' && !s.eliminated);
    clockEl.classList.toggle('ribbon-red', s.phase === 'war' && !s.eliminated);
    clockEl.classList.toggle('ribbon-black', s.eliminated);

    const speed = this.q('[data-f="speed"]');
    speed.classList.toggle('hidden', !s.speedControl);
    if (s.speedControl && !speed.firstChild)
      speed.innerHTML = [1, 5, 20].map((x) => `<button class="btn-round" data-speed="${x}" title="${t('Oyun hızı ×{0}', x)}">×${x}</button>`).join('');
    speed.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === s.speed));
  }

  private renderPlayers(): void {
    const players = this.room?.players ?? [];
    const key = players.map((p) => `${p.seat}:${p.name}:${p.color}:${p.connected}:${p.eliminated}:${p.isBot}`).join(',');
    if (key === this.playersKey) return;
    this.playersKey = key;
    const box = this.q('[data-f="players"]');
    box.dataset.n = String(players.length); // with three or four players only the avatars fit in one row
    box.innerHTML = players.map((p) => chip(p, p.seat === this.mySeat)).join('');
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.el.querySelector<T>(selector)!;
  }
}

function chip(p: PlayerView, me: boolean): string {
  const state = p.eliminated ? 'out' : p.connected ? '' : 'away';
  const avatar = `${AVATAR_ROOT}Avatars_${String(((p.seat - 1) % 25) + 1).padStart(2, '0')}.png`;
  const title = `${tr(p.name)}${p.isBot ? ` ${t('(bot)')}` : ''}${me ? ` ${t('(sen)')}` : ''}${p.eliminated ? ` — ${t('elendi')}` : p.connected ? '' : ` — ${t('bağlantı yok')}`}`;
  return `<span class="chip ${state} ${me ? 'me' : ''}" data-seat="${p.seat}" data-color="${p.color}" title="${esc(title)}">
    <i class="avatar" style="background-image:url('${avatar}')"></i><span class="chip-name">${botMark(p.seat)}${esc(tr(p.name))}</span></span>`;
}
