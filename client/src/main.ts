import Phaser from 'phaser';
import './style.css';
import { GameUi, type FallActions } from './ui/game-ui';
import { loadActiveRoom, loadName, markActiveRoom, saveName } from './identity';
import { GameConnection, type ConnectionStatus } from './net';
import { WorldScene } from './scene/WorldScene';
import { loadUiArt } from './ui/sprites';
import { watchUiScale } from './ui/scale';
import './ui/ui.css';
import './ui/theme.css';
import './ui/kf-art.css';
import './ui/juice.css';
import './ui/challenges.css';
import { applyCalm } from './ui/juice';
import './ui/touch.css';
import './ui/touch-text.css';
import './ui/touch-targets.css';
import './ui/touch-fixes.css';
import './ui/touch-windows.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-ext-700.css';
import '@fontsource/noto-sans/cyrillic-400.css';
import '@fontsource/noto-sans/cyrillic-700.css';
import './ui/fonts.css';
import './ui/i18n-fit.css';
import './ui/director.css';
import { Minimap } from './minimap';
import { EndScreen, HomeScreen, LobbyScreen } from './screens';
import { setBotSeats } from './format';
import { t, tr } from './i18n';
import { installTouch } from './ui/touch';
import { startDiagnostics, watchGlContext } from './diagnostics';
import { PROTOCOL } from './net';
import { music, sfx } from './audio';
import { mountGuideButton, showFirstTimeGuide } from './ui/guide';
import { CloudCurtain } from './ui/clouds';
import { fadeFrom } from './ui/transitions';
import { warmUp } from './preload';
import { mountScenery } from './ui/scenery';
import { confirmLeave, mountLangButton, mountSettingsButton, setLeaveAction } from './ui/settings';
import { startFpsMeter } from './ui/fps-meter';
import { armTutorial, disarmTutorial, tutorialDone } from './ui/tutorial';
import { CRAZY } from './crazy';
import { FEATURE_PRIVATE_ROOM } from './features';
import { initSteam, steamStatus } from './steam';
import { crazyGameplay, crazyInstant, crazyInviteRoom, crazyLoaded, crazyRoom, crazyUsername, crazyVictory, initCrazy, onCrazyJoin, watchCrazySettings } from './crazy';
import { countMatch, newPlayer, playsFullRules, setSiteChatOff } from './prefs';
import { guarded, installErrorReporting } from './error-report';
import { ChallengeScreen, loadStars, nextOf, resultHtml, saveStars } from './ui/challenges';
import './ui/progress.css';
import { ProgressScreen, mergeDelta, progressPanelHtml } from './ui/progress';
import { recordMatch, recordMeta, type ProgressDelta } from './progress/catalog';
import type { BattleStartedView, ProgressResult, BotLevel, CastleView, ChallengeList, ChallengeResult, MapLayoutView, MapStateView, RoomView, SpectatorStateView, SummaryView } from './types';
import { currentRoute, embedded, setRoute } from './env';

// Routes: "/" is the home screen, "/oda/ABCD" is a room. Inside a room the screen follows the
// room's phase: lobby → game (preparation and war) → end screen.

const app = document.getElementById('app')!;

/** The "reconnecting" note waits a moment (a pending timer); once it is shown, the return is announced. */
let downTimer = 0;
let downShown = false;

const statusText: Record<ConnectionStatus, string> = {
  connecting: t('Bağlanıyor…'),
  connected: t('Bağlı'),
  reconnecting: t('Bağlantı koptu, yeniden deneniyor…'),
  disconnected: t('Bağlantı yok — sunucu çalışıyor mu?'),
  roomLost: t('Oda kapandı'),
};

type Screen = 'none' | 'home' | 'challenges' | 'progress' | 'lobby' | 'game' | 'end';
let screen: Screen = 'none';
let lastCastle: CastleView | null = null;
let lastLayout: MapLayoutView | null = null;
let lastMap: MapStateView | null = null;
let pendingBattles: BattleStartedView[] = [];
let lastSpectator: SpectatorStateView | null = null;
/**
 * The director (cameraman) page: `?director=<key>`, only in a build for our own server (not Steam, CrazyGames or the hosted itch build: there this is
 * false at build time and the code is left out). See director.ts and docs/kameraman.md.
 */
const DIRECTOR_KEY: string | null = !import.meta.env.VITE_PLATFORM && !import.meta.env.VITE_SERVER_URL ? new URLSearchParams(location.search).get('director') : null;
let directorCam: import('./director').DirectorCamera | null = null;
let summary: SummaryView | null = null;
let status = '';
/** Challenge mode: the list from the server (once), and the result of the match that just ended until the end screen has shown it. */
let challengeList: ChallengeList | null = null;
let lastChallengeResult: ChallengeResult | null = null;
/** What the finished match changed in the player's progress (kept until the end screen shows it). */
let progressDelta: ProgressDelta | null = null;
let progressSeen = false;

