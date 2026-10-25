import { COLOR_NAMES, botMark, clock, esc } from '../format';
import type { ArmyMode, CastleView, Job, PlayerView, RoomView, Row, ScoutReportView, ScoutTargetView } from '../types';
import { ago, scoutReportHtml } from './scout-report';
import { Win, type WinContext, type WinData } from './windows';

// A rival's castle: send a scout, read the latest report, send an army. What is inside the castle is
// not known here (only what the scouts bring), so this window never shows more than the reports do.

const AVATAR = (seat: number) =>
  `/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/UI%20Elements/UI%20Elements/Human%20Avatars/Avatars_${String(((seat - 1) % 25) + 1).padStart(2, '0')}.png`;

export class EnemyWin extends Win {
  constructor(ctx: WinContext, private readonly seat: number, s: CastleView, room: RoomView | null) {
    super(ctx, 'red');
    this.el.classList.add('wide');
    const rowSelect = (id: string, def: Row) =>
      `<select data-row="${id}"><option value="front"${def === 'front' ? ' selected' : ''}>ön</option><option value="back"${def === 'back' ? ' selected' : ''}>arka</option></select>`;
    const units = s.units.map((u) => `
      <div class="atk-row" data-unit="${u.id}">
        <span><b>${esc(u.name)}</b> <small class="muted-ink" data-f="home"></small></span>
        <span class="stepper"><button class="btn-round" data-act="less" title="Bir eksik">−</button>
          <input type="number" min="0" value="0" data-count="${u.id}" aria-label="${esc(u.name)} sayısı">
          <button class="btn-round" data-act="more" title="Bir fazla">+</button></span>
        ${rowSelect(u.id, u.id === 'okcu' ? 'back' : 'front')}
      </div>`).join('');
    const priority = `<option value="">ön sıra</option>${s.units.map((u) => `<option value="${u.id}">önce ${esc(u.name)}</option>`).join('')}`;
    const sources = s.jobs.map((j) => `<option value="${j.job}"></option>`).join('');
    this.body.innerHTML = `
      <div class="who"><i class="avatar big" style="background-image:url('${AVATAR(seat)}')"></i>
        <div><b data-f="name"></b><div class="muted-ink small" data-f="state"></div></div></div>
      <h4>Gözcü</h4>
      <div class="row"><select data-f="source" title="Gözcü hangi meslekten çıksın">${sources}</select>
        <button class="btn" data-act="scout" title="Görevdeki gözcü çalışmaz ama yemek yer; dönünce boşta olur">Gözcü gönder</button></div>
      <div class="row sub"><span data-f="scout-info"></span></div>
      <div class="gbar hidden" data-f="scout-bar"><div class="fill"></div></div>
      <div data-f="report"></div>
      <h4>Saldır</h4>
      <p class="muted-ink small hidden" data-f="locked"></p>
      <div data-f="attack">
        <div class="atk-head"><span>Birlik</span><span>Gönder</span><span>Sıra</span></div>
        ${units}
        <div class="row"><span>Okçu hedefi</span><select data-f="priority">${priority}</select></div>
        <div class="row"><span>Emir</span>
          <select data-f="mode" title="Önünü kes: yolda karşılaştığı ilk orduyla savaşır ve eve döner; kimseyle karşılaşmazsa yolun yarısından döner. Rakip bunu bilemez.">
            <option value="attack">Saldır (kaleye)</option><option value="intercept">Önünü kes (yolda karşıla, dön)</option></select></div>
        <div class="row"><small class="muted-ink" data-f="total"></small>
          <button class="btn btn-red" data-act="send">Saldır</button></div>
      </div>`;
    this.body.addEventListener('click', (e) => void this.click(e));
    this.body.addEventListener('input', () => this.refreshSend());
    this.last = { castle: s, room };
    this.update({ castle: s, room });
  }

  private last: WinData | null = null;

  private target(s: CastleView): ScoutTargetView | undefined {
    return s.scouting.targets.find((t) => t.seat === this.seat);
  }

  private player(room: RoomView | null): PlayerView | undefined {
    return room?.players.find((p) => p.seat === this.seat);
  }

