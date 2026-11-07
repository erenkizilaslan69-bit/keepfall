// Renders a small HTML page to a PNG with headless Chrome (CDP): exact pixel sizes, the game's own font, optional transparent background.
// Used by the Steam media tools for trailer captions and store capsules. No game server needed; local files are referenced as file:/// URLs.
//   import { renderHtml, fileUrl } from './steam-render.mjs'; await renderHtml(html, 1920, 1080, 'out.png', { transparent: true });
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fileUrl = (p) => pathToFileURL(resolve(p)).href;
export const FONT = fileUrl(join(root, 'client', 'node_modules', '@fontsource', 'pixelify-sans', 'files', 'pixelify-sans-latin-400-normal.woff2'));
export const FONT_EXT = fileUrl(join(root, 'client', 'node_modules', '@fontsource', 'pixelify-sans', 'files', 'pixelify-sans-latin-ext-400-normal.woff2'));
/** @font-face rules for the game's Pixelify Sans (latin + latin-ext: Turkish letters); put it in the page's <style>. */
export const FONT_CSS = `@font-face{font-family:KF;src:url('${FONT}') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:KF;src:url('${FONT_EXT}') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One shared headless Chrome for many renders (close it with close()). */
export async function openRenderer() {
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-render-'))}`,
    '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(400); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  const dir = mkdtempSync(join(tmpdir(), 'kf-render-html-'));
  let n = 0;
  return {
    send,
    async render(html, w, h, out, { transparent = false, format = 'png', quality = 92 } = {}) {
      const file = join(dir, `p${++n}.html`);
      writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${FONT_CSS}html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden;${transparent ? 'background:transparent' : 'background:#000'}}*{box-sizing:border-box}</style>${html}`);
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await send('Emulation.setDefaultBackgroundColorOverride', { color: transparent ? { r: 0, g: 0, b: 0, a: 0 } : { r: 0, g: 0, b: 0, a: 1 } });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      await sleep(400);
      for (let i = 0; i < 60; i++) { const r = await send('Runtime.evaluate', { expression: `document.readyState==='complete' && [...document.images].every(i=>i.complete) && document.fonts.ready.then(()=>true)`, awaitPromise: true, returnByValue: true }); if (r.result?.result?.value) break; await sleep(150); }
      await sleep(150);
      const r = await send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality } : {}), clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: false });
      writeFileSync(out, Buffer.from(r.result.data, 'base64'));
    },
    close() { try { ws.close(); } catch { /* */ } try { chrome.kill(); } catch { /* */ } spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); },
  };
}
export async function renderHtml(html, w, h, out, opts) { const r = await openRenderer(); try { await r.render(html, w, h, out, opts); } finally { r.close(); } }
