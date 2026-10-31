import { BACK_LINE, SHOOTERS, colorNote, esc } from '../format';
import { t as tt, tr } from '../i18n';
import type { CastleView, Corner, Job, QuarterView, Row, SiteView } from '../types';
import { SITE_NAME } from '../scene/Sites';
import { dot } from './report-html';
import { scoutButton } from './scout-report';
import { Win, type WinContext, type WinData } from './windows';

// The forest: a quarter of it to send a scout to tour (it finds the places of that quarter), and the places
// found so far (a chest, a village, a bandit camp). Everything here is what the server told us: a place that
// was emptied since we last looked is still shown as we saw it, with how long ago that was.

const QUARTER_NAME: Record<Corner, string> = { northWest: tt('Kuzeybatı'), northEast: tt('Kuzeydoğu'), southWest: tt('Güneybatı'), southEast: tt('Güneydoğu') };

const ageText = (s: SiteView, now: number) => {
  const minutes = Math.floor(Math.max(0, now - s.seenAt) / 60);
  return minutes < 1 ? tt('şimdi görüldü') : tt('{0} dk önce görüldü', minutes);
};

const stateText = (s: SiteView): string => {
  const bandits = s.bandits.reduce((n, b) => n + b.count, 0);
  switch (s.kind) {
    case 'chest': return s.gone ? tt('boşalmış') : tt('altın ve demir var');
    case 'village': return s.gone ? tt('yağmalanmış') : tt('yağmalanabilir');
    default: return s.gone ? tt('temizlenmiş') : tt('≈{0} haydut', bandits);
  }
};

const sources = (s: CastleView) => s.jobs.map((j) => `<option value="${j.job}"></option>`).join('');

function fillSources(root: HTMLElement, s: CastleView): void {
  const select = root.querySelector<HTMLSelectElement>('[data-f="source"]');
  if (!select) return;
  for (const opt of select.options) {
    const j = s.jobs.find((x) => x.job === opt.value)!;
    const text = `${tr(j.name)} (${j.count})`;
    if (opt.textContent !== text) opt.textContent = text;
  }
}