installTouch();
mountGuideButton(); // the "?" for the menus (in the game it is in the top bar)
mountSettingsButton(); // the gear next to it
mountLangButton(); // and the TR / EN switch

// Sound: browsers start it only after a gesture; every button press gets a small click.
// (iOS only lets a sound start from the end of a touch or a click, so those unlock it as well)
for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true });
document.addEventListener('click', (e) => { if ((e.target as HTMLElement | null)?.closest?.('button')) sfx.play('click'); }, true);

installErrorReporting(() => ({
  room: /^\/oda\/([A-Za-z]{6})/.exec(currentRoute())?.[1]?.toUpperCase(),
  seat: net.seat,
  phase: lastCastle?.phase,
  elapsedSeconds: lastCastle?.elapsedSeconds,
  context: `screen=${screen} scene=${scene ? 'on' : 'off'} spectating=${lastSpectator ? 'yes' : 'no'}`,
}));

const curtain = new CloudCurtain();
mountScenery(); // the living picture behind the menus
let lobby: LobbyScreen | null = null;
let lastEndRoom: RoomView | null = null;
let end: EndScreen | null = null;
let ui: GameUi | null = null;
let game: Phaser.Game | null = null;
let scene: WorldScene | null = null;

const net = new GameConnection({
  room: onRoom,
  castle: onCastle,
  mapLayout: (layout) => {
    lastLayout = layout;
    if (screen === 'game' && !scene && lastCastle) onCastle(lastCastle);
  },
  battleStarted: (battle) => {
    if (scene) scene.playBattle(battle);
    else pendingBattles.push(battle); // e.g. right after a reconnect, before the scene is up
  },
  mapState: (state) => {
    lastMap = state;
    guarded('map-state', () => scene?.setMap(state), 'scene');
    guarded('map-state', () => ui?.setSites(state.sites), 'ui');
    guarded('map-state', () => ui?.setMapState(state), 'ui');
  },
  spectatorState: (frame) => {
    lastSpectator = frame;
    directorCam?.onPicture(frame);
    for (const b of frame.started) {
      if (scene) scene.playBattle(b);
      else pendingBattles.push(b);
    }
    guarded('spectator-state', () => ui?.setSpectating(lastCastle ? Math.max(0, lastCastle.elapsedSeconds - frame.elapsedSeconds) : 0), 'ui');
    guarded('spectator-state', () => scene?.setSpectator(frame), 'scene');
  },
  spectatorWait: (wait) => ui?.setSpectatorWait(wait.startsIn),
  matchEnded: (s) => { summary = s; end?.setSummary(s); },
  challengeResult: (r) => { lastChallengeResult = r; applyChallengeResult(); },
  progressResult: (r) => onProgressResult(r),
  notification: (text) => ui?.notify(text),
  status: (s) => {
    // A blip shorter than a second and a half is not worth a red ribbon: "reconnecting" is only shown if it lasts.
    if (s === 'reconnecting') {
      if (!downTimer && !downShown) {
        downTimer = window.setTimeout(() => {
          downTimer = 0; downShown = true;
          status = statusText.reconnecting;
          ui?.setStatus(status, false);
          if (screen !== 'home' && screen !== 'game') showBanner(t('Yeniden bağlanılıyor...'));
        }, 1500);
      }
      return;
    }
    if (downTimer) { window.clearTimeout(downTimer); downTimer = 0; }
    if (s === 'connected' && downShown) { downShown = false; ui?.notify(t('Yeniden bağlandı')); }
    status = statusText[s];
    ui?.setStatus(status, s === 'connected');
    if (s === 'connected') hideBanner();
    if (s === 'disconnected' && screen !== 'home') showBanner(t('Sunucuyla bağlantı yok. Sayfayı yenileyince kaldığın yere dönersin.'));
    if (s === 'roomLost') {
      // The server was restarted (or the room closed): the match is gone. A clear message, then the main menu by itself (a tap is not needed, but still works).
      const toMenu = () => { markActiveRoom(null); setRoute('/', 'replace'); location.reload(); };
      showBanner(t('Sunucu yeniden başladı, maç kapandı. Ana menüye dönülüyor…'), toMenu);
      window.setTimeout(toMenu, 3500);
    }
  },
});
startFpsMeter(net);
startDiagnostics({ game: () => game, scene: () => scene, net });

