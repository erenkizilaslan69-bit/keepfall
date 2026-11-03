import { sfx } from '../audio';
import { t } from '../i18n';
import type { WorldScene } from '../scene/WorldScene';
import type { BuildingType, CastleView, RoomView, UnitView } from '../types';
import { sameTarget, type Target } from './windows';

// The interactive tutorial of the first Quick play: a short list of things to DO, one at a time. The thing to use is shown with a glowing frame and a
// bouncing hand, with one short sentence next to it; when the player has done it the next step starts by itself. The map stays usable and the game never
// pauses. "Skip" is on the card at all times. Only for a match with one human (the guided Quick play); multiplayer rooms get no tutorial.

const DONE_KEY = 'keepfall_tutorial_done', RUN_KEY = 'keepfall.tut';

const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* private mode: the tutorial may come again, harmless */ } },
};
const session = {
  get: (): { step: number } | null => { try { const v = sessionStorage.getItem(RUN_KEY); return v ? JSON.parse(v) as { step: number } : null; } catch { return null; } },
  set: (v: { step: number } | null): void => { try { if (v) sessionStorage.setItem(RUN_KEY, JSON.stringify(v)); else sessionStorage.removeItem(RUN_KEY); } catch { /* not kept over a reload */ } },
};

/** The player has finished (or skipped) the tutorial before. When the browser keeps nothing it counts as done (never nag every match). */
export function tutorialDone(): boolean {
  try { return localStorage.getItem(DONE_KEY) === 'true'; } catch { return true; }
}
export function setTutorialDone(done: boolean): void { store.set(DONE_KEY, done ? 'true' : 'false'); }
/** The guided match is about to start (set by Quick play): the game screen of this tab runs the tutorial. */
export function armTutorial(): void { session.set({ step: 0 }); }
export function disarmTutorial(): void { session.set(null); }
export function tutorialArmed(): boolean { return session.get() !== null; }
/** "Restart the tutorial" (settings): true when a running match with bots only took it up at once, false when it waits for the next guided Quick play. */
export function restartTutorial(): boolean {
  setTutorialDone(false);
  const detail = { handled: false };
  window.dispatchEvent(new CustomEvent('kf-tutorial-restart', { detail }));
  return detail.handled;
}

export interface TutorialHost {
  root: HTMLElement;
  scene: () => WorldScene | null;
  /** The window that is open now (null: none) and its element. */
  windowTarget: () => Target | null;
  windowEl: () => HTMLElement | null;
  closeWindow: () => void;
  /** Bottom edge of the top bar (px). */
  topBottom: () => number;
  /** Seats of the rivals still in the game. */
  rivals: () => number[];
}

interface Ctx { win: Target | null; el: HTMLElement | null; rivals: number[] }
/** What to point at: a thing on the map (the camera is taken there if it is out of sight) or an element of the open window. */
type Aim = { world: Target } | { dom: string } | null;
interface Step {
  /** The step of the list of seven it belongs to. */
  group: number;
  /** The window this step works in (kept open when the step changes; any other window is closed). */
  win?: Target;
  done: (s: CastleView) => boolean;
  aim: (s: CastleView, c: Ctx) => Aim;
  text: (s: CastleView, aim: Aim) => string;
}

const GROUPS = 7;
const building = (type: BuildingType): Target => ({ kind: 'building', type });
const idleOf = (s: CastleView): number => s.jobs.find((j) => j.job === 'idle')?.count ?? 0;
const jobOf = (s: CastleView, job: string): number => s.jobs.find((j) => j.job === job)?.count ?? 0;
/** The tutorial asks for this many soldiers before the first attack (the first one is armed in step 4; weapons and arming for the rest follow in step 7). */
const SOLDIER_GOAL = 5;
const soldierCount = (s: CastleView): number => s.soldiers + s.units.reduce((n, u) => n + u.arming, 0);
const weaponStock = (s: CastleView): number => s.units.reduce((n, u) => n + u.weapons, 0);
const queuedWeapons = (s: CastleView): number => s.queue.reduce((n, o) => n + o.remaining, 0);
/** Farmers the tutorial asks for: three make 24 food a minute, enough for the people and the five soldiers (balance.json: 8 a farmer, 1 a person, 1.5 a soldier). */
const FARMERS = 3;
const hasSoldierOrWeapon = (s: CastleView): boolean => s.soldiers > 0 || s.units.some((u) => u.weapons > 0 || u.soldiers > 0 || u.arming > 0);
/** The weapon to order: the cheapest the stores can pay for (the deck's own units only). */
function cheapest(s: CastleView): UnitView | undefined {
  const afford = s.units.filter((u) => u.wood <= s.resources.wood && u.iron <= s.resources.iron);
  return (afford.length ? afford : s.units).slice().sort((a, b) => a.wood + a.iron - (b.wood + b.iron))[0];
}

