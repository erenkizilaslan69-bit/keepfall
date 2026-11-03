// A tiny headless-Chrome driver for the browser tests: `const b = await launch({ width, height, mobile })`, then b.goto(url), b.js(expr), b.shot(file), b.close().
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch({ width = 1280, height = 720, mobile = false, ua = null, init = '', dpr = 1 } = {}) {
  const port = 9333 + Math.floor(Math.random() * 600);
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-chrome-'))}`, `--window-size=${width},${height}`, '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (ua) await send('Network.setUserAgentOverride', { userAgent: ua });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','en')}catch(e){};" + init });
  const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'js error'); return r.result?.result?.value; };
  return {
    send, js, events,
    goto: async (url) => { await send('Page.navigate', { url }); await sleep(2500); },
    waitFor: async (expr, sec = 20) => { for (let i = 0; i < sec * 2; i++) { try { if (await js(expr)) return true; } catch { /* page loading */ } await sleep(500); } return false; },
    shot: async (file) => { writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); },
    close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); },
  };
}
