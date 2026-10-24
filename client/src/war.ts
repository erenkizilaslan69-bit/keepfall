import { COLOR_CSS, esc, fmt } from './format';
import type { GameConnection } from './net';
import type { BattleReportView, CastleView, IncomingView, RoomView, Row } from './types';

// The war part of the panel: castle HP and famine, the "army approaching" warning with a live
// countdown, the attack form, our armies, the defence line-up and battle reports (a new report
// pops up once). Built once, then updated in place so inputs keep their values between ticks.

const dot = (color?: string) => `<span class="dot small-dot" style="background:${COLOR_CSS[color ?? ''] ?? '#888'}"></span>`;
const ABLATIVE: Record<string, string> = { blue: "Mavi'den", red: "Kırmızı'dan", yellow: "Sarı'dan", purple: "Mor'dan" };

export class WarPanel {
  private built = false;
  private targetsKey = '';
  private battlesKey = '';
  private seenBattles: Set<number> | null = null;
  private incoming: IncomingView[] = [];
  private incomingAt = 0;
  private speed = 1;
  private state: CastleView | null = null;
  private room: RoomView | null = null;

  constructor(
    private readonly section: HTMLElement,
    private readonly banner: HTMLElement,
    private readonly modal: HTMLElement,
    private readonly net: GameConnection,
    private readonly toast: (message: string) => void,
  ) {
    section.addEventListener('click', (e) => void this.onClick(e));
    section.addEventListener('input', (e) => this.onInput(e));
    modal.addEventListener('click', (e) => {
      if (e.target === modal || (e.target as HTMLElement).closest('[data-w-close]')) modal.classList.add('hidden');
    });
    // The countdown runs between server ticks too.
    window.setInterval(() => this.renderBanner(), 250);
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
      <h2>Savaş <span class="muted" id="war-phase"></span></h2>
      <div class="row wall-row">
        <span class="label">Kale</span>
        <div class="hpbar"><div id="wall-fill"></div></div>
        <span class="count" id="wall-text"></span>
      </div>
      <p class="muted small" id="famine"></p>
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
      <h2>Savaş raporları</h2>
      <div id="battles"><p class="muted small">Henüz savaş yok.</p></div>`;
    this.q<HTMLSelectElement>('[data-d="priority"]').value = s.war.defense.archerPriority ?? '';
    this.built = true;
  }

  // ---- values ------------------------------------------------------------------------------

  private refresh(s: CastleView, room: RoomView | null): void {
    const w = s.war;
    this.speed = s.speed;
    this.q('#war-phase').textContent = s.phase === 'war' ? '(savaş fazı)' : s.phase === 'preparation' ? '(hazırlık)' : '';
    this.q('#wall-fill').style.width = `${(100 * w.wallHp) / w.maxWallHp}%`;
    this.q('#wall-fill').classList.toggle('low', w.wallHp < w.maxWallHp * 0.35);
    this.q('#wall-text').textContent = `${fmt(w.wallHp)} / ${fmt(w.maxWallHp)}`;
    this.q('#famine').textContent = w.famine
      ? 'Kıtlık: yemek üretimi yarıya indi.'
      : s.phase === 'war' ? `Kıtlık ${Math.ceil(w.famineStartsIn)} sn sonra başlar (yemek üretimi yarıya iner).` : '';

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
    this.q('#attack-total').textContent = total > 0 ? `${total} asker, yol ${w.marchSeconds} sn` : 'Gönderilecek askeri seç.';
    this.q<HTMLButtonElement>('[data-war-action="send"]').disabled = total === 0 || targets.length === 0;

    this.q('#armies').innerHTML = w.armies.map((a) => `
      <div class="order">
        <span>${dot(a.targetColor)}${esc(a.targetName)} · ${a.state === 'marching' ? 'yolda' : 'dönüyor'}</span>
        <div class="bar"><div style="width:${100 * (a.state === 'marching' ? a.distance : 1 - a.distance)}%"></div></div>
        <span class="muted small">${Math.ceil(a.remainingSeconds)} sn</span>
        <span class="small army-units">${a.units.map((u) => `${u.count} ${esc(u.name)}`).join(' · ')}</span>
      </div>`).join('');

    // Each state carries fresh "arrives in" values; count down locally from the moment it came.
    this.incoming = w.incoming;
    this.incomingAt = performance.now();
    this.renderBanner();

    // Rebuilt only when the list changes, so a click on a report is never lost to a refresh.
    const battlesKey = w.battles.map((b) => b.id).join(',');
    if (battlesKey !== this.battlesKey) {
      this.battlesKey = battlesKey;
      this.renderBattles(w.battles);
    }

    // Pop up battles that arrived since last time (not the ones we already had on joining).
    const ids = new Set(w.battles.map((b) => b.id));
    if (this.seenBattles === null) this.seenBattles = ids;
    else {
      const fresh = w.battles.find((b) => !this.seenBattles!.has(b.id));
      this.seenBattles = new Set([...this.seenBattles, ...ids]);
      if (fresh) this.openReport(fresh);
    }
  }

  private renderBattles(battles: BattleReportView[]): void {
    this.q('#battles').innerHTML = battles.length === 0
      ? '<p class="muted small">Henüz savaş yok.</p>'
      : battles.map((b) => `
        <div class="report battle ${b.youWon ? 'won' : b.winner === 'draw' ? 'draw' : 'lost'}" data-war-action="open" data-id="${b.id}">
          <div class="report-head">${dot(b.opponentColor)}<b>${esc(b.opponentName)}</b>
            <span class="muted small">${b.attacking ? 'saldırın' : 'savunman'} · ${resultWord(b)}</span></div>
          <div class="small">${b.castleDamage > 0 ? `Kale hasarı ${fmt(b.castleDamage)}` : 'Kale hasarı yok'}${b.defenderEliminated ? ' · kale düştü' : ''}</div>
        </div>`).join('');
  }

  /** "Kırmızı'dan bir ordu yaklaşıyor! 7 sn" — big, red, counting down between ticks. */
  private renderBanner(): void {
    const elapsed = ((performance.now() - this.incomingAt) / 1000) * this.speed;
    this.banner.classList.toggle('hidden', this.incoming.length === 0);
    this.banner.innerHTML = this.incoming.map((w) => `
      <div class="incoming">⚠ ${esc(ABLATIVE[w.fromColor] ?? 'Bir rakipten')} bir ordu yaklaşıyor!
        <b>${Math.max(0, Math.ceil(w.arrivesInSeconds - elapsed))}</b> sn</div>`).join('');
  }

  private openReport(b: BattleReportView): void {
    this.modal.innerHTML = `<div class="modal-box">${reportHtml(b)}<button class="primary" data-w-close>Tamam</button></div>`;
    this.modal.classList.remove('hidden');
  }

  // ---- input -------------------------------------------------------------------------------

  private onInput(e: Event): void {
    if ((e.target as HTMLElement).matches('[data-w-count]') && this.state) this.refresh(this.state, this.room);
  }

  private async onClick(e: Event): Promise<void> {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-war-action]');
    if (!el || !this.state) return;
    const action = el.dataset.warAction;
    if (action === 'open') {
      const b = this.state.war.battles.find((x) => x.id === Number(el.dataset.id));
      if (b) this.openReport(b);
      return;
    }
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
      const r = await this.net.sendArmy(target, units, rows, priority);
      if (!r.ok) { this.toast(r.error ?? 'Saldırı gönderilemedi.'); return; }
      this.section.querySelectorAll<HTMLInputElement>('[data-w-count]').forEach((i) => (i.value = '0'));
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

function resultWord(b: BattleReportView): string {
  if (b.winner === 'draw') return 'berabere';
  return b.youWon ? 'kazandın' : 'kaybettin';
}

/** Both armies side by side with losses, then the castle. */
export function reportHtml(b: BattleReportView): string {
  const side = (title: string, lines: BattleReportView['attackerUnits']) => `
    <div class="side"><h3>${title}</h3>${lines.length === 0 ? '<p class="muted small">Kalede asker yoktu.</p>'
      : lines.map((l) => `<div class="small">${l.count} ${esc(l.name)} <span class="loss">−${l.lost}</span></div>`).join('')}</div>`;
  const them = `${dot(b.opponentColor)}${esc(b.opponentName)}`;
  const title = b.attacking ? `${them} kalesine saldırı` : `${them} saldırdı`;
  return `
    <h2>${title} — ${resultWord(b)}</h2>
    <div class="battle-sides">
      ${side(b.attacking ? 'Senin ordun' : 'Saldıran', b.attackerUnits)}
      ${side(b.attacking ? 'Savunan' : 'Senin savunman', b.defenderUnits)}
    </div>
    <div class="row wall-row"><span class="label">${b.attacking ? 'Onların kalesi' : 'Kalen'}</span>
      <div class="hpbar"><div style="width:${(100 * b.castleHpAfter) / b.castleHpMax}%"></div></div>
      <span class="count">${fmt(b.castleHpAfter)} / ${fmt(b.castleHpMax)}</span></div>
    <p class="small">${b.castleDamage > 0 ? `Kale ${fmt(b.castleDamage)} hasar aldı.` : 'Kale hasar almadı.'}
      ${b.defenderEliminated ? '<b>Kale düştü.</b>' : ''}</p>`;
}