/** A step "click the building, then press the button in its window": the building on the map first, the button once the window is open. */
function press(group: number, bType: BuildingType, selector: (s: CastleView) => string, done: (s: CastleView) => boolean, worldText: (s: CastleView) => string, domText: (s: CastleView) => string, needsIdle = false): Step {
  const win = building(bType);
  return {
    group, win, done,
    aim: (s, c) => (needsIdle && idleOf(s) === 0 ? null : c.win && sameTarget(c.win, win) ? { dom: selector(s) } : { world: win }),
    text: (s, a) => (needsIdle && idleOf(s) === 0 ? t('Boşta işçi kalmadı: önce başka bir binada − düğmesine bas.')
      : a && 'dom' in a ? domText(s) : worldText(s)),
  };
}

function createSteps(): Step[] {
  const IN = '[data-act="in"]';
  return [
    press(1, 'farm', () => IN, (s) => jobOf(s, 'farmer') >= 1,
      () => t('Tarlana tıkla: yemek buradan gelir.'), () => t('Boştaki bir işçiyi tarlaya ver: +'), true),
    press(1, 'farm', () => IN, (s) => jobOf(s, 'farmer') >= FARMERS,
      (s) => t('Herkesi doyurmak için tarlaya yine tıkla ({0}/{1} çiftçi).', jobOf(s, 'farmer'), FARMERS),
      (s) => t('Tarlaya bir işçi daha ekle: + ({0}/{1} çiftçi)', jobOf(s, 'farmer'), FARMERS), true),
    press(2, 'lumberCamp', () => IN, (s) => jobOf(s, 'lumberjack') >= 1,
      () => t('Şimdi oduncu kampına tıkla.'), () => t('Oduncu kampına bir işçi ekle: +'), true),
    press(2, 'mine', () => IN, (s) => jobOf(s, 'miner') >= 1,
      () => t('Madene tıkla: demir buradan gelir.'), () => t('Madene bir işçi ekle: +'), true),
    press(3, 'forge', () => IN, (s) => jobOf(s, 'blacksmith') >= 1,
      () => t('Demirhaneye tıkla: silahlar burada yapılır.'), () => t('Demirciye bir işçi ekle: +'), true),
    press(3, 'forge', (s) => `[data-unit="${cheapest(s)?.id ?? ''}"] [data-act="queue"][data-n="1"]`, (s) => s.queue.length > 0 || hasSoldierOrWeapon(s),
      () => t('Demirhaneye yine tıkla ve bir silah sırala.'), () => t('Bir silah üret: bu satırdaki +1\'e bas.')),
    { // wait for the weapon (nothing to click)
      group: 4, done: hasSoldierOrWeapon, aim: () => null,
      text: () => t('Silah hazırlanıyor… hazır olunca onu askere çevireceksin.'),
    },
    {
      group: 4, win: { kind: 'castle' }, done: (s) => s.soldiers > 0 || s.units.some((u) => u.soldiers > 0 || u.arming > 0),
      aim: (s, c) => {
        if (!(c.win && sameTarget(c.win, { kind: 'castle' }))) return { world: { kind: 'castle' } };
        const u = s.units.find((x) => x.weapons > 0);
        return u ? { dom: `.unit-row[data-unit="${u.id}"] [data-act="arm"][data-n="1"]` } : null;
      },
      text: (_s, a) => (a && 'dom' in a ? t('Silahın yanındaki +1\'e bas: işçi asker olur.') : t('Kaleye tıkla: işçiyi askere çevireceğiz.')),
    },
    {
      group: 5, win: building('farm'), done: (s) => s.buildings.some((b) => b.upgradeRemaining !== null || b.level > 1),
      aim: (s, c) => {
        const b = s.buildings.find((x) => x.nextUpgrade && x.nextUpgrade.wood <= s.resources.wood && x.nextUpgrade.iron <= s.resources.iron);
        if (!b) return null;
        return c.win && c.win.kind === 'building' && c.win.type === b.type ? { dom: '[data-act="upgrade"]' } : { world: building(b.type) };
      },
      text: (_s, a) => {
        if (!a) return t('Yükseltmek için biraz odun ve demir biriktir…');
        return 'dom' in a ? t('Yükselt düğmesine bas.') : t('Bir binayı yükselt: ona tıkla.');
      },
    },
    {
      group: 6, win: { kind: 'forest', id: 'northWest' }, done: (s) => s.scouting.missions.length > 0 || s.scouting.quarters.some((q) => q.explored),
      aim: (s, c) => {
        if (s.scouting.locked || idleOf(s) === 0) return null;
        const q = s.scouting.quarters.find((x) => !x.explored && !x.busy) ?? s.scouting.quarters[0];
        const target: Target = { kind: 'forest', id: q?.corner ?? 'northWest' };
        return c.win && c.win.kind === 'forest' ? { dom: '[data-act="explore"]' } : { world: target };
      },
      text: (_s, a) => (!a ? t('Gözcü için boşta bir işçi gerekir: bir binadan − ile işçi al.')
        : 'dom' in a ? t('Gözcü göndermek için "Bu bölgeyi keşfet"e bas.') : t('Ormana tıkla: gözcü gönderip yağma yerlerini bulacağız.')),
    },
    { // up to five soldiers: weapons first (blacksmith), then arming (castle); the preparation is long enough for it
      group: 7, done: (s) => soldierCount(s) >= SOLDIER_GOAL,
      aim: (s, c) => {
        const need = SOLDIER_GOAL - soldierCount(s) - weaponStock(s) - queuedWeapons(s);
        if (need > 0) {
          const u = cheapest(s);
          if (!u || u.wood > s.resources.wood || u.iron > s.resources.iron) return null; // waiting for wood and iron
          const n = need >= 5 && u.wood * 5 <= s.resources.wood && u.iron * 5 <= s.resources.iron ? 5 : 1;
          return c.win && c.win.kind === 'building' && c.win.type === 'forge' ? { dom: `[data-unit="${u.id}"] [data-act="queue"][data-n="${n}"]` } : { world: building('forge') };
        }
        const u = s.units.find((x) => x.weapons > 0);
        if (!u) return null; // the weapons are still being forged
        const n = Math.min(u.weapons, SOLDIER_GOAL - soldierCount(s)) >= 5 ? 5 : 1;
        return c.win && c.win.kind === 'castle' ? { dom: `.unit-row[data-unit="${u.id}"] [data-act="arm"][data-n="${n}"]` } : { world: { kind: 'castle' } };
      },
      text: (s, a) => {
        const have = soldierCount(s);
        const n = a && 'dom' in a ? /data-n="(\d+)"/.exec(a.dom)?.[1] ?? '1' : '1';
        if (!a) return SOLDIER_GOAL - have - weaponStock(s) - queuedWeapons(s) > 0
          ? t('Silah için odun ve demir bekleniyor… ({0}/{1} asker)', have, SOLDIER_GOAL)
          : t('Silahlar üretiliyor… ({0}/{1} asker)', have, SOLDIER_GOAL);
        if ('dom' in a) return a.dom.includes('queue') ? t('Silah sırala: +{0}', n) : t('Silahları askere çevirmek için +{0}\'e bas.', n);
        return a.world.kind === 'castle' ? t('Silahları askere çevir ({0}/{1}): kaleye tıkla.', have, SOLDIER_GOAL)
          : t('Savaşa en az {1} asker lazım ({0}/{1}): demirhaneye tıkla, silah sırala.', have, SOLDIER_GOAL);
      },
    },
    { // wait for the war
      group: 7, done: (s) => s.phase === 'war', aim: () => null,
      text: (s) => t('Hazırlık sürüyor. Savaşa {0} kaldı: üretmeye ve geliştirmeye devam et!', clock(s.prepSeconds - s.elapsedSeconds)),
    },
    {
      group: 7, done: (s) => s.war.armies.length > 0,
      aim: (s, c) => {
        const seat = c.rivals[0];
        if (seat === undefined || !s.units.some((u) => u.soldiers > 0)) return null;
        if (!(c.win && c.win.kind === 'enemy')) return { world: { kind: 'enemy', seat } };
        const total = [...(c.el?.querySelectorAll<HTMLInputElement>('[data-count]') ?? [])].reduce((n, i) => n + (Number(i.value) || 0), 0);
        return { dom: total > 0 ? '[data-act="send"]' : '[data-act="half"]' };
      },
      text: (s, a) => (!a ? (s.units.some((u) => u.arming > 0) ? t('Askerlerin hazırlanıyor… birazdan saldırabilirsin.') : t('Saldırmak için önce kaleden asker çıkar: kale penceresinde +1.'))
        : 'dom' in a ? (a.dom.includes('send') ? t('Şimdi Saldır\'a bas!') : t('Önce "Yarısı"na bas: kaleyi savunacak asker bırak, yoksa kalen düşer!')) : t('Savaş başladı! Bir rakip kaleye tıkla; daha çok asker, daha güçlü saldırı demek.')),
    },
  ];
}

