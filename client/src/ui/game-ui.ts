import { botMark, esc } from '../format';
import { sfx } from '../audio';
import { guarded } from '../error-report';
import type { GameConnection } from '../net';
import type { CastleView, Corner, RoomView, SiteView } from '../types';
import type { WorldScene } from '../scene/WorldScene';
import { BuildingWin } from './building-window';
import { CastleWin } from './castle-window';
import { EnemyWin } from './enemy-window';
import { ArmyWin, ScoutWin } from './mover-windows';
import { ForestWin, SiteWin } from './forest-window';
import { WindowManager, sameTarget, type Target, type Win, type WinContext } from './windows';
import { Notifications, type NoteKind } from './notifications';
import { ReportTags } from './reports';
import { GENITIVE, scoutKey, scoutReportHtml } from './scout-report';
import { TopBar } from './topbar';
import { WorldLabels } from './world-labels';

// Everything drawn over the map: the top bar, ribbons, report tags (and, step by step, the windows).
// One instance per game screen; `update` takes every castle state the server sends.

export class GameUi {
  private readonly top: HTMLElement;
  private readonly labels: WorldLabels;
  private readonly wait: HTMLElement;
  private waitTimer = 0;
  private waitEnds = 0;
  private waitTotal = 1;
  private spectating = false;
  /** Scout reports we have already told the player about (null until the first state: a reload is not news). */
  private scoutsSeen: Set<string> | null = null;
  /** The places of the forest we have found (the latest map state). */
  private sites: SiteView[] = [];
  private lastGold: number | null = null;
  private exploredSeen: Set<string> | null = null;
  private readonly bar: TopBar;
  private readonly notes: Notifications;
  private readonly reports: ReportTags;
  private readonly windows: WindowManager;
  private readonly ctx: WinContext;
  private scene: WorldScene | null = null;
  private castle: CastleView | null = null;
  private room: RoomView | null = null;
  private phase: CastleView['phase'] | null = null;
  private eliminated = false;
  private readonly onKey = (e: KeyboardEvent) => this.keydown(e);

  /** The "every human is out" box for the host, and whether they already chose to keep watching. */
  private readonly finish: HTMLElement;
  private readonly cam: HTMLElement;
  /** The small scroll under a rival's name with their last scout report (null seat: closed). */
  private readonly scroll: HTMLElement;
  private scrollSeat: number | null = null;
  private scrollAt: DOMRect | null = null;
  private camKey = '';
  private finishDismissed = false;
  private readonly mySeat: number;
  private readonly labelRoot: HTMLElement;