// Dev only: lets the console (and browser tests) send commands as this tab's player.
if (import.meta.env.DEV) (window as unknown as { keepfallNet: GameConnection }).keepfallNet = net;
if (import.meta.env.DEV) (window as unknown as { keepfallLeave: () => Promise<void> }).keepfallLeave = () => leaveToMenu(); // (tools/perf-loop.mjs)
if (import.meta.env.DEV) (window as unknown as { keepfallAudio: unknown }).keepfallAudio = { sfx, music };
if (import.meta.env.DEV) (window as unknown as { keepfallCrazy: unknown }).keepfallCrazy = { victory: crazyVictory };

// ---- room events ---------------------------------------------------------------------------

function onRoom(r: RoomView): void {
  if (DIRECTOR_KEY) {
    // the director watches only a match: the lobby and the end screens are not its business (the recorder stops when the match is over)
    (window as unknown as { keepfallDirector?: { phase?: string } }).keepfallDirector!.phase = r.phase;
    if (r.phase !== 'preparation' && r.phase !== 'war') { if (directorCam && !directorCam.matchEnd) directorCam.matchEnd = Date.now(); return; }
    if (screen !== 'game') showGame();
    ui?.setRoom(r);
    scene?.setRoom(r);
    return;
  }
  // Starter rules hide the row pickers (the server ignores them anyway).
  document.documentElement.classList.toggle('kf-starter', r.starter === true);
  setBotSeats(r.players);
  mountScenery().setColors(r.players.map((p) => p.color));
  // In the lobby the browser already fetches what the map will need.
  const me = r.players.find((p) => p.seat === net.seat);
  if (me && r.phase === 'lobby') warmUp(me.color, r.players.map((p) => p.color));
  const wanted: Screen = r.phase === 'lobby' ? 'lobby' : r.phase === 'ended' ? 'end' : 'game';
  if (wanted !== screen) {
    if (wanted === 'lobby') showLobby(r);
    else if (wanted === 'game') showGame();
    else showEnd(r);
  }
  if (screen === 'lobby') lobby!.update(r);
  else if (screen === 'game') {
    ui?.setRoom(r);
    scene?.setRoom(r);
  }
  else if (screen === 'end') { lastEndRoom = r; end!.update(r); }
  // The site (CrazyGames) learns which room we are in, and that friends may join only while it is a lobby.
  crazyRoom(r.code, r.phase === 'lobby' && !soloRoom);
  crazyGameplay(screen === 'game' && !lastCastle?.eliminated);
  roomEnded = r.phase === 'ended'; roomChallenge = !!r.challengeId;
  announce();
}

/** Steam friends list ("Rich Presence"): what this player is doing now; does nothing without Steam. */
let roomEnded = false, roomChallenge = false;
function announce(): void {
  if (screen === 'home' || screen === 'challenges' || screen === 'progress' || screen === 'lobby' || screen === 'none') { steamStatus('menu'); return; }
  if (screen === 'end' || roomEnded) { steamStatus('ended'); return; }
  if (lastCastle?.eliminated) { steamStatus('spectating'); return; }
  const war = lastCastle?.phase === 'war';
  steamStatus(roomChallenge ? (war ? 'challenge_war' : 'challenge_prep') : war ? 'war' : 'prep');
}

function onCastle(c: CastleView): void {
  lastCastle = c;
  if (screen === 'game') { crazyGameplay(!c.eliminated); announce(); } // an eliminated player only watches: the site is told the play has stopped
  if (c.summary) { summary = c.summary; end?.setSummary(c.summary); }
  if (screen === 'game') {
    if (musicInGame) music.scene(c.phase === 'war' ? 'war' : 'prep'); // the lively track for the war, the calm one before it (once the clouds have parted)
    guarded('castle-state', () => ui?.update(c), 'ui');
    guarded('castle-state', () => { if (!scene && lastLayout) startScene(c.color, lastLayout); }, 'start scene');
    guarded('castle-state', () => scene?.setState(c), 'scene');
  }
}

// ---- screens -------------------------------------------------------------------------------

/**
 * The canvas is the visible part of the window, whatever happens to it: a turn of the phone, Safari's address bar sliding away, the keyboard, a split view.
 * iOS reports the new size late (after the event), so a turn is looked at again a moment later, and a slow check catches anything missed.
 */
const onWindowResize = () => {
  if (!game) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (game.scale.gameSize.width !== w || game.scale.gameSize.height !== h) game.scale.resize(w, h);
  if (game.canvas) { game.canvas.style.width = `${w}px`; game.canvas.style.height = `${h}px`; }
  game.scale.updateBounds();
};
/**
 * Where the canvas is on the page, for turning a touch into a point on the map. Safari's address bar sliding in or out moves the canvas by tens of pixels without
 * any resize event, and Phaser keeps the bounds it measured last: every touch would then land that far off. So the bounds are measured again at the start of every
 * touch and every movement (before Phaser reads them) and whenever the visual viewport changes.
 */