const clock = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

export class Tutorial {
  private readonly steps = createSteps();
  private idx: number;
  private state: CastleView | null = null;
  private readonly frameEl: HTMLElement;
  private readonly hand: HTMLElement;
  private readonly card: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly stepEl: HTMLElement;
  private raf = 0;
  private lastPan = 0;
  private lastIdx = -1;
  private finished = false;

  constructor(private readonly host: TutorialHost) {
    this.idx = Math.min(session.get()?.step ?? 0, this.steps.length - 1);
    const root = document.createElement('div');
    root.className = 'tut-root';
    root.innerHTML = `
      <div class="tut-frame" hidden></div>
      <div class="tut-hand" hidden aria-hidden="true"></div>
      <div class="tut-card paper hit" role="status">
        <div class="tut-step"></div>
        <div class="tut-text"></div>
        <div class="tut-buttons"><button class="btn" data-act="skip">${t('Atla')}</button></div>
      </div>`;
    host.root.appendChild(root);
    this.frameEl = root.querySelector('.tut-frame')!;
    this.hand = root.querySelector('.tut-hand')!;
    this.card = root.querySelector('.tut-card')!;
    this.textEl = root.querySelector('.tut-text')!;
    this.stepEl = root.querySelector('.tut-step')!;
    this.card.hidden = true;
    root.querySelector('[data-act="skip"]')!.addEventListener('click', () => this.end(false));
    this.root = root;
    if (import.meta.env.DEV) (window as unknown as { keepfallTutorial: Tutorial }).keepfallTutorial = this; // the browser tests look at it
    this.loop();
  }
  private readonly root: HTMLElement;

