import { fadeFrom } from './transitions';
import { COLOR_NAMES, botMark, esc } from '../format';
import { sfx } from '../audio';
import { guarded } from '../error-report';
import type { GameConnection } from '../net';
import type { CastleView, Corner, MapStateView, RoomView, SiteView } from '../types';
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
import { t, tr } from '../i18n';
import { TopBar } from './topbar';
import { WorldLabels } from './world-labels';
import { KingdomUi } from './kingdom';
import { setLiveKingdoms } from './emblem';
import { Tutorial, armTutorial, rivalSeats, setTutorialDone, tutorialArmed } from './tutorial';
import { Hints } from './hints';

// Everything drawn over the map: the top bar, ribbons, report tags (and, step by step, the windows).
// One instance per game screen; `update` takes every castle state the server sends.

/** What the buttons of the fall card do; each returns an error text, or null when it worked. */
export interface FallActions {
  /** To the main menu; true when the match should be played out first (only bots are left). */
  menu: (finishFirst: boolean) => Promise<string | null>;
  newMatch: () => Promise<string | null>;
  newRoom: () => Promise<string | null>;
}

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
  private readonly kingdom: KingdomUi;
  private readonly ctx: WinContext;
  private scene: WorldScene | null = null;
  private castle: CastleView | null = null;
  private room: RoomView | null = null;
  private phase: CastleView['phase'] | null = null;
  private eliminated = false;
  private readonly onKey = (e: KeyboardEvent) => this.keydown(e);
  /** The first-match tutorial (only in the guided Quick play, a match with one human) and the contextual tips. */
  private tutorial: Tutorial | null = null;
  private readonly hints: Hints;
  private readonly root: HTMLElement;

  /** The "every human is out" box for the host, and whether they already chose to keep watching. */
  private readonly finish: HTMLElement;
  private readonly cam: HTMLElement;
  /** The small scroll under a rival's name with their last scout report (null seat: closed). */
  private readonly scroll: HTMLElement;
  private scrollSeat: number | null = null;
  private scrollAt: DOMRect | null = null;
  private fallNote = -1e9;
  private camKey = '';
  private finishDismissed = false;
  /** What the buttons of the fall card do (set by the page: leaving the room is the page's business). Each returns an error text or null. */
  fall: FallActions | null = null;
  private readonly mySeat: number;
  private readonly labelRoot: HTMLElement;

  constructor(root: HTMLElement, net: GameConnection, seat: number, home: () => void) {
    root.innerHTML = '';
    this.root = root;
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
        <div class="ribbon ribbon-red">${t('Kalen düştü')}</div>
        <div class="spec-body">
          <p>${t('İzleme {0} sn sonra başlıyor', '<b class="spec-n"></b>')}</p>
          <div class="gbar"><div class="fill"></div></div>
          <p class="muted-ink small">${t('Artık izleyicisin: tüm haritayı sissiz, kalelerin içiyle birlikte izlersin.')}</p>
        </div>
      </div>`;
    root.appendChild(this.wait);
    this.finish = document.createElement('div');
    this.finish.className = 'bot-end hidden';
    this.finish.style.pointerEvents = 'none'; // the strip around the box lets clicks through to the map; the box itself is `hit`
    this.finish.innerHTML = `
      <div class="paper hit">
        <div class="ribbon ribbon-red">${t('Kalen düştü')}</div>
        <div class="spec-body">
          <p class="fall-text"></p>
          <div class="bot-end-btns"></div>
        </div>
      </div>`;
    this.finish.addEventListener('click', async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
      const a = btn?.dataset.a;
      if (!btn || !a) return;
      if (a === 'watch') { this.finishDismissed = true; this.updateFinish(); return; }
      btn.disabled = true;
      let error: string | null | undefined = null;
      if (a === 'menu') error = await this.fall?.menu(!!this.room?.allHumansOut && this.isHost());
      else if (a === 'newMatch') error = await this.fall?.newMatch();
      else if (a === 'newRoom') error = await this.fall?.newRoom();
      else if (a === 'leave') error = await this.fall?.menu(false);
      else if (a === 'finish') { const r = await net.finishMatch(); if (!r.ok) error = r.error ?? t('Maç bitirilemedi.'); }
      btn.disabled = false;
      if (error) this.error(error);
    });
    root.appendChild(this.finish);
    const seat0 = seat;
    this.top = document.createElement('div');
    this.top.className = 'ui-top';
    root.appendChild(this.top);
    this.bar = new TopBar(this.top, {
      speed: (n) => void net.setSpeed(n).then((r) => { if (!r.ok) this.error(r.error ?? t('Hız değişmedi.')); }),
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
      <button class="btn hit" data-cam="home" title="${t('Kamerayı kalene getirir (boşluk tuşu)')}"><i class="ico ico-shield"></i> ${t('Kaleme dön')}<b class="cam-short">${t('Ben')}</b></button>
      <span data-f="rivals"></span>
      <button class="btn hit" data-cam="forest" title="${t('Kamerayı ormanın ortasına getirir')}">${t('Orman')}<b class="cam-short">${t('Orman')}</b></button>`;
    this.cam.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cam]');
      if (!b) return;
      if (b.dataset.cam === 'home') home();
      else if (b.dataset.cam === 'forest') this.scene?.focusForest();
      else if (b.dataset.cam === 'rival') this.scene?.focus({ kind: 'enemy', seat: Number(b.dataset.seat) });
    });
    root.appendChild(this.cam);
    // (No zoom buttons on a touch screen: two fingers zoom the map, like the mouse wheel on a desktop.)
    // The column of camera buttons stays under the top bar (its height is a variable the stylesheet uses).
    const syncTop = () => root.style.setProperty('--top-h', `${Math.max(0, Math.round(this.top.getBoundingClientRect().bottom - root.getBoundingClientRect().top))}px`);
    syncTop();
    new ResizeObserver(syncTop).observe(this.top);
    this.windows = new WindowManager(root, () => this.top.getBoundingClientRect().bottom, () =>
      [this.cam, document.querySelector('.kf-minimap'), root.querySelector('.report-tags'), root.querySelector('.report-toggle')].filter((e): e is Element => !!e)
        .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0));
    this.ctx = { net, say: (m) => this.error(m), info: (m) => { sfx.play('uiConfirm'); this.notes.push(m, 'info', 3500); }, open: (t) => this.open(t), close: () => this.windows.close(),
      army: (id) => this.scene?.resolveArmy(id), seat, sites: () => this.sites };
    this.kingdom = new KingdomUi(root, { net, say: (m) => this.error(m), info: (m) => { sfx.play('uiConfirm'); this.notes.push(m, 'info', 3500); }, seat });
    window.addEventListener('keydown', this.onKey);
    this.hints = new Hints((text, ms) => this.notes.push(text, 'info', ms ?? 9000));
    if (tutorialArmed()) this.startTutorial();
    window.addEventListener('kf-tutorial-restart', this.onTutorialRestart);
  }

  private startTutorial(): void {
    this.tutorial?.destroy();
    this.tutorial = new Tutorial({
      root: this.root,
      scene: () => this.scene,
      windowTarget: () => this.windows.current,
      windowEl: () => this.windows.element,
      closeWindow: () => this.windows.close(),
      topBottom: () => this.top.getBoundingClientRect().bottom,
      rivals: () => rivalSeats(this.room, this.mySeat),
    });
  }

  /** "Rehberi tekrar başlat" in the settings: starts at once when this is a match with bots only, else the next guided Quick play will run it. */
  private readonly onTutorialRestart = (e: Event): void => {
    const humans = (this.room?.players ?? []).filter((p) => !p.isBot).length;
    if (humans > 1 || this.spectating) return;
    setTutorialDone(false);
    armTutorial();
    this.startTutorial();
    (e as CustomEvent<{ handled: boolean }>).detail.handled = true;
  };

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
    window.removeEventListener('kf-tutorial-restart', this.onTutorialRestart);
    this.tutorial?.destroy();
    window.clearInterval(this.waitTimer);
    this.labels.destroy();
    this.labelRoot.remove();
    this.kingdom.destroy();
    this.notes.destroy();
    this.reports.destroy();
  }

  update(s: CastleView): void {
    this.castle = s;
    // Each part on its own: one that fails must not keep the rest of the screen from updating.
    guarded('ui-update', () => this.windows.update({ castle: s, room: this.room }), 'windows');
    guarded('ui-update', () => this.bar.update(s), 'top bar');
    guarded('ui-update', () => this.kingdom.update(s), 'kingdom');
    guarded('ui-update', () => this.renderScroll(), 'scroll');
    guarded('ui-update', () => this.reports.update(s.war.battles, s.elapsedSeconds), 'report tags');
    guarded('ui-update', () => this.updateNotes(s), 'ribbons');
    guarded('ui-update', () => this.tutorial?.update(s), 'tutorial');
    guarded('ui-update', () => this.hints.update(s, !!this.tutorial && tutorialArmed()), 'hints');
  }

  /** The ribbons that follow from a new state: scouts home, gold, a toured quarter, hunger, the war, a fallen castle. */
  private updateNotes(s: CastleView): void {
    const reports = s.scouting.reports;
    if (this.scoutsSeen) {
      if (reports.some((x) => !this.scoutsSeen!.has(scoutKey(x)))) sfx.play('scoutBack');
      for (const r of reports.filter((x) => !this.scoutsSeen!.has(scoutKey(x))))
        this.notes.push(t('Gözcün döndü: {0} raporu', tr(GENITIVE[r.targetColor] ?? 'rakibin')), 'battle', 15000, () => this.reports.showScout(r));
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
    if (this.lastGold !== null && gold > this.lastGold + 1e-6) this.notes.push(t('+{0} altın kasaya girdi', Math.round(gold - this.lastGold)), 'info', 5000);
    this.lastGold = gold;
    const explored = new Set(s.scouting.quarters.filter((q) => q.explored).map((q) => q.corner));
    if (this.exploredSeen) {
      for (const corner of explored)
        if (!this.exploredSeen.has(corner)) this.notes.push(t('Keşif bitti: ormanın bu bölgesindeki yerler haritada'), 'info', 6000);
    }
    this.exploredSeen = explored;
    this.notes.setIncoming(s.eliminated ? [] : s.war.incoming, s.speed);
    this.notes.setSticky('hunger', s.starving && !s.eliminated, t('Açlık! Yemek bitti, tüm üretim yarıya indi.'));
    if (this.phase === 'preparation' && s.phase === 'war') { sfx.play('battleStart'); this.notes.push(t('Savaş başladı! Orduların yola çıkabilir.'), 'battle', 6000); }
    if (!this.eliminated && s.eliminated) { sfx.play('castleFall'); }
    this.phase = s.phase;
    const changed = this.eliminated !== s.eliminated;
    this.eliminated = s.eliminated;
    if (changed) this.updateFinish();
  }

  private toggleScroll(seat: number, at: DOMRect): void {
    if (this.scrollSeat === seat) { this.closeScroll(); return; }
    this.scrollSeat = seat;
    this.scrollAt = at;
    this.scroll.dataset.html = '';
    this.renderScroll();
  }

  /** The back button: closes whatever is open on top (a window, a report, the scroll) and says whether there was something. */
  closeTop(): boolean {
    if (this.reports.isOpen) { this.reports.close(); return true; }
    if (this.scrollSeat !== null) { this.closeScroll(); return true; }
    if (this.windows.isOpen) { this.windows.close(); return true; }
    const panel = document.querySelector('.kingdom-panel:not(.hidden)');
    if (panel) { panel.classList.add('hidden'); return true; }
    const decree = document.getElementById('kingdom-decree');
    if (decree) { decree.remove(); return true; }
    return false;
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
    const html = `<button class="btn-round btn-red win-close" data-act="close" title="${t('Kapat (Esc)')}"><i class="ico ico-close"></i></button>
      ${report ? scoutReportHtml(report, s.elapsedSeconds)
        : `<div class="rep-title ribbon ribbon-yellow">${esc(tr(player?.name ?? '?'))}</div><p class="rep-note">${t('Henüz gözcü raporu yok. Gözcüyü rakip kalenin penceresinden gönderirsin.')}</p>`}
      <div class="scroll-foot"><button class="btn" data-act="open">${t('Kale penceresi')}</button></div>`;
    if (this.scroll.dataset.html !== html) {
      this.scroll.dataset.html = html;
      this.scroll.innerHTML = html;
    }
    this.scroll.classList.remove('hidden');
    const at = this.scrollAt;
    if (at) {
      const rr = this.root.getBoundingClientRect();
      const w = this.scroll.offsetWidth, h = this.scroll.offsetHeight;
      const vh = Math.min(rr.height, (window.visualViewport?.height ?? Infinity) - rr.top);
      let top = Math.max(4, Math.min(vh - h - 4, at.bottom + 6 - rr.top));
      let left = Math.max(8, Math.min(rr.width - w - 8, at.left + at.width / 2 - w / 2 - rr.left));
      // Never over the minimap: beside it (to its left) if it would cover it, else above it.
      const mm = document.querySelector('.kf-minimap')?.getBoundingClientRect();
      if (mm && mm.width > 0) {
        const mL = mm.left - rr.left, mT = mm.top - rr.top;
        if (left < mL + mm.width && left + w > mL && top < mT + mm.height && top + h > mT) {
          if (mL - 8 - w >= 8) left = mL - 8 - w;
          else if (mT - 8 - h >= 4) top = mT - 8 - h;
        }
      }
      this.scroll.style.top = `${top}px`;
      this.scroll.style.left = `${left}px`;
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
      fadeFrom('#000000', 900, 0.9);
      this.windows.close();
      window.clearInterval(this.waitTimer);
      this.waitTimer = 0;
      this.wait.classList.add('hidden');
      this.updateFinish();
    }
    // A few seconds is just the tick (or the dev speed); only a real delay (match.spectatorDelaySeconds) is worth saying.
    const lag = Math.round(lagSeconds);
    this.notes.setSticky('spectating', true, lag >= 10 ? t('İzleyici: tüm harita, oyundan {0} sn geride', lag) : t('İzleyici: tüm harita, canlı'), 'info');
  }

  /** The places of the forest we have found, from the latest map state (the windows about them read this). */
  setSites(sites: SiteView[]): void {
    this.sites = sites;
  }

  /** The latest map state (the kingdom panel lists the armies we can bribe, the camps we can hire and what the Oracle sees through). */
  setMapState(state: MapStateView): void {
    this.kingdom.setMap(state);
    setLiveKingdoms(state.kingdoms);
  }

  setRoom(room: RoomView): void {
    this.room = room;
    if (this.tutorial && room.players.filter((p) => !p.isBot).length > 1) { this.tutorial.destroy(); this.tutorial = null; } // a room of people: tips only
    this.kingdom.setRoom(room);
    this.bar.setRoom(room);
    // One camera button per rival castle, in that player's colour.
    const rivals = room.players.filter((p) => p.seat !== this.mySeat);
    const key = rivals.map((p) => `${p.seat}:${p.color}:${p.name}`).join(',');
    if (key !== this.camKey) {
      this.camKey = key;
      this.cam.querySelector('[data-f="rivals"]')!.innerHTML = rivals.map((p) =>
        `<button class="btn hit cam-rival" data-cam="rival" data-seat="${p.seat}" data-color="${p.color}" title="${esc(t('Kamerayı {0} kalesine götürür', tr(p.name)))}"><i class="dot"></i>${botMark(p.seat)}${esc(tr(p.name))}<b class="cam-short">${esc(COLOR_NAMES[p.color] ?? p.color)}</b></button>`).join('');
    }
    this.updateFinish();
  }

  private isHost(): boolean {
    return !!this.room?.players.find((p) => p.seat === this.mySeat)?.isHost;
  }

  /**
   * The card for a player whose castle has fallen, at once (the countdown to the spectator view runs beside it). What it offers:
   * only bots left, and we are the host: watch / new match (or finish, with other people in the room) / menu;
   * people still playing: watch / leave the room / new room. A challenge needs no card (it ends by itself and the result screen comes).
   */
  private updateFinish(): void {
    const room = this.room;
    const show = this.eliminated && !!room && room.phase !== 'ended' && !room.challengeId && !this.finishDismissed;
    this.finish.classList.toggle('hidden', !show);
    if (!show || !room) return;
    const host = this.isHost();
    const humans = room.players.filter((p) => !p.isBot).length;
    const buttons: [string, string, string][] = [['watch', t('Maçı izle'), '']];
    let text: string;
    if (room.allHumansOut && host) {
      text = humans <= 1 ? t('Maçta sadece botlar kaldı. İzleyebilir ya da hemen yeni bir maça geçebilirsin.') : t('Tüm insanlar elendi, maçta sadece botlar kaldı.');
      buttons.push(humans <= 1 ? ['newMatch', t('Yeni maç'), 'btn-red'] : ['finish', t('Maçı bitir'), 'btn-red'], ['menu', t('Menü'), '']);
    } else {
      text = room.allHumansOut ? t('Tüm insanlar elendi. Maçı oda sahibi bitirir ya da izlemeye devam edersin.') : t('Maç diğer oyuncular için sürüyor. Haritayı izleyebilir ya da odadan çıkabilirsin.');
      buttons.push(['leave', t('Odadan çık'), ''], ['newRoom', t('Yeni oda'), '']);
    }
    const key = `${text}|${buttons.map((b) => b[0]).join(',')}`;
    if (this.finish.dataset.key !== key) {
      this.finish.dataset.key = key;
      this.finish.querySelector('.fall-text')!.textContent = text;
      this.finish.querySelector('.bot-end-btns')!.innerHTML = buttons.map(([a, label, cls]) => `<button class="btn ${cls}" data-a="${a}">${esc(label)}</button>`).join('');
    }
  }

  private lettersSeen: Set<number> | null = null;

  /** Something that happened to us (a server notification). */
  notify(text: string): void {
    // The fall of our castle comes as three or four server messages and the countdown window already says it: one of them is enough ("... attack beat your defense").
    if (/düştü|elendi/.test(text)) {
      if (performance.now() - this.fallNote < 20_000) return;
      this.fallNote = performance.now();
    }
    // The ribbon with the countdown already says an army is coming.
    if (text.includes('yaklaşıyor')) { sfx.play('warning'); return; }
    if (/elendi/.test(text)) sfx.play('castleFall');
    const kind: NoteKind = /düştü|elendi/.test(text) ? 'danger' : /saldır|çarpış|yendin|yenildin|püskürt|savaş/i.test(text) ? 'battle' : 'info';
    this.notes.push(tr(text), kind, 6000);
  }

  /** A command that did not work, or something else the player must know. */
  error(text: string): void {
    sfx.play('uiError');
    this.notes.push(tr(text), 'danger', 3500);
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