const refreshBounds = () => game?.scale.updateBounds();
for (const ev of ['touchstart', 'touchmove', 'pointerdown', 'pointermove', 'mousedown']) window.addEventListener(ev, refreshBounds, { capture: true, passive: true });
window.addEventListener('scroll', refreshBounds, { passive: true });
window.visualViewport?.addEventListener('scroll', refreshBounds);
const onTurn = () => { onWindowResize(); for (const ms of [120, 400, 900]) setTimeout(onWindowResize, ms); };
window.addEventListener('orientationchange', onTurn);
window.addEventListener('pageshow', onWindowResize);
window.visualViewport?.addEventListener('resize', onWindowResize);
setInterval(onWindowResize, 700);

function clear(): void {
  window.removeEventListener('resize', onWindowResize);
  document.documentElement.classList.remove('in-game', 'in-menu');
  game?.destroy(true);
  game = null; scene = null; lobby = null; end = null;
  ui?.destroy();
  ui = null;
  app.innerHTML = '';
}

/** Back to the main menu; in a running match the castle stays in the game and the room's link brings the player back to it. */
async function leaveToMenu(): Promise<void> {
  await net.leaveRoom();
  disarmTutorial();
  crazyRoom(null, false);
  crazyGameplay(false);
  soloRoom = false;
  lastCastle = null; lastLayout = null; lastMap = null; lastSpectator = null; pendingBattles = []; summary = null; progressDelta = null; progressSeen = false;
  setRoute(`/${location.search}`);
  showHome();
}

/** The CrazyGames account's name, when there is one: the name offered while the player has not typed their own. */
let siteName = '';
/** A quick match (the player and bots only) is not a room to invite friends to: the CrazyGames invite button stays away from it. */
let soloRoom = false;

/** The match's music has begun (the clouds have parted): until then the menu music plays on. */
let musicInGame = false;

function showHome(defaults: { code?: string; error?: string } = {}): void {
  musicInGame = false;
  music.scene('lobby');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'home';
  announce();
  new HomeScreen(app, { name: loadName() || siteName, code: defaults.code ?? '', error: defaults.error }, {
    create: async (name) => {
      saveName(name);
      soloRoom = false;
      const r = await net.createRoom(name);
      if (!r.ok) return r.error;
      setRoute(`/oda/${r.code}${location.search}`);
      return null;
    },
    challenges: () => void showChallenges(),
    progress: () => void showProgress(),
    quick: async (name) => {
      saveName(name);
      return quickMatch(name);
    },
    join: async (name, code) => {
      const c = code.trim().toUpperCase();
      if (!/^[A-Z]{6}$/.test(c)) return t('Oda kodu 6 harf olmalı.');
      saveName(name);
      const r = await net.joinRoom(c, name);
      if (!r.ok) return r.error;
      setRoute(`/oda/${r.code}${location.search}`);
      return null;
    },
  });
}

// ---- progress: achievements, mastery, cosmetics --------------------------------------------

/** What the history rules need besides the stored counters: the stars of the challenges and how many fixed challenges there are. */
const metaContext = () => ({ challengeStars: loadStars(), challengeCount: challengeList?.challenges.length ?? 0 });

async function showProgress(): Promise<void> {
  if (!challengeList) { try { challengeList = await net.getChallenges(); } catch { /* an old server: the challenge achievements wait */ } }
  musicInGame = false;
  music.scene('lobby');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'progress';
  recordMeta(metaContext()); // (stars earned meanwhile may have opened history achievements)
  new ProgressScreen(app, metaContext(), { back: () => showHome() });
}

/** The server named the achievements this match earned: they are kept in this browser together with the kingdom's tally. */
function onProgressResult(r: ProgressResult): void {
  if (progressSeen) return;
  progressSeen = true;
  progressDelta = recordMatch(r, metaContext());
  showProgressPanel();
}

function showProgressPanel(): void {
  if (!end) return;
  end.setProgressHtml(progressPanelHtml(progressDelta));
}

// ---- challenge mode ------------------------------------------------------------------------

/** The list of challenges (and today's). An older server that does not know them answers with an error. */
async function showChallenges(error = ''): Promise<void> {
  try { challengeList = await net.getChallenges(); } catch { challengeList = null; }
  if (!challengeList) { showHome({ error: t('Bu sunucuda meydan okuma yok.') }); return; }
  musicInGame = false;
  music.scene('lobby');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'challenges';
  new ChallengeScreen(app, challengeList, { play: (id) => playChallenge(id), back: () => showHome() });
  if (error) { const el = document.getElementById('ch-error'); if (el) el.textContent = tr(error); }
}