/** One quarter of the forest. */
export class ForestWin extends Win {
  constructor(ctx: WinContext, private readonly corner: Corner, s: CastleView) {
    super(ctx, 'purple');
    this.body.innerHTML = `
      <div class="row"><span>${tt('Bölge')}</span><b data-f="who"></b></div>
      <div class="row sub"><span data-f="status"></span></div>
      <div class="row"><select data-f="source" title="${tt('Gözcü hangi meslekten çıksın')}">${sources(s)}</select>
        <button class="btn" data-act="explore" title="${tt('Gözcü bölgenin yolunu yürür, yakındaki yerleri bulur ve döner (ortadaki büyük kamp da görünür)')}">${tt('Bu bölgeyi keşfet')}</button></div>
      <div class="gbar hidden" data-f="bar"><div class="fill"></div></div>
      <h4>${tt('Bulunanlar')}</h4>
      <div data-f="list" class="site-list"></div>
      <p class="muted-ink small">${tt('Bir yer ancak gözcün yakınından geçince bulunur ve harita üzerinde kalır. Başkası bir yeri boşaltırsa, onu tekrar görene kadar eski haliyle görürsün.')}</p>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.update({ castle: s, room: null });
  }

  private q(corner = this.corner): QuarterView | undefined {
    return this.last?.castle.scouting.quarters.find((x) => x.corner === corner);
  }

  private last: WinData | null = null;

  update(data: WinData): void {
    this.last = data;
    const { castle: s } = data;
    const quarter = this.q();
    const mine = quarter?.seat === this.ctx.seat;
    this.setTitle(tt('Orman · {0}', QUARTER_NAME[this.corner]));
    this.q2('[data-f="who"]').innerHTML = quarter?.seat
      ? `${dot(quarter.color ?? undefined)}${mine ? tt('Senin bölgen') : `${esc(tr(quarter.name ?? ''))}${colorNote(quarter.name, quarter.color)}`}` : tt('Boş köşe');
    const mission = s.scouting.missions.find((m) => m.kind === 'explore' && m.quarter === this.corner);
    this.q2('[data-f="status"]').textContent = mission ? tt('Gözcü turda · {0} sn', Math.ceil(mission.remainingSeconds))
      : quarter?.explored ? tt('Keşfedildi') : tt('Henüz keşfedilmedi · tur {0} sn', Math.ceil(quarter?.seconds ?? 0));
    fillSources(this.body, s);
    const bar = this.q2('[data-f="bar"]');
    bar.classList.toggle('hidden', !mission);
    if (mission) bar.querySelector<HTMLElement>('.fill')!.style.width = `${100 * mission.progress}%`;
    const button = this.q2<HTMLButtonElement>('[data-act="explore"]');
    scoutButton(button, quarter?.explored ? tt('Yeniden keşfet') : tt('Bu bölgeyi keşfet'), s, s.eliminated, !!mission);

    const sites = (this.ctx.sites?.() ?? []).filter((x) => x.quarter === this.corner || x.kind === 'bigCamp');
    const html = sites.length === 0 ? `<p class="muted-ink small">${tt('Henüz bir şey bulunmadı.')}</p>`
      : sites.map((x) => `<button class="site-row" data-site="${x.id}"><b>${esc(SITE_NAME[x.kind])}</b> <small>${stateText(x)} · ${ageText(x, s.elapsedSeconds)}</small></button>`).join('');
    const list = this.q2('[data-f="list"]');
    if (list.dataset.html !== html) { list.innerHTML = html; list.dataset.html = html; }
  }

  private async click(e: Event): Promise<void> {
    const t = e.target as HTMLElement;
    const site = t.closest<HTMLElement>('[data-site]')?.dataset.site;
    if (site) { this.ctx.open({ kind: 'site', id: site }); return; }
    const btn = t.closest<HTMLButtonElement>('button[data-act="explore"]');
    if (!btn || btn.disabled) return;
    const r = await this.ctx.net.sendExplore(this.corner, this.q2<HTMLSelectElement>('[data-f="source"]').value as Job);
    if (!r.ok) this.ctx.say(tr(r.error ?? tt('Gözcü gönderilemedi.')));
    else this.ctx.info(tt('Gözcü ormana çıktı.'));
  }

  private q2<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}

/** A place of the forest we have found. */
export class SiteWin extends Win {
  private missing = false;
  private last: WinData | null = null;

  constructor(ctx: WinContext, private readonly siteId: string, s: CastleView) {
    super(ctx, 'yellow');
    this.el.classList.add('wide');
    const site = this.site();
    const kind = site?.kind ?? 'chest';
    const units = s.units.map((u) => `
      <div class="atk-row" data-unit="${u.id}">
        <span><b>${esc(tr(u.name))}</b> <small class="muted-ink" data-f="home"></small></span>
        <span class="stepper"><button class="btn-round" data-act="less" title="${tt('Bir eksik')}">−</button>
          <input type="number" min="0" value="0" data-count="${u.id}" aria-label="${esc(tt('{0} sayısı', tr(u.name)))}">
          <button class="btn-round" data-act="more" title="${tt('Bir fazla')}">+</button></span>
        <select data-row="${u.id}"><option value="front"${BACK_LINE.includes(u.id) ? '' : ' selected'}>${tt('ön')}</option><option value="back"${BACK_LINE.includes(u.id) ? ' selected' : ''}>${tt('arka')}</option></select>
      </div>`).join('');
    const priority = `<option value="">${tt('ön sıra')}</option>${s.units.map((u) => `<option value="${u.id}">${tt('önce {0}', esc(tr(u.name)))}</option>`).join('')}`;
    const army = kind === 'chest' ? '' : `
      <h4>${kind === 'village' ? tt('Yağmala') : tt('Saldır')}</h4>
      <div data-f="attack">
        <div class="row quick"><span>${tt('Hızlı doldur')}</span><span>
          <button class="btn" data-act="all" title="${tt('Her türden kaledeki tüm askerleri yaz')}">${tt('Tümü')}</button>
          <button class="btn" data-act="half" title="${tt('Her türden kaledeki askerin yarısını yaz')}">${tt('Yarısı')}</button></span></div>
        <div class="atk-head"><span>${tt('Birlik')}</span><span>${tt('Gönder')}</span><span>${tt('Sıra')}</span></div>
        ${units}
        <div class="row" data-f="priority-row"><span data-f="priority-label">${tt('Okçu hedefi')}</span><select data-f="priority">${priority}</select></div>
        <div class="row"><small class="muted-ink" data-f="total"></small>
          <button class="btn btn-red" data-act="send">${kind === 'village' ? tt('Yağmala') : tt('Saldır')}</button></div>
      </div>`;
    const chest = kind !== 'chest' ? '' : `
      <h4>${tt('Gözcü')}</h4>
      <div class="row"><select data-f="source" title="${tt('Gözcü hangi meslekten çıksın')}">${sources(s)}</select>
        <button class="btn" data-act="chest" title="${tt('Gözcü sandığı alır ve altını eve getirir')}">${tt('Gözcü gönder')}</button></div>
      <div class="gbar hidden" data-f="bar"><div class="fill"></div></div>
      <div class="row sub"><span data-f="mission"></span></div>`;
    this.body.innerHTML = `
      <div class="row"><span data-f="state"></span></div>
      <div class="row sub"><span data-f="age"></span></div>
      <div data-f="bandits" class="scout-soldiers"></div>
      <p class="muted-ink small hidden" data-f="why"></p>
      ${chest}${army}
      <p class="muted-ink small" data-f="note"></p>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.body.addEventListener('input', () => this.refreshSend());
    this.update({ castle: s, room: null });
  }

