import Phaser from 'phaser';
import './style.css';
import { Hud } from './hud';
import { loadName, saveName } from './identity';
import { GameConnection, type ConnectionStatus } from './net';
import { SCENE_HEIGHT, SCENE_WIDTH, WorldScene } from './scene/WorldScene';
import { EndScreen, HomeScreen, LobbyScreen, rosterHtml } from './screens';
import type { CastleView, MapLayoutView, RoomView, SummaryView } from './types';

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
let summary: SummaryView | null = null;
let status = '';

let lobby: LobbyScreen | null = null;
let end: EndScreen | null = null;
let hud: Hud | null = null;
let game: Phaser.Game | null = null;
let scene: WorldScene | null = null;

const net = new GameConnection({
  room: onRoom,
  castle: onCastle,
  mapLayout: (layout) => {
    lastLayout = layout;
    if (screen === 'game' && !scene && lastCastle) onCastle(lastCastle);
  },
  mapState: () => {},
  matchEnded: (s) => { summary = s; end?.setSummary(s); },
  notification: (text) => hud?.notify(text),
  status: (s) => {
    status = statusText[s];
    hud?.setStatus(status);
    if (s === 'disconnected' && screen !== 'home') showBanner('Sunucuyla bağlantı yok. Sayfayı yenileyince kaldığın yere dönersin.');
  },
});

// ---- room events ---------------------------------------------------------------------------

function onRoom(r: RoomView): void {
  const wanted: Screen = r.phase === 'lobby' ? 'lobby' : r.phase === 'ended' ? 'end' : 'game';
  if (wanted !== screen) {
    if (wanted === 'lobby') showLobby(r);
    else if (wanted === 'game') showGame();
    else showEnd(r);
  }
  if (screen === 'lobby') lobby!.update(r);
  else if (screen === 'game') {
    document.getElementById('roster')!.innerHTML = rosterHtml(r, net.seat);
    hud?.setRoom(r);
  }
  else if (screen === 'end') end!.update(r);
}

function onCastle(c: CastleView): void {
  lastCastle = c;
  if (c.summary) { summary = c.summary; end?.setSummary(c.summary); }
  if (screen === 'game') {
    hud!.update(c);
    if (!scene && lastLayout) startScene(c.color, lastLayout);
    scene?.setState(c);
  }
}

// ---- screens -------------------------------------------------------------------------------

function clear(): void {
  game?.destroy(true);
  game = null; scene = null; hud = null; lobby = null; end = null;
  app.innerHTML = '';
}

function showHome(defaults: { code?: string; error?: string } = {}): void {
  clear();
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
  clear();
  screen = 'lobby';
  lastCastle = null;
  lastLayout = null;
  summary = null;
  lobby = new LobbyScreen(app, net, net.seat, r, saveName);
}

function showGame(): void {
  clear();
  screen = 'game';
  app.innerHTML = `
    <main class="game">
      <div id="stage"><button id="home-cam" class="stage-btn" title="Kamerayı kalene getirir (boşluk tuşu)">Kaleme dön</button></div>
      <aside id="panel"><div id="roster"></div><div id="hud"><p class="muted">Kale hazırlanıyor…</p></div></aside>
    </main>`;
  hud = new Hud(document.getElementById('hud')!, net);
  document.getElementById('home-cam')!.addEventListener('click', () => scene?.centerOnCastle());
  hud.setStatus(status);
  if (lastCastle) onCastle(lastCastle);
}

/** The scene is drawn in the player's colour on the shared map, so it starts once both have arrived. */
function startScene(color: CastleView['color'], layout: MapLayoutView): void {
  scene = new WorldScene(color, layout, net.seat);
  scene.onBuildingClick = (type) => hud?.focusBuilding(type);
  // Dev only: lets the console preview other building levels / counts without playing up to them.
  if (import.meta.env.DEV) (window as unknown as { keepfallScene: WorldScene }).keepfallScene = scene;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'stage',
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    backgroundColor: '#47aba9',
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene,
  });
}

function showEnd(r: RoomView): void {
  clear();
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
