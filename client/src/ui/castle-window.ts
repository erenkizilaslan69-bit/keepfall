import { esc, fmt } from '../format';
import type { CastleView, Job, Row } from '../types';
import { Win, type WinContext, type WinData } from './windows';

// Our own castle: soldiers (arm and disarm, from which job), growth and the defence line-up.

type Tab = 'soldiers' | 'growth' | 'defense';
const TABS: [Tab, string][] = [['soldiers', 'Askerler'], ['growth', 'Büyüme'], ['defense', 'Savunma']];

export class CastleWin extends Win {
  private tab: Tab = 'soldiers';
  private growthOn = false;
  private defenseTouched = false;

  constructor(ctx: WinContext, s: CastleView) {
    super(ctx, 'blue');
    this.el.classList.add('wide');
    const sources = s.jobs.map((j) => `<option value="${j.job}"></option>`).join('');
    const units = s.units.map((u) => `
      <div class="unit-row" data-unit="${u.id}">
        <div class="unit-head"><b>${esc(u.name)}</b> <span data-f="stock"></span></div>
        <span class="stepper"><button class="btn" data-act="arm" data-n="1">+1</button><button class="btn" data-act="arm" data-n="5">+5</button>
          <button class="btn btn-red" data-act="disarm" data-n="1" title="Silahı bırak, boşa dön">−1</button></span>
      </div>`).join('');
    const rows = s.units.map((u) => `
      <div class="row"><span>${esc(u.name)}</span>
        <select data-d-row="${u.id}"><option value="front">ön sıra</option><option value="back">arka sıra</option></select></div>`).join('');
    const priority = `<option value="">ön sıra</option>${s.units.map((u) => `<option value="${u.id}">önce ${esc(u.name)}</option>`).join('')}`;
    this.body.innerHTML = `
      <div class="tabs">${TABS.map(([id, label]) => `<button class="tab" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="pane" data-pane="soldiers">
        <div class="row"><span>Hangi meslekten</span><select data-f="source" title="Silah verilen kişi hangi meslekten alınsın">${sources}</select></div>
        ${units}
        <p class="muted-ink small" data-f="soldier-note"></p>
      </div>
      <div class="pane" data-pane="growth">
        <div class="row"><span>Nüfus</span><b data-f="pop"></b></div>
        <div class="row"><span>Yeni kişi</span><span data-f="next"></span></div>
        <div class="row sub"><span data-f="reserve"></span></div>
        <div class="gbar" title="Çizgi: korunan rezerv, çubuğun sonu: yeni kişinin doğacağı yemek miktarı"><div class="fill"></div><span class="gbar-text" data-f="food-text"></span></div>
        <div class="row center"><button class="btn" data-act="growth"></button></div>
      </div>
      <div class="pane" data-pane="defense">
        <p class="muted-ink small">Kale saldırıya uğrayınca evdeki askerler böyle dizilir.</p>
        ${rows}
        <div class="row"><span>Okçu hedefi</span><select data-d="priority">${priority}</select></div>
        <div class="row center"><button class="btn" data-act="save-defense">Kaydet</button></div>
      </div>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.body.addEventListener('change', (e) => { if ((e.target as HTMLElement).closest('[data-pane="defense"]')) this.defenseTouched = true; });
    this.fillDefense(s);
    this.update({ castle: s, room: null });
  }

  private fillDefense(s: CastleView): void {
    for (const u of s.units) this.q<HTMLSelectElement>(`[data-d-row="${u.id}"]`).value = (s.war.defense.rows[u.id] as Row | undefined) ?? (u.id === 'okcu' ? 'back' : 'front');
    this.q<HTMLSelectElement>('[data-d="priority"]').value = s.war.defense.archerPriority ?? '';
  }