/** A room of our own, then the server sets the challenge up (bots, seed, kingdoms) and the match begins. Null when it worked. */
async function playChallenge(id: string): Promise<string | null> {
  soloRoom = true;
  lastChallengeResult = null;
  const r = await net.createRoom(loadName() || siteName);
  if (!r.ok) { soloRoom = false; return r.error ?? null; }
  setRoute(`/oda/${r.code}${location.search}`);
  const go = await net.startChallenge(id, playsFullRules());
  if (!go.ok) {
    await leaveToMenu();
    void showChallenges(go.error ?? '');
    return null;
  }
  countMatch();
  return null;
}

/** Saves the stars and shows the goals on the end screen, once both the result and the screen are there. */
function applyChallengeResult(): void {
  if (!end || !lastChallengeResult) return;
  const r = lastChallengeResult;
  lastChallengeResult = null;
  const before = saveStars(r.id, r.stars);
  // (the stars may have opened history achievements: add them to the progress block)
  const more = recordMeta(metaContext());
  progressDelta = mergeDelta(progressDelta, more);
  if (progressDelta === null && (more.newAchievements.length || more.newCosmetics.length)) progressDelta = { newAchievements: more.newAchievements, newCosmetics: more.newCosmetics, kingdom: null, won: r.won, masteryBefore: 0, masteryAfter: 0, winsAfter: 0 };
  showProgressPanel();
  const list = challengeList;
  const card = list ? (r.id.startsWith('daily-') ? list.daily : list.challenges.find((c) => c.id === r.id) ?? null) : null;
  const next = card && list && r.stars >= 1 ? nextOf(card, list) : null;
  end.challenge = {
    retry: async () => { const b = await net.backToLobby(); return b.ok ? ((await net.startChallenge(card && card.daily ? 'daily' : r.id)).error ?? null) : b.error ?? null; },
    next: async () => { if (!next) return null; const b = await net.backToLobby(); return b.ok ? ((await net.startChallenge(next.id)).error ?? null) : b.error ?? null; },
    list: () => void leaveToMenu().then(() => showChallenges()),
  };
  end.setChallengeResult(resultHtml(card, r, before), !!next);
  end.update(lastEndRoom!);
}

/** "Hızlı oyna": a room of our own with three bots (a mix of Easy and Medium), everybody ready, and off it goes; deck and kingdom are drawn by lot. Null when it worked. */
async function quickMatch(name: string): Promise<string | null> {
  soloRoom = true;
  const r = await net.createRoom(name);
  if (!r.ok) soloRoom = false;
  if (!r.ok) return r.error;
  setRoute(`/oda/${r.code}${location.search}`);
  // The very first Quick play is the guided one: three Easy bots and the interactive tutorial (ui/tutorial.ts).
  const guided = !tutorialDone();
  const fail = (error: string | null | undefined): string | null => { disarmTutorial(); return error ?? null; };
  // The first three matches of a browser have easy bots (the first one is the guided match, which counts); later a mix.
  const levels: BotLevel[] = guided || newPlayer() ? ['easy', 'easy', 'easy'] : ['easy', 'medium', Math.random() < 0.5 ? 'easy' : 'medium'];
  for (const level of guided ? levels : levels.sort(() => Math.random() - 0.5)) {
    const a = await net.addBot(level);
    if (!a.ok) return fail(a.error);
  }
  if ((guided || newPlayer()) && !playsFullRules()) { const st = await net.setStarter(true); if (!st.ok) return fail(st.error); }
  if (guided) { const g = await net.setGuided(true); if (!g.ok) return fail(g.error); }
  const ready = await net.setReady(true);
  if (!ready.ok) return fail(ready.error);
  if (guided) armTutorial();
  const go = await net.startMatch();
  if (go.ok) countMatch();
  return go.ok ? null : fail(go.error);
}

function showLobby(r: RoomView): void {
  disarmTutorial();
  musicInGame = false;
  music.scene('lobby');
  setBotSeats(r.players);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'lobby';
  lastCastle = null;
  lastLayout = null;
  lastMap = null;
  lastSpectator = null;
  pendingBattles = [];
  summary = null; progressDelta = null; progressSeen = false;
  setLeaveAction(null);
  lobby = new LobbyScreen(app, net, net.seat, r, saveName, () => void leaveToMenu());
}

function showGame(): void {
  // The clouds close over the lobby; they part when the map is up.
  curtain.cover();
  clear();
  setLeaveAction(() => void leaveToMenu());
  screen = 'game';
  document.documentElement.classList.add('in-game');
  // The map fills the window and never scrolls; the UI layer (top bar, windows, ribbons) sits on top of it.
  app.innerHTML = `
    <main class="game">
      <div id="stage"></div>
      <div id="ui" class="ui-root"></div>
    </main>`;
  armBack();
  ui = new GameUi(document.getElementById('ui')!, net, net.seat, () => scene?.centerOnCastle());
  ui.setStatus(status, status === statusText.connected);
  ui.fall = fallActions;
  if (import.meta.env.DEV) (window as unknown as { keepfallUi: GameUi }).keepfallUi = ui;
  showFirstTimeGuide(); // only in the very first match of this browser (before the first castle state: the kingdom decree waits for it)
  if (lastCastle) onCastle(lastCastle);
}

