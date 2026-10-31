import { botMark, colorNote, esc } from '../format';
import { t as tt, tr } from '../i18n';
import type { ArmyView, CastleView, Corner, ScoutMissionView, ScoutTargetView } from '../types';
import { SITE_NAME } from '../scene/Sites';
import { dot } from './report-html';
import { Win, type WinContext, type WinData } from './windows';

// One of our armies or scouts on the road.

const QUARTER: Record<Corner, string> = { northWest: tt('Kuzeybatı'), northEast: tt('Kuzeydoğu'), southWest: tt('Güneybatı'), southEast: tt('Güneydoğu') };

const armyState = (a: ArmyView) =>
  a.fighting ? tt('savaşta') : a.state === 'returning' ? tt('eve dönüyor') : a.mode === 'intercept' ? tt('önünü kesiyor') : tt('saldırıya gidiyor');

export class ArmyWin extends Win {
  private missing = false;

  constructor(ctx: WinContext, private readonly publicId: string, s: CastleView) {
    super(ctx, 'blue');
    this.body.innerHTML = `
      <div class="row"><span>${tt('Hedef')}</span><b data-f="target"></b></div>
      <div class="row"><span>${tt('Durum')}</span><b data-f="state"></b></div>
      <div class="gbar" data-f="bar"><div class="fill"></div></div>
      <div class="row sub"><span data-f="left"></span></div>
      <h4>${tt('Askerler')}</h4>
      <div data-f="units"></div>
      <p class="muted-ink small" data-f="mode"></p>
      <h4>${tt('Yeni emir')}</h4>
      <div class="row"><select data-f="dest" title="${tt('Ordu bulunduğu yerden yeni hedefe yol ağı üzerinden yürür')}"></select></div>
      <div class="row center"><button class="btn" data-act="redirect" title="${tt('Ordu bulunduğu yerden yeni hedefe yürür; rakipler yalnız yönünü görür, hedefini değil')}">${tt('Yeni hedefe gönder')}</button></div>
      <p class="muted-ink small" data-f="why"></p>
      <div class="row center"><button class="btn btn-red" data-act="recall" title="${tt('Bulunduğu yerden aynı yoldan eve döner')}">${tt('Geri çağır')}</button></div>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.update({ castle: s, room: null });
  }

  gone(): boolean { return this.missing; }

  update({ castle: s, room }: WinData): void {
    const a = this.ctx.army?.(this.publicId);
    this.missing = !a;
    if (!a) return;
    this.setTitle(a.mode === 'intercept' && a.state === 'marching' ? tt('Önünü kesen ordun') : tt('Ordun'));
    this.q('[data-f="target"]').innerHTML = `${dot(a.targetColor)}${botMark(a.targetSeat)}${esc(tr(a.targetName))}`;
    this.q('[data-f="state"]').textContent = armyState(a);
    this.q('[data-f="bar"] .fill').style.width = `${100 * (a.state === 'marching' ? a.distance : 1 - a.distance)}%`;
    this.q('[data-f="left"]').textContent = a.fighting ? tt('Savaş sürüyor.') : a.state === 'returning' ? tt('{0} sn sonra evde', Math.ceil(a.remainingSeconds)) : a.mode === 'intercept' ? tt('{0} sn sonra geri döner', Math.ceil(a.remainingSeconds)) : tt('{0} sn sonra varır', Math.ceil(a.remainingSeconds));
    this.q('[data-f="units"]').innerHTML = a.units.map((u) => `<div>${u.count} × ${esc(tr(u.name))}</div>`).join('');
    this.q('[data-f="mode"]').textContent = a.mode === 'intercept' && a.state === 'marching'
      ? tt('İlk yol savaşından sonra (sağ kalırsa) eve döner; kimseyle karşılaşmazsa yolun yarısından döner.') : '';
    this.renderOrders(a, s, room);
    const recall = this.q<HTMLButtonElement>('[data-act="recall"]');
    recall.disabled = a.fighting || a.state === 'returning' || s.eliminated;
    recall.title = a.fighting ? tt('Savaştaki ordu geri çağrılamaz') : a.state === 'returning' ? tt('Zaten eve dönüyor') : tt('Bulunduğu yerden aynı yoldan eve döner');
  }

  /** The places this army can be sent to now: rival castles (war only) and the forest's villages and camps. */
  private renderOrders(a: ArmyView, s: CastleView, room: WinData['room']): void {
    const dest = this.q<HTMLSelectElement>('[data-f="dest"]');
    const soldiers = a.units.reduce((n, u) => n + u.count, 0);
    const walkingTo = (isSite: boolean, id: string | number) => a.state === 'marching' && (isSite ? a.siteId === id : !a.siteId && a.targetSeat === id);
    const options: string[] = [];
    for (const t of s.scouting.targets) {
      if (room?.players.find((p) => p.seat === t.seat)?.eliminated || walkingTo(false, t.seat)) continue;
      options.push(`<option value="r:${t.seat}"${s.phase === 'war' ? '' : ' disabled'}>${tt('Saldır: {0}', esc(tr(t.name)))}${s.phase === 'war' ? '' : ` ${tt('(savaşta açılır)')}`}</option>`);
    }
    for (const x of this.ctx.sites?.() ?? []) {
      if (x.kind === 'chest' || x.gone || walkingTo(true, x.id)) continue;
      const where = x.quarter ? ` · ${QUARTER[x.quarter]}` : ` · ${tt('orta')}`;
      const few = x.kind === 'village' && soldiers < x.minSoldiers;
      options.push(`<option value="s:${x.id}"${few ? ' disabled' : ''}>${x.kind === 'village' ? tt('Yağmala: {0}', esc(SITE_NAME[x.kind])) : tt('Saldır: {0}', esc(SITE_NAME[x.kind]))}${where}${few ? ` ${tt('(en az {0} asker)', x.minSoldiers)}` : ''}</option>`);
    }
    const html = options.join('');
    if (dest.dataset.html !== html) {
      const keep = dest.value;
      dest.innerHTML = html;
      dest.dataset.html = html;
      if ([...dest.options].some((o) => o.value === keep && !o.disabled)) dest.value = keep;
      else dest.selectedIndex = Math.max(0, [...dest.options].findIndex((o) => !o.disabled));
    }
    const ok = !!dest.value && !dest.selectedOptions[0]?.disabled;
    const why = a.fighting ? tt('Savaştaki ordu yeni emir alamaz.') : s.eliminated ? tt('Kalen düştü; izleyicisin.') : options.length === 0 ? tt('Gidilecek yer yok.') : '';
    this.q('[data-f="why"]').textContent = why;
    this.q<HTMLButtonElement>('[data-act="redirect"]').disabled = !!why || !ok;
  }

  private async click(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act="recall"],[data-act="redirect"]');
    const a = this.ctx.army?.(this.publicId);
    if (!btn || btn.disabled || !a) return;
    if (btn.dataset.act === 'redirect') {
      const value = this.q<HTMLSelectElement>('[data-f="dest"]').value;
      const r = value.startsWith('r:') ? await this.ctx.net.redirectArmy(a.id, Number(value.slice(2)), null)
        : await this.ctx.net.redirectArmy(a.id, null, value.slice(2));
      if (!r.ok) this.ctx.say(tr(r.error ?? tt('Yeni emir verilemedi.')));
      else this.ctx.info(tt('Ordu yeni hedefe yöneldi.'));
      return;
    }
    const r = await this.ctx.net.recallArmy(a.id);
    if (!r.ok) this.ctx.say(tr(r.error ?? tt('Geri çağrılamadı.')));
    else this.ctx.info(tt('Ordu geri çağrıldı.'));
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
      <div class="row"><span>${tt('Hedef')}</span><b data-f="target"></b></div>
      <div class="row"><span>${tt('Durum')}</span><b data-f="state"></b></div>
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
    this.setTitle(tt('Gözcün'));
    const note = this.q('[data-f="note"]');
    if (m.kind === 'explore') {
      this.q('[data-f="target"]').textContent = tt('Orman · {0}', QUARTER[m.quarter as Corner] ?? '');
      this.q('[data-f="state"]').textContent = tt('bölgeyi dolaşıyor');
      note.textContent = tt('Gözcü ormanın bu bölgesinin yolunu yürür, yakınındaki yerleri bulur ve eve döner.');
    } else if (m.kind === 'chest') {
      this.q('[data-f="target"]').textContent = tt('Sandık');
      this.q('[data-f="state"]').textContent = m.arrived ? tt('altınla dönüyor') : tt('sandığa gidiyor');
      note.textContent = tt('Sandığı alır ve altını eve getirir; altın gözcü dönünce kasaya girer.');
    } else {
      const t: ScoutTargetView | undefined = s.scouting.targets.find((x) => x.seat === m.targetSeat);
      this.q('[data-f="target"]').innerHTML = t ? `${dot(t.color)}${botMark(t.seat)}${esc(tr(t.name))}${colorNote(t.name, t.color)}` : '?';
      this.q('[data-f="state"]').textContent = m.arrived ? tt('gözetledi, dönüyor') : tt('hedefe gidiyor');
      note.textContent = tt('Gözcü hedefin kapısına yürür, orada bakar ve raporla birlikte eve döner. Görevdeki gözcü çalışmaz ama yemek yer.');
    }
    this.q('[data-f="bar"] .fill').style.width = `${100 * m.progress}%`;
    this.q('[data-f="left"]').textContent = tt('{0} sn sonra evde', Math.ceil(m.remainingSeconds));
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
