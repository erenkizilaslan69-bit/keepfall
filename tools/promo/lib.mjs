// Trailer-shooting helpers: a HEADED Chrome (kiosk, real GPU) on the primary 1920x1080 screen, driven over CDP, recorded by ffmpeg's gdigrab at 60 fps.
// Nothing here touches the game: only the dev/test hooks (keepfallScene / keepfallUi / keepfallNet) and CSS to hide the interface.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// KF_PROMO_CLIPS: another output folder (the Steam media tools shoot into art/video/clips-<lang>/); KF_PROMO_LANG / KF_PROMO_URL: interface language and the client to shoot.
export const CLIPS = (process.env.KF_PROMO_CLIPS ? process.env.KF_PROMO_CLIPS.split('\\').join('/').replace(/\/?$/, '/') : fileURLToPath(new URL('../../art/promo/clips/', import.meta.url)).split('\\').join('/'));
mkdirSync(CLIPS, { recursive: true });

export async function launch({ url = process.env.KF_PROMO_URL || 'http://localhost:5174/', lang = process.env.KF_PROMO_LANG || 'en', name = 'Eren' } = {}) {
  const port = 9700 + Math.floor(Math.random() * 200);
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kf-promo-'))}`,
    '--kiosk', '--window-position=0,0', '--window-size=1920,1080', '--no-first-run', '--disable-infobars', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion', '--lang=en-US', '--disable-translate', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* */ } await sleep(500); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('keepfall_tutorial_seen','true');localStorage.setItem('keepfall_tutorial_done','true');localStorage.setItem('keepfall_lang','${lang}');localStorage.setItem('keepfall_name','${name}');localStorage.setItem('keepfall.matches','9')}catch(e){}` });
  const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'js error'); return r.result?.result?.value; };
  const b = {
    send, js, port, pid: chrome.pid,
    goto: async (u) => { await send('Page.navigate', { url: u }); await sleep(2500); },
    waitFor: async (expr, sec = 30) => { for (let i = 0; i < sec * 4; i++) { try { if (await js(expr)) return true; } catch { /* */ } await sleep(250); } return false; },
    close: () => { try { ws.close(); } catch { /* */ } chrome.kill(); spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F']); },
  };
  await b.goto(url);
  await b.waitFor("document.querySelector('#quick')", 40);
  return b;
}

/** Starts ffmpeg on the whole primary screen (desktop duplication on the GPU: a steady 60 fps, gdigrab only managed ~50). Visually lossless intra capture; the final mp4 is made afterwards. */
export function startRecording(file) {
  const raw = file.replace(/\.mp4$/, '.raw.mkv');
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=60:draw_mouse=0,hwdownload,format=bgra',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '10', '-pix_fmt', 'yuv420p', raw], { stdio: ['pipe', 'inherit', 'inherit'] });
  return async () => {
    ff.stdin.write('q'); await new Promise((r) => ff.on('close', r));
    return raw;
  };
}

/** The raw capture to the final H.264 mp4 (CRF 18, veryfast, yuv420p), trimmed to [from, from+dur] seconds. */
export function encode(raw, out, from = 0, dur = 0) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(from), '-i', raw, ...(dur ? ['-t', String(dur)] : []), '-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', out];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  return r.status === 0;
}
export const probe = (f) => { const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames,r_frame_rate,duration', '-of', 'default=nw=1', f], { encoding: 'utf8' }); return r.stdout.replace(/\n/g, ' '); };
