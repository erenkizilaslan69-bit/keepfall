import { clock, COLOR_CSS, esc, fmt, rate } from './format';
import type { GameConnection } from './net';
import type { BuildingType, BuildingView, CastleView, CommandResult, Job, ScoutingView } from './types';

// Plain-HTML panel for the player's own castle. The structure is built once from the first state
// and then updated in place, so dropdowns and hover states survive the once-per-second refresh.

export class Hud {
  private built = false;
  private state: CastleView | null = null;
  private toastTimer = 0;
  private status = '';
  private queueKey = '';
  private noticeTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly net: GameConnection,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
  }

  update(state: CastleView): void {
    this.state = state;
    if (!this.built) this.build(state);
    this.refresh(state);
  }

  /** Scroll the panel to a building's row and flash it (from a click in the scene). */
  focusBuilding(type: BuildingType): void {
    if (!this.built) return;
    const row = this.q(`[data-building="${type}"]`);
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('flash');
    void row.offsetWidth; // restart the animation
    row.classList.add('flash');
  }

  setStatus(text: string): void {
    this.status = text;
    if (this.built) this.q('#status').textContent = text;
  }

  // ---- structure ---------------------------------------------------------------------------

  private build(s: CastleView): void {
    const jobs = s.jobs.map((j) => `
      <div class="row job" data-job="${j.job}">
        <span class="label">${esc(j.name)}</span>
        <span class="count" data-f="count"></span>
        <span class="buttons">
          ${j.job === 'idle' ? '' : `
          <button data-action="move" data-from="${j.job}" data-to="idle" data-n="1" title="Boşa al">−</button>
          <button data-action="move" data-from="idle" data-to="${j.job}" data-n="1" title="Boştan ata">+</button>`}
        </span>
      </div>`).join('');

    const buildings = s.buildings.map((b) => `
      <div class="row building" data-building="${b.type}">
        <span class="label">${esc(b.name)} <b data-f="level"></b></span>
        <span class="detail" data-f="detail"></span>
        <span class="buttons"><button class="upgrade" data-action="upgrade" data-building="${b.type}" data-f="upgrade"></button></span>
        <div class="bar" data-f="bar"><div></div></div>
      </div>`).join('');

    const sources = s.jobs.map((j) => `<option value="${j.job}">${esc(j.name)}</option>`).join('');
    const units = s.units.map((u) => `
      <div class="row unit" data-unit="${u.id}">
        <span class="label">${esc(u.name)}</span>
        <span class="detail" data-f="detail"></span>
        <span class="buttons">
          <button data-action="queue" data-unit="${u.id}" data-n="1" title="${u.wood} odun, ${u.iron} demir, ${u.buildSeconds} sn">+1 silah</button>
          <button data-action="queue" data-unit="${u.id}" data-n="5">+5</button>
        </span>
        <span class="buttons arm">
          <select data-f="source" title="Askeri hangi meslekten al">${sources}</select>
          <button data-action="arm" data-unit="${u.id}">Asker yap</button>
          <button data-action="disarm" data-unit="${u.id}" title="Silahı bırak, boşa dön">Bırak</button>
        </span>
      </div>`).join('');

    this.root.innerHTML = `
      <header>
        <div><span class="timer" id="timer"></span> <span class="muted">hazırlık</span></div>
        <div id="speed" class="speed">${s.speedControl
          ? [1, 5, 20].map((x) => `<button data-action="speed" data-n="${x}">×${x}</button>`).join('')
          : ''}</div>
        <div class="muted" id="status">${esc(this.status)}</div>
      </header>
      <div id="starving" class="banner danger">Açlık! Yemek bitti, tüm üretim yarıya indi.</div>
      <section class="resources">
        <div><span class="res-name">Yemek</span> <b id="food"></b> <span class="muted" id="food-rate"></span></div>
        <div><span class="res-name">Odun</span> <b id="wood"></b> <span class="muted" id="wood-rate"></span></div>
        <div><span class="res-name">Demir</span> <b id="iron"></b> <span class="muted" id="iron-rate"></span></div>
        <div class="foodbar-wrap">
          <div class="foodbar" title="Yemek: çizgi = rezerv, çubuğun sonu = yeni kişinin doğacağı miktar">
            <div class="fill" id="food-fill"></div>
            <div class="mark" id="food-mark"></div>
          </div>
          <div class="muted small" id="food-bar-label"></div>
        </div>
      </section>
      <section>
        <div class="row">
          <span class="label">Nüfus <b id="population"></b></span>
          <span class="detail" id="growth-detail"></span>
          <span class="buttons"><button data-action="growth" id="growth"></button></span>
        </div>
      </section>
      <section><h2>Meslekler</h2>${jobs}</section>
      <section><h2>Binalar</h2>${buildings}</section>
      <section><h2>Demirhane <span class="muted" id="forge-speed"></span></h2>
        ${units}
        <div id="queue" class="queue"></div>
      </section>
      ${scoutSection(s, sources)}
      <div id="toast" class="toast"></div>
      <div id="notice" class="toast info"></div>`;
    this.built = true;
  }

  // ---- values ------------------------------------------------------------------------------

  private refresh(s: CastleView): void {
    this.q('#timer').textContent = clock(s.remainingSeconds);
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>('[data-action="speed"]'))
      btn.classList.toggle('active', Number(btn.dataset.n) === s.speed);

    this.q('#starving').classList.toggle('hidden', !s.starving);
    this.q('#food').textContent = fmt(s.resources.food);
    this.q('#food-rate').textContent = `${rate(s.rates.foodIn - s.rates.foodOut)}/dk (+${s.rates.foodIn.toFixed(1)} −${s.rates.foodOut.toFixed(1)})`;
    // Food bar: the line is the reserve growth keeps; the end of the bar is where the next person is born.
    const threshold = s.foodReserve + s.nextPersonCost;
    const scale = Math.max(threshold, s.resources.food, 1);
    const fill = this.q('#food-fill');
    fill.style.width = `${Math.min(100, (100 * s.resources.food) / scale)}%`;
    fill.classList.toggle('low', s.resources.food < s.foodReserve);
    this.q('#food-mark').style.left = `${(100 * s.foodReserve) / scale}%`;
    this.q('#food-bar-label').textContent = s.growthEnabled
      ? `rezerv ${fmt(s.foodReserve)} · yeni kişi ${fmt(threshold)} yemekte doğar`
      : `rezerv ${fmt(s.foodReserve)} · büyüme kapalı`;
    this.q('#wood').textContent = fmt(s.resources.wood);
    this.q('#wood-rate').textContent = `${rate(s.rates.wood)}/dk`;
    this.q('#iron').textContent = fmt(s.resources.iron);
    this.q('#iron-rate').textContent = `${rate(s.rates.iron)}/dk`;

    this.q('#population').textContent = `${s.population}` + (s.soldiers ? ` (${s.soldiers} asker)` : '');
    this.q('#growth-detail').textContent = `yeni kişi: ${s.nextPersonCost} yemek`;
    this.q('#growth').textContent = s.growthEnabled ? 'Büyüme: açık' : 'Büyüme: kapalı';
    this.q('#growth').classList.toggle('active', s.growthEnabled);

    for (const j of s.jobs) {
      const row = this.q(`[data-job="${j.job}"]`);
      row.querySelector('[data-f="count"]')!.textContent = j.capacity === null ? `${j.count}` : `${j.count} / ${j.capacity}`;
      // Idle people are wasted food: make them hard to miss.
      if (j.job === 'idle') row.classList.toggle('attention', j.count > 0);
    }

    for (const b of s.buildings) {
      const row = this.q(`[data-building="${b.type}"]`);
      row.querySelector('[data-f="level"]')!.textContent = `Sv ${b.level}`;
      row.querySelector('[data-f="detail"]')!.textContent = `kapasite ${b.capacity}, ×${b.multiplier}`;
      const button = row.querySelector<HTMLButtonElement>('[data-f="upgrade"]')!;
      const bar = row.querySelector<HTMLElement>('[data-f="bar"]')!;
      if (b.upgradeRemaining !== null) {
        button.textContent = `Yükseliyor… ${Math.ceil(b.upgradeRemaining)} sn`;
        button.disabled = true;
        bar.classList.remove('hidden');
        (bar.firstElementChild as HTMLElement).style.width = `${100 * (1 - b.upgradeRemaining / b.upgradeTotal)}%`;
      } else {
        bar.classList.add('hidden');
        const n = b.nextUpgrade;
        button.innerHTML = n
          ? `${esc(upgradeGainText(b))}<small>${n.wood} odun · ${n.iron} demir · ${n.seconds} sn</small>`
          : 'En üst seviye';
        button.disabled = !n || s.resources.wood + 1e-6 < n.wood || s.resources.iron + 1e-6 < n.iron;
      }
    }

    this.q('#forge-speed').textContent = s.rates.forgeSpeed > 0 ? `hız ×${s.rates.forgeSpeed.toFixed(2)}` : '(demirci yok, sıra duruyor)';
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      row.querySelector('[data-f="detail"]')!.textContent = `depoda ${u.weapons} silah · ${u.soldiers} asker`;
      for (const btn of row.querySelectorAll<HTMLButtonElement>('[data-action="queue"]')) {
        const n = Number(btn.dataset.n);
        btn.disabled = s.resources.wood + 1e-6 < u.wood * n || s.resources.iron + 1e-6 < u.iron * n;
      }
      row.querySelector<HTMLButtonElement>('[data-action="arm"]')!.disabled = u.weapons === 0;
      row.querySelector<HTMLButtonElement>('[data-action="disarm"]')!.disabled = u.soldiers === 0;
    }

    // Rebuild the queue only when its lines change, so a click on "İptal" is never lost to a refresh.
    const queueKey = s.queue.map((o) => `${o.unitId}:${o.remaining}`).join(',');
    if (queueKey !== this.queueKey) {
      this.queueKey = queueKey;
      this.q('#queue').innerHTML = s.queue.length === 0 ? '<span class="muted">Üretim sırası boş.</span>' : s.queue.map((o, i) => `
        <div class="order">
          <span>${o.remaining} × ${esc(o.name)}</span>
          <div class="bar"><div></div></div>
          <button data-action="cancel" data-n="${i}" title="Kalanları iptal et, kaynakları geri al">İptal</button>
        </div>`).join('');
    }
    this.root.querySelectorAll<HTMLElement>('#queue .order .bar > div').forEach((bar, i) => {
      bar.style.width = `${(100 * s.queue[i].progress) / s.queue[i].buildSeconds}%`;
    });

    this.refreshScouting(s.scouting, s.elapsedSeconds);

  }

  // ---- input -------------------------------------------------------------------------------

  private async onClick(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!btn || btn.disabled || !this.state) return;
    const d = btn.dataset;
    const n = Number(d.n ?? 1);
    let result: CommandResult;
    switch (d.action) {
      case 'move': result = await this.net.moveWorkers(d.from as Job, d.to as Job, n); break;
      case 'upgrade': result = await this.net.upgradeBuilding(d.building as BuildingType); break;
      case 'queue': result = await this.net.queueWeapon(d.unit!, n); break;
      case 'cancel': result = await this.net.cancelWeapon(n); break;
      case 'arm': {
        const source = btn.closest('.unit')!.querySelector<HTMLSelectElement>('[data-f="source"]')!.value as Job;
        result = await this.net.armWorkers(d.unit!, 1, source);
        break;
      }
      case 'disarm': result = await this.net.disarmSoldiers(d.unit!, 1); break;
      case 'growth': result = await this.net.setGrowth(!this.state.growthEnabled); break;
      case 'speed': result = await this.net.setSpeed(n); break;
      case 'scout': {
        const target = Number(this.q<HTMLSelectElement>('[data-f="scout-target"]').value);
        const from = this.q<HTMLSelectElement>('[data-f="scout-source"]').value as Job;
        result = await this.net.sendScout(target, from);
        break;
      }
      default: return;
    }
    if (!result.ok) this.toast(result.error ?? 'Olmadı.');
  }

  /** A message about something that happened to us (not an error), shown a little longer. */
  notify(message: string): void {
    if (!this.built) return;
    const el = this.q('#notice');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => el.classList.remove('show'), 6000);
  }

  private refreshScouting(sc: ScoutingView, now: number): void {
    const select = this.root.querySelector<HTMLSelectElement>('[data-f="scout-target"]');
    if (!select) return;
    for (const option of select.options) {
      const t = sc.targets.find((x) => x.seat === Number(option.value));
      option.disabled = !t || t.busy;
      option.textContent = t ? `${t.name}${t.busy ? ' (gözcü yolda)' : ''}` : option.textContent;
    }
    // Keep a usable target selected when the current one becomes busy.
    if (select.selectedOptions[0]?.disabled) {
      const free = [...select.options].find((o) => !o.disabled);
      if (free) select.value = free.value;
    }
    const allBusy = [...select.options].every((o) => o.disabled);
    this.q<HTMLButtonElement>('[data-action="scout"]').disabled = allBusy;

    const name = (seat: number) => sc.targets.find((t) => t.seat === seat);
    this.q('#scout-missions').innerHTML = sc.missions.map((m) => {
      const t = name(m.targetSeat);
      const state = m.arrived ? 'gözetledi, dönüyor' : 'yolda';
      return `
        <div class="order">
          <span>${dot(t?.color)}${esc(t?.name ?? '?')} · ${state}</span>
          <div class="bar"><div style="width:${100 * m.progress}%"></div></div>
          <span class="muted small">${Math.ceil(m.remainingSeconds)} sn</span>
        </div>`;
    }).join('');

    this.q('#scout-reports').innerHTML = sc.reports.length === 0
      ? '<p class="muted small">Henüz rapor yok. Gözcü dönünce son rapor burada görünür.</p>'
      : sc.reports.map((r) => `
        <div class="report">
          <div class="report-head">${dot(r.targetColor)}<b>${esc(r.targetName)}</b>
            <span class="muted small">${Math.max(0, Math.floor(now - r.deliveredAt))} sn önce</span></div>
          <div class="small">${r.soldiers.map((u) => `${esc(u.name)} ${u.count === 0 ? '0' : `≈${u.count}`}`).join(' · ')}</div>
          <div class="small muted">${r.buildings.map((b) => `${esc(b.name)} Sv ${b.level}`).join(' · ')}</div>
        </div>`).join('');
  }

  toast(message: string): void {
    const el = this.q('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2500);
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }
}