/** The buttons of the card a fallen player gets (ui/game-ui.ts): out of a match that is still going, or straight into the next one. */
const fallActions: FallActions = {
  // Only bots are left in the match: it is played out on the server first, so the room does not keep ticking for nobody.
  menu: async (finishFirst) => {
    if (finishFirst) await net.finishMatch();
    await leaveToMenu();
    return null;
  },
  // Alone with bots: the rest of the match is played out on the server, and the same group starts again.
  newMatch: async () => {
    const f = await net.finishMatch();
    if (!f.ok) return f.error ?? null;
    let r = await net.backToLobby();
    if (r.ok) r = await net.setReady(true);
    if (r.ok) r = await net.startMatch();
    if (r.ok) countMatch();
    return r.ok ? null : r.error ?? null;
  },
  // Out of the room (the match goes on for the others, the seat does not turn into a bot) and into a room of our own.
  newRoom: async () => {
    const name = loadName() || siteName;
    await leaveToMenu();
    soloRoom = false;
    const r = await net.createRoom(name);
    if (!r.ok) return r.error ?? null;
    setRoute(`/oda/${r.code}${location.search}`);
    return null;
  },
};

/** A number from the room code: the same for everybody in the room, so the decorations of the map come out the same. */
function seedOf(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}

/** The scene is drawn in the player's colour on the shared map, so it starts once both have arrived. */
function startScene(color: CastleView['color'], layout: MapLayoutView): void {
  scene = new WorldScene(color, layout, net.seat, seedOf(net.roomCode ?? ''));
  scene.onReady = () => {
    curtain.open();
    musicInGame = true;
    if (lastCastle?.phase === 'war') music.scene('war'); // (back into a war already on: no opening piece)
    else music.intro('prep'); // the clouds part: the opening piece plays once, then the preparation music comes in
  };
  ui?.attach(scene);
  const world = scene;
  world.minimap = new Minimap(document.getElementById('stage')!, layout, (tile) => world.lookAt(tile));
  if (lastMap) scene.setMap(lastMap);
  for (const b of pendingBattles) scene.playBattle(b);
  pendingBattles = [];
  if (lastSpectator) scene.setSpectator(lastSpectator);
  // Dev only: lets the console preview other building levels / counts without playing up to them.
  if (import.meta.env.DEV) (window as unknown as { keepfallScene: WorldScene }).keepfallScene = scene;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'stage',
    // The canvas is the whole window. Phaser's own RESIZE mode misses a window that shrinks, so the size
    // is set here and followed explicitly (window events, and every frame in WorldScene.update).
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#47aba9',
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE },
    // Only events that hit the canvas count: by default Phaser also listens on the window, so a click on a UI
    // window, the top bar or the minimap would reach the map underneath.
    input: { windowEvents: false },
    scene,
  });
  window.addEventListener('resize', onWindowResize);
  game.events.once('ready', () => {
    if (!game?.canvas) return;
    watchGlContext(game.canvas);
    // A touch is turned into a point of the canvas from the canvas's position measured NOW (not the one Phaser measured last): whatever moved the canvas
    // since (Safari's address bar, a keyboard, a scroll), the point is where the finger is.
    const canvas = game.canvas, scale = game.scale;
    scale.transformX = (pageX: number) => { const r = canvas.getBoundingClientRect(); return (pageX - (r.left + window.scrollX)) * (scale.gameSize.width / Math.max(1, r.width)); };
    scale.transformY = (pageY: number) => { const r = canvas.getBoundingClientRect(); return (pageY - (r.top + window.scrollY)) * (scale.gameSize.height / Math.max(1, r.height)); };
  });
}

function showEnd(r: RoomView): void {
  disarmTutorial();
  musicInGame = false;
  music.hushThen('lobby', 6.5); // the victory or defeat sound has the room first, then the menu music returns
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'end';
  end = new EndScreen(app, net, net.seat);
  fadeFrom('#0b0a14', 900);
  if (summary) end.setSummary(summary);
  lastEndRoom = r;
  end.update(r);
  applyChallengeResult(); // (the result may have come before the screen)
  showProgressPanel();
}

function hideBanner(): void { document.getElementById('banner')?.remove(); }

function showBanner(text: string, onClick?: () => void): void {
  let el = document.getElementById('banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'banner';
    el.className = 'banner danger top';
    document.body.prepend(el);
  }
  el.textContent = text;
  el.style.pointerEvents = onClick ? 'auto' : '';
  el.style.cursor = onClick ? 'pointer' : '';
  el.onclick = onClick ?? null;
}

