import { sfx } from '../audio';
import { toggleGuide } from './guide';
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
          <span class="res" data-r="gold" title="Altın: ormandan gelir; kale penceresinde asker kiralanır"><i class="ico ico-coin"></i><b></b><small></small></span>
        </div>
        <div class="strip hit tb-pop" title="Nüfus ve asker sayısı">
          <span class="pop"><span class="lbl">Nüfus</span><b data-f="pop"></b></span>
          <span class="pop"><i class="ico ico-sword"></i><b data-f="soldiers"></b></span>
          <span class="idle-warn ribbon ribbon-sm ribbon-red hidden" data-f="idle" title="Boştaki işçiler yemek yer ama üretmez"></span>
        </div>
      </div>
      <div class="tb-c">
        <div class="strip hit tb-hp" title="Kale canı"><i class="ico ico-shield"></i>
          <div class="gbar"><div class="fill"></div><span class="gbar-text"></span></div></div>
      </div>
      <div class="tb-p"><div class="strip hit tb-players" data-f="players"></div></div>
      <div class="tb-k">
        <div class="ribbon tb-clock hit ribbon-blue" data-f="clock"><b></b><small></small></div>
        <div class="strip hit tb-icons">
          <button class="btn-round" data-sound="toggle" aria-label="Ses" aria-haspopup="true" aria-expanded="false" title="Ses">
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M2 7h4l5-4v14l-5-4H2z" fill="currentColor"/>
              <path class="wave" d="M13.5 6.5a5 5 0 0 1 0 7M15.5 4a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path class="slash" d="M3 3l14 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
          <button class="btn-round" data-guide title="Nasıl oynanır?" aria-label="Nasıl oynanır?"><b>?</b></button>
          <div class="tb-menu paper hit hidden" data-f="soundmenu" role="menu">
            <div class="tb-menu-row"><b>Ses</b><button class="kf-btn" data-sound="mute"></button></div>
            <input type="range" min="0" max="100" step="5" data-sound="volume" aria-label="Ses düzeyi" title="Ses düzeyi">
          </div>
        </div>
        <div class="strip hit tb-speed hidden" data-f="speed"></div>
      </div>`;
    parent.appendChild(this.el);
    this.wireSound();
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

  /**
   * The speaker icon opens a small menu (on/off and the volume); "?" opens the guide. The choice is kept by the sound module
   * (localStorage, when it works). The menu closes on a click elsewhere or Esc.
   */
  private wireSound(): void {
    const icon = this.q<HTMLButtonElement>('[data-sound="toggle"]');
    const menu = this.q('[data-f="soundmenu"]');
    const mute = this.q<HTMLButtonElement>('[data-sound="mute"]');
    const slider = this.q<HTMLInputElement>('[data-sound="volume"]');
    const show = () => {
      icon.classList.toggle('off', sfx.muted);
      icon.title = sfx.muted ? 'Ses kapalı' : 'Ses';
      mute.textContent = sfx.muted ? 'Aç' : 'Kapat';
      slider.value = String(Math.round(sfx.volume * 100));
      slider.disabled = sfx.muted;
    };
    const setOpen = (open: boolean) => {
      menu.classList.toggle('hidden', !open);
      icon.setAttribute('aria-expanded', String(open));
    };
    icon.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.classList.contains('hidden')); });
    menu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => setOpen(false));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.classList.contains('hidden')) { setOpen(false); e.stopPropagation(); } }, true);
    mute.addEventListener('click', () => { sfx.setMuted(!sfx.muted); show(); });
    this.q('[data-guide]').addEventListener('click', toggleGuide);
    slider.addEventListener('input', () => { sfx.setVolume(Number(slider.value) / 100); });
    slider.addEventListener('change', () => sfx.play('sword')); // a sample at the new level
    show();
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
    this.q('[data-r="food"]').title = `Yemek: +${s.rates.foodIn.toFixed(1)} üretim, −${s.rates.foodOut.toFixed(1)} tüketim (dakikada)`
      + (s.starving ? '\nAçlık: üretim yarıya indi!' : '');
    this.q('[data-r="food"]').classList.toggle('starving', s.starving);
    this.q('[data-r="wood"]').title = `Odun: ${rate(s.rates.wood)} /dk`;
    this.q('[data-r="iron"]').title = `Demir: ${rate(s.rates.iron)} /dk`;

    this.q('[data-f="pop"]').textContent = String(s.population);
    this.q('[data-f="soldiers"]').textContent = String(s.soldiers);
    const idle = s.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    const warn = this.q('[data-f="idle"]');
    warn.classList.toggle('hidden', idle === 0 || s.eliminated);
    warn.textContent = `${idle} boşta!`;

    const clockEl = this.q('[data-f="clock"]');
    clockEl.querySelector('b')!.textContent = clock(s.remainingSeconds);
    clockEl.querySelector('small')!.textContent = s.eliminated ? 'izleyici'
      : s.phase === 'war' ? (s.war.famine ? 'savaş · kıtlık' : 'savaş') : 'hazırlık';
    clockEl.classList.toggle('ribbon-blue', s.phase === 'preparation' && !s.eliminated);
    clockEl.classList.toggle('ribbon-red', s.phase === 'war' && !s.eliminated);
    clockEl.classList.toggle('ribbon-black', s.eliminated);

    const hp = this.q('.tb-hp .gbar');
    const w = s.war;
    hp.classList.toggle('low', w.wallHp < w.maxWallHp * 0.35);
    hp.querySelector<HTMLElement>('.fill')!.style.width = `${(100 * w.wallHp) / w.maxWallHp}%`;
    hp.querySelector('.gbar-text')!.textContent = s.eliminated ? 'Kale düştü' : `${fmt(w.wallHp)} / ${fmt(w.maxWallHp)}`;

    const speed = this.q('[data-f="speed"]');
    speed.classList.toggle('hidden', !s.speedControl);
    if (s.speedControl && !speed.firstChild)
      speed.innerHTML = [1, 5, 20].map((x) => `<button class="btn-round" data-speed="${x}" title="Oyun hızı ×${x}">×${x}</button>`).join('');
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
  const title = `${p.name}${p.isBot ? ' (bot)' : ''}${me ? ' (sen)' : ''}${p.eliminated ? ' — elendi' : p.connected ? '' : ' — bağlantı yok'}`;
  return `<span class="chip ${state} ${me ? 'me' : ''}" data-seat="${p.seat}" data-color="${p.color}" title="${esc(title)}">
    <i class="avatar" style="background-image:url('${avatar}')"></i><span class="chip-name">${botMark(p.seat)}${esc(p.name)}</span></span>`;
}