  update({ castle: s }: WinData): void {
    this.setTitle('Kalen');
    for (const t of this.body.querySelectorAll<HTMLElement>('[data-tab]')) t.classList.toggle('on', t.dataset.tab === this.tab);
    for (const p of this.body.querySelectorAll<HTMLElement>('[data-pane]')) p.classList.toggle('hidden', p.dataset.pane !== this.tab);
    const dead = s.eliminated;

    // soldiers
    const source = this.q<HTMLSelectElement>('[data-f="source"]');
    for (const opt of source.options) {
      const j = s.jobs.find((x) => x.job === opt.value)!;
      const text = `${j.name} (${j.count})`;
      if (opt.textContent !== text) opt.textContent = text;
    }
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      row.querySelector('[data-f="stock"]')!.textContent = `asker ${u.soldiers} · silah ${u.weapons}`;
      for (const b of row.querySelectorAll<HTMLButtonElement>('[data-act="arm"]')) b.disabled = u.weapons < Number(b.dataset.n) || dead;
      row.querySelector<HTMLButtonElement>('[data-act="disarm"]')!.disabled = u.soldiers === 0 || dead;
    }
    this.q('[data-f="soldier-note"]').textContent = `Asker ${s.soldiers} / nüfus ${s.population}. Silahı demirhanede üret, burada işçiye ver.`;

    // growth
    this.q('[data-f="pop"]').textContent = String(s.population);
    this.q('[data-f="next"]').innerHTML = `<span class="cost"><i class="ico ico-meat"></i>${s.nextPersonCost}</span> yemek`;
    this.q('[data-f="reserve"]').textContent = s.growthEnabled ? `Yemek ${fmt(s.foodReserve)} altına inmezse büyür.` : 'Büyüme kapalı.';
    const threshold = s.foodReserve + s.nextPersonCost;
    const bar = this.q('.pane[data-pane="growth"] .gbar');
    bar.classList.toggle('low', s.resources.food < s.foodReserve);
    bar.querySelector<HTMLElement>('.fill')!.style.width = `${Math.min(100, (100 * s.resources.food) / Math.max(threshold, 1))}%`;
    this.q('[data-f="food-text"]').textContent = `${fmt(s.resources.food)} / ${fmt(threshold)}`;
    this.growthOn = s.growthEnabled;
    const growth = this.q<HTMLButtonElement>('[data-act="growth"]');
    growth.textContent = s.growthEnabled ? 'Büyüme: açık' : 'Büyüme: kapalı';
    growth.disabled = dead;

    // defence: follow the server until the player starts editing
    if (!this.defenseTouched) this.fillDefense(s);
    this.q<HTMLButtonElement>('[data-act="save-defense"]').disabled = dead;
  }

  private async click(e: Event): Promise<void> {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) { this.tab = tab.dataset.tab as Tab; this.refreshTabs(); return; }
    const btn = t.closest<HTMLButtonElement>('button[data-act]');
    if (!btn || btn.disabled) return;
    const net = this.ctx.net;
    const unit = btn.closest<HTMLElement>('[data-unit]')?.dataset.unit;
    let r;
    switch (btn.dataset.act) {
      case 'arm': r = await net.armWorkers(unit!, Number(btn.dataset.n), this.q<HTMLSelectElement>('[data-f="source"]').value as Job); break;
      case 'disarm': r = await net.disarmSoldiers(unit!, Number(btn.dataset.n)); break;
      case 'growth': r = await net.setGrowth(!this.growthOn); break;
      case 'save-defense': {
        const rows: Record<string, Row> = {};
        for (const sel of this.body.querySelectorAll<HTMLSelectElement>('[data-d-row]')) rows[sel.dataset.dRow!] = sel.value as Row;
        r = await net.setDefense(rows, this.q<HTMLSelectElement>('[data-d="priority"]').value || null);
        if (r.ok) { this.defenseTouched = false; this.ctx.info('Savunma dizilişi kaydedildi.'); }
        break;
      }
      default: return;
    }
    if (!r.ok) this.ctx.say(r.error ?? 'Olmadı.');
  }

  private refreshTabs(): void {
    for (const el of this.body.querySelectorAll<HTMLElement>('[data-tab]')) el.classList.toggle('on', el.dataset.tab === this.tab);
    for (const p of this.body.querySelectorAll<HTMLElement>('[data-pane]')) p.classList.toggle('hidden', p.dataset.pane !== this.tab);
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
