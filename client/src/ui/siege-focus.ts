import { botMark, esc } from '../format';
import { t, tr } from '../i18n';
import type { GameConnection } from '../net';
import type { BattleStartedView } from '../types';
import { dot } from './report-html';

// At a gate where two armies besiege the same castle, everyone in the fight chooses whom to hit first: this small panel under the top bar
// lists the others in the battle (the castle, the other besieger) and tells the server the choice. Nothing else changes for the player.

export class SiegeFocus {
  private readonly el: HTMLElement;
  private sig = '';
  /** What this player chose in each battle (a seat; 0 = the default). */
  private readonly chosen = new Map<string, number>();
  private readonly timer: number;

  constructor(
    parent: HTMLElement,
    private readonly net: GameConnection,
    private readonly mySeat: number,
    private readonly battles: () => BattleStartedView[],
    private readonly say: (message: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'siege-focus hit hidden';
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-seat]');
      if (b) void this.choose(b.dataset.battle!, Number(b.dataset.seat));
    });
    this.timer = window.setInterval(() => this.render(), 500);
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.el.remove();
  }

  private async choose(battle: string, seat: number): Promise<void> {
    const r = await this.net.setSiegeFocus(seat);
    if (!r.ok) { this.say(tr(r.error ?? '')); return; }
    this.chosen.set(battle, seat);
    this.sig = '';
    this.render();
  }

  private render(): void {
    const mine = this.battles().find((v) => v.kind === 'siege' && v.sides.length >= 3 && v.sides.some((s) => s.seat === this.mySeat));
    if (!mine) { this.el.classList.add('hidden'); this.sig = ''; return; }
    const pick = this.chosen.get(mine.id) ?? 0;
    const sig = `${mine.id}:${mine.sides.length}:${pick}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const others = mine.sides.filter((s) => s.seat !== this.mySeat);
    const btn = (seat: number, label: string, on: boolean) =>
      `<button class="btn${on ? ' on' : ''}" data-battle="${mine.id}" data-seat="${seat}">${label}</button>`;
    this.el.innerHTML = `
      <div class="siege-focus-title">${t('Kapıdaki savaş')} — ${t('Kime vurulsun?')}</div>
      <div class="siege-focus-row">
        ${others.map((s) => btn(s.seat, `${dot(s.color)}${botMark(s.seat)}${s.attacker ? t('Rakip ordu') : t('Kale')}: ${esc(tr(s.name))}`, pick === s.seat)).join('')}
        ${btn(0, t('Varsayılan'), pick === 0)}
      </div>`;
    this.el.classList.remove('hidden');
  }
}
