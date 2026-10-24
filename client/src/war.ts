import { COLOR_CSS, esc } from './format';
import type { GameConnection } from './net';
import type { ArmyMode, ArmyView, CastleView, RoomView, Row } from './types';

// The war part of the panel: castle HP and famine, the "army approaching" warning with a live
// countdown, the attack form, our armies, the defence line-up and battle reports (a new report
// pops up once). Built once, then updated in place so inputs keep their values between ticks.

const dot = (color?: string) => `<span class="dot small-dot" style="background:${COLOR_CSS[color ?? ''] ?? '#888'}"></span>`;

export class WarPanel {
  private built = false;
  private targetsKey = '';
  private armiesKey = '';
  private state: CastleView | null = null;
  private room: RoomView | null = null;

  constructor(
    private readonly section: HTMLElement,
    private readonly net: GameConnection,
    private readonly toast: (message: string) => void,
  ) {
    section.addEventListener('click', (e) => void this.onClick(e));
    section.addEventListener('input', (e) => this.onInput(e));
  }

  update(s: CastleView, room: RoomView | null): void {
    this.state = s;
    this.room = room ?? this.room;
    if (!this.built) this.build(s);
    this.refresh(s, this.room);
  }

  // ---- structure ---------------------------------------------------------------------------

  private build(s: CastleView): void {
    const rowSelect = (attr: string, id: string, def: Row) =>
      `<select ${attr}="${id}"><option value="front"${def === 'front' ? ' selected' : ''}>ön</option><option value="back"${def === 'back' ? ' selected' : ''}>arka</option></select>`;
    const defaultRow = (id: string): Row => (id === 'okcu' ? 'back' : 'front');
    const priorityOptions = `<option value="">ön sıra</option>${s.units.map((u) => `<option value="${u.id}">önce ${esc(u.name)}</option>`).join('')}`;

    this.section.innerHTML = `
      <h2>Savaş</h2>
      <div id="attack">
        <p class="muted small" id="attack-locked"></p>
        <div id="attack-form">
          <div class="row"><span class="label">Hedef</span><span></span><select data-w="target"></select></div>
          <div class="army-grid">
            <span class="muted small">Birlik</span><span class="muted small">Kalede</span><span class="muted small">Gönder</span><span class="muted small">Sıra</span>
            ${s.units.map((u) => `
              <span>${esc(u.name)}</span>
              <span class="muted" data-w-home="${u.id}"></span>
              <input type="number" min="0" value="0" data-w-count="${u.id}" aria-label="${esc(u.name)} sayısı">
              ${rowSelect('data-w-row', u.id, defaultRow(u.id))}`).join('')}
          </div>
          <div class="row"><span class="label">Okçu hedefi</span><span></span><select data-w="priority">${priorityOptions}</select></div>
          <div class="row"><span class="label">Emir</span><span></span>
            <select data-w="mode" title="Önünü kes: yolda karşılaştığı ilk orduyla savaşır ve eve döner; kimseyle karşılaşmazsa yolun yarısından döner. Rakip bunu bilemez.">
              <option value="attack">Saldır (kaleye)</option>
              <option value="intercept">Önünü kes (yolda karşıla, dön)</option>
            </select></div>
          <div class="row"><span class="muted small" id="attack-total"></span><span></span>
            <button class="primary" data-war-action="send">Saldır</button></div>
        </div>
      </div>
      <div id="armies" class="queue"></div>
      <details class="defense">
        <summary>Savunma dizilişi</summary>
        <div class="army-grid defense-grid">
          ${s.units.map((u) => `<span>${esc(u.name)}</span>${rowSelect('data-d-row', u.id, (s.war.defense.rows[u.id] as Row) ?? defaultRow(u.id))}`).join('')}
        </div>
        <div class="row"><span class="label">Okçu hedefi</span><span></span><select data-d="priority">${priorityOptions}</select></div>
        <div class="row"><span></span><span></span><button data-war-action="defense">Kaydet</button></div>
      </details>
`;
    this.q<HTMLSelectElement>('[data-d="priority"]').value = s.war.defense.archerPriority ?? '';
    this.built = true;
  }

  // ---- values ------------------------------------------------------------------------------

