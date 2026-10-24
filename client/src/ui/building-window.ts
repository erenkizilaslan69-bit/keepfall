import { esc } from '../format';
import type { BuildingType, BuildingView, CastleView, Job, Resource } from '../types';
import { Win, type WinContext, type WinData } from './windows';

// A building's window: how many people work in it, what it makes, what the next level gives and
// costs. The forge also holds the weapon orders. Updated in place on every state so that a click is
// never lost to a rebuild (the queue is only redrawn when its lines change).

const PRODUCT: Record<Resource, { name: string; icon: string }> = {
  food: { name: 'yemek', icon: 'ico-meat' },
  wood: { name: 'odun', icon: 'ico-wood' },
  iron: { name: 'demir', icon: 'ico-iron' },
};

export const cost = (icon: string, n: number) => `<span class="cost"><i class="ico ${icon}"></i>${n}</span>`;

export class BuildingWin extends Win {
  private queueKey = '';
  private unitsBuilt = false;

  constructor(ctx: WinContext, private readonly type: BuildingType, s: CastleView) {
    super(ctx, 'blue');
    const b = this.building(s);
    this.body.innerHTML = `
      <div class="row"><span>Çalışan</span>
        <span class="stepper"><button class="btn-round btn-red" data-act="out" title="Bir işçiyi boşa al">−</button><b data-f="workers"></b>
          <button class="btn-round" data-act="in" title="Boştan bir işçi ata">+</button></span></div>
      <div class="row sub"><span data-f="idle"></span></div>
      <div class="row"><span>Üretim</span><b data-f="output"></b></div>
      <div class="row sub"><span data-f="capacity"></span></div>
      <div class="upgrade-box"><button class="btn" data-act="upgrade"></button>
        <div class="gbar hidden" data-f="progress"><div class="fill"></div></div></div>
      ${b.product === null ? `
      <h4>Silah üretimi <small data-f="speed"></small></h4>
      <div data-f="units"></div>
      <div data-f="queue" class="queue"></div>` : ''}`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.update({ castle: s, room: null });
  }

  private building(s: CastleView): BuildingView {
    return s.buildings.find((b) => b.type === this.type)!;
  }

  update({ castle: s }: WinData): void {
    const b = this.building(s);
    this.setTitle(`${esc(b.name)} · Sv ${b.level}`);
    const workers = s.jobs.find((j) => j.job === b.worker)?.count ?? 0;
    const idle = s.jobs.find((j) => j.job === 'idle')?.count ?? 0;
    this.q('[data-f="workers"]').textContent = `${workers} / ${b.capacity}`;
    this.q('[data-f="idle"]').textContent = idle > 0 ? `Boştaki işçi: ${idle}` : 'Boşta işçi yok';
    this.q('[data-f="idle"]').classList.toggle('warn', idle > 0 && b.product !== null);
    this.q<HTMLButtonElement>('[data-act="in"]').disabled = idle === 0 || workers >= b.capacity || s.eliminated;
    this.q<HTMLButtonElement>('[data-act="out"]').disabled = workers === 0 || s.eliminated;

    const out = this.q('[data-f="output"]');
    if (b.product) {
      const p = PRODUCT[b.product];
      const perMinute = b.product === 'food' ? s.rates.foodIn : b.product === 'wood' ? s.rates.wood : s.rates.iron;
      out.innerHTML = `<i class="ico ${p.icon}"></i> +${perMinute.toFixed(1)} ${p.name}/dk`;
    } else {
      out.innerHTML = s.rates.forgeSpeed > 0 ? `<i class="ico ico-hammer"></i> hız ×${s.rates.forgeSpeed.toFixed(2)}` : 'demirci yok, sıra duruyor';
    }
    this.q('[data-f="capacity"]').textContent = `Kapasite ${b.capacity} · çarpan ×${b.multiplier}`;

    const upgrade = this.q<HTMLButtonElement>('[data-act="upgrade"]');
    const bar = this.q('[data-f="progress"]');
    if (b.upgradeRemaining !== null) {
      upgrade.disabled = true;
      upgrade.innerHTML = `Yükseliyor… ${Math.ceil(b.upgradeRemaining)} sn`;
      bar.classList.remove('hidden');
      bar.querySelector<HTMLElement>('.fill')!.style.width = `${100 * (1 - b.upgradeRemaining / b.upgradeTotal)}%`;
    } else {
      bar.classList.add('hidden');
      const n = b.nextUpgrade;
      if (!n) {
        upgrade.disabled = true;
        upgrade.innerHTML = 'En üst seviye';
      } else {
        const woodShort = s.resources.wood + 1e-6 < n.wood, ironShort = s.resources.iron + 1e-6 < n.iron;
        upgrade.disabled = woodShort || ironShort || s.eliminated;
        upgrade.title = woodShort || ironShort ? `Yetmiyor: ${[woodShort && 'odun', ironShort && 'demir'].filter(Boolean).join(' ve ')}` : '';
        upgrade.innerHTML = `<span class="up-line"><i class="ico ico-hammer"></i><b>Yükselt</b> ${esc(gainText(b))}</span>
          <span class="up-cost">${cost('ico-wood', n.wood)} ${cost('ico-iron', n.iron)} <small>${n.seconds} sn</small></span>`;
      }
    }
    if (b.product === null) this.updateForge(s);
  }

