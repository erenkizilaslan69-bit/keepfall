import { esc } from '../format';
import { t, tr } from '../i18n';
import type { BuildingType, BuildingView, CastleView, Job, Resource } from '../types';
import { Win, type WinContext, type WinData } from './windows';
import { setChip, weaponChip } from './unit-chips';

// A building's window: how many people work in it, what it makes, what the next level gives and
// costs. The forge also holds the weapon orders. Updated in place on every state so that a click is
// never lost to a rebuild (the queue is only redrawn when its lines change).

const PRODUCT: Record<Resource, { name: string; icon: string }> = {
  food: { name: t('yemek'), icon: 'ico-meat' },
  wood: { name: t('odun'), icon: 'ico-wood' },
  iron: { name: t('demir'), icon: 'ico-iron' },
};

export const cost = (icon: string, n: number) => `<span class="cost"><i class="ico ${icon}"></i>${n}</span>`;

export class BuildingWin extends Win {
  private queueKey = '';
  private unitsBuilt = false;

  constructor(ctx: WinContext, private readonly type: BuildingType, s: CastleView) {
    super(ctx, 'blue');
    const b = this.building(s);
    this.body.innerHTML = `
      <div class="kf-prod">
        <span class="kf-prod-ico" data-f="icon"></span>
        <div class="kf-prod-txt"><small>${t('Üretim')}</small><b data-f="output"></b><small data-f="capacity"></small></div>
      </div>
      <div class="kf-crew">
        <button class="kf-btn kf-btn--danger kf-btn--sq" data-act="out" title="${t('Bir işçiyi boşa al')}" aria-label="${t('Bir işçiyi boşa al')}">−</button>
        <div class="kf-crew-mid"><small>${t('Çalışan')}</small><b data-f="workers"></b><div class="kf-slots" data-f="slots"></div></div>
        <button class="kf-btn kf-btn--green kf-btn--sq" data-act="in" title="${t('Boştan bir işçi ata')}" aria-label="${t('Boştan bir işçi ata')}">+</button>
      </div>
      <div class="row sub center"><span data-f="idle"></span></div>
      <div class="upgrade-box"><button class="kf-btn kf-btn--big kf-btn--wide" data-act="upgrade"></button>
        <div class="gbar hidden" data-f="progress"><div class="fill"></div></div></div>
      ${b.product === null ? `
      <h4>${t('Silah üretimi')} <small data-f="speed"></small></h4>
      <div data-f="units"></div>
      <div data-f="queue" class="queue"></div>` : ''}`;
    // the forge: no production box (its speed is in the weapons heading), compact weapon rows, each order under its own weapon: the window fits without scrolling
    this.body.classList.toggle('forge', b.product === null);
    this.body.addEventListener('click', (e) => void this.click(e));
    this.update({ castle: s, room: null });
  }

  private building(s: CastleView): BuildingView {
    return s.buildings.find((b) => b.type === this.type)!;
  }