  gone(): boolean { return this.missing; }

  private site(): SiteView | undefined {
    return this.ctx.sites?.().find((x) => x.id === this.siteId);
  }

  update(data: WinData): void {
    this.last = data;
    const { castle: s } = data;
    const site = this.site();
    this.missing = !site;
    if (!site) return;
    this.setTitle(SITE_NAME[site.kind]);
    this.q('[data-f="state"]').innerHTML = `<b>${stateText(site)}</b>`;
    this.q('[data-f="age"]').textContent = `${ageText(site, s.elapsedSeconds)} · ${tt('bu bilgi eski olabilir')}`;
    const bandits = this.q('[data-f="bandits"]');
    const html = site.kind === 'chest' || site.kind === 'village' || site.gone ? '' : site.bandits
      .map((b) => `<span class="unit-count" title="${esc(tr(b.name))}"><i class="unit-ico unit-${esc(b.unitId)}"></i><b>≈${b.count}</b></span>`).join('');
    if (bandits.dataset.html !== html) { bandits.innerHTML = html; bandits.dataset.html = html; }

    this.q('[data-f="note"]').textContent = site.kind === 'chest' ? tt('Sandık bir kez alınır; ilk gelen alır. Altın ve demir, gözcü eve dönünce kasaya girer.')
      : site.kind === 'village' ? tt('Savaşsız yağmalanır: altın, yemek ve birkaç kişi, ordu eve dönünce gelir. En az {0} asker gerekir; yağmalanınca köy yok olur.', site.minSoldiers)
      : tt('Görünür bir savaş olur. Kazanırsan altın, odun ve hazır silahlar ordu eve dönünce gelir; kaybedersen kamp kalan haydutlarla kalır.');

    if (site.kind === 'chest') {
      fillSources(this.body, s);
      const mission = s.scouting.missions.find((m) => m.kind === 'chest' && m.siteId === site.id);
      const send = this.q<HTMLButtonElement>('[data-act="chest"]');
      scoutButton(send, tt('Gözcü gönder'), s, site.gone || s.eliminated, !!mission);
      const bar = this.q('[data-f="bar"]');
      bar.classList.toggle('hidden', !mission);
      if (mission) bar.querySelector<HTMLElement>('.fill')!.style.width = `${100 * mission.progress}%`;
      this.q('[data-f="mission"]').textContent = mission ? tt('Gözcü {0} · {1} sn', mission.arrived ? tt('altınla dönüyor') : tt('yolda'), Math.ceil(mission.remainingSeconds)) : '';
      return;
    }
    for (const u of s.units) {
      this.q(`[data-unit="${u.id}"] [data-f="home"]`).textContent = tt('kalede {0}', u.soldiers);
      const input = this.q<HTMLInputElement>(`[data-count="${u.id}"]`);
      input.max = String(u.soldiers);
      if (Number(input.value) > u.soldiers) input.value = String(u.soldiers);
    }
    this.refreshSend();
  }

