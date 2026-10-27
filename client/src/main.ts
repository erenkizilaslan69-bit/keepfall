import Phaser from 'phaser';
import './style.css';
import { GameUi } from './ui/game-ui';
import { loadName, saveName } from './identity';
import { GameConnection, type ConnectionStatus } from './net';
import { WorldScene } from './scene/WorldScene';
import { loadUiArt } from './ui/sprites';
import { watchUiScale } from './ui/scale';
import './ui/ui.css';
import './ui/theme.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-ext-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/pixelify-sans/latin-ext-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-ext-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-ext-700.css';
import { Minimap } from './minimap';
import { EndScreen, HomeScreen, LobbyScreen } from './screens';
import { setBotSeats } from './format';
import { music, sfx } from './audio';
import { mountGuideButton } from './ui/guide';
import { CloudCurtain } from './ui/clouds';
import { warmUp } from './preload';
import { mountScenery } from './ui/scenery';
import { mountSettingsButton, setLeaveAction } from './ui/settings';
import { guarded, installErrorReporting } from './error-report';
import type { BattleStartedView, CastleView, MapLayoutView, MapStateView, RoomView, SpectatorStateView, SummaryView } from './types';

// Routes: "/" is the home screen, "/oda/ABCD" is a room. Inside a room the screen follows the
// room's phase: lobby → game (preparation and war) → end screen.

const app = document.getElementById('app')!;

const statusText: Record<ConnectionStatus, string> = {
  connecting: 'bağlanıyor…',
  connected: 'bağlı',
  reconnecting: 'bağlantı koptu, yeniden deneniyor…',
  disconnected: 'bağlantı yok — sunucu çalışıyor mu?',
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

mountGuideButton(); // the "?" for the menus (in the game it is in the top bar)
mountSettingsButton(); // the gear next to it

// Sound: browsers start it only after a gesture; every button press gets a small click.
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true });
document.addEventListener('click', (e) => { if ((e.target as HTMLElement | null)?.closest?.('button')) sfx.play('click'); }, true);

installErrorReporting(() => ({
  room: /^\/oda\/([A-Za-z]{4})/.exec(location.pathname)?.[1]?.toUpperCase(),
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
    if (s === 'disconnected' && screen !== 'home') showBanner('Sunucuyla bağlantı yok. Sayfayı yenileyince kaldığın yere dönersin.');
  },
});

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
}

function onCastle(c: CastleView): void {
  lastCastle = c;
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
  lastCastle = null; lastLayout = null; lastMap = null; lastSpectator = null; pendingBattles = []; summary = null;
  history.pushState(null, '', `/${location.search}`);
  showHome();
}

function showHome(defaults: { code?: string; error?: string } = {}): void {
  music.scene('prep');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'home';
  new HomeScreen(app, { name: loadName(), code: defaults.code ?? '', error: defaults.error }, {
    create: async (name) => {
      saveName(name);
      const r = await net.createRoom(name);
      if (!r.ok) return r.error;
      history.pushState(null, '', `/oda/${r.code}${location.search}`);
      return null;
    },
    join: async (name, code) => {
      const c = code.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(c)) return 'Oda kodu 4 harf olmalı.';
      saveName(name);
      const r = await net.joinRoom(c, name);
      if (!r.ok) return r.error;
      history.pushState(null, '', `/oda/${r.code}${location.search}`);
      return null;
    },
  });
}

function showLobby(r: RoomView): void {
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
}

function showEnd(r: RoomView): void {
  music.scene('prep');
  setLeaveAction(null);
  clear();
  document.documentElement.classList.add('in-menu');
  screen = 'end';
  end = new EndScreen(app, net, net.seat);
  if (summary) end.setSummary(summary);
  end.update(r);
}

function showBanner(text: string): void {
  let el = document.getElementById('banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'banner';
    el.className = 'banner danger top';
    document.body.prepend(el);
  }
  el.textContent = text;
}

// ---- start ---------------------------------------------------------------------------------

window.addEventListener('popstate', () => location.reload());

async function main(): Promise<void> {
  watchUiScale();
  // The UI art is cut once; without it the UI falls back to plain boxes. Never wait long for it: it
  // can stall in a background tab, and it switches itself on whenever it is ready.
  await Promise.race([loadUiArt(), new Promise((resolve) => setTimeout(resolve, 2500))]);
  try {
    await net.start();
  } catch (e) {
    console.error(e);
    app.innerHTML = '<div class="screen"><p class="banner danger">Sunucuya bağlanılamadı. <code>dotnet run --project src/Keepfall.Server</code> çalışıyor mu?</p></div>';
    return;
  }
  const code = /^\/oda\/([A-Za-z]{4})\/?$/.exec(location.pathname)?.[1]?.toUpperCase();
  if (!code) { showHome(); return; }
  const r = await net.joinRoom(code, loadName());
  if (!r.ok) {
    history.replaceState(null, '', `/${location.search}`);
    showHome({ code, error: r.error ?? 'Odaya katılınamadı.' });
  }
}

void main();
