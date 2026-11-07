// Starts the packed Steam demo (steam-build/Keepfall/Keepfall.exe) with a remote-debugging port and returns a small CDP driver
// { child, js, waitFor, shot, send, log, ws }. Shared by tools/steam-check.mjs and tools/shot-steam.mjs.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const exe = join(root, 'steam-build', 'Keepfall', 'Keepfall.exe');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const userDataDir = () => mkdtempSync(join(tmpdir(), 'kf-steam-'));

export async function launch(label, cdpPort, steamAppId = '', userData = userDataDir(), OUT = join(userData, 'x')) {
  if (!existsSync(exe)) throw new Error('Run node tools/pack-steam.mjs first.');
  const log = join(userData, `${label}.log`);
  writeFileSync(log, '');
  const child = spawn(exe, [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${userData}`], { stdio: 'ignore', env: { ...process.env, KEEPFALL_SHELL_LOG: log, KEEPFALL_STEAM_APPID: steamAppId } });
  let target;
  for (let i = 0; i < 120 && !target; i++) {
    await sleep(500);
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('keepfall.localhost')); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('no window');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'js error'); return r.result?.result?.value; };
  const waitFor = async (expr, sec = 30) => { for (let i = 0; i < sec * 2; i++) { try { if (await js(expr)) return true; } catch { /* loading */ } await sleep(500); } return false; };
  const shot = async (name) => writeFileSync(`${OUT}-${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  return { child, js, waitFor, shot, send, log, ws };
}

