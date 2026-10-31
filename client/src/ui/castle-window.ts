import { BACK_LINE, SHOOTERS, esc, fmt } from '../format';
import { t as tt, tr } from '../i18n';
import type { CastleView, Job, Row } from '../types';
import { Win, type WinContext, type WinData } from './windows';

// Our own castle: soldiers (arm and disarm, from which job), growth and the defence line-up.

type Tab = 'soldiers' | 'hire' | 'growth' | 'defense';
const TABS: [Tab, string][] = [['soldiers', tt('Askerler')], ['hire', tt('Kirala')], ['growth', tt('Büyüme')], ['defense', tt('Savunma')]];

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
        <div class="unit-head"><b>${esc(tr(u.name))}</b> <span data-f="stock"></span> <small class="muted-ink" data-f="arming"></small></div>
        <span class="stepper"><button class="btn" data-act="arm" data-n="1" title="">+1</button><button class="btn" data-act="arm" data-n="5">+5</button>
          <button class="btn btn-red" data-act="disarm" data-n="1" title="${tt('Silahı bırak, boşa dön')}">−1</button></span>
      </div>`).join('');
    const hire = s.units.map((u) => `
      <div class="unit-row" data-hire="${u.id}">
        <div class="unit-head"><b>${esc(tr(u.name))}</b> <span class="cost"><i class="ico ico-coin"></i><b>${fmt(u.price)}</b></span>
          <small class="muted-ink" data-f="hired"></small></div>
        <span class="stepper"><button class="btn" data-act="hire" data-n="1">+1</button><button class="btn" data-act="hire" data-n="5">+5</button></span>
      </div>`).join('');
    const rows = s.units.map((u) => `
      <div class="row"><span>${esc(tr(u.name))}</span>
        <select data-d-row="${u.id}"><option value="front">${tt('ön sıra')}</option><option value="back">${tt('arka sıra')}</option></select></div>`).join('');
    const priority = `<option value="">${tt('ön sıra')}</option>${s.units.map((u) => `<option value="${u.id}">${tt('önce {0}', esc(tr(u.name)))}</option>`).join('')}`;
    this.body.innerHTML = `
      <div class="tabs">${TABS.map(([id, label]) => `<button class="tab" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="pane" data-pane="soldiers">
        <div class="row"><span>${tt('Hangi meslekten')}</span><select data-f="source" title="${tt('Silah verilen kişi hangi meslekten alınsın')}">${sources}</select></div>
        ${units}
        <div class="row" data-f="arming-row"><span>${tt('Kuşanıyor')}</span><b data-f="arming-n"></b></div>
        <p class="muted-ink small" data-f="soldier-note"></p>
      </div>
      <div class="pane" data-pane="hire">
        <div class="row"><span>${tt('Kasadaki altın')}</span><span class="cost"><i class="ico ico-coin"></i><b data-f="gold"></b></span></div>
        ${hire}
        <p class="muted-ink small">${tt('Paralı asker anında gelir, işçiden eksilmez ve nüfusa sayılır; yemek yer ve bir daha işçi olamaz. Altın ormandan (sandık, köy, haydut kampı) gelir.')}</p>
      </div>
      <div class="pane" data-pane="growth">
        <div class="row"><span>${tt('Nüfus')}</span><b data-f="pop"></b></div>
        <div class="row"><span>${tt('Yeni kişi')}</span><span data-f="next"></span></div>
        <div class="row sub"><span data-f="reserve"></span></div>
        <div class="gbar" title="${tt('Çizgi: korunan rezerv, çubuğun sonu: yeni kişinin doğacağı yemek miktarı')}"><div class="fill"></div><span class="gbar-text" data-f="food-text"></span></div>
        <div class="row center"><button class="btn" data-act="growth"></button></div>
      </div>
      <div class="pane" data-pane="defense">
        <p class="muted-ink small">${tt('Kale saldırıya uğrayınca evdeki askerler böyle dizilir. Kapıdaki okçular surun arkasından %25 fazla hasar verir; savaşı kaybedersen kale düşer.')}</p>
        ${rows}
        ${s.units.some((u) => SHOOTERS.includes(u.id)) ? `<div class="row"><span>${s.units.some((u) => u.id === 'okcu') ? tt('Okçu hedefi') : tt('Mancınık hedefi')}</span><select data-d="priority">${priority}</select></div>` : ''}
        <div class="row center"><button class="btn" data-act="save-defense">${tt('Kaydet')}</button></div>
      </div>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.body.addEventListener('change', (e) => { if ((e.target as HTMLElement).closest('[data-pane="defense"]')) this.defenseTouched = true; });
    this.fillDefense(s);
    this.update({ castle: s, room: null });
  }

  private fillDefense(s: CastleView): void {
    for (const u of s.units) this.q<HTMLSelectElement>(`[data-d-row="${u.id}"]`).value = (s.war.defense.rows[u.id] as Row | undefined) ?? (BACK_LINE.includes(u.id) ? 'back' : 'front');
    const priority = this.body.querySelector<HTMLSelectElement>('[data-d="priority"]');
    if (priority) priority.value = s.war.defense.archerPriority ?? '';
  }

  update({ castle: s }: WinData): void {
    this.setTitle(tt('Kalen'));
    for (const t of this.body.querySelectorAll<HTMLElement>('[data-tab]')) t.classList.toggle('on', t.dataset.tab === this.tab);
    for (const p of this.body.querySelectorAll<HTMLElement>('[data-pane]')) p.classList.toggle('hidden', p.dataset.pane !== this.tab);
    const dead = s.eliminated;

    // soldiers
    const source = this.q<HTMLSelectElement>('[data-f="source"]');
    for (const opt of source.options) {
      const j = s.jobs.find((x) => x.job === opt.value)!;
      const text = `${tr(j.name)} (${j.count})`;
      if (opt.textContent !== text) opt.textContent = text;
    }
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      row.querySelector('[data-f="stock"]')!.textContent = tt('asker {0} · silah {1}', u.soldiers, u.weapons);
      row.querySelector('[data-f="arming"]')!.textContent = u.arming > 0 ? tt('· kuşanıyor {0}', u.arming) : '';
      const wait = s.armSeconds > 0 ? tt('Kuşanması {0} sn sürer (bu sürede çalışmaz, savaşmaz)', fmt(s.armSeconds)) : '';
      for (const b of row.querySelectorAll<HTMLButtonElement>('[data-act="arm"]')) b.title = wait;
      for (const b of row.querySelectorAll<HTMLButtonElement>('[data-act="arm"]')) b.disabled = u.weapons < Number(b.dataset.n) || dead;
      row.querySelector<HTMLButtonElement>('[data-act="disarm"]')!.disabled = u.soldiers - u.hired <= 0 || dead;
      row.querySelector<HTMLButtonElement>('[data-act="disarm"]')!.title = u.hired > 0 ? tt('{0} paralı asker işçiye dönemez', u.hired) : tt('Silahı bırak, boşa dön');
      const h = this.q(`[data-hire="${u.id}"]`);
      h.querySelector('[data-f="hired"]')!.textContent = u.hired > 0 ? tt('kiralanan {0}', u.hired) : '';
      for (const b of h.querySelectorAll<HTMLButtonElement>('[data-act="hire"]'))
        b.disabled = dead || u.price <= 0 || s.resources.gold + 1e-6 < u.price * Number(b.dataset.n);
    }
    this.q('[data-f="gold"]').textContent = fmt(s.resources.gold);
    const arming = s.units.reduce((n, u) => n + u.arming, 0);
    this.q('[data-f="soldier-note"]').textContent = tt('Asker {0} / nüfus {1}. Silahı demirhanede üret, burada işçiye ver.', s.soldiers, s.population)
      + (s.armSeconds > 0 ? ` ${tt('Silah kuşanmak {0} sn sürer; paralı asker anında gelir.', fmt(s.armSeconds))}` : '')
      + (arming > 0 ? ` ${tt('Kuşanıyor: {0}.', arming)}` : '');
    this.q('[data-f="arming-row"]').classList.toggle('hidden', arming === 0);
    this.q('[data-f="arming-n"]').textContent = String(arming);

    // growth
    this.q('[data-f="pop"]').textContent = String(s.population);
    this.q('[data-f="next"]').innerHTML = `<span class="cost"><i class="ico ico-meat"></i>${s.nextPersonCost}</span> ${tt('yemek')}`;
    this.q('[data-f="reserve"]').textContent = s.growthEnabled ? tt('Yemek {0} altına inmezse büyür.', fmt(s.foodReserve)) : tt('Büyüme kapalı.');
    const threshold = s.foodReserve + s.nextPersonCost;
    const bar = this.q('.pane[data-pane="growth"] .gbar');
    bar.classList.toggle('low', s.resources.food < s.foodReserve);
    bar.querySelector<HTMLElement>('.fill')!.style.width = `${Math.min(100, (100 * s.resources.food) / Math.max(threshold, 1))}%`;
    this.q('[data-f="food-text"]').textContent = `${fmt(s.resources.food)} / ${fmt(threshold)}`;
    this.growthOn = s.growthEnabled;
    const growth = this.q<HTMLButtonElement>('[data-act="growth"]');
    growth.textContent = s.growthEnabled ? tt('Büyüme: açık') : tt('Büyüme: kapalı');
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
    const unit = btn.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? btn.closest<HTMLElement>('[data-hire]')?.dataset.hire;
    let r;
    switch (btn.dataset.act) {
      case 'arm': r = await net.armWorkers(unit!, Number(btn.dataset.n), this.q<HTMLSelectElement>('[data-f="source"]').value as Job); break;
      case 'hire':
        r = await net.hireMercenary(unit!, Number(btn.dataset.n));
        if (r.ok) this.ctx.info(tt('Paralı asker geldi.'));
        break;
      case 'disarm': r = await net.disarmSoldiers(unit!, Number(btn.dataset.n)); break;
      case 'growth': r = await net.setGrowth(!this.growthOn); break;
      case 'save-defense': {
        const rows: Record<string, Row> = {};
        for (const sel of this.body.querySelectorAll<HTMLSelectElement>('[data-d-row]')) rows[sel.dataset.dRow!] = sel.value as Row;
        r = await net.setDefense(rows, this.body.querySelector<HTMLSelectElement>('[data-d="priority"]')?.value || null);
        if (r.ok) { this.defenseTouched = false; this.ctx.info(tt('Savunma dizilişi kaydedildi.')); }
        break;
      }
      default: return;
    }
    if (!r.ok) this.ctx.say(tr(r.error ?? tt('Olmadı.')));
  }

  private refreshTabs(): void {
    for (const el of this.body.querySelectorAll<HTMLElement>('[data-tab]')) el.classList.toggle('on', el.dataset.tab === this.tab);
    for (const p of this.body.querySelectorAll<HTMLElement>('[data-pane]')) p.classList.toggle('hidden', p.dataset.pane !== this.tab);
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