  private refresh(s: CastleView, room: RoomView | null): void {
    const w = s.war;
    // Attack form: only in the war, only for the living.
    const canAttack = s.phase === 'war' && !s.eliminated;
    this.q('#attack-form').classList.toggle('hidden', !canAttack);
    this.q('#attack-locked').textContent = s.eliminated ? 'Kalen düştü; izleyicisin.'
      : s.phase === 'preparation' ? `Saldırı savaş fazında açılır (${Math.ceil(s.remainingSeconds)} sn sonra).` : '';

    const me = room?.players.find((p) => p.color === s.color);
    const targets = (room?.players ?? []).filter((p) => p !== me && !p.eliminated);
    const key = targets.map((t) => `${t.seat}:${t.name}`).join(',');
    if (key !== this.targetsKey) {
      this.targetsKey = key;
      const select = this.q<HTMLSelectElement>('[data-w="target"]');
      const previous = select.value;
      select.innerHTML = targets.length === 0 ? '<option value="">Rakip yok</option>'
        : targets.map((t) => `<option value="${t.seat}">${esc(t.name)}</option>`).join('');
      if (targets.some((t) => String(t.seat) === previous)) select.value = previous;
    }

    let total = 0;
    for (const u of s.units) {
      this.q(`[data-w-home="${u.id}"]`).textContent = String(u.soldiers);
      const input = this.q<HTMLInputElement>(`[data-w-count="${u.id}"]`);
      input.max = String(u.soldiers);
      if (Number(input.value) > u.soldiers) input.value = String(u.soldiers);
      total += Number(input.value) || 0;
    }
    const march = s.scouting.targets.find((t) => String(t.seat) === this.q<HTMLSelectElement>('[data-w="target"]').value)?.marchSeconds ?? 0;
    const intercept = this.q<HTMLSelectElement>('[data-w="mode"]').value === 'intercept';
    this.q('#attack-total').textContent = total === 0 ? 'Gönderilecek askeri seç.'
      : intercept ? `${total} asker, yolun yarısına ${Math.ceil(march / 2)} sn` : `${total} asker, yol ${Math.ceil(march)} sn`;
    const send = this.q<HTMLButtonElement>('[data-war-action="send"]');
    send.textContent = intercept ? 'Önünü kes' : 'Saldır';
    send.disabled = total === 0 || targets.length === 0;
    this.renderArmies(w.armies);

  }

  /**
   * Our armies on the road. The rows are rebuilt only when something about them changes (not their
   * progress), so a click on "Geri çağır" is never lost to a refresh.
   */
  private renderArmies(armies: ArmyView[]): void {
    const key = armies.map((a) => `${a.id}:${a.state}:${a.fighting}:${a.units.map((u) => u.count).join('.')}`).join(',');
    const list = this.q('#armies');
    if (key !== this.armiesKey) {
      this.armiesKey = key;
      list.innerHTML = armies.map((a) => `
        <div class="order" data-army="${a.id}">
          <span>${dot(a.targetColor)}${esc(a.targetName)} · ${a.fighting ? 'savaşta' : a.state === 'returning' ? 'dönüyor'
            : a.mode === 'intercept' ? 'önünü kesiyor' : 'yolda'}</span>
          <div class="bar"><div></div></div>
          <span class="muted small" data-left></span>
          <span class="small army-units">${a.units.map((u) => `${u.count} ${esc(u.name)}`).join(' · ')}</span>
          ${a.state === 'marching' && !a.fighting
            ? `<button class="small-btn" data-war-action="recall" data-id="${a.id}" title="Bulunduğu yerden aynı yoldan eve döner">Geri çağır</button>` : ''}
        </div>`).join('');
    }
    for (const a of armies) {
      const row = list.querySelector<HTMLElement>(`[data-army="${a.id}"]`);
      if (!row) continue;
      row.querySelector<HTMLElement>('.bar > div')!.style.width = `${100 * (a.state === 'marching' ? a.distance : 1 - a.distance)}%`;
      row.querySelector('[data-left]')!.textContent = a.fighting ? '' : `${Math.ceil(a.remainingSeconds)} sn`;
    }
  }

  private onInput(e: Event): void {
    if ((e.target as HTMLElement).matches('[data-w-count], [data-w="mode"], [data-w="target"]') && this.state) this.refresh(this.state, this.room);
  }

  private async onClick(e: Event): Promise<void> {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-war-action]');
    if (!el || !this.state) return;
    const action = el.dataset.warAction;
    if ((el as HTMLButtonElement).disabled) return;
    if (action === 'send') {
      const units: Record<string, number> = {};
      const rows: Record<string, Row> = {};
      for (const u of this.state.units) {
        const n = Number(this.q<HTMLInputElement>(`[data-w-count="${u.id}"]`).value) || 0;
        if (n > 0) units[u.id] = n;
        rows[u.id] = this.q<HTMLSelectElement>(`[data-w-row="${u.id}"]`).value as Row;
      }
      const target = Number(this.q<HTMLSelectElement>('[data-w="target"]').value);
      const priority = this.q<HTMLSelectElement>('[data-w="priority"]').value || null;
      const mode = this.q<HTMLSelectElement>('[data-w="mode"]').value as ArmyMode;
      const r = await this.net.sendArmy(target, units, rows, priority, mode);
      if (!r.ok) { this.toast(r.error ?? 'Saldırı gönderilemedi.'); return; }
      this.section.querySelectorAll<HTMLInputElement>('[data-w-count]').forEach((i) => (i.value = '0'));
    } else if (action === 'recall') {
      const r = await this.net.recallArmy(Number(el.dataset.id));
      if (!r.ok) this.toast(r.error ?? 'Geri çağrılamadı.');
    } else if (action === 'defense') {
      const rows: Record<string, Row> = {};
      for (const u of this.state.units) rows[u.id] = this.q<HTMLSelectElement>(`[data-d-row="${u.id}"]`).value as Row;
      const r = await this.net.setDefense(rows, this.q<HTMLSelectElement>('[data-d="priority"]').value || null);
      this.toast(r.ok ? 'Savunma dizilişi kaydedildi.' : r.error ?? 'Kaydedilemedi.');
    }
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.section.querySelector<T>(selector)!;
  }
}