  /** The latest castle state (about once a second): steps the player has done move on. */
  update(s: CastleView): void {
    this.state = s;
    if (this.finished) return;
    if (s.eliminated) { this.end(false); return; }
    if (document.getElementById('kingdom-decree')) return; // the decree comes first
    // steps done already (or just now) are passed, one after the other
    let moved = false;
    while (this.idx < this.steps.length && this.steps[this.idx].done(s)) { this.idx++; moved = true; }
    if (moved) sfx.play('uiConfirm');
    if (this.idx >= this.steps.length) { this.end(true); return; }
    session.set({ step: this.idx });
    if (this.idx !== this.lastIdx) {
      this.lastIdx = this.idx;
      const win = this.steps[this.idx].win;
      const open = this.host.windowTarget();
      if (open && !(win && sameTarget(open, win))) this.host.closeWindow();
      this.lastPan = 0;
    }
  }

  /** Ends it: finished or skipped, it does not come back (until "Restart the tutorial" in the settings). */
  end(completed: boolean): void {
    if (this.finished) return;
    this.finished = true;
    setTutorialDone(true);
    session.set(null);
    cancelAnimationFrame(this.raf);
    this.frameEl.hidden = true;
    this.hand.hidden = true;
    if (completed) {
      this.stepEl.textContent = '';
      this.textEl.textContent = t('Harika! Rehber bitti. İyi şanslar!');
      this.card.querySelector<HTMLElement>('.tut-buttons')!.hidden = true;
      this.card.hidden = false;
      this.placeCard(null);
      sfx.play('win');
      window.setTimeout(() => this.root.remove(), 4500);
    } else {
      this.root.remove();
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  private loop(): void {
    this.raf = requestAnimationFrame(() => { try { this.frame(); } catch { /* cosmetic: the next frame tries again */ } this.loop(); });
  }

  /** Dev only: where the tutorial is and what it points at (tools/tutorial-check.mjs). */
  debug(): { idx: number; aim: Aim } | null {
    return this.state && this.idx < this.steps.length ? { idx: this.idx, aim: this.steps[this.idx].aim(this.state, this.ctx()) } : null;
  }

  private ctx(): Ctx { return { win: this.host.windowTarget(), el: this.host.windowEl(), rivals: this.host.rivals() }; }

  private frame(): void {
    const s = this.state;
    if (!s || this.finished || this.idx >= this.steps.length || document.getElementById('kingdom-decree')) {
      this.frameEl.hidden = true; this.hand.hidden = true; if (!this.finished) this.card.hidden = true;
      return;
    }
    const step = this.steps[this.idx];
    const ctx = this.ctx();
    const aim = step.aim(s, ctx);
    // A thing on the map that another window covers (the blacksmith's window over the castle): the window is closed so the thing can be clicked.
    if (aim && 'world' in aim && ctx.win && !sameTarget(ctx.win, aim.world)) this.host.closeWindow();
    this.card.hidden = false;
    this.stepEl.textContent = t('Adım {0} / {1}', step.group, GROUPS);
    const text = step.text(s, aim);
    if (this.textEl.textContent !== text) this.textEl.textContent = text;
    const rect = aim ? this.rectOf(aim) : null;
    this.frameEl.hidden = this.hand.hidden = !rect;
    if (rect) {
      Object.assign(this.frameEl.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      this.placeHand(rect);
    }
    this.placeCard(rect);
  }

  /** The screen rectangle (CSS px) of what is pointed at; takes the camera there when a thing on the map is out of sight. */
  private rectOf(aim: NonNullable<Aim>): { x: number; y: number; w: number; h: number } | null {
    if ('dom' in aim) {
      const el = this.host.windowEl()?.querySelector<HTMLElement>(aim.dom);
      if (!el) return null;
      let r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      // A button that sits below the fold of a tall window is scrolled into view first (and a window that runs off the screen is already scrolled inside).
      const box = el.closest<HTMLElement>('.win-body')?.getBoundingClientRect();
      const top = this.host.topBottom();
      if (r.top < Math.max(top, box?.top ?? 0) || r.bottom > Math.min(window.innerHeight, box?.bottom ?? window.innerHeight)) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        r = el.getBoundingClientRect();
      }
      const pad = 4;
      return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    }
    const scene = this.host.scene();
    if (!scene) return null;
    const a = scene.anchorOf(aim.world);
    if (!a) return null;
    const vw = window.innerWidth, vh = window.innerHeight, top = this.host.topBottom();
    const visible = a.x > 30 && a.x < vw - 30 && a.y > top + 20 && a.y < vh - 30;
    if (!visible && performance.now() - this.lastPan > 2500) {
      this.lastPan = performance.now();
      const k = aim.world.kind;
      if (k === 'forest') scene.focusForest(); else if (k === 'enemy') scene.focus(aim.world); else scene.centerOnCastle();
    }
    if (!visible) return null;
    const w = Math.max(70, a.reach * 1.5), h = Math.max(70, a.reach * 1.35);
    return { x: a.x - w / 2, y: a.y - h / 2, w, h };
  }

  /** The hand below the frame (pointing up), or above it (pointing down) when there is no room below. */
  private placeHand(r: { x: number; y: number; w: number; h: number }): void {
    const below = r.y + r.h + 48 < window.innerHeight;
    this.hand.textContent = below ? '👆' : '👇';
    this.hand.classList.toggle('down', !below);
    this.hand.style.left = `${r.x + r.w / 2}px`;
    this.hand.style.top = below ? `${r.y + r.h - 4}px` : `${r.y - 38}px`;
  }

  /** The card with the sentence: beside the frame when there is room, else above or below it; in the bottom middle when nothing is pointed at. */
  private placeCard(r: { x: number; y: number; w: number; h: number } | null): void {
    const vw = window.innerWidth, vh = window.innerHeight, top = this.host.topBottom();
    const cw = this.card.offsetWidth || 260, ch = this.card.offsetHeight || 90, m = 10;
    let x = (vw - cw) / 2, y = vh - ch - m - 6;
    if (r) {
      const spaceRight = vw - (r.x + r.w) - m, spaceLeft = r.x - m;
      if (spaceRight >= cw) { x = r.x + r.w + m; y = r.y + r.h / 2 - ch / 2; }
      else if (spaceLeft >= cw) { x = r.x - cw - m; y = r.y + r.h / 2 - ch / 2; }
      else if (r.y - ch - m - 40 >= top) { x = r.x + r.w / 2 - cw / 2; y = r.y - ch - m - 40; }
      else { x = r.x + r.w / 2 - cw / 2; y = Math.min(vh - ch - m, r.y + r.h + 56); }
    }
    x = Math.max(m, Math.min(vw - cw - m, x));
    y = Math.max(top + m, Math.min(vh - ch - m, y));
    this.card.style.left = `${Math.round(x)}px`;
    this.card.style.top = `${Math.round(y)}px`;
  }
}

/** Seats and names are not needed here; the room is only asked for who is still in the game. */
export function rivalSeats(room: RoomView | null, mySeat: number): number[] {
  return (room?.players ?? []).filter((p) => p.seat !== mySeat && !p.eliminated).map((p) => p.seat);
}

