import { COLOR_NAMES, esc } from '../format';
import type { ArmyView, CastleView, ScoutMissionView, ScoutTargetView } from '../types';
import { dot } from './report-html';
import { Win, type WinContext, type WinData } from './windows';

// One of our armies or scouts on the road, and the forest (a place kept for the next step).

const armyState = (a: ArmyView) =>
  a.fighting ? 'savaşta' : a.state === 'returning' ? 'eve dönüyor' : a.mode === 'intercept' ? 'önünü kesiyor' : 'saldırıya gidiyor';

export class ArmyWin extends Win {
  private missing = false;

  constructor(ctx: WinContext, private readonly publicId: string, s: CastleView) {
    super(ctx, 'blue');
    this.body.innerHTML = `
      <div class="row"><span>Hedef</span><b data-f="target"></b></div>
      <div class="row"><span>Durum</span><b data-f="state"></b></div>
      <div class="gbar" data-f="bar"><div class="fill"></div></div>
      <div class="row sub"><span data-f="left"></span></div>
      <h4>Askerler</h4>
      <div data-f="units"></div>
      <p class="muted-ink small" data-f="mode"></p>
      <div class="row center"><button class="btn btn-red" data-act="recall" title="Bulunduğu yerden aynı yoldan eve döner">Geri çağır</button></div>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.update({ castle: s, room: null });
  }

  gone(): boolean { return this.missing; }

  update({ castle: s }: WinData): void {
    const a = this.ctx.army?.(this.publicId);
    this.missing = !a;
    if (!a) return;
    this.setTitle(a.mode === 'intercept' && a.state === 'marching' ? 'Önünü kesen ordun' : 'Ordun');
    this.q('[data-f="target"]').innerHTML = `${dot(a.targetColor)}${esc(a.targetName)}`;
    this.q('[data-f="state"]').textContent = armyState(a);
    this.q('[data-f="bar"] .fill').style.width = `${100 * (a.state === 'marching' ? a.distance : 1 - a.distance)}%`;
    this.q('[data-f="left"]').textContent = a.fighting ? 'Savaş sürüyor.' : `${Math.ceil(a.remainingSeconds)} sn ${a.state === 'returning' ? 'sonra evde' : a.mode === 'intercept' ? 'sonra geri döner' : 'sonra varır'}`;
    this.q('[data-f="units"]').innerHTML = a.units.map((u) => `<div>${u.count} × ${esc(u.name)}</div>`).join('');
    this.q('[data-f="mode"]').textContent = a.mode === 'intercept' && a.state === 'marching'
      ? 'İlk yol savaşından sonra (sağ kalırsa) eve döner; kimseyle karşılaşmazsa yolun yarısından döner.' : '';
    const recall = this.q<HTMLButtonElement>('[data-act="recall"]');
    recall.disabled = a.fighting || a.state === 'returning' || s.eliminated;
    recall.title = a.fighting ? 'Savaştaki ordu geri çağrılamaz' : a.state === 'returning' ? 'Zaten eve dönüyor' : 'Bulunduğu yerden aynı yoldan eve döner';
  }

  private async click(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act="recall"]');
    const a = this.ctx.army?.(this.publicId);
    if (!btn || btn.disabled || !a) return;
    const r = await this.ctx.net.recallArmy(a.id);
    if (!r.ok) this.ctx.say(r.error ?? 'Geri çağrılamadı.');
    else this.ctx.info('Ordu geri çağrıldı.');
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}

export class ScoutWin extends Win {
  private missing = false;

  constructor(ctx: WinContext, private readonly seat: number, s: CastleView) {
    super(ctx, 'yellow');
    this.body.innerHTML = `
      <div class="row"><span>Hedef</span><b data-f="target"></b></div>
      <div class="row"><span>Durum</span><b data-f="state"></b></div>
      <div class="gbar" data-f="bar"><div class="fill"></div></div>
      <div class="row sub"><span data-f="left"></span></div>
      <p class="muted-ink small">Gözcü hedefin kapısına yürür, orada bakar ve raporla birlikte eve döner.
        Görevdeki gözcü çalışmaz ama yemek yer.</p>`;
    this.update({ castle: s, room: null });
  }

  gone(): boolean { return this.missing; }

  update({ castle: s }: WinData): void {
    const m: ScoutMissionView | undefined = s.scouting.missions.find((x) => x.targetSeat === this.seat);
    this.missing = !m;
    if (!m) return;
    const t: ScoutTargetView | undefined = s.scouting.targets.find((x) => x.seat === this.seat);
    this.setTitle('Gözcün');
    this.q('[data-f="target"]').innerHTML = t ? `${dot(t.color)}${esc(t.name)} <small>${COLOR_NAMES[t.color] ?? ''}</small>` : '?';
    this.q('[data-f="state"]').textContent = m.arrived ? 'gözetledi, dönüyor' : 'hedefe gidiyor';
    this.q('[data-f="bar"] .fill').style.width = `${100 * m.progress}%`;
    this.q('[data-f="left"]').textContent = `${Math.ceil(m.remainingSeconds)} sn sonra evde`;
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}

/** The forest in the middle of the map. Nothing to do there yet; the window is here for what comes next. */
export class ForestWin extends Win {
  constructor(ctx: WinContext) {
    super(ctx, 'purple');
    this.body.innerHTML = `
      <p>Haritanın ortasındaki orman. Yollar içinden geçer; çapraz köşeye giden ordular da buradan yürür.</p>
      <p class="muted-ink">Yakında: gözcü gönderip keşfetmek, ganimet toplamak, köyler ve haydut kampları.</p>`;
    this.setTitle('Orman');
  }

  update(): void {}
}