  update({ castle: s }: WinData): void {
    const b = this.building(s);
    this.setTitle(`${esc(tr(b.name))} · ${t('Sv {0}', b.level)}`);
    const workers = s.jobs.find((j) => j.job === b.worker)?.count ?? 0;
    const idle = s.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    this.q('[data-f="workers"]').textContent = `${workers} / ${b.capacity}`;
    const slots = Array.from({ length: b.capacity }, (_, i) => `<i class="kf-pip${i < workers ? ' on' : ''}"></i>`).join('');
    const slotBox = this.q('[data-f="slots"]');
    if (slotBox.dataset.html !== slots) { slotBox.innerHTML = slots; slotBox.dataset.html = slots; }
    this.q('[data-f="idle"]').textContent = idle > 0 ? t('Boştaki işçi: {0}', idle) : t('Boşta işçi yok');
    this.q('[data-f="idle"]').classList.toggle('warn', idle > 0 && b.product !== null);
    this.q<HTMLButtonElement>('[data-act="in"]').disabled = idle === 0 || workers >= b.capacity || s.eliminated;
    this.q<HTMLButtonElement>('[data-act="out"]').disabled = workers === 0 || s.eliminated;

    const out = this.q('[data-f="output"]');
    if (b.product) {
      const p = PRODUCT[b.product];
      const perMinute = b.product === 'food' ? s.rates.foodIn : b.product === 'wood' ? s.rates.wood : s.rates.iron;
      out.textContent = t('+{0} {1}/dk', perMinute.toFixed(1), p.name);
      this.q('[data-f="icon"]').innerHTML = `<i class="ico ${p.icon}"></i>`;
    } else {
      out.textContent = s.rates.forgeSpeed > 0 ? t('hız ×{0}', s.rates.forgeSpeed.toFixed(2)) : t('demirci yok, sıra duruyor');
      this.q('[data-f="icon"]').innerHTML = '<i class="ico ico-hammer"></i>';
    }
    this.q('[data-f="capacity"]').textContent = t('Kapasite {0} · çarpan ×{1}', b.capacity, b.multiplier);

    const upgrade = this.q<HTMLButtonElement>('[data-act="upgrade"]');
    const bar = this.q('[data-f="progress"]');
    if (b.upgradeRemaining !== null) {
      upgrade.disabled = true;
      upgrade.innerHTML = t('Yükseliyor… {0} sn', Math.ceil(b.upgradeRemaining));
      bar.classList.remove('hidden');
      bar.querySelector<HTMLElement>('.fill')!.style.width = `${100 * (1 - b.upgradeRemaining / b.upgradeTotal)}%`;
    } else {
      bar.classList.add('hidden');
      const n = b.nextUpgrade;
      if (!n) {
        upgrade.disabled = true;
        upgrade.innerHTML = t('En üst seviye');
      } else {
        const woodShort = s.resources.wood + 1e-6 < n.wood, ironShort = s.resources.iron + 1e-6 < n.iron;
        upgrade.disabled = woodShort || ironShort || s.eliminated;
        upgrade.title = woodShort || ironShort ? t('Yetmiyor: {0}', [woodShort && t('odun'), ironShort && t('demir')].filter(Boolean).join(t(' ve '))) : '';
        upgrade.innerHTML = `<span class="up-line"><i class="ico ico-hammer"></i><b>${t('Yükselt')}</b> ${esc(gainText(b))}</span>
          <span class="up-cost">${cost('ico-wood', n.wood)} ${cost('ico-iron', n.iron)} <small>${t('{0} sn', n.seconds)}</small></span>`;
      }
    }
    if (b.product === null) this.updateForge(s);
  }

