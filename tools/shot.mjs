// Screenshots of the screens at three window sizes (headless Chrome via CDP), for before/after comparisons of the look.
// Needs the dev server and the Vite dev client running (see README); usage: node tools/shot.mjs <output folder> <tag> [client url]
// e.g. node tools/shot.mjs docs/gorsel/once once http://localhost:5174/   → docs/gorsel/once-1280x720-home.png …
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const tag = process.argv[3] ?? 'shot';
const URL = process.argv[4] ?? 'http://localhost:5174/';
const SIZES = [[1000, 640], [1280, 720], [1920, 1080]];
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-shot-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,800', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const shot = async (size, name) => {
  await sleep(700);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `${tag}-${size[0]}x${size[1]}-${name}.png`);
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
};
const wait = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;
const click = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)}))?.click();`;

await send('Runtime.enable');
await send('Page.enable');
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await run('localStorage.clear(); sessionStorage.clear(); 1');
  await send('Page.navigate', { url: URL });
  await sleep(3500);
  await shot(size, 'home');

  await run(`(async () => { document.querySelector('input').value = 'Eren'; ${click('Oda kur')} ${wait(1800)} ${click('Kolay')} ${wait(900)} 1; })()`);
  await shot(size, 'lobby');

  await run(`(async () => { ${click('Hazırım')} ${wait(800)} ${click('Maçı başlat')} ${wait(2500)} 1; })()`);
  await run(`(async () => { for (let i = 0; i < 80; i++) { if (window.keepfallScene?.battles) break; ${wait(500)} } ${wait(1500)} 1; })()`);
  await shot(size, 'game');
  for (const [name, target] of [
    ['farm', "{kind:'building',type:'farm'}"], ['forge', "{kind:'building',type:'forge'}"], ['castle', "{kind:'castle'}"], ['enemy', "{kind:'enemy',seat:2}"],
  ]) {
    await run(`window.keepfallUi.windows.close(); window.keepfallUi.open(${target}); 1`);
    await shot(size, name);
  }
  await run('window.keepfallUi.windows.close(); document.querySelector(".tb-sound [data-guide]")?.click(); 1');
  await shot(size, 'guide');
  await run('document.querySelector(".guide-close")?.click(); 1');
}
ws.close();
chrome.kill();
process.exit(0);