  private updateForge(s: CastleView): void {
    if (!this.unitsBuilt) {
      this.unitsBuilt = true;
      this.q('[data-f="units"]').innerHTML = s.units.map((u) => `
        <div class="unit-row" data-unit="${u.id}">
          <div class="unit-head"><b>${esc(u.name)}</b> <span data-f="stock"></span></div>
          <div class="unit-cost">${cost('ico-wood', u.wood)} ${cost('ico-iron', u.iron)} <small>${u.buildSeconds} sn</small></div>
          <span class="stepper"><button class="btn" data-act="queue" data-n="1">+1</button><button class="btn" data-act="queue" data-n="5">+5</button></span>
        </div>`).join('');
    }
    this.q('[data-f="speed"]').textContent = s.rates.forgeSpeed > 0 ? `hız ×${s.rates.forgeSpeed.toFixed(2)}` : '(demirci yok)';
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      row.querySelector('[data-f="stock"]')!.textContent = `depoda ${u.weapons} · asker ${u.soldiers}`;
      for (const btn of row.querySelectorAll<HTMLButtonElement>('[data-act="queue"]')) {
        const n = Number(btn.dataset.n);
        btn.disabled = s.resources.wood + 1e-6 < u.wood * n || s.resources.iron + 1e-6 < u.iron * n || s.eliminated;
      }
    }
    // Rebuild the queue only when its lines change, so a click on "İptal" is never lost to a refresh.
    const key = s.queue.map((o) => `${o.unitId}:${o.remaining}`).join(',');
    const queue = this.q('[data-f="queue"]');
    if (key !== this.queueKey) {
      this.queueKey = key;
      queue.innerHTML = s.queue.length === 0 ? '<p class="muted-ink">Üretim sırası boş.</p>' : s.queue.map((o, i) => `
        <div class="order"><span>${o.remaining} × ${esc(o.name)}</span>
          <div class="gbar"><div class="fill"></div></div>
          <button class="btn-round btn-red" data-act="cancel" data-n="${i}" title="Kalanları iptal et, kaynakları geri al">×</button></div>`).join('');
    }
    queue.querySelectorAll<HTMLElement>('.order .fill').forEach((fill, i) => {
      if (s.queue[i]) fill.style.width = `${(100 * s.queue[i].progress) / s.queue[i].buildSeconds}%`;
    });
  }

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
    if (!result.ok) this.ctx.say(result.error ?? 'Olmadı.');
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
  if (b.product === null) return `+%${Math.round((b.nextUpgrade!.multiplier / b.multiplier - 1) * 100)} silah hızı`;
  const p = PRODUCT[b.product].name;
  return gain <= 0 ? `+0 ${p}/dk (işçi yok)` : `+${Number(gain.toFixed(1))} ${p}/dk`;
}

