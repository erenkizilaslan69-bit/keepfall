// Frame cost of the map on a phone-sized screen: WebGL draw calls per frame, how long the scene's update and the render take (CPU side), objects by kind, particles.
// Compares the default graphics with ?low=1 (what a touch device starts with). Headless Chrome with software GL: the FPS is not a phone's, the COUNTS and the CPU times are comparable.
// Usage: node tools/perf-profile.mjs [http://localhost:5174] [WxH=852x393]
import { launch, sleep } from './cdp.mjs';
const URL = (process.argv[2] ?? 'http://localhost:5174').replace(/\/$/, '');
const [W, H] = (process.argv[3] ?? '852x393').split('x').map(Number);
for (const low of [false, true]) {
  const b = await launch({ width: W, height: H, mobile: true, dpr: 2, init: `try{localStorage.setItem('keepfall.prefs', JSON.stringify({ lowGraphics: ${low} }))}catch(e){}` });
  await b.goto(`${URL}/`);
  await b.js("document.querySelector('#name').value='P'; document.querySelector('#quick').click(); 1");
  await b.waitFor("document.documentElement.classList.contains('in-game')", 90); await b.waitFor("typeof window.keepfallScene === 'object' && !!keepfallScene.state", 90);
  await sleep(5000);
  await b.js("document.querySelector('#kingdom-decree [data-close]')?.click(); 1");
  const r = await b.js(`(async () => {
    const gl = keepfallScene.game.renderer.gl; let draws = 0, frames = 0;
    for (const fn of ['drawElements', 'drawArrays']) { const o = gl[fn].bind(gl); gl[fn] = (...a) => { draws++; return o(...a); }; }
    const s = keepfallScene; let render = 0;
    s.events.on('update', () => { frames++; }); const g = s.game; const orr = g.renderer.render.bind(g.renderer); g.renderer.render = (...a) => { const t0 = performance.now(); orr(...a); render += performance.now() - t0; };
    await new Promise((res) => setTimeout(res, 6000));
    const kinds = {}; for (const o of s.children.list) kinds[o.type] = (kinds[o.type] || 0) + 1;
    const emitters = s.children.list.filter((o) => o.type === 'ParticleEmitter').length;
    let texMB = 0; for (const k of g.textures.getTextureKeys()) { if (k.startsWith('__')) continue; for (const src of g.textures.get(k).source) texMB += src.width * src.height * 4 / 1048576; }
    return JSON.stringify({ frames, drawsPerFrame: +(draws / Math.max(1, frames)).toFixed(1), renderCpuMsPerFrame: +(render / Math.max(1, frames)).toFixed(2), fps: Math.round(g.loop.actualFps), objects: s.children.list.length, kinds, emitters, tweens: s.tweens.getTweens().length, texMB: Math.round(texMB) });
  })()`);
  console.log(low ? 'LOW  ' : 'FULL ', r);
  b.close();
}