  private refreshSend(): void {
    if (!this.last || !this.body.querySelector('[data-act="send"]')) return;
    const s = this.last.castle, site = this.site();
    if (!site) return;
    let total = 0, shooters = 0;
    for (const u of s.units) {
      const n = Number(this.q<HTMLInputElement>(`[data-count="${u.id}"]`).value) || 0;
      total += n;
      if (SHOOTERS.includes(u.id)) shooters += n;
    }
    this.q('[data-f="priority-row"]').classList.toggle('hidden', shooters === 0);
    this.q('[data-f="priority-label"]').textContent = s.units.some((u) => u.id === 'okcu') ? tt('Okçu hedefi') : tt('Mancınık hedefi');
    const enough = site.kind !== 'village' || total >= site.minSoldiers;
    this.q('[data-f="total"]').textContent = total === 0 ? tt('Gönderilecek askeri seç.')
      : site.kind === 'village' && !enough ? tt('En az {0} asker gerekir.', site.minSoldiers) : tt('{0} asker', total);
    const why = this.q('[data-f="why"]');
    const reason = s.eliminated ? tt('Kalen düştü; izleyicisin.') : site.gone ? (site.kind === 'village' ? tt('Bu köy yağmalanmış görünüyor.') : tt('Bu kamp temizlenmiş görünüyor.')) : '';
    why.textContent = reason;
    why.classList.toggle('hidden', reason === '');
    this.q<HTMLButtonElement>('[data-act="send"]').disabled = total === 0 || !enough || !!reason;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('[data-act="less"],[data-act="more"],[data-act="all"],[data-act="half"]')) b.disabled = !!reason;
  }

  private async click(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn || btn.disabled || !this.last) return;
    const s = this.last.castle, net = this.ctx.net;
    if (btn.dataset.act === 'all' || btn.dataset.act === 'half') {
      for (const u of s.units) {
        this.q<HTMLInputElement>(`[data-count="${u.id}"]`).value = String(btn.dataset.act === 'all' ? u.soldiers : Math.floor(u.soldiers / 2));
      }
      this.refreshSend();
      return;
    }
    if (btn.dataset.act === 'less' || btn.dataset.act === 'more') {
      const input = btn.closest('[data-unit]')!.querySelector<HTMLInputElement>('[data-count]')!;
      const next = Number(input.value) + (btn.dataset.act === 'more' ? 1 : -1);
      input.value = String(Math.max(0, Math.min(Number(input.max) || 0, next)));
      this.refreshSend();
      return;
    }
    if (btn.dataset.act === 'chest') {
      const r = await net.sendChestScout(this.siteId, this.q<HTMLSelectElement>('[data-f="source"]').value as Job);
      if (!r.ok) this.ctx.say(tr(r.error ?? tt('Gözcü gönderilemedi.')));
      else this.ctx.info(tt('Gözcü sandığa gidiyor.'));
      return;
    }
    const units: Record<string, number> = {};
    const rows: Record<string, Row> = {};
    for (const u of s.units) {
      const n = Number(this.q<HTMLInputElement>(`[data-count="${u.id}"]`).value) || 0;
      if (n > 0) units[u.id] = n;
      rows[u.id] = this.q<HTMLSelectElement>(`[data-row="${u.id}"]`).value as Row;
    }
    const r = await net.sendArmyToSite(this.siteId, units, rows, this.q<HTMLSelectElement>('[data-f="priority"]').value || null);
    if (!r.ok) { this.ctx.say(tr(r.error ?? tt('Ordu gönderilemedi.'))); return; }
    for (const i of this.body.querySelectorAll<HTMLInputElement>('[data-count]')) i.value = '0';
    this.refreshSend();
    this.ctx.info(tt('Ordu yola çıktı.'));
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