  constructor(root: HTMLElement, net: GameConnection, seat: number, home: () => void) {
    root.innerHTML = '';
    this.mySeat = seat;
    // The signs on the map get a layer of their own UNDER the minimap (z-index 2) and under the top bar, the buttons and the windows (the UI layer, 10),
    // so nothing on the map can ever be drawn over the HUD.
    this.labelRoot = document.createElement('div');
    this.labelRoot.className = 'ui-root ui-labels';
    root.parentElement?.insertBefore(this.labelRoot, root);
    this.labels = new WorldLabels(this.labelRoot);
    this.wait = document.createElement('div');
    this.wait.className = 'spec-wait hit hidden';
    this.wait.innerHTML = `
      <div class="paper">
        <div class="ribbon ribbon-red">Kalen düştü</div>
        <div class="spec-body">
          <p>İzleme <b class="spec-n"></b> sn sonra başlıyor</p>
          <div class="gbar"><div class="fill"></div></div>
          <p class="muted-ink small">Artık izleyicisin: tüm haritayı sissiz, kalelerin içiyle birlikte izlersin.</p>
        </div>
      </div>`;
    root.appendChild(this.wait);
    this.finish = document.createElement('div');
    this.finish.className = 'bot-end hidden';
    this.finish.innerHTML = `
      <div class="paper">
        <div class="ribbon ribbon-black">Tüm insanlar elendi</div>
        <div class="spec-body">
          <p>Maçta sadece botlar kaldı.</p>
          <p class="muted-ink small">İzlemeye devam edebilir ya da kalan süreyi hızlıca oynatıp maç sonu ekranına geçebilirsin.</p>
          <div class="bot-end-btns">
            <button class="btn" data-a="watch">İzlemeye devam</button>
            <button class="btn btn-red" data-a="finish">Maçı bitir</button>
          </div>
        </div>
      </div>`;
    this.finish.addEventListener('click', async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'watch') { this.finishDismissed = true; this.updateFinish(); }
      else if (a === 'finish') {
        const r = await net.finishMatch();
        if (!r.ok) this.error(r.error ?? 'Maç bitirilemedi.');
      }
    });
    root.appendChild(this.finish);
    const seat0 = seat;
    this.top = document.createElement('div');
    this.top.className = 'ui-top';
    root.appendChild(this.top);
    this.bar = new TopBar(this.top, {
      speed: (n) => void net.setSpeed(n).then((r) => { if (!r.ok) this.error(r.error ?? 'Hız değişmedi.'); }),
      player: (seat) => {
        const target: Target = seat === seat0 ? { kind: 'castle' } : { kind: 'enemy', seat };
        this.scene?.focus(target);
        this.open(target);
      },
      rival: (seat, at) => this.toggleScroll(seat, at),
    });
    this.bar.setSeat(seat);
    this.notes = new Notifications(this.top);
    this.scroll = document.createElement('div');
    this.scroll.className = 'scroll-pop paper-dark hit hidden';
    this.scroll.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.closeScroll();
      else if (act === 'open' && this.scrollSeat !== null) { const seat = this.scrollSeat; this.closeScroll(); this.scene?.focus({ kind: 'enemy', seat }); this.open({ kind: 'enemy', seat }); }
    });
    root.appendChild(this.scroll);
    this.reports = new ReportTags(root);
    // Quick camera buttons next to the minimap: our castle, each rival's castle (in their colour) and the forest in the middle.
    this.cam = document.createElement('div');
    this.cam.className = 'cam-btns';
    this.cam.innerHTML = `
      <button class="btn hit" data-cam="home" title="Kamerayı kalene getirir (boşluk tuşu)"><i class="ico ico-shield"></i> Kaleme dön</button>
      <span data-f="rivals"></span>
      <button class="btn hit" data-cam="forest" title="Kamerayı ormanın ortasına getirir">Orman</button>`;
    this.cam.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cam]');
      if (!b) return;
      if (b.dataset.cam === 'home') home();
      else if (b.dataset.cam === 'forest') this.scene?.focusForest();
      else if (b.dataset.cam === 'rival') this.scene?.focus({ kind: 'enemy', seat: Number(b.dataset.seat) });
    });
    root.appendChild(this.cam);
    this.windows = new WindowManager(root, () => this.top.getBoundingClientRect().bottom, () =>
      [this.cam, document.querySelector('.kf-minimap'), root.querySelector('.report-tags')].filter((e): e is Element => !!e)
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0));
    this.ctx = { net, say: (m) => this.error(m), info: (m) => { sfx.play('uiConfirm'); this.notes.push(m, 'info', 3500); }, open: (t) => this.open(t), close: () => this.windows.close(),
      army: (id) => this.scene?.resolveArmy(id), seat, sites: () => this.sites };
    window.addEventListener('keydown', this.onKey);
  }

  /** The map the windows are anchored on. */
  attach(scene: WorldScene): void {
    this.scene = scene;
    scene.onSelect = (t) => this.open(t);
    scene.onDeselect = () => this.windows.close();
    scene.labels = this.labels;
    scene.onFrame = () => {
      this.labels.layout((p) => scene.screenOf(p), scene.cameras.main.zoom);
      this.windows.reposition();
    };
  }

  /** Open (or move) the window for a target; clicking the same thing again closes it. */
  open(target: Target): void {
    const s = this.castle;
    if (!s || !this.scene || this.spectating) return; // a spectator only looks
    if (sameTarget(this.windows.current, target)) { this.windows.close(); return; }
    const win = this.makeWindow(target, s);
    if (!win) return;
    const scene = this.scene;
    this.windows.open(target, win, () => scene.anchorOf(target));
    win.update({ castle: s, room: this.room });
  }

  private makeWindow(target: Target, s: CastleView): Win | null {
    switch (target.kind) {
      case 'building': return new BuildingWin(this.ctx, target.type, s);
      case 'castle': return new CastleWin(this.ctx, s);
      case 'enemy': return new EnemyWin(this.ctx, target.seat, s, this.room);
      case 'army': return new ArmyWin(this.ctx, target.id, s);
      case 'scout': return new ScoutWin(this.ctx, target.id, s);
      case 'forest': return new ForestWin(this.ctx, target.id as Corner, s);
      case 'site': return new SiteWin(this.ctx, target.id, s);
      default: return null; // the other windows come in the next steps
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.clearInterval(this.waitTimer);
    this.labels.destroy();
    this.labelRoot.remove();
  }

  update(s: CastleView): void {
    this.castle = s;
    // Each part on its own: one that fails must not keep the rest of the screen from updating.
    guarded('ui-update', () => this.windows.update({ castle: s, room: this.room }), 'windows');
    guarded('ui-update', () => this.bar.update(s), 'top bar');
    guarded('ui-update', () => this.renderScroll(), 'scroll');
    guarded('ui-update', () => this.reports.update(s.war.battles, s.elapsedSeconds), 'report tags');
    guarded('ui-update', () => this.updateNotes(s), 'ribbons');
  }

  /** The ribbons that follow from a new state: scouts home, gold, a toured quarter, hunger, the war, a fallen castle. */
  private updateNotes(s: CastleView): void {
    const reports = s.scouting.reports;
    if (this.scoutsSeen) {
      if (reports.some((x) => !this.scoutsSeen!.has(scoutKey(x)))) sfx.play('scoutBack');
      for (const r of reports.filter((x) => !this.scoutsSeen!.has(scoutKey(x))))
        this.notes.push(`Gözcün döndü: ${GENITIVE[r.targetColor] ?? 'rakibin'} raporu`, 'battle', 15000, () => this.reports.showScout(r));
    }
    this.scoutsSeen = new Set(reports.map(scoutKey));

    // An envoy left something at our castle: a decree opens (the letter is ours alone), and a sound.
    const letters = s.letters ?? [];
    if (this.lettersSeen) {
      const fresh = letters.filter((l) => !this.lettersSeen!.has(l.id));
      if (fresh.length) { sfx.play('envoy'); this.reports.showLetter(fresh[fresh.length - 1]); }
    }
    this.lettersSeen = new Set(letters.map((l) => l.id));

    // Gold that came home, and a quarter of the forest that has been toured.
    const gold = s.resources.gold;
    if (this.lastGold !== null && gold > this.lastGold + 1e-6) this.notes.push(`+${Math.round(gold - this.lastGold)} altın kasaya girdi`, 'info', 5000);
    this.lastGold = gold;
    const explored = new Set(s.scouting.quarters.filter((q) => q.explored).map((q) => q.corner));
    if (this.exploredSeen) {
      for (const corner of explored)
        if (!this.exploredSeen.has(corner)) this.notes.push('Keşif bitti: ormanın bu bölgesindeki yerler haritada', 'info', 6000);
    }
    this.exploredSeen = explored;
    this.notes.setIncoming(s.eliminated ? [] : s.war.incoming, s.speed);
    this.notes.setSticky('hunger', s.starving && !s.eliminated, 'Açlık! Yemek bitti, tüm üretim yarıya indi.');
    this.notes.setSticky('out', s.eliminated, 'Kalen düştü — elendin. Artık sadece izleyicisin.', 'info');
    if (this.phase === 'preparation' && s.phase === 'war') { sfx.play('battleStart'); this.notes.push('Savaş başladı! Orduların yola çıkabilir.', 'battle', 6000); }
    if (!this.eliminated && s.eliminated) { sfx.play('castleFall'); this.notes.push('Kalen düştü!', 'danger', 6000); }
    this.phase = s.phase;
    this.eliminated = s.eliminated;
  }

  private toggleScroll(seat: number, at: DOMRect): void {
    if (this.scrollSeat === seat) { this.closeScroll(); return; }
    this.scrollSeat = seat;
    this.scrollAt = at;
    this.scroll.dataset.html = '';
    this.renderScroll();
  }

  private closeScroll(): void {
    this.scrollSeat = null;
    this.scroll.classList.add('hidden');
  }

  /** The scroll's content: the rival's last report in full, or a line saying there is none; it ages with the clock. */
  private renderScroll(): void {
    const seat = this.scrollSeat, s = this.castle;
    if (seat === null || !s) return;
    const report = s.scouting.reports.find((r) => r.targetSeat === seat);
    const player = this.room?.players.find((p) => p.seat === seat);
    const html = `<button class="btn-round btn-red win-close" data-act="close" title="Kapat (Esc)"><i class="ico ico-close"></i></button>
      ${report ? scoutReportHtml(report, s.elapsedSeconds)
        : `<div class="rep-title ribbon ribbon-yellow">${esc(player?.name ?? '?')}</div><p class="rep-note">Henüz gözcü raporu yok. Gözcüyü rakip kalenin penceresinden gönderirsin.</p>`}
      <div class="scroll-foot"><button class="btn" data-act="open">Kale penceresi</button></div>`;
    if (this.scroll.dataset.html !== html) {
      this.scroll.dataset.html = html;
      this.scroll.innerHTML = html;
    }
    this.scroll.classList.remove('hidden');
    const at = this.scrollAt;
    if (at) {
      const w = this.scroll.offsetWidth;
      this.scroll.style.top = `${at.bottom + 6}px`;
      this.scroll.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, at.left + at.width / 2 - w / 2))}px`;
    }
  }

  /** Our castle has fallen and the view starts in <paramref name="startsIn"/> game seconds: a countdown instead of an empty screen. */
  setSpectatorWait(startsIn: number): void {
    if (this.spectating) return;
    this.windows.close();
    const speed = Math.max(1, this.castle?.speed ?? 1);
    this.waitEnds = performance.now() + (startsIn / speed) * 1000;
    this.waitTotal = Math.max(this.waitTotal, startsIn / speed, 1);
    this.wait.classList.remove('hidden');
    if (!this.waitTimer) this.waitTimer = window.setInterval(() => this.tickWait(), 200);
    this.tickWait();
  }

  private tickWait(): void {
    const left = Math.max(0, (this.waitEnds - performance.now()) / 1000);
    this.wait.querySelector('.spec-n')!.textContent = String(Math.ceil(left));
    this.wait.querySelector<HTMLElement>('.fill')!.style.width = `${100 * (1 - left / this.waitTotal)}%`;
  }

  /** The first picture arrived (and every one after it): the countdown goes, the map is the whole world. */
  setSpectating(lagSeconds: number): void {
    if (!this.spectating) {
      this.spectating = true;
      this.windows.close();
      window.clearInterval(this.waitTimer);
      this.waitTimer = 0;
      this.wait.classList.add('hidden');
      this.updateFinish();
    }
    // A few seconds is just the tick (or the dev speed); only a real delay (match.spectatorDelaySeconds) is worth saying.
    const lag = Math.round(lagSeconds);
    this.notes.setSticky('spectating', true, lag >= 10 ? `İzleyici: tüm harita, oyundan ${lag} sn geride` : 'İzleyici: tüm harita, canlı', 'info');
  }

  /** The places of the forest we have found, from the latest map state (the windows about them read this). */
  setSites(sites: SiteView[]): void {
    this.sites = sites;
  }

  setRoom(room: RoomView): void {
    this.room = room;
    this.bar.setRoom(room);
    // One camera button per rival castle, in that player's colour.
    const rivals = room.players.filter((p) => p.seat !== this.mySeat);
    const key = rivals.map((p) => `${p.seat}:${p.color}:${p.name}`).join(',');
    if (key !== this.camKey) {
      this.camKey = key;
      this.cam.querySelector('[data-f="rivals"]')!.innerHTML = rivals.map((p) =>
        `<button class="btn hit cam-rival" data-cam="rival" data-seat="${p.seat}" data-color="${p.color}" title="Kamerayı ${esc(p.name)} kalesine götürür"><i class="dot"></i>${botMark(p.seat)}${esc(p.name)}</button>`).join('');
    }
    this.updateFinish();
  }

  /** Once the last human has fallen the host chooses: keep watching, or have the server play the rest out. */
  private updateFinish(): void {
    const host = !!this.room?.players.find((p) => p.seat === this.mySeat)?.isHost;
    const show = !!this.room?.allHumansOut && host && !this.finishDismissed && (this.spectating || this.wait.classList.contains('hidden'));
    this.finish.classList.toggle('hidden', !show);
  }

  private lettersSeen: Set<number> | null = null;

  /** Something that happened to us (a server notification). */
  notify(text: string): void {
    // The ribbon with the countdown already says an army is coming.
    if (text.includes('yaklaşıyor')) { sfx.play('warning'); return; }
    if (/elendi/.test(text)) sfx.play('castleFall');
    const kind: NoteKind = /düştü|elendi/.test(text) ? 'danger' : /saldır|çarpış|yendin|yenildin|püskürt|savaş/i.test(text) ? 'battle' : 'info';
    this.notes.push(text, kind, 6000);
  }

  /** A command that did not work, or something else the player must know. */
  error(text: string): void {
    sfx.play('uiError');
    this.notes.push(text, 'danger', 3500);
  }

  setStatus(text: string, ok: boolean): void {
    this.notes.setSticky('connection', !ok, text);
  }

  private keydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (this.reports.isOpen) this.reports.close();
    else if (this.scrollSeat !== null) this.closeScroll();
    else this.windows.close();
  }
}