  private updateForge(s: CastleView): void {
    if (!this.unitsBuilt) {
      this.unitsBuilt = true;
      this.q('[data-f="units"]').innerHTML = s.units.map((u) => `
        <div class="unit-row" data-unit="${u.id}">
          <div class="unit-head">${weaponChip(u.id, '', u.weapons, 'wstock')}<span class="unit-name"><b>${esc(tr(u.name))}</b> <small>${t('{0} sn', u.buildSeconds)}</small></span></div>
          <div class="unit-cost">${cost('ico-wood', u.wood)} ${cost('ico-iron', u.iron)}</div>
          <span class="stepper"><button class="btn" data-act="queue" data-n="1">+1</button><button class="btn" data-act="queue" data-n="5">+5</button></span>
          <div class="uorders" data-f="orders"></div>
        </div>`).join('');
    }
    this.q('[data-f="speed"]').textContent = s.rates.forgeSpeed > 0 ? t('hız ×{0}', s.rates.forgeSpeed.toFixed(2)) : t('(demirci yok)');
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      setChip(row, 'wstock', u.weapons, `${tr(u.name)}: ${t('depoda {0} · asker {1}', u.weapons, u.soldiers)}`);
      for (const btn of row.querySelectorAll<HTMLButtonElement>('[data-act="queue"]')) {
        const n = Number(btn.dataset.n);
        btn.disabled = s.resources.wood + 1e-6 < u.wood * n || s.resources.iron + 1e-6 < u.iron * n || s.eliminated;
      }
    }
    // Each order sits under its own weapon's row (several orders: several lines, in the queue's order).
    // Rebuilt only when the lines change, so a click on the cancel button is never lost to a refresh.
    const key = s.queue.map((o) => `${o.unitId}:${o.remaining}`).join(',');
    const orphans = this.q('[data-f="queue"]'); // (an order for a weapon with no row: not expected, kept visible all the same)
    if (key !== this.queueKey) {
      this.queueKey = key;
      this.body.querySelectorAll<HTMLElement>('[data-f="orders"]').forEach((box) => { box.innerHTML = ''; });
      orphans.innerHTML = '';
      s.queue.forEach((o, i) => {
        const box = this.body.querySelector<HTMLElement>(`[data-unit="${o.unitId}"] [data-f="orders"]`) ?? orphans;
        box.insertAdjacentHTML('beforeend', `
          <div class="order" data-order="${i}">${box === orphans ? weaponChip(o.unitId, esc(tr(o.name)), o.remaining) : `<b class="order-n">×${o.remaining}</b>`}
            <div class="gbar"><div class="fill"></div><span class="gbar-text" data-f="eta"></span></div>
            <button class="btn-round btn-red" data-act="cancel" data-n="${i}" title="${t('Kalanları iptal et, kaynakları geri al')}" aria-label="${t('Kalanları iptal et, kaynakları geri al')}">×</button></div>`);
      });
    }
    // the time left: the queue is worked through in order, so an order is done after everything before it; the forge's real pace
    // (it runs faster in the preparation, slower while starving) is read from how fast the work goes down, the shown speed until then
    const left = s.queue.map((o) => o.remaining * o.buildSeconds - o.progress);
    const rate = this.pace(left.reduce((a, b) => a + b, 0), s.rates.forgeSpeed);
    let before = 0;
    s.queue.forEach((o, i) => {
      const line = this.body.querySelector<HTMLElement>(`.order[data-order="${i}"]`);
      if (!line) return;
      line.querySelector<HTMLElement>('.fill')!.style.width = `${i === 0 ? (100 * o.progress) / o.buildSeconds : 0}%`;
      before += left[i];
      const eta = line.querySelector<HTMLElement>('[data-f="eta"]')!;
      const secs = rate > 0 ? t('{0} sn', Math.max(1, Math.ceil(before / rate))) : '';
      eta.textContent = i === 0 ? secs : secs ? `${t('bekliyor')} · ${secs}` : t('bekliyor');
    });
  }

  /** Forge work done per real second, smoothed over the last states; `shown` (the view's speed) until it has been measured. */
  private pace(work: number, shown: number): number {
    if (shown !== BuildingWin.shown) { BuildingWin.shown = shown; BuildingWin.rate = 0; } // a smith more or less, hunger: the old pace is no longer true
    const now = performance.now(), last = BuildingWin.lastWork;
    if (last && work < last.work - 1e-6 && now - last.at > 200) {
      const r = (last.work - work) / ((now - last.at) / 1000);
      BuildingWin.rate = BuildingWin.rate > 0 ? BuildingWin.rate * 0.7 + r * 0.3 : r;
      BuildingWin.lastWork = { work, at: now };
    } else if (!last || work > last.work + 1e-6 || now - last.at > 5000 || work === 0) BuildingWin.lastWork = work > 0 ? { work, at: now } : null; // new orders / a pause: measure again from here
    if (shown <= 0) return 0;
    return BuildingWin.rate > 0 ? BuildingWin.rate : shown;
  }

  private static lastWork: { work: number; at: number } | null = null;
  private static rate = 0;
  private static shown = -1;

  private async click(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn || btn.disabled) return;
    const n = Number(btn.dataset.n ?? 1);
    const b = this.ctx.net;
    const job = this.workerJob();
    const result = await (btn.dataset.act === 'in' ? b.moveWorkers('idle', job, 1)
      : btn.dataset.act === 'out' ? b.moveWorkers(job, 'idle', 1)
      : btn.dataset.act === 'upgrade' ? b.upgradeBuilding(this.type)
      : btn.dataset.act === 'queue' ? b.queueWeapon(btn.closest<HTMLElement>('[data-unit]')!.dataset.unit!, n)
      : b.cancelWeapon(n));
    if (!result.ok) this.ctx.say(tr(result.error ?? t('Olmadı.')));
  }

  private workerJob(): Job {
    return ({ farm: 'farmer', lumberCamp: 'lumberjack', mine: 'miner', forge: 'blacksmith' } as const)[this.type];
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}

/** "+16 yemek/dk" with today's workers; the forge shows its speed gain instead. */
function gainText(b: BuildingView): string {
  const gain = b.upgradeGain ?? 0;
  if (b.product === null) return t('+%{0} silah hızı', Math.round((b.nextUpgrade!.multiplier / b.multiplier - 1) * 100));
  const p = PRODUCT[b.product].name;
  return gain <= 0 ? t('+0 {0}/dk (işçi yok)', p) : t('+{0} {1}/dk', Number(gain.toFixed(1)), p);
}