  update(data: WinData): void {
    this.last = data;
    const { castle: s, room } = data;
    const t = this.target(s), p = this.player(room);
    const name = t?.name ?? p?.name ?? 'Rakip';
    const color = t?.color ?? p?.color ?? 'red';
    this.setTitle(`${botMark(this.seat)}${esc(name)} <small>${COLOR_NAMES[color] ?? ''}</small>`);
    this.q('[data-f="name"]').textContent = name;
    const out = !!p?.eliminated;
    this.q('[data-f="state"]').textContent = out ? 'Kalesi düştü' : p && !p.connected ? 'Bağlantısı yok' : 'Kalesi ayakta';

    // scout
    const source = this.q<HTMLSelectElement>('[data-f="source"]');
    for (const opt of source.options) {
      const j = s.jobs.find((x) => x.job === opt.value)!;
      const text = `${j.name} (${j.count})`;
      if (opt.textContent !== text) opt.textContent = text;
    }
    const mission = s.scouting.missions.find((m) => m.targetSeat === this.seat);
    const send = this.q<HTMLButtonElement>('[data-act="scout"]');
    send.disabled = !t || t.busy || out || s.eliminated;
    const bar = this.q('[data-f="scout-bar"]');
    bar.classList.toggle('hidden', !mission);
    if (mission) bar.querySelector<HTMLElement>('.fill')!.style.width = `${100 * mission.progress}%`;
    this.q('[data-f="scout-info"]').textContent = mission
      ? (mission.arrived ? `Gözcü gözetledi, dönüyor · ${Math.ceil(mission.remainingSeconds)} sn` : `Gözcü yolda · ${Math.ceil(mission.remainingSeconds)} sn`)
      : t ? `Gidiş-dönüş ${Math.ceil(2 * t.scoutSeconds)} sn` : '';
    this.renderReport(s.scouting.reports.find((r) => r.targetSeat === this.seat), s.elapsedSeconds);

    // attack
    const preparing = s.phase === 'preparation';
    const locked = this.q('[data-f="locked"]');
    const why = s.eliminated ? 'Kalen düştü; izleyicisin.' : out ? 'Bu oyuncu elendi.'
      : preparing ? `Saldırı savaş fazında açılır (${clock(s.remainingSeconds)} sonra).` : s.phase === 'ended' ? 'Maç bitti.' : '';
    locked.textContent = why;
    locked.classList.toggle('hidden', why === '');
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      row.querySelector('[data-f="home"]')!.textContent = `kalede ${u.soldiers}`;
      const input = this.q<HTMLInputElement>(`[data-count="${u.id}"]`);
      input.max = String(u.soldiers);
      if (Number(input.value) > u.soldiers) input.value = String(u.soldiers);
    }
    this.refreshSend();
  }

  private refreshSend(): void {
    if (!this.last) return;
    const s = this.last.castle;
    let total = 0;
    for (const u of s.units) total += Number(this.q<HTMLInputElement>(`[data-count="${u.id}"]`).value) || 0;
    const t = this.target(s);
    const intercept = this.q<HTMLSelectElement>('[data-f="mode"]').value === 'intercept';
    const march = t?.marchSeconds ?? 0;
    this.q('[data-f="total"]').textContent = total === 0 ? 'Gönderilecek askeri seç.'
      : intercept ? `${total} asker, yolun yarısına ${Math.ceil(march / 2)} sn` : `${total} asker, yol ${Math.ceil(march)} sn`;
    const button = this.q<HTMLButtonElement>('[data-act="send"]');
    button.textContent = intercept ? 'Önünü kes' : 'Saldır';
    const out = !!this.player(this.last.room)?.eliminated;
    button.disabled = total === 0 || !t || out || s.eliminated || s.phase !== 'war';
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('[data-act="less"],[data-act="more"]')) b.disabled = s.phase !== 'war' || out || s.eliminated;
  }

  private renderReport(r: ScoutReportView | undefined, now: number): void {
    const el = this.q('[data-f="report"]');
    const html = !r ? '<p class="muted-ink small">Henüz rapor yok. Gözcü dönünce son rapor burada görünür.</p>'
      : `<div class="scout-report">${scoutReportHtml(r, now).replace(/<div class="rep-title[^>]*>.*?<\/div>/s, `<h4>Son gözcü raporu · ${ago(r, now)}</h4>`)}</div>`;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }

  private async click(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn || btn.disabled || !this.last) return;
    const s = this.last.castle;
    const net = this.ctx.net;
    if (btn.dataset.act === 'less' || btn.dataset.act === 'more') {
      const input = btn.closest('[data-unit]')!.querySelector<HTMLInputElement>('[data-count]')!;
      const next = Number(input.value) + (btn.dataset.act === 'more' ? 1 : -1);
      input.value = String(Math.max(0, Math.min(Number(input.max) || 0, next)));
      this.refreshSend();
      return;
    }
    if (btn.dataset.act === 'scout') {
      const r = await net.sendScout(this.seat, this.q<HTMLSelectElement>('[data-f="source"]').value as Job);
      if (!r.ok) this.ctx.say(r.error ?? 'Gözcü gönderilemedi.');
      return;
    }
    const units: Record<string, number> = {};
    const rows: Record<string, Row> = {};
    for (const u of s.units) {
      const n = Number(this.q<HTMLInputElement>(`[data-count="${u.id}"]`).value) || 0;
      if (n > 0) units[u.id] = n;
      rows[u.id] = this.q<HTMLSelectElement>(`[data-row="${u.id}"]`).value as Row;
    }
    const mode = this.q<HTMLSelectElement>('[data-f="mode"]').value as ArmyMode;
    const r = await net.sendArmy(this.seat, units, rows, this.q<HTMLSelectElement>('[data-f="priority"]').value || null, mode);
    if (!r.ok) { this.ctx.say(r.error ?? 'Ordu gönderilemedi.'); return; }
    for (const i of this.body.querySelectorAll<HTMLInputElement>('[data-count]')) i.value = '0';
    this.refreshSend();
    this.ctx.info(mode === 'intercept' ? 'Ordu yola çıktı: önünü kesecek.' : 'Ordu yola çıktı.');
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
