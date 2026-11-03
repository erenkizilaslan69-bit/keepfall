import Phaser from 'phaser';
import './style.css';
import { GameUi } from './ui/game-ui';
import { loadActiveRoom, loadName, markActiveRoom, saveName } from './identity';
import { GameConnection, type ConnectionStatus } from './net';
import { WorldScene } from './scene/WorldScene';
import { loadUiArt } from './ui/sprites';
import { watchUiScale } from './ui/scale';
import './ui/ui.css';
import './ui/theme.css';
import './ui/kf-art.css';
import './ui/touch.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-ext-700.css';
import { Minimap } from './minimap';
import { EndScreen, HomeScreen, LobbyScreen } from './screens';
import { setBotSeats } from './format';
import { t, tr } from './i18n';
import { installTouch } from './ui/touch';
import { startDiagnostics, watchGlContext } from './diagnostics';
import { music, sfx } from './audio';
import { mountGuideButton, showFirstTimeGuide } from './ui/guide';
import { CloudCurtain } from './ui/clouds';
import { fadeFrom } from './ui/transitions';
import { warmUp } from './preload';
import { mountScenery } from './ui/scenery';
import { loadHorse } from './scene/HorseArt';
import { mountLangButton, mountSettingsButton, setLeaveAction } from './ui/settings';
import { startFpsMeter } from './ui/fps-meter';
import { armTutorial, disarmTutorial, tutorialDone } from './ui/tutorial';
import { CRAZY } from './crazy';
import { crazyGameplay, crazyInstant, crazyInviteRoom, crazyLoaded, crazyRoom, crazyUsername, initCrazy, onCrazyJoin, watchCrazySettings } from './crazy';
import { setSiteChatOff } from './prefs';
import { guarded, installErrorReporting } from './error-report';
import type { BattleStartedView, BotLevel, CastleView, MapLayoutView, MapStateView, RoomView, SpectatorStateView, SummaryView } from './types';
import { currentRoute, setRoute } from './env';

// Routes: "/" is the home screen, "/oda/ABCD" is a room. Inside a room the screen follows the
// room's phase: lobby → game (preparation and war) → end screen.

const app = document.getElementById('app')!;

const statusText: Record<ConnectionStatus, string> = {
  connecting: t('bağlanıyor…'),
  connected: t('bağlı'),
  reconnecting: t('bağlantı koptu, yeniden deneniyor…'),
  disconnected: t('bağlantı yok — sunucu çalışıyor mu?'),
  roomLost: t('oda kapandı'),
};

type Screen = 'none' | 'home' | 'lobby' | 'game' | 'end';
let screen: Screen = 'none';
let lastCastle: CastleView | null = null;
let lastLayout: MapLayoutView | null = null;
let lastMap: MapStateView | null = null;
let pendingBattles: BattleStartedView[] = [];
let lastSpectator: SpectatorStateView | null = null;
let summary: SummaryView | null = null;
let status = '';

installTouch();
mountGuideButton(); // the "?" for the menus (in the game it is in the top bar)
mountSettingsButton(); // the gear next to it
mountLangButton(); // and the TR / EN switch

// Sound: browsers start it only after a gesture; every button press gets a small click.
// (iOS only lets a sound start from the end of a touch or a click, so those unlock it as well)
for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true });
document.addEventListener('click', (e) => { if ((e.target as HTMLElement | null)?.closest?.('button')) sfx.play('click'); }, true);

void loadHorse();
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
    for (const b of frame.started) {
      if (scene) scene.playBattle(b);
      else pendingBattles.push(b);
    }
    guarded('spectator-state', () => ui?.setSpectating(lastCastle ? Math.max(0, lastCastle.elapsedSeconds - frame.elapsedSeconds) : 0), 'ui');
    guarded('spectator-state', () => scene?.setSpectator(frame), 'scene');
  },
  spectatorWait: (wait) => ui?.setSpectatorWait(wait.startsIn),
  matchEnded: (s) => { summary = s; end?.setSummary(s); },
  notification: (text) => ui?.notify(text),
  status: (s) => {
    status = statusText[s];
    ui?.setStatus(status, s === 'connected');
    if (s === 'reconnecting' && screen !== 'home' && screen !== 'game') showBanner(t('Yeniden bağlanılıyor...'));
    if (s === 'connected') hideBanner();
    if (s === 'disconnected' && screen !== 'home') showBanner(t('Sunucuyla bağlantı yok. Sayfayı yenileyince kaldığın yere dönersin.'));
    if (s === 'roomLost') showBanner(t('Oda kapanmış (sunucu yeniden başlamış olabilir). Ana menüye dönmek için buraya tıkla.'), () => location.assign('/'));
  },
});
startFpsMeter(net);
startDiagnostics({ game: () => game, scene: () => scene, net });

// Dev only: lets the console (and browser tests) send commands as this tab's player.
if (import.meta.env.DEV) (window as unknown as { keepfallNet: GameConnection }).keepfallNet = net;
if (import.meta.env.DEV) (window as unknown as { keepfallAudio: unknown }).keepfallAudio = { sfx, music };

// ---- room events ---------------------------------------------------------------------------

function onRoom(r: RoomView): void {
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
  else if (screen === 'end') end!.update(r);
  // The site (CrazyGames) learns which room we are in, and that friends may join only while it is a lobby.
  crazyRoom(r.code, r.phase === 'lobby' && !soloRoom);
  crazyGameplay(screen === 'game' && !lastCastle?.eliminated);
}

