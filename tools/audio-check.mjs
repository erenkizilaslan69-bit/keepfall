// Checks the real sounds in headless Chrome: the recordings load and decode, the music starts at the first click, crossfades to the war track
// and back, the two volumes are separate. Needs the dev server and the Vite dev client; usage: node tools/audio-check.mjs [client url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.argv[2] ?? 'http://localhost:5174/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'kf-audio-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--window-size=1280,720', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* not up yet */ }
  await sleep(500);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const failed = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !d.params.response.url.endsWith('/favicon.ico')) failed.push(`${d.params.response.status} ${d.params.response.url}`);
  if (d.method === 'Runtime.exceptionThrown') failed.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).split('\n')[0]);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'ERR ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
let bad = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok   ' : 'FAIL ', name, extra); if (!ok) bad++; };

await send('Runtime.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(3500);
await run('localStorage.clear(); localStorage.setItem('keepfall_tutorial_seen', 'true'); 1');
await send('Page.navigate', { url: URL });
await sleep(3500);

check('no sound or music before the first click', (await run(`window.keepfallAudio.sfx.audioContext === null || window.keepfallAudio.sfx.audioContext.state !== 'running'`)) === true);
// a real click (counts as the first gesture)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
await sleep(2500);
const state = JSON.parse(await run(`(() => { const a = window.keepfallAudio; return JSON.stringify({ ctx: a.sfx.audioContext?.state, samples: a.sfx.buffers.size, track: a.music.current?.track ?? null, musicBuffers: [...a.music.buffers.keys()] }); })()`));
check('the audio context runs after the click', state.ctx === 'running', JSON.stringify(state));
check('the recordings are loaded and decoded', state.samples >= 20, String(state.samples));
check('the calm track starts at that click', state.track === 'prep');
await run(`window.keepfallAudio.music.scene('war'); 1`);
await sleep(1000);
const mid = JSON.parse(await run(`(() => { const c = window.keepfallAudio.music.current; return JSON.stringify({ track: c.track, gain: c.gain.gain.value }); })()`));
check('the war track fades in (not yet full a second in)', mid.track === 'war' && mid.gain > 0 && mid.gain < 1, JSON.stringify(mid));
await sleep(3500);
const full = JSON.parse(await run(`(() => { const c = window.keepfallAudio.music.current; return JSON.stringify({ track: c.track, gain: c.gain.gain.value }); })()`));
check('and reaches full volume', full.track === 'war' && full.gain > 0.99, JSON.stringify(full));
await run(`window.keepfallAudio.music.scene('prep'); 1`);
await sleep(4000);
check('back to the calm track at the end', (await run(`window.keepfallAudio.music.current.track`)) === 'prep');
check('looping', (await run(`window.keepfallAudio.music.current.src.loop`)) === true);
await run(`window.keepfallAudio.sfx.setMusicVolume(0.6); 1`);
const levels = JSON.parse(await run(`(() => { const s = window.keepfallAudio.sfx; return JSON.stringify({ music: s.musicBus.gain.value, sfx: s.master.gain.value }); })()`));
check('music and effects have separate levels', Math.abs(levels.music - 0.3) < 1e-6 && Math.abs(levels.sfx - 0.15) < 1e-6, JSON.stringify(levels));
check('a made-up sound is not needed for the files that exist', (await run(`(() => { const s = window.keepfallAudio.sfx; s.play('sword'); s.play('uiOpen'); return true; })()`)) === true);
const mp3 = JSON.parse(await run(`(async () => { const ctx = window.keepfallAudio.sfx.audioContext, out = []; for (const n of ['sword-1', 'castleFall-3', 'ui-click-2', 'warning']) { const r = await fetch('/audio/sfx/' + n + '.mp3'); const b = await ctx.decodeAudioData(await r.arrayBuffer()); out.push(Math.round(b.duration * 100) / 100); } return JSON.stringify(out); })()`));
check('the MP3 backups decode too (Safari)', mp3.every((d) => d > 0.005), JSON.stringify(mp3));
const loops = JSON.parse(await run(`JSON.stringify([...window.keepfallAudio.music.buffers.values()].map((b) => Math.round(b.duration * 100) / 100))`));
// the WAV sources last 49.95 s and 56.31 s: MP3 encoder padding is trimmed, so the loops are as long as the originals (no gap at the seam)
check('the music loops decode to their exact length', loops.some((d) => Math.abs(d - 49.95) < 0.08) && loops.some((d) => Math.abs(d - 56.31) < 0.08), JSON.stringify(loops));
check('no failed requests or exceptions', failed.length === 0, failed.join(' | '));
ws.close();
chrome.kill();
console.log(bad === 0 ? 'All audio checks passed.' : `${bad} check(s) failed.`);
process.exit(bad === 0 ? 0 : 1);
