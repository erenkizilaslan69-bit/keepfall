import { COLOR_NAMES, esc } from '../format';
import { t as tt, tr } from '../i18n';
import { emblemHtml } from './emblem';
import { whenGuideClosed } from './guide';
import type { GameConnection } from '../net';
import type { CastleView, KingdomView, MapStateView, RoomView } from '../types';

// The kingdom: the decree the player gets at the start (who they are and what they can do) and a panel with the controls of the kingdom's abilities.
// Everything here only sends commands; the server checks that the kingdom may do it, what it costs and whether it is ready.

interface Ctx { net: GameConnection; say: (m: string) => void; info: (m: string) => void; seat: number }

const FIGHTERS = ['kilicli', 'mizrakci', 'kalkanli', 'okcu', 'suvari'];

export class KingdomUi {
  private readonly fab: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private castle: CastleView | null = null;
  private map: MapStateView | null = null;
  private room: RoomView | null = null;
  private built = '';
  private lists = '';
  private decreeShown = false;

  constructor(root: HTMLElement, private readonly ctx: Ctx) {
    this.fab = document.createElement('button');
    this.fab.className = 'btn kingdom-fab hit hidden';
    this.fab.addEventListener('click', () => this.panel.classList.toggle('hidden'));
    root.appendChild(this.fab);
    this.panel = document.createElement('div');
    this.panel.className = 'kingdom-panel paper hit hidden';
    this.panel.addEventListener('click', (e) => void this.click(e));
    this.panel.addEventListener('input', () => this.refreshCosts());
    root.appendChild(this.panel);
  }

  destroy(): void {
    this.fab.remove();
    this.panel.remove();
    document.getElementById('kingdom-decree')?.remove();
  }

  setRoom(room: RoomView): void { this.room = room; }
  setMap(map: MapStateView): void { this.map = map; this.refreshLists(); }

  update(c: CastleView): void {
    this.castle = c;
    const k = c.kingdom;
    if (!k || c.eliminated) { this.fab.classList.add('hidden'); this.panel.classList.add('hidden'); return; }
    this.fab.classList.remove('hidden');
    this.fab.innerHTML = `${emblemHtml(k.look, 'emblem-fab')}${esc(tr(k.name))}`;
    if (!this.decreeShown) { this.decreeShown = true; whenGuideClosed(() => this.showDecree(k)); }
    if (this.built !== `${k.id}:${this.signature(c)}`) this.build(k, c);
    this.refreshDynamic(k, c);
    this.refreshLists();
  }