// ---- start ---------------------------------------------------------------------------------

// ---- the same player in a second tab: the newer tab takes the seat, the older one steps aside ----------------------------------------------------------
const TAB_ID = Math.random().toString(36).slice(2);
const tabs = 'BroadcastChannel' in window ? new BroadcastChannel('keepfall-tab') : null;
tabs?.addEventListener('message', (e) => {
  const m = e.data as { type: string; id: string; code?: string; to?: string };
  if (m.type === 'claim' && m.id !== TAB_ID && m.code && m.code === net.roomCode && !net.retired) {
    tabs.postMessage({ type: 'ack', id: TAB_ID, to: m.id });
    void stepAside();
  }
});
async function stepAside(): Promise<void> {
  await net.retire();
  document.getElementById('banner')?.remove();
  const box = document.createElement('div');
  box.className = 'guide-overlay';
  box.style.zIndex = '90000';
  box.innerHTML = `<div class="guide paper" role="alertdialog"><div class="ribbon ribbon-blue guide-title">${t('Başka bir sekmede açık')}</div><div class="guide-body"><p>${t('Keepfall bu tarayıcıda başka bir sekmede açıldı ve koltuğunu o aldı. Burada oynamaya devam etmek için sayfayı yenile.')}</p><section class="set-links"><button class="btn btn-red" data-act="reload">${t('Sayfayı yenile')}</button></section></div></div>`;
  box.querySelector('[data-act="reload"]')!.addEventListener('click', () => location.reload());
  document.body.appendChild(box);
}
/** Before taking a seat back: if another tab of ours holds it, ask it to let go (it answers within a moment) and wait for the line to drop. */
async function claimSeat(code: string): Promise<void> {
  if (!tabs) return;
  const answered = await new Promise<boolean>((resolve) => {
    const on = (e: MessageEvent) => { const m = e.data as { type: string; to?: string }; if (m.type === 'ack' && m.to === TAB_ID) { tabs.removeEventListener('message', on); resolve(true); } };
    tabs.addEventListener('message', on);
    tabs.postMessage({ type: 'claim', id: TAB_ID, code });
    setTimeout(() => { tabs.removeEventListener('message', on); resolve(false); }, 350);
  });
  if (answered) await new Promise((r) => setTimeout(r, 1200));
}

// The server and the page must speak the same version: told once, when the line is up.
async function checkVersion(): Promise<void> {
  const server = await net.serverProtocol();
  if (server !== null && server !== PROTOCOL) showBanner(t('Keepfall yeni sürüme geçti. Yenilemek için buraya tıkla.'), () => location.reload());
}

// The back button (Android): in a match it closes the window that is open, or asks "Leave the match?"; elsewhere it is the old behaviour.
const BACK = { kfBack: 1 };
function armBack(): void { if (!embedded && !history.state?.kfBack) history.pushState(BACK, ''); }
window.addEventListener('popstate', () => {
  if (screen === 'game' && ui) {
    armBack();
    if (!ui.closeTop()) confirmLeave();
    return;
  }
  location.reload();
});
// A phone that slept, a tab that was in the background, a network that came back: check the line (and take the seat back if it dropped).
document.addEventListener('visibilitychange', () => { if (!document.hidden) void net.recheck(); });
window.addEventListener('online', () => void net.recheck());

/**
 * The CrazyGames build connects with a plain "Connecting to server..." and no explanation: an attempt that takes longer than 8 seconds is dropped and made
 * again by itself (a sleeping hosted server needs a while), and after a minute without a connection there is a "Retry" button.
 */
async function connectOnSite(): Promise<void> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  for (;;) {
    app.innerHTML = `<div class="screen kf-connect"><div class="kf-spinner" aria-hidden="true"></div><p>${t('Sunucuya bağlanılıyor...')}</p></div>`;
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      const attempt = net.start();
      attempt.catch(() => undefined);
      const result = await Promise.race([attempt.then(() => true, () => false), sleep(8000).then(() => null)]);
      if (result === true) return;
      await net.abort(); // the attempt that failed or hung is dropped before the next one
      await sleep(1000);
    }
    await new Promise<void>((resolve) => {
      app.innerHTML = `<div class="screen kf-connect"><p>${t('Bağlanılamadı.')}</p><button class="btn" id="kf-retry">${t('Yeniden dene')}</button></div>`;
      document.getElementById('kf-retry')!.addEventListener('click', () => resolve());
    });
  }
}

