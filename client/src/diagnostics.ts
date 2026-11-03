import type Phaser from 'phaser';
import type { GameConnection } from './net';
import { errorCounts, reportDiag } from './error-report';

// What the game costs the device, in numbers: textures (and the memory they take on the GPU: width x height x 4), objects in the scene, DOM nodes, JS heap
// (where the browser says), frame rate, ping, connection. Shown in a corner with ?debug=1, and sent to the server log every 30 seconds in a match
// together with the device (system, browser, screen, pixel ratio): when a phone's tab is killed for memory, the last lines say how big things were.

const EVERY_MS = 30_000;

export interface DiagSource { game: () => Phaser.Game | null; scene: () => Phaser.Scene | null; net: GameConnection }

function device(): Record<string, unknown> {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : 'other';
  const browser = /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'other';
  return { os, browser, screen: `${screen.width}x${screen.height}`, inner: `${innerWidth}x${innerHeight}`, dpr: window.devicePixelRatio, touch: matchMedia('(pointer: coarse)').matches };
}

export function snapshot(src: DiagSource): Record<string, unknown> {
  const game = src.game(), scene = src.scene();
  let textures = 0, texMB = 0, biggest = 0;
  if (game) {
    for (const key of game.textures.getTextureKeys()) {
      if (key.startsWith('__')) continue;
      for (const s of game.textures.get(key).source) { textures++; const mb = (s.width * s.height * 4) / 1048576; texMB += mb; biggest = Math.max(biggest, Math.max(s.width, s.height)); }
    }
  }
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const canvas = game?.canvas;
  return {
    textures, texMB: Math.round(texMB), biggestTexture: biggest,
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    objects: scene?.children.length ?? 0,
    tweens: scene && 'tweens' in scene ? (scene.tweens.getTweens?.().length ?? 0) : 0,
    dom: document.getElementsByTagName('*').length,
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    fps: game ? Math.round(game.loop.actualFps) : null,
    conn: src.net.state, errors: errorCounts().sent, glLost: glLost,
  };
}

let glLost = 0;

export function startDiagnostics(src: DiagSource): void {
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  let panel: HTMLPreElement | null = null;
  if (debug) {
    panel = document.createElement('pre');
    panel.className = 'kf-diag';
    document.body.appendChild(panel);
  }
  const inGame = () => document.documentElement.classList.contains('in-game');

  setInterval(async () => {
    if (!panel || !inGame()) return;
    const s = snapshot(src);
    const ping = await src.net.ping();
    panel.textContent = Object.entries({ ...device(), ...s, ping: ping === null ? '-' : Math.round(ping) }).map(([k, v]) => `${k}: ${v}`).join('\n');
  }, 2000);

  setInterval(async () => {
    if (!inGame() || document.hidden) return;
    const ping = await src.net.ping();
    reportDiag(JSON.stringify({ ...device(), ...snapshot(src), ping: ping === null ? null : Math.round(ping) }));
  }, EVERY_MS);
}

/** A lost WebGL context (the system took the GPU back): it is allowed to come back, and when it does the page starts afresh (the match is rejoined by the saved seat). */
export function watchGlContext(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost++; reportDiag(`webgl context lost (${glLost})`); });
  canvas.addEventListener('webglcontextrestored', () => { reportDiag('webgl context restored: reloading'); location.reload(); });
}
