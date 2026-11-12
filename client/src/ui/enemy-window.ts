import { syncStepButtons } from './step-buttons';
import { SHOOTERS, bindRowSwap, botMark, clock, colorNote, defaultRows, esc, rowSelect } from '../format';
import { t as tt, tr } from '../i18n';
import { messagesOn } from '../prefs';
import { emblemHtml, rivalKingdom } from './emblem';
import type { ArmyMode, CastleView, Job, PlayerView, RoomView, Row, ScoutReportView, ScoutTargetView } from '../types';
import { ago, scoutButton, scoutReportHtml } from './scout-report';
import { Win, type WinContext, type WinData } from './windows';
import { asset } from '../env';

// A rival's castle: send a scout, read the latest report, send an army. What is inside the castle is
// not known here (only what the scouts bring), so this window never shows more than the reports do.

const AVATAR = (seat: number) =>
  asset(`/assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/UI%20Elements/UI%20Elements/Human%20Avatars/Avatars_${String(((seat - 1) % 25) + 1).padStart(2, '0')}.png`);

export class EnemyWin extends Win {
  constructor(ctx: WinContext, private readonly seat: number, s: CastleView, room: RoomView | null) {
    super(ctx, 'red');
    this.el.classList.add('wide');
    const defaults = defaultRows(s.units.map((u) => u.id));
    const units = s.units.map((u) => `
      <div class="atk-row" data-unit="${u.id}">
        <span><b>${esc(tr(u.name))}</b> <small class="muted-ink" data-f="home"></small></span>
        <span class="stepper"><button class="btn-round" data-act="less" title="${tt('Bir eksik')}">−</button>
          <input type="number" min="0" value="0" data-count="${u.id}" aria-label="${esc(tt('{0} sayısı', tr(u.name)))}">
          <button class="btn-round" data-act="more" title="${tt('Bir fazla')}">+</button></span>
        ${rowSelect('data-row', u.id, defaults[u.id])}
      </div>`).join('');
    const priority = `<option value="">${tt('ön sıra')}</option>${s.units.map((u) => `<option value="${u.id}">${tt('önce {0}', esc(tr(u.name)))}</option>`).join('')}`;
    const sources = s.jobs.map((j) => `<option value="${j.job}"></option>`).join('');
    this.body.innerHTML = `
      <div class="who"><i class="avatar big" style="background-image:url('${AVATAR(seat)}')"></i><span data-f="emblem"></span>
        <div><b data-f="name"></b><div class="muted-ink small" data-f="state"></div></div></div>
      <div class="tabs win-tabs" role="tablist">
        <button class="tab" role="tab" data-tab-sec="scout">${tt('Gözcü')}</button><button class="tab" role="tab" data-tab-sec="envoy">${tt('Ulak')}</button><button class="tab" role="tab" data-tab-sec="attack">${tt('Saldır')}</button></div>
      <div class="win-sec" data-sec="scout">
      <h4>${tt('Gözcü')}</h4>
      <div class="row"><select data-f="source" title="${tt('Gözcü hangi meslekten çıksın')}">${sources}</select>
        <button class="btn" data-act="scout" title="${tt('Görevdeki gözcü çalışmaz ama yemek yer; dönünce boşta olur')}">${tt('Gözcü gönder')}</button></div>
      <div class="row sub"><span data-f="scout-info"></span></div>
      <div class="gbar hidden" data-f="scout-bar"><div class="fill"></div></div>
      <div data-f="report"></div>
      </div>
      <div class="win-sec" data-sec="envoy">
      <h4>${tt('Ulak')}</h4>
      <p class="muted-ink small">${tt('Ulak yük ve mesaj taşır; bilgi toplamaz, yakalanamaz. Yükü ve mesajı yalnız sen ve alıcı görür. Gözcüyle aynı hakkı kullanır.')}</p>
      <div class="envoy-goods">
        <label><i class="ico ico-meat"></i><input type="number" min="0" value="0" data-env="food" aria-label="${tt('Yemek')}"><small data-f="env-have-food"></small></label>
        <label><i class="ico ico-wood"></i><input type="number" min="0" value="0" data-env="wood" aria-label="${tt('Odun')}"><small data-f="env-have-wood"></small></label>
        <label><i class="ico ico-iron"></i><input type="number" min="0" value="0" data-env="iron" aria-label="${tt('Demir')}"><small data-f="env-have-iron"></small></label>
        <label><i class="ico ico-coin"></i><input type="number" min="0" value="0" data-env="gold" aria-label="${tt('Altın')}"><small data-f="env-have-gold"></small></label>
      </div>
      <textarea class="envoy-text" data-f="env-text" rows="2" ${messagesOn() ? '' : 'hidden'} placeholder="${tt('Mesaj (isteğe bağlı)')}" aria-label="${tt('Ulak mesajı')}"></textarea>
      <div class="row"><small class="muted-ink" data-f="env-total"></small>
        <button class="btn" data-act="envoy">${tt('Ulak gönder')}</button></div>
      <div class="row sub"><span data-f="env-info"></span></div>
      </div>
      <div class="win-sec" data-sec="attack">
      <h4>${tt('Saldır')}</h4>
      <p class="muted-ink small hidden" data-f="locked"></p>
      <div data-f="attack">
        <div class="row quick"><span>${tt('Hızlı doldur')}</span><span>
          <button class="btn" data-act="all" title="${tt('Her türden kaledeki tüm askerleri yaz')}">${tt('Tümü')}</button>
          <button class="btn" data-act="half" title="${tt('Her türden kaledeki askerin yarısını yaz')}">${tt('Yarısı')}</button></span></div>
        <div class="atk-head"><span>${tt('Birlik')}</span><span>${tt('Gönder')}</span><span>${tt('Sıra')}</span></div>
        ${units}
        <div class="row" data-f="priority-row"><span data-f="priority-label">${tt('Okçu hedefi')}</span><select data-f="priority">${priority}</select></div>
        <div class="row"><span>${tt('Emir')}</span>
          <select data-f="mode" title="${tt('Önünü kes: yolda karşılaştığı ilk orduyla savaşır ve eve döner; kimseyle karşılaşmazsa yolun yarısından döner. Rakip bunu bilemez.')}">
            <option value="attack">${tt('Saldır (kaleye)')}</option><option value="intercept">${tt('Önünü kes (yolda karşıla, dön)')}</option></select></div>
        <div class="row"><small class="muted-ink" data-f="total"></small>
          <button class="btn btn-red" data-act="send">${tt('Saldır')}</button></div>
      </div>
      </div>`;
    // On a touch screen the three parts (scout, envoy, attack) are tabs: one at a time fits the screen, and its main button is always in sight. On a desktop all three stay in a column.
    this.tabbed = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.el.classList.toggle('tabbed', this.tabbed);
    this.showSection(s.phase === 'war' ? 'attack' : 'scout');
    bindRowSwap(this.body, 'data-row');
    this.body.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab-sec]');
      if (tab) { this.showSection(tab.dataset.tabSec!); return; }
      void this.click(e);
    });
    this.body.addEventListener('input', () => { this.refreshSend(); if (this.last) this.updateEnvoy(this.last.castle, !!this.player(this.last.room)?.eliminated); });
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
    const name = tr(t?.name ?? p?.name ?? 'Rakip');
    const color = t?.color ?? p?.color ?? 'red';
    this.setTitle(`${botMark(this.seat)}${esc(name)}${colorNote(name, color)}`);
    this.q('[data-f="name"]').textContent = name;
    const emblem = emblemHtml(rivalKingdom(this.seat, s.scouting.reports.find((r) => r.targetSeat === this.seat)), 'emblem-who');
    const emblemBox = this.q('[data-f="emblem"]');
    if (emblemBox.dataset.html !== emblem) { emblemBox.dataset.html = emblem; emblemBox.innerHTML = emblem; }
    const out = !!p?.eliminated;
    this.q('[data-f="state"]').textContent = out ? tt('Kalesi düştü') : p && !p.connected ? tt('Bağlantısı yok') : tt('Kalesi ayakta');

    // scout
    const source = this.q<HTMLSelectElement>('[data-f="source"]');
    for (const opt of source.options) {
      const j = s.jobs.find((x) => x.job === opt.value)!;
      const text = `${tr(j.name)} (${j.count})`;
      if (opt.textContent !== text) opt.textContent = text;
    }
    const mission = s.scouting.missions.find((m) => m.kind === 'spy' && m.targetSeat === this.seat);
    const send = this.q<HTMLButtonElement>('[data-act="scout"]');
    scoutButton(send, tt('Gözcü gönder'), s, !t || out || s.eliminated, !!t?.busy);
    const bar = this.q('[data-f="scout-bar"]');
    bar.classList.toggle('hidden', !mission);
    if (mission) bar.querySelector<HTMLElement>('.fill')!.style.width = `${100 * mission.progress}%`;
    this.q('[data-f="scout-info"]').textContent = mission
      ? (mission.arrived ? tt('Gözcü gözetledi, dönüyor · {0} sn', Math.ceil(mission.remainingSeconds)) : tt('Gözcü yolda · {0} sn', Math.ceil(mission.remainingSeconds)))
      : t ? tt('Gidiş-dönüş {0} sn', Math.ceil(2 * t.scoutSeconds)) : '';
    this.renderReport(s.scouting.reports.find((r) => r.targetSeat === this.seat), s.elapsedSeconds);
    this.updateEnvoy(s, out);

    // attack
    const preparing = s.phase === 'preparation';
    const locked = this.q('[data-f="locked"]');
    const why = s.eliminated ? tt('Kalen düştü; izleyicisin.') : out ? tt('Bu oyuncu elendi.')
      : preparing ? tt('Saldırı savaş fazında açılır ({0} sonra).', clock(s.remainingSeconds)) : s.phase === 'ended' ? tt('Maç bitti.') : '';
    locked.textContent = why;
    locked.classList.toggle('hidden', why === '');
    for (const u of s.units) {
      const row = this.q(`[data-unit="${u.id}"]`);
      row.querySelector('[data-f="home"]')!.textContent = tt('kalede {0}', u.soldiers);
      const input = this.q<HTMLInputElement>(`[data-count="${u.id}"]`);
      input.max = String(u.soldiers);
      if (Number(input.value) > u.soldiers) input.value = String(u.soldiers);
    }
    this.refreshSend();
  }

  /** The load an envoy may carry: what the stores hold, and no more than the envoy can take in all. */
  private updateEnvoy(s: CastleView, out: boolean): void {
    const goods = ['food', 'wood', 'iron', 'gold'] as const;
    const left = s.envoy.maxCargo;
    let total = 0;
    for (const g of goods) {
      const input = this.q<HTMLInputElement>(`[data-env="${g}"]`);
      const have = Math.floor(s.resources[g]);
      this.q(`[data-f="env-have-${g}"]`).textContent = `/ ${have}`;
      input.max = String(Math.min(have, left));
      if (Number(input.value) > Number(input.max)) input.value = input.max;
      total += Number(input.value) || 0;
    }
    const text = this.q<HTMLTextAreaElement>('[data-f="env-text"]');
    text.maxLength = s.envoy.maxMessageLength;
    const message = text.value.trim();
    const mission = s.scouting.missions.find((m) => m.kind === 'envoy' && m.targetSeat === this.seat);
    // an envoy has its own slot: one on the road at a time (the server checks it too); a scout out does not stop it
    const envoys = s.scouting.missions.filter((m) => m.kind === 'envoy');
    const busy = envoys.length >= (s.envoy.maxAtOnce ?? 1);
    const noneLeft = (s.envoy.sendsLeft ?? -1) === 0;
    this.q('[data-f="env-total"]').textContent = tt('Yük {0} / {1} · mesaj {2} / {3}', total, s.envoy.maxCargo, message.length, s.envoy.maxMessageLength);
    const button = this.q<HTMLButtonElement>('[data-act="envoy"]');
    const label = busy ? tt('Ulak yolda · {0} sn', Math.ceil(Math.min(...envoys.map((m) => m.remainingSeconds)))) : tt('Ulak gönder');
    if (button.textContent !== label) button.textContent = label;
    button.disabled = busy || noneLeft || out || s.eliminated || (total === 0 && message === '') || total > s.envoy.maxCargo;
    this.q('[data-f="env-info"]').textContent = noneLeft ? tt('Bu maçta ulak hakkın bitti.') : busy
      ? tt('Ulağın yolda, dönünce yenisini gönderebilirsin.')
      : mission ? (mission.arrived ? tt('Ulak yükünü bıraktı, dönüyor · {0} sn', Math.ceil(mission.remainingSeconds)) : tt('Ulak yolda · {0} sn', Math.ceil(mission.remainingSeconds))) : '';
  }

  private refreshSend(): void {
    if (!this.last) return;
    const s = this.last.castle;
    let total = 0, shooters = 0;
    for (const u of s.units) {
      const n = Number(this.q<HTMLInputElement>(`[data-count="${u.id}"]`).value) || 0;
      total += n;
      if (SHOOTERS.includes(u.id)) shooters += n;
    }
    // The target pick is for armies with something that shoots in them.
    this.q('[data-f="priority-row"]').classList.toggle('hidden', shooters === 0);
    this.q('[data-f="priority-label"]').textContent = s.units.some((u) => u.id === 'okcu') ? tt('Okçu hedefi') : tt('Mancınık hedefi');
    const t = this.target(s);
    const intercept = this.q<HTMLSelectElement>('[data-f="mode"]').value === 'intercept';
    const march = t?.marchSeconds ?? 0;
    this.q('[data-f="total"]').textContent = total === 0 ? tt('Gönderilecek askeri seç.')
      : intercept ? tt('{0} asker, yolun yarısına {1} sn', total, Math.ceil(march / 2)) : tt('{0} asker, yol {1} sn', total, Math.ceil(march));
    const button = this.q<HTMLButtonElement>('[data-act="send"]');
    button.textContent = intercept ? tt('Önünü kes') : tt('Saldır');
    const out = !!this.player(this.last.room)?.eliminated;
    button.disabled = total === 0 || !t || out || s.eliminated || s.phase !== 'war';
    syncStepButtons(this.body, s.phase !== 'war' || out || s.eliminated);
  }

  private renderReport(r: ScoutReportView | undefined, now: number): void {
    const el = this.q('[data-f="report"]');
    const html = !r ? `<p class="muted-ink small">${tt('Henüz rapor yok. Gözcü dönünce son rapor burada görünür.')}</p>`
      : `<div class="scout-report">${scoutReportHtml(r, now).replace(/<div class=\x22rep-title[^>]*>.*?<\/div>/s, `<h4>${tt('Son gözcü raporu')} · ${ago(r, now)}</h4>`)}</div>`;
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }

  private async click(e: Event): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn || btn.disabled || !this.last) return;
    const s = this.last.castle;
    const net = this.ctx.net;
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
    if (btn.dataset.act === 'scout') {
      const r = await net.sendScout(this.seat, this.q<HTMLSelectElement>('[data-f="source"]').value as Job);
      if (!r.ok) this.ctx.say(tr(r.error ?? tt('Gözcü gönderilemedi.')));
      return;
    }
    if (btn.dataset.act === 'envoy') {
      const n = (g: string) => Math.max(0, Math.floor(Number(this.q<HTMLInputElement>(`[data-env="${g}"]`).value) || 0));
      const textBox = this.q<HTMLTextAreaElement>('[data-f="env-text"]');
      const r = await net.sendEnvoy(this.seat, n('food'), n('wood'), n('iron'), n('gold'), messagesOn() ? textBox.value.trim() : '', this.q<HTMLSelectElement>('[data-f="source"]').value as Job);
      if (!r.ok) { this.ctx.say(tr(r.error ?? tt('Ulak gönderilemedi.'))); return; }
      for (const i of this.body.querySelectorAll<HTMLInputElement>('[data-env]')) i.value = '0';
      textBox.value = '';
      this.ctx.info(tt('Ulak yola çıktı.'));
      this.updateEnvoy(s, false);
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
    if (!r.ok) { this.ctx.say(tr(r.error ?? tt('Ordu gönderilemedi.'))); return; }
    for (const i of this.body.querySelectorAll<HTMLInputElement>('[data-count]')) i.value = '0';
    this.refreshSend();
    this.ctx.info(mode === 'intercept' ? tt('Ordu yola çıktı: önünü kesecek.') : tt('Ordu yola çıktı.'));
  }

  private tabbed = false;
  /** Shows one of the parts of the window (tabs, touch screens); the others are hidden by touch-windows.css. */
  private showSection(name: string): void {
    for (const sec of this.body.querySelectorAll<HTMLElement>('[data-sec]')) sec.classList.toggle('on', sec.dataset.sec === name);
    for (const tab of this.body.querySelectorAll<HTMLElement>('[data-tab-sec]')) { const on = tab.dataset.tabSec === name; tab.classList.toggle('on', on); tab.setAttribute('aria-selected', String(on)); }
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.body.querySelector<T>(selector)!;
  }
}
