import Phaser from 'phaser';
import './style.css';
import { Hud } from './hud';
import { GameConnection, type ConnectionStatus } from './net';
import { CastleScene, SCENE_HEIGHT, SCENE_WIDTH } from './scene/CastleScene';

const scene = new CastleScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: SCENE_WIDTH,
  height: SCENE_HEIGHT,
  backgroundColor: '#47aba9',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene,
});

const statusText: Record<ConnectionStatus, string> = {
  connecting: 'bağlanıyor…',
  connected: 'bağlı',
  reconnecting: 'bağlantı koptu, yeniden deneniyor…',
  disconnected: 'bağlantı yok — sunucu çalışıyor mu?',
};

let hud: Hud | null = null;
const net = new GameConnection(
  (state) => {
    hud!.update(state);
    scene.setState(state);
  },
  (status) => hud?.setStatus(statusText[status]),
);
hud = new Hud(document.getElementById('panel')!, net);
scene.onBuildingClick = (type) => hud!.focusBuilding(type);
// Dev only: lets the console preview other building levels / counts without playing up to them.
if (import.meta.env.DEV) (window as unknown as { keepfallScene: CastleScene }).keepfallScene = scene;

net.start().catch((e) => {
  console.error(e);
  document.getElementById('panel')!.innerHTML =
    '<p class="banner danger">Sunucuya bağlanılamadı. <code>dotnet run --project src/Keepfall.Server</code> çalışıyor mu?</p>';
});