const PRODUCT_NAMES: Record<string, string> = { food: 'yemek', wood: 'odun', iron: 'demir' };

/** "Yükselt → +16 yemek/dk" with today's workers; the forge shows its speed gain instead. */
function upgradeGainText(b: BuildingView): string {
  const gain = b.upgradeGain ?? 0;
  if (b.product === null) {
    const percent = Math.round((b.nextUpgrade!.multiplier / b.multiplier - 1) * 100);
    return `Yükselt → +%${percent} silah hızı`;
  }
  if (gain <= 0) return `Yükselt → +0 ${PRODUCT_NAMES[b.product]}/dk (işçi yok)`;
  return `Yükselt → +${Number(gain.toFixed(1))} ${PRODUCT_NAMES[b.product]}/dk`;
}

const dot = (color?: string) => `<span class="dot small-dot" style="background:${COLOR_CSS[color ?? ''] ?? '#888'}"></span>`;

/** The scouting section: target, which job the scout comes from, send, missions under way, reports. */
function scoutSection(s: CastleView, sources: string): string {
  const sc = s.scouting;
  if (sc.targets.length === 0)
    return `<section><h2>Gözcü</h2><p class="muted small">Gözetlenecek rakip yok.</p></section>`;
  const targets = sc.targets.map((t) => `<option value="${t.seat}">${esc(t.name)}</option>`).join('');
  return `
    <section><h2>Gözcü <span class="muted">(görev ${sc.missionSeconds} sn)</span></h2>
      <div class="row scout-send">
        <select data-f="scout-target" title="Hangi rakip">${targets}</select>
        <select data-f="scout-source" title="Gözcü hangi meslekten çıksın">${sources}</select>
        <button data-action="scout" title="Görevdeki gözcü çalışmaz ama yemek yer; dönünce boşta olur">Gönder</button>
      </div>
      <div id="scout-missions" class="queue"></div>
      <div id="scout-reports"></div>
    </section>`;
}
