import { COLOR_NAMES, esc } from '../format';
import type { ArmyView, CastleView, Corner, ScoutMissionView, ScoutTargetView } from '../types';
import { dot } from './report-html';
import { Win, type WinContext, type WinData } from './windows';

// One of our armies or scouts on the road.

const QUARTER: Record<Corner, string> = { northWest: 'Kuzeybatı', northEast: 'Kuzeydoğu', southWest: 'Güneybatı', southEast: 'Güneydoğu' };

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

  /** `id`: the target's seat for a spy, "q:corner" for a tour of a forest quarter, "c:id" for a chest. */
  constructor(ctx: WinContext, private readonly id: string, s: CastleView) {
    super(ctx, 'yellow');
    this.body.innerHTML = `
      <div class="row"><span>Hedef</span><b data-f="target"></b></div>
      <div class="row"><span>Durum</span><b data-f="state"></b></div>
      <div class="gbar" data-f="bar"><div class="fill"></div></div>
      <div class="row sub"><span data-f="left"></span></div>
      <p class="muted-ink small" data-f="note"></p>`;
    this.update({ castle: s, room: null });
  }

  private find(s: CastleView): ScoutMissionView | undefined {
    return s.scouting.missions.find((m) => this.id.startsWith('q:') ? m.kind === 'explore' && m.quarter === this.id.slice(2)
      : this.id.startsWith('c:') ? m.kind === 'chest' && m.siteId === this.id.slice(2)
      : m.kind === 'spy' && m.targetSeat === Number(this.id));
  }

  gone(): boolean { return this.missing; }

  update({ castle: s }: WinData): void {
    const m: ScoutMissionView | undefined = this.find(s);
    this.missing = !m;
    if (!m) return;
    this.setTitle('Gözcün');
    const note = this.q('[data-f="note"]');
    if (m.kind === 'explore') {
      this.q('[data-f="target"]').textContent = `Orman · ${QUARTER[m.quarter as Corner] ?? ''}`;
      this.q('[data-f="state"]').textContent = 'bölgeyi dolaşıyor';
      note.textContent = 'Gözcü ormanın bu bölgesinin yolunu yürür, yakınındaki yerleri bulur ve eve döner.';
    } else if (m.kind === 'chest') {
      this.q('[data-f="target"]').textContent = 'Sandık';
      this.q('[data-f="state"]').textContent = m.arrived ? 'altınla dönüyor' : 'sandığa gidiyor';
      note.textContent = 'Sandığı alır ve altını eve getirir; altın gözcü dönünce kasaya girer.';
    } else {
      const t: ScoutTargetView | undefined = s.scouting.targets.find((x) => x.seat === m.targetSeat);
      this.q('[data-f="target"]').innerHTML = t ? `${dot(t.color)}${esc(t.name)} <small>${COLOR_NAMES[t.color] ?? ''}</small>` : '?';
      this.q('[data-f="state"]').textContent = m.arrived ? 'gözetledi, dönüyor' : 'hedefe gidiyor';
      note.textContent = 'Gözcü hedefin kapısına yürür, orada bakar ve raporla birlikte eve döner. Görevdeki gözcü çalışmaz ama yemek yer.';
    }
    this.q('[data-f="bar"] .fill').style.width = `${100 * m.progress}%`;
    this.q('[data-f="left"]').textContent = `${Math.ceil(m.remainingSeconds)} sn sonra evde`;
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