  /** The decree is shown once per match and browser tab. */
  private showDecree(k: KingdomView): void {
    const key = `keepfall.decree.${location.pathname}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* shown again after a reload: harmless */ }
    const box = document.createElement('div');
    box.id = 'kingdom-decree';
    box.className = 'guide-overlay kingdom-decree';
    box.innerHTML = `
      <div class="decree paper kd-${esc(k.look)}" role="dialog" aria-label="${tt('Ferman')}">
        <div class="decree-seal">${emblemHtml(k.look, 'emblem-decree')}</div>
        <div class="decree-kicker">${tt('Ferman')}</div>
        <h2>${esc(tr(k.name))}</h2>
        <p class="decree-title">${esc(tr(k.title))}</p>
        <p class="decree-text">${esc(tr(k.decree))}</p>
        <ul class="decree-abilities">${k.abilities.map((a) => `<li><b>${esc(tr(a.name))}</b><span>${esc(tr(a.text))}</span></li>`).join('')}</ul>
        <p class="muted-ink small">${tt('Yeteneklerin düğmeleri sol üstteki <b>{0}</b> düğmesindeki panelde.', esc(tr(k.name)))}</p>
        <button class="btn btn-red wide" data-close>${tt('Anladım')}</button>
      </div>`;
    box.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === box || t.closest('[data-close]')) box.remove();
    });
    document.body.appendChild(box);
  }

  // ---- the panel ------------------------------------------------------------------------------

  private signature(c: CastleView): string {
    return `${(c.deck ?? c.units.map((u) => u.id)).join(',')}|${this.room?.players.map((p) => `${p.seat}${p.eliminated ? 'x' : ''}`).join(',') ?? ''}`;
  }

  private rivals() { return (this.room?.players ?? []).filter((p) => p.seat !== this.ctx.seat && !p.eliminated); }

  private rivalOptions(): string {
    return this.rivals().map((p) => `<option value="${p.seat}">${esc(tr(p.name))} (${esc(COLOR_NAMES[p.color] ?? p.color)})</option>`).join('');
  }

  private unitInputs(c: CastleView, prefix: string, defaults: Record<string, number> = {}): string {
    return c.units.map((u) =>
      `<label class="kd-unit"><span>${esc(tr(u.name))}</span><input type="number" min="0" max="999" value="${defaults[u.id] ?? 0}" data-unit="${esc(u.id)}" data-form="${prefix}"></label>`).join('');
  }

  private build(k: KingdomView, c: CastleView): void {
    this.built = `${k.id}:${this.signature(c)}`;
    this.lists = '';
    const first = FIGHTERS.find((id) => c.units.some((u) => u.id === id)) ?? c.units[0]?.id ?? 'kilicli';
    let body = `<p class="muted-ink small">${esc(tr(k.decree))}</p>`;
    switch (k.id) {
      case 'golge':
        body += `
          <section><h4>${tt('Sahte ordu')} <small data-f="decoy-state"></small></h4>
            <p class="muted-ink small">${tt('Rakibe yürüyen hayalet ordu: rakip onu gerçek sanır, savaşa girince dağılır. En çok {0} kişilik, kişi başı {1} altın.', k.numbers.decoyMaxSoldiers, k.numbers.decoyGoldPerSoldier)}</p>
            <label>${tt('Hedef')} <select data-f="decoy-target">${this.rivalOptions()}</select></label>
            <div class="kd-units">${this.unitInputs(c, 'decoy', { [first]: 10 })}</div>
            <button class="btn" data-a="decoy">${tt('Hayalet gönder')} <span data-f="decoy-cost"></span></button>
          </section>
          <section><h4>${tt('Sahte rapor')} <small data-f="fake-state"></small></h4>
            <p class="muted-ink small">${tt('Rakip gözcüsü kaleni gözetlerse bu tabloyu okur (Kâhin hariç). Boş bırakırsan gerçeği görür.')}</p>
            <div class="kd-units">${this.unitInputs(c, 'fake', k.fakeReport ?? {})}</div>
            <button class="btn" data-a="fake">${tt('Raporu ayarla')}</button>
          </section>`;
        break;
      case 'tuccar':
        body += `
          <section><h4>${tt('Rüşvet')} <small data-f="bribe-state"></small></h4>
            <p class="muted-ink small">${tt("Görüş alanındaki, sana yaklaşan ordunun en çok %{0}'i geri döner; asker başına {1} altın.", Math.round(k.numbers.bribeMaxShare * 100), k.numbers.bribeGoldPerSoldier)}</p>
            <div data-f="armies"></div>
          </section>
          <section><h4>${tt('Kamp kiralama')}</h4>
            <p class="muted-ink small">${tt("Keşfettiğin bir haydut kampını (küçük {0}, büyük {1} altın) kiralar, haydutları bir kaleye saldırtırsın; kale düşerse ganimetin %{2}'i sana gelir. Kamp boşalır. Yalnız savaşta.", k.numbers.campPriceSmall, k.numbers.campPriceBig, Math.round(k.numbers.campLootShare * 100))}</p>
            <label>${tt('Hedef')} <select data-f="camp-target">${this.rivalOptions()}</select></label>
            <div data-f="camps"></div>
          </section>`;
        break;
      case 'kahin':
        body += `<section><h4>${tt('Rakipler')}</h4><div data-f="oracle"></div></section>
          <section><h4>${tt('Sezdiklerin')}</h4><div data-f="fakes"><p class="muted-ink small">${tt('Şu an sahte bir şey görmüyorsun.')}</p></div></section>`;
        break;
      case 'entrikaci':
        body += `
          <section><h4>${tt('Sahte ulak')}</h4>
            <p class="muted-ink small">${tt('Ulak başka bir oyuncunun adıyla ve renginde varır; alıcı gerçek göndereni göremez.')}</p>
            <label>${tt('Alıcı')} <select data-f="env-target">${this.rivalOptions()}</select></label>
            <label>${tt('Adına')} <select data-f="env-as">${this.rivalOptions()}</select></label>
            <label>${tt('Mesaj')} <input data-f="env-msg" maxlength="${c.envoy.maxMessageLength}" placeholder="${tt('En az bir mesaj yaz')}"></label>
            <button class="btn" data-a="envoy">${tt('Sahte ulak gönder')}</button>
          </section>
          <section><h4>${tt('Kılık değiştirme')} <small data-f="disguise-state"></small></h4>
            <p class="muted-ink small">${tt('Ordun başka bir oyuncunun renginde saldırır; gerçek kimlik ilk savaştan {0} sn sonra ya da gözcü raporuyla çıkar. Gönderdiğin birlikler evdeki askerlerinden.', Math.round(k.numbers.disguiseRevealSeconds))}</p>
            <label>${tt('Hedef')} <select data-f="dis-target">${this.rivalOptions()}</select></label>
            <label>${tt('Adına')} <select data-f="dis-as">${this.rivalOptions()}</select></label>
            <div class="kd-units">${this.unitInputs(c, 'dis')}</div>
            <button class="btn btn-red" data-a="disguise">${tt('Kılıkta gönder')}</button>
          </section>`;
        break;
    }
    this.panel.innerHTML = `
      <div class="ribbon ribbon-sm ribbon-blue kd-title">${esc(tr(k.name))}</div>
      <button class="btn-round btn-red win-close" data-a="close" title="${tt('Kapat')}"><i class="ico ico-close"></i></button>
      <div class="kd-body">${body}</div>`;
    const pick = (sel: string, index: number) => { const el = this.panel.querySelector<HTMLSelectElement>(sel); if (el && el.options.length > index) el.selectedIndex = index; };
    pick('[data-f="env-as"]', 1); pick('[data-f="dis-as"]', 1);
  }

  private refreshDynamic(k: KingdomView, c: CastleView): void {
    const set = (f: string, text: string) => { const el = this.panel.querySelector(`[data-f="${f}"]`); if (el && el.textContent !== text) el.textContent = text; };
    const wait = (s: number) => (s > 0 ? tt('bekle {0} sn', Math.ceil(s)) : tt('hazır'));
    set('decoy-state', tt('{0} · {1}/{2} yolda', wait(k.decoyReadyIn), k.decoysOut, k.numbers.decoyMax));
    set('bribe-state', wait(k.bribeReadyIn));
    set('disguise-state', wait(k.disguiseReadyIn));
    set('fake-state', k.fakeReport ? tt('kurulu: {0}', Object.entries(k.fakeReport).map(([id, n]) => `${n} ${tr(c.units.find((u) => u.id === id)?.name ?? id)}`).join(', ')) : tt('kapalı'));
    this.refreshCosts();
    if (k.id === 'kahin') this.renderOracle(c);
  }

  private refreshCosts(): void {
    const k = this.castle?.kingdom;
    if (!k) return;
    const el = this.panel.querySelector('[data-f="decoy-cost"]');
    if (el) el.textContent = tt('({0} altın)', Math.ceil(this.sum('decoy') * k.numbers.decoyGoldPerSoldier));
  }

  private units(form: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const input of this.panel.querySelectorAll<HTMLInputElement>(`input[data-form="${form}"]`)) {
      const n = Math.max(0, Math.floor(Number(input.value) || 0));
      if (n > 0) out[input.dataset.unit!] = n;
    }
    return out;
  }
  private sum(form: string): number { return Object.values(this.units(form)).reduce((a, b) => a + b, 0); }
  private seatOf(sel: string): number { return Number(this.panel.querySelector<HTMLSelectElement>(`[data-f="${sel}"]`)?.value ?? 0); }

  /** Lists that follow the map: armies we can bribe, camps we can hire, what the Oracle sees through. */
  private refreshLists(): void {
    const k = this.castle?.kingdom, map = this.map;
    if (!k || !map || this.panel.classList.contains('hidden') && this.lists === '') { /* build once the panel is first opened too */ }
    if (!k || !map) return;
    const players = this.room?.players ?? [];
    const name = (seat: number) => tr(players.find((p) => p.seat === seat)?.name ?? '?');
    if (k.id === 'tuccar') {
      const armies = map.seen.filter((s) => s.kind === 'army');
      const camps = map.sites.filter((s) => (s.kind === 'camp' || s.kind === 'bigCamp') && !s.gone);
      const sig = `${armies.map((a) => a.id + a.units.reduce((n, u) => n + u.count, 0)).join(',')}|${camps.map((s) => s.id).join(',')}`;
      if (sig === this.lists) return;
      this.lists = sig;
      const box = this.panel.querySelector('[data-f="armies"]');
      if (box) box.innerHTML = armies.length === 0 ? `<p class="muted-ink small">${tt('Şu an gördüğün bir ordu yok.')}</p>` : armies.map((a) => {
        const size = a.units.reduce((n, u) => n + u.count, 0);
        const n = Math.floor(size * k.numbers.bribeMaxShare);
        return `<div class="kd-row"><span>${tt('{0} ordusu · {1} asker', esc(name(a.ownerSeat)), size)}</span><button class="btn" data-a="bribe" data-id="${esc(a.id)}" data-n="${n}" ${n < 1 ? 'disabled' : ''}>${tt('Rüşvet ({0} asker, {1} altın)', n, Math.ceil(n * k.numbers.bribeGoldPerSoldier))}</button></div>`;
      }).join('');
      const cbox = this.panel.querySelector('[data-f="camps"]');
      if (cbox) cbox.innerHTML = camps.length === 0 ? `<p class="muted-ink small">${tt('Keşfettiğin bir kamp yok (gözcü gönder).')}</p>` : camps.map((s) => {
        const bandits = s.bandits.reduce((n, u) => n + u.count, 0);
        const price = s.kind === 'bigCamp' ? k.numbers.campPriceBig : k.numbers.campPriceSmall;
        return `<div class="kd-row"><span>${s.kind === 'bigCamp' ? tt('Büyük kamp') : tt('Haydut kampı')} · ${tt('~{0} haydut', bandits)}</span><button class="btn" data-a="camp" data-id="${esc(s.id)}">${tt('Kirala ({0} altın)', price)}</button></div>`;
      }).join('');
    } else if (k.id === 'kahin') {
      const fakes = map.seen.filter((s) => s.fake);
      const sig = fakes.map((f) => f.id).join(',');
      if (sig === this.lists) return;
      this.lists = sig;
      const box = this.panel.querySelector('[data-f="fakes"]');
      if (box) box.innerHTML = fakes.length === 0 ? `<p class="muted-ink small">${tt('Şu an sahte bir şey görmüyorsun.')}</p>`
        : fakes.map((f) => `<div class="kd-row"><span class="kd-fake">${tt('SAHTE · {0} {1} görünüyor, gerçekte {2}', f.kind === 'army' ? tt('ordu') : tt('ulak'), esc(name(f.ownerSeat)), esc(name(f.realSeat ?? 0)))}</span></div>`).join('');
    }
  }

  private renderOracle(c: CastleView): void {
    const box = this.panel.querySelector('[data-f="oracle"]');
    if (!box) return;
    const k = c.kingdom!;
    const players = this.room?.players ?? [];
    const rows = (c.rivals ?? []).map((r) => {
      const p = players.find((x) => x.seat === r.seat);
      const kd = tr(k.catalog.find((x) => x.id === r.faction)?.name ?? r.faction);
      const odds = c.odds?.find((o) => o.seat === r.seat);
      const chance = !odds || !odds.known ? tt('gözcü raporu gerek') : `%${Math.round(odds.low * 100)}–${Math.round(odds.high * 100)}`;
      const faked = c.scouting.reports.find((x) => x.targetSeat === r.seat)?.faked ? ` <b class="kd-fake">${tt('(raporu sahteydi, gerçeği görüyorsun)')}</b>` : '';
      const deck = r.deck.map((id) => tr(c.units.find((u) => u.id === id)?.name ?? id)).join(', ');
      return `<div class="kd-oracle"><b>${esc(tr(p?.name ?? '?'))}</b> · ${esc(kd)}<br><span class="muted-ink small">${tt('Deste:')} ${esc(deck)}</span><br><span>${tt('Kazanma şansın (evdeki askerlerle):')} <b>${chance}</b></span>${faked}</div>`;
    }).join('');
    const html = rows || `<p class="muted-ink small">${tt('Rakip yok.')}</p>`;
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  private async click(e: Event): Promise<void> {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const { net } = this.ctx;
    let result: { ok: boolean; error: string | null } | null = null;
    if (a === 'close') { this.panel.classList.add('hidden'); return; }
    if (a === 'decoy') result = await net.sendDecoy(this.seatOf('decoy-target'), this.units('decoy'));
    else if (a === 'fake') result = await net.setFakeReport(this.units('fake'));
    else if (a === 'bribe') result = await net.bribeArmy(b.dataset.id!, Number(b.dataset.n));
    else if (a === 'camp') result = await net.hireCamp(b.dataset.id!, this.seatOf('camp-target'));
    else if (a === 'envoy') {
      const msg = this.panel.querySelector<HTMLInputElement>('[data-f="env-msg"]')?.value ?? '';
      result = await net.sendEnvoyAs(this.seatOf('env-target'), this.seatOf('env-as'), 0, 0, 0, 0, msg, 'idle' as const);
    } else if (a === 'disguise') result = await net.sendArmyAs(this.seatOf('dis-target'), this.seatOf('dis-as'), this.units('dis'), null, null);
    if (!result) return;
    if (result.ok) this.ctx.info(tt('Yapıldı.')); else this.ctx.say(tr(result.error ?? tt('Olmadı.')));
  }
}
