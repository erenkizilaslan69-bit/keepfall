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
import { GENITIVE, scoutKey } from './scout-report';
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

  constructor(root: HTMLElement, net: GameConnection, seat: number, home: () => void) {
    root.innerHTML = '';
    this.labels = new WorldLabels(root); // first, so every window is drawn over the signs
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
    });
    this.bar.setSeat(seat);
    this.notes = new Notifications(this.top);
    this.reports = new ReportTags(root);
    const homeButton = document.createElement('button');
    homeButton.className = 'btn home-btn hit';
    homeButton.title = 'Kamerayı kalene getirir (boşluk tuşu)';
    homeButton.innerHTML = '<i class="ico ico-shield"></i> Kaleme dön';
    homeButton.addEventListener('click', home);
    root.appendChild(homeButton);
    this.windows = new WindowManager(root, () => this.top.getBoundingClientRect().bottom, () =>
      [homeButton, document.querySelector('.minimap'), root.querySelector('.report-tags')].filter((e): e is Element => !!e)
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0));
    this.ctx = { net, say: (m) => this.error(m), info: (m) => this.notes.push(m, 'info', 3500), open: (t) => this.open(t), close: () => this.windows.close(),
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
  }

  update(s: CastleView): void {
    this.castle = s;
    this.windows.update({ castle: s, room: this.room });
    this.bar.update(s);
    this.reports.update(s.war.battles, s.scouting.reports, s.elapsedSeconds);
    const reports = s.scouting.reports;
    if (this.scoutsSeen) {
      for (const r of reports.filter((x) => !this.scoutsSeen!.has(scoutKey(x))))
        this.notes.push(`Gözcün döndü: ${GENITIVE[r.targetColor] ?? 'rakibin'} raporu`, 'battle', 15000, () => this.reports.showScout(r));
    }
    this.scoutsSeen = new Set(reports.map(scoutKey));

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
    if (this.phase === 'preparation' && s.phase === 'war') this.notes.push('Savaş başladı! Orduların yola çıkabilir.', 'battle', 6000);
    if (!this.eliminated && s.eliminated) this.notes.push('Kalen düştü!', 'danger', 6000);
    this.phase = s.phase;
    this.eliminated = s.eliminated;
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
  }

  /** Something that happened to us (a server notification). */
  notify(text: string): void {
    // The ribbon with the countdown already says an army is coming.
    if (text.includes('yaklaşıyor')) return;
    const kind: NoteKind = /düştü|elendi/.test(text) ? 'danger' : /saldır|çarpış|yendin|yenildin|püskürt|savaş/i.test(text) ? 'battle' : 'info';
    this.notes.push(text, kind, 6000);
  }

  /** A command that did not work, or something else the player must know. */
  error(text: string): void {
    this.notes.push(text, 'danger', 3500);
  }

  setStatus(text: string, ok: boolean): void {
    this.notes.setSticky('connection', !ok, text);
  }

  private keydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (this.reports.isOpen) this.reports.close();
    else this.windows.close();
  }
}