async function main(): Promise<void> {
  applyCalm(); // "Efektleri azalt" / low graphics: the interface's small movements are off
  // CrazyGames build only: loading starts here, before anything is fetched: the site's SDK (nothing happens anywhere else); loadingStop comes when the lobby is up.
  const onSite = await initCrazy();
  await initSteam(); // Steam build with Steam running: progress goes through Steamworks (achievements, cloud); otherwise nothing happens
  if (onSite) {
    siteName = (await crazyUsername()) ?? '';
    watchCrazySettings((s) => { setSiteChatOff(s.disableChat); sfx.setSiteMuted(s.muteAudio); });
    onCrazyJoin((code) => void joinInvite(code));
  }
  watchUiScale();
  // The UI art is cut once; without it the UI falls back to plain boxes. Never wait long for it: it
  // can stall in a background tab, and it switches itself on whenever it is ready.
  await Promise.race([loadUiArt(), new Promise((resolve) => setTimeout(resolve, 2500))]);
  if (CRAZY) {
    await connectOnSite();
  } else {
    try {
      await net.start();
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="screen"><p class="banner danger">${t('Sunucuya bağlanılamadı.')} <code>dotnet run --project src/Keepfall.Server</code> ${t('çalışıyor mu?')}</p></div>`;
      return;
    }
  }
  if (DIRECTOR_KEY) { await startDirector(DIRECTOR_KEY); return; }
  // A room in the address: /oda/KOD (the page's own address) or ?room=KOD (an invitation link; the CrazyGames link carries it too)
  const asked = FEATURE_PRIVATE_ROOM ? new URLSearchParams(location.search).get('room') : null;
  const named = !FEATURE_PRIVATE_ROOM ? null : /^\/oda\/([A-Za-z]{6})\/?$/.exec(currentRoute())?.[1]?.toUpperCase() ?? (asked && /^[A-Za-z]{6}$/.test(asked) ? asked.toUpperCase() : null) ?? crazyInviteRoom();
  const resumed = !named && loadActiveRoom() !== null;
  const code = named ?? loadActiveRoom();
  void checkVersion();
  if (!code) {
    if (crazyInstant()) {
      // The site's "play with friends": straight into a private room of our own (the lobby), joinable at once.
      const made = await net.createRoom(loadName() || siteName);
      crazyLoaded();
      if (made.ok) return;
    }
    showHome();
    crazyLoaded();
    return;
  }
  await claimSeat(code);
  const r = await net.joinRoom(code, loadName() || siteName);
  crazyLoaded();
  if (!r.ok) {
    setRoute(`/${location.search}`, 'replace');
    // A return to the room we were in a moment ago that no longer exists is not an error worth showing: the home screen simply comes up.
    markActiveRoom(null);
    showHome(resumed ? {} : { code, error: tr(r.error ?? t('Odaya katılınamadı.')) });
  }
}

/**
 * The director page: picks the match to watch (`&room=CODE`, else the running match with the most people, waiting for one if there is none),
 * hides the interface and the pointer, and lets the camera direct itself.
 */
async function startDirector(key: string): Promise<void> {
  document.documentElement.classList.add('kf-director');
  const state: { phase?: string; room?: string; error?: string; log: unknown[]; cam?: unknown } = { log: [] };
  (window as unknown as { keepfallDirector: typeof state }).keepfallDirector = state;
  const show = (text: string) => { app.innerHTML = `<div class="screen director-wait"><p class="banner">${text}</p></div>`; };
  const wanted = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
  for (;;) {
    const rooms = await net.directorRooms(key).catch(() => null);
    if (!rooms) { state.error = 'refused'; show('Director: refused (no Keepfall__DirectorKey on the server, wrong key, or a hosted/Steam server).'); return; }
    const live = rooms.filter((r) => r.phase === 'Preparation' || r.phase === 'War');
    const pick = wanted ? live.find((r) => r.code === wanted) : live.sort((a, b) => b.humans - a.humans || b.elapsedSeconds - a.elapsedSeconds)[0];
    if (pick) {
      const { DirectorCamera } = await import('./director');
      directorCam = new DirectorCamera(() => scene, () => lastLayout);
      state.log = directorCam.log;
      state.cam = directorCam;
      const r = await net.directorWatch(key, pick.code);
      if (r.ok) { state.room = pick.code; return; }
      directorCam.stop(); directorCam = null;
    }
    show(`Director: waiting for a match${wanted ? ' in room ' + wanted : ''}…`);
    await new Promise((res) => setTimeout(res, 3000));
  }
}

/** A friend's invitation arrives while we are in the game: leave what we are doing and join that room. */
async function joinInvite(code: string): Promise<void> {
  if (screen !== 'home' && screen !== 'none') await leaveToMenu();
  const r = await net.joinRoom(code, loadName() || siteName);
  if (!r.ok) showHome({ code, error: tr(r.error ?? t('Odaya katılınamadı.')) });
}

void main();
