// Scene directing on top of lib.mjs: a staged match, UI on/off, smooth camera paths, takes. Only dev hooks (keepfallNet / keepfallScene / keepfallUi) and CSS are used.
import { launch, startRecording, encode, probe, sleep, CLIPS } from './lib.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, renameSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
export { sleep, CLIPS, probe };

const CAM_JS = `(() => {
  if (window.__cam) return;
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
  const cam = () => keepfallScene.cameras.main;
  window.__camStop = false;
  // Move the camera centre/zoom to (x, y, zoom) in 'ms' with easing; the zoom is interpolated in log space so it feels even. Resolves when done.
  window.__cam = (x, y, zoom, ms, e = 'inout') => new Promise((res) => {
    const c = cam(); const x0 = c.midPoint.x, y0 = c.midPoint.y, z0 = c.zoom; const t0 = performance.now();
    const f = (now) => {
      let t = Math.min(1, (now - t0) / Math.max(1, ms)); const k = e === 'linear' ? t : ease(t);
      c.setZoom(Math.exp(Math.log(z0) + (Math.log(zoom) - Math.log(z0)) * k));
      c.centerOn(x0 + (x - x0) * k, y0 + (y - y0) * k);
      if (t < 1 && !window.__camStop) requestAnimationFrame(f); else res(1);
    };
    requestAnimationFrame(f);
  });
  // Follow a function that returns {x, y} each frame (an army), with a smoothed lag so the shot does not jerk.
  window.__follow = (getter, zoom, ms, lag = 0.06) => new Promise((res) => {
    const c = cam(); const t0 = performance.now(); let cx = c.midPoint.x, cy = c.midPoint.y; const z0 = c.zoom;
    const f = (now) => {
      const p = getter(); const t = Math.min(1, (now - t0) / ms);
      if (p) { cx += (p.x - cx) * lag; cy += (p.y - cy) * lag; c.centerOn(cx, cy); }
      c.setZoom(Math.exp(Math.log(z0) + (Math.log(zoom) - Math.log(z0)) * ease(Math.min(1, (now - t0) / 1500))));
      if (t < 1 && !window.__camStop) requestAnimationFrame(f); else res(1);
    };
    requestAnimationFrame(f);
  });
})()`;

export class Director {
  static async open(opts = {}) { const d = new Director(); d.b = await launch(opts); return d; }
  js(e) { return this.b.js(e); }
  /** UI hidden (the clean version) or shown. */
  async ui(on) {
    await this.js(`(() => { let s = document.getElementById('promo-hide'); if (!s) { s = document.createElement('style'); s.id = 'promo-hide'; document.head.appendChild(s); }
      s.textContent = '.tb-speed, .dev-only, .kf-debug, [data-dev], .kf-fps, body > pre, body > div[style*="9999"] { display: none !important; }' + ${on ? "''" : "' .ui-root, .guide-fab, .settings-fab, .lang-fab, .kf-minimap, body > div:not(#app), .kingdom-decree, .tut-frame, .tut-card, .cloud-curtain, .rotate-screen, .hint-card { display: none !important; }'"}; })()`);
  }
  /** A room with the given bots, our deck, started; returns when the map is up and the decree closed. */
  async match({ bots = ['easy', 'easy', 'easy'], deck = null, kingdom = null, tries = 12, guided = true } = {}) {
    for (let i = 0; i < tries; i++) {
      const ok = await this.js(`(async () => { const n = keepfallNet; if (n.roomCode) { try { await n.leaveRoom(); } catch (e) {} }
        let r = await n.createRoom('Eren'); if (!r.ok) return 'create ' + r.error;
        for (const l of ${JSON.stringify(bots)}) { r = await n.addBot(l); if (!r.ok) return 'bot ' + r.error; }
        ${deck ? `r = await n.setDeck(${JSON.stringify(deck)});` : ''}
        r = await n.setGuided(${guided}); // the bots leave us alone for the first minutes of the war (keeps the staging calm)
        r = await n.setReady(true); r = await n.startMatch(); return r.ok ? 'ok' : 'start ' + r.error; })()`);
      if (ok !== 'ok') throw new Error('match setup: ' + ok);
      await this.b.waitFor("document.documentElement.classList.contains('in-game') && !!keepfallScene.state && keepfallScene.ready", 60);
      await sleep(2500);
      await this.js("document.querySelector('#kingdom-decree [data-close]')?.click(); 1");
      const k = await this.js('keepfallScene.state.kingdom?.id ?? null');
      if (!kingdom || k === kingdom) return k;
    }
    throw new Error('could not get kingdom ' + kingdom);
  }
  async speed(n) { await this.js(`keepfallNet.setSpeed(${n}).then(() => 1)`); }
  async install() { await this.js(CAM_JS); }
  cam(x, y, zoom, ms, e) { return this.js(`window.__cam(${x}, ${y}, ${zoom}, ${ms}, ${JSON.stringify(e ?? 'inout')})`); }
  camNow(x, y, zoom) { return this.js(`(() => { const c = keepfallScene.cameras.main; c.setZoom(${zoom}); c.centerOn(${x}, ${y}); return 1; })()`); }
  state() { return this.js('JSON.stringify(keepfallScene.state)').then(JSON.parse); }
  /** Records <seconds> of whatever `action` does (it starts once the recorder is warm), writes <name>-<tag>.mp4 into the clips folder, returns the file name. */
  async take(name, tag, seconds, action) {
    const file = `${CLIPS}${name}${tag ? '-' + tag : ''}.mp4`;
    const front = () => { try { spawn('powershell', ['-NoProfile', '-Command', `(New-Object -ComObject WScript.Shell).AppActivate(${this.b.pid})`], { stdio: 'ignore', windowsHide: true }).unref(); } catch { /* */ } this.b.send('Page.bringToFront'); };
    front();
    const keep = setInterval(front, 1500); // another window (a chat, a notification) must not slide in front of the game while we record
    const stop = startRecording(file);
    await sleep(1500);
    const t0 = Date.now();
    try { await action(); } catch (e) { clearInterval(keep); try { rmSync(await stop()); } catch { /* */ } throw e; } // a failed action must not leave the recorder running
    const used = (Date.now() - t0) / 1000;
    await sleep(Math.max(0, seconds - used) * 1000);
    const raw = await stop();
    clearInterval(keep);
    encode(raw, file, 1.5, seconds);
    try { rmSync(raw); } catch { /* */ }
    // The screen must show only the game: a taskbar or another window in the picture (a dark strip at the bottom) spoils the take.
    const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', file, '-vf', "select='not(mod(n,20))',crop=1920:36:0:1044,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", '-f', 'null', '-'], { encoding: 'utf8' });
    const ys = (r.stdout.match(/YAVG=([0-9.]+)/g) ?? []).map((x) => Number(x.slice(5)));
    if (ys.filter((y) => y < 55).length > 1) throw new Error(`take ${name} has another window in the picture`);
    return file;
  }
  async shot(file) { const r = await this.b.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
  close() { this.b.close(); }
}