function onCastle(c: CastleView): void {
  lastCastle = c;
  if (screen === 'game') crazyGameplay(!c.eliminated); // an eliminated player only watches: the site is told the play has stopped
  if (c.summary) { summary = c.summary; end?.setSummary(c.summary); }
  if (screen === 'game') {
    music.scene(c.phase === 'war' ? 'war' : 'prep'); // the lively track for the war, the calm one before it
    guarded('castle-state', () => ui?.update(c), 'ui');
    guarded('castle-state', () => { if (!scene && lastLayout) startScene(c.color, lastLayout); }, 'start scene');
    guarded('castle-state', () => scene?.setState(c), 'scene');
  }
}

// ---- screens -------------------------------------------------------------------------------

const onWindowResize = () => game?.scale.resize(window.innerWidth, window.innerHeight);

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
  lastCastle = null; lastLayout = null; lastMap = null; lastSpectator = null; pendingBattles = []; summary = null;
  setRoute(`/${location.search}`);
  showHome();
}

/** The CrazyGames account's name, when there is one: the name offered while the player has not typed their own. */
let siteName = '';
/** A quick match (the player and bots only) is not a room to invite friends to: the CrazyGames invite button stays away from it. */
let soloRoom = false;

function showHome(defaults: { code?: string; error?: string } = {}): void {
  music.scene('prep');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'home';
  new HomeScreen(app, { name: loadName() || siteName, code: defaults.code ?? '', error: defaults.error }, {
    create: async (name) => {
      saveName(name);
      soloRoom = false;
      const r = await net.createRoom(name);
      if (!r.ok) return r.error;
      setRoute(`/oda/${r.code}${location.search}`);
      return null;
    },
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
  const levels: BotLevel[] = guided ? ['easy', 'easy', 'easy'] : ['easy', 'medium', Math.random() < 0.5 ? 'easy' : 'medium'];
  for (const level of guided ? levels : levels.sort(() => Math.random() - 0.5)) {
    const a = await net.addBot(level);
    if (!a.ok) return fail(a.error);
  }
  if (guided) { const g = await net.setGuided(true); if (!g.ok) return fail(g.error); }
  const ready = await net.setReady(true);
  if (!ready.ok) return fail(ready.error);
  if (guided) armTutorial();
  const go = await net.startMatch();
  return go.ok ? null : fail(go.error);
}

function showLobby(r: RoomView): void {
  disarmTutorial();
  music.scene('prep');
  setBotSeats(r.players);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'lobby';
  lastCastle = null;
  lastLayout = null;
  lastMap = null;
  lastSpectator = null;
  pendingBattles = [];
  summary = null;
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
  ui = new GameUi(document.getElementById('ui')!, net, net.seat, () => scene?.centerOnCastle());
  ui.setStatus(status, status === statusText.connected);
  if (import.meta.env.DEV) (window as unknown as { keepfallUi: GameUi }).keepfallUi = ui;
  showFirstTimeGuide(); // only in the very first match of this browser (before the first castle state: the kingdom decree waits for it)
  if (lastCastle) onCastle(lastCastle);
}

/** A number from the room code: the same for everybody in the room, so the decorations of the map come out the same. */
function seedOf(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}

/** The scene is drawn in the player's colour on the shared map, so it starts once both have arrived. */
function startScene(color: CastleView['color'], layout: MapLayoutView): void {
  scene = new WorldScene(color, layout, net.seat, seedOf(net.roomCode ?? ''));
  scene.onReady = () => curtain.open();
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
  game.events.once('ready', () => { if (game?.canvas) watchGlContext(game.canvas); });
}

function showEnd(r: RoomView): void {
  disarmTutorial();
  music.scene('prep');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'end';
  end = new EndScreen(app, net, net.seat);
  fadeFrom('#0b0a14', 900);
  if (summary) end.setSummary(summary);
  end.update(r);
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

window.addEventListener('popstate', () => location.reload());
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
  // CrazyGames build only: loading starts here, before anything is fetched: the site's SDK (nothing happens anywhere else); loadingStop comes when the lobby is up.
  const onSite = await initCrazy();
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
  // A room in the address: /oda/KOD (the page's own address) or ?room=KOD (an invitation link; the CrazyGames link carries it too)
  const asked = new URLSearchParams(location.search).get('room');
  const named = /^\/oda\/([A-Za-z]{6})\/?$/.exec(currentRoute())?.[1]?.toUpperCase() ?? (asked && /^[A-Za-z]{6}$/.test(asked) ? asked.toUpperCase() : null) ?? crazyInviteRoom();
  const resumed = !named && loadActiveRoom() !== null;
  const code = named ?? loadActiveRoom();
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
  const r = await net.joinRoom(code, loadName() || siteName);
  crazyLoaded();
  if (!r.ok) {
    setRoute(`/${location.search}`, 'replace');
    // A return to the room we were in a moment ago that no longer exists is not an error worth showing: the home screen simply comes up.
    markActiveRoom(null);
    showHome(resumed ? {} : { code, error: tr(r.error ?? t('Odaya katılınamadı.')) });
  }
}

/** A friend's invitation arrives while we are in the game: leave what we are doing and join that room. */
async function joinInvite(code: string): Promise<void> {
  if (screen !== 'home' && screen !== 'none') await leaveToMenu();
  const r = await net.joinRoom(code, loadName() || siteName);
  if (!r.ok) showHome({ code, error: tr(r.error ?? t('Odaya katılınamadı.')) });
}

void main();
