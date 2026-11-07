// The Steam trailer (≈ 42 s, 1920x1080, 60 fps, H.264 + AAC) in Turkish and English, cut from the GPU clips tools/promo shoots.
//   node tools/steam-trailer.mjs [--lang tr|en|both] [--dry] [--music-a path] [--music-b path]
// Output (git-ignored: Tiny Swords art inside): art/video/keepfall-trailer-<lang>.mp4, art/video/keepfall-loop-<lang>.gif (10 s), art/video/trailer-frames-<lang>.png (contact sheet)
// Inputs: art/video/clips-en/cNN-clean-t1.mp4 (language-free) and art/video/clips-<lang>/cNN-ui-t1.mp4 (interface in that language), shot by
//   node tools/steam-screenshots.mjs --shoot   (or tools/promo/clips.mjs with KF_PROMO_LANG / KF_PROMO_CLIPS, see docs/steam-medya.md)
// The "who deceived whom" beat is a still of the end screen (art/shots/steam/<lang>/24-who-deceived-whom.png, made-up sample result) with a slow zoom.
// Captions are rendered with the game's own font in headless Chrome (tools/steam-render.mjs) and overlaid; music is the repo's CC0 tracks
// (client/public/audio/music: prep-bg → war, crossfaded at the march). Requires ffmpeg/ffprobe.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRenderer, fileUrl, root } from './steam-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const LANGS = opt('--lang', 'both') === 'both' ? ['tr', 'en'] : [opt('--lang', 'both')];
const VIDEO = join(root, 'art', 'video');
const SHOTS = join(root, 'art', 'shots', 'steam');
const LOGO = join(root, 'art', 'promo', 'keepfall-logo-transparent.png');
const MUSIC_A = opt('--music-a', join(root, 'client', 'public', 'audio', 'music', 'prep-bg.mp3'));
const MUSIC_B = opt('--music-b', join(root, 'client', 'public', 'audio', 'music', 'war.mp3'));
const FADE = 0.4; // cross-dissolve between beats (s)
const FPS = 60;

// beat: [clip | 'still', variant, start s, length s, caption (tr, en) or null, kind]
const BEATS = [
  { clip: 'c01', tag: 'clean', ss: 0, d: 4, cap: ['Her asker, kaybedilmiş bir işçidir.', 'Every soldier is a worker lost.'] },
  { clip: 'c03', tag: 'ui', ss: 0.3, d: 3, cap: ['Üret. Ya da savaş.', 'Produce. Or fight.'] },
  { clip: 'c04', tag: 'clean', ss: 0, d: 3, cap: ['Sis her şeyi saklar.', 'The fog hides everything.'] },
  { clip: 'c06', tag: 'ui', ss: 0.5, d: 3, cap: ['Yaz. Kandır.', 'Write. Deceive.'] },
  { clip: 'c07', tag: 'clean', ss: 0, d: 4, cap: ['Dört gizli krallık.', 'Four secret kingdoms.'] },
  { clip: 'c09', tag: 'clean', ss: 0, d: 3, cap: null },
  { clip: 'c10', tag: 'clean', ss: 0, d: 4, cap: ['Tek kapı, tek savaş.', 'One gate, one battle.'], march: true },
  { clip: 'c11', tag: 'clean', ss: 0, d: 3, cap: null },
  { clip: 'c12', tag: 'ui', ss: 1.5, d: 5, cap: null },
  { clip: 'c13', tag: 'clean', ss: 0, d: 3, cap: ['Kale tek seferde düşer.', 'A castle falls in a single blow.'] },
  { clip: 'c14', tag: 'clean', ss: 0, d: 3, cap: null },
  { clip: 'still', d: 3.4, cap: ['Kim kimi kandırdı?', 'Who deceived whom?'] },
  { clip: 'c15', tag: 'ui', ss: 0, d: 3.5, cap: null, endCard: true },
];

const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'], ...o }); if (r.status !== 0) throw new Error(`${cmd} failed: ${a.slice(0, 12).join(' ')}`); };
const ffmpeg = (a) => run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', ...a]);
const clipPath = (lang, b) => (b.tag === 'clean' ? join(VIDEO, 'clips-en', `${b.clip}-clean-t1.mp4`) : join(VIDEO, `clips-${lang}`, `${b.clip}-ui-t1.mp4`));

const starts = []; let acc = 0;
BEATS.forEach((b, i) => { starts.push(i === 0 ? 0 : acc - i * FADE + (i === 0 ? 0 : 0)); acc += b.d; });
// start time of beat i on the output timeline = sum(d before) - i * FADE
for (let i = 0; i < BEATS.length; i++) starts[i] = BEATS.slice(0, i).reduce((s, b) => s + b.d, 0) - i * FADE;
const total = BEATS.reduce((s, b) => s + b.d, 0) - (BEATS.length - 1) * FADE;
console.log(`${BEATS.length} beats, ${total.toFixed(1)} s`);

const problems = [];
for (const lang of LANGS) for (const b of BEATS) {
  if (b.clip === 'still') { const f = join(SHOTS, lang, '24-who-deceived-whom.png'); if (!existsSync(f)) problems.push(f); continue; }
  const f = clipPath(lang, b); if (!existsSync(f)) problems.push(f);
}
if (problems.length) { console.error('Missing inputs (shoot them: node tools/steam-screenshots.mjs --shoot; the end-screen still: node tools/steam-screenshots.mjs --only menus):\n' + [...new Set(problems)].join('\n')); process.exit(1); }
if (args.includes('--dry')) process.exit(0);

mkdirSync(VIDEO, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'kf-trailer-'));

// ---- audio: calm music, the war music crossfaded in at the march; the same for both languages
const marchAt = starts[BEATS.findIndex((b) => b.march)];
const audio = join(tmp, 'music.wav');
ffmpeg(['-i', MUSIC_A, '-i', MUSIC_B, '-filter_complex',
  `[0:a]atrim=0:${(marchAt + 2).toFixed(2)},asetpts=PTS-STARTPTS[a];[1:a]atrim=0:${(total - marchAt + 2).toFixed(2)},asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=2:c1=tri:c2=tri,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5,atrim=0:${total.toFixed(2)},loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000[out]`,
  '-map', '[out]', '-ac', '2', audio]);

const r = await openRenderer();
try {
  for (const lang of LANGS) {
    const li = lang === 'tr' ? 0 : 1;
    const dir = join(tmp, lang); mkdirSync(dir, { recursive: true });
    // ---- caption overlays (transparent 1920x1080 PNGs) and the end card
    const capCss = `position:absolute;left:0;right:0;bottom:118px;text-align:center;font:84px/1.1 KF,sans-serif;color:#fff4d6;-webkit-text-stroke:14px #1c120a;paint-order:stroke fill;letter-spacing:1px;text-shadow:0 8px 0 rgba(0,0,0,.45)`;
    const capFiles = [];
    for (let i = 0; i < BEATS.length; i++) {
      const b = BEATS[i]; if (!b.cap) { capFiles.push(null); continue; }
      const f = join(dir, `cap${i}.png`);
      await r.render(`<div style="position:absolute;left:0;right:0;bottom:0;height:380px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55))"></div><div style="${capCss}">${b.cap[li]}</div>`, 1920, 1080, f, { transparent: true });
      capFiles.push(f);
    }
    const endCard = join(dir, 'end.png');
    await r.render(`<div style="position:absolute;inset:0;background:rgba(6,9,16,.58)"></div>
      <img src="${fileUrl(LOGO)}" style="position:absolute;left:460px;top:250px;width:1000px;height:442px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.6))">
      <div style="position:absolute;left:0;right:0;top:760px;text-align:center;font:66px KF,sans-serif;color:#fff4d6;-webkit-text-stroke:12px #1c120a;paint-order:stroke fill">${lang === 'tr' ? 'Steam’de istek listene ekle' : 'Wishlist on Steam'}</div>
      <div style="position:absolute;left:0;right:0;bottom:70px;text-align:center;font:38px KF,sans-serif;color:#e9dfc4;-webkit-text-stroke:8px #1c120a;paint-order:stroke fill">Art: Tiny Swords by Pixel Frog</div>`, 1920, 1080, endCard, { transparent: true });

    // ---- the still beat: slow zoom on the end screen (4x nearest first so the zoom does not jitter)
    const stillClip = join(dir, 'still.mp4'); const sb = BEATS.find((b) => b.clip === 'still');
    const frames = Math.round(sb.d * FPS);
    ffmpeg(['-loop', '1', '-i', join(SHOTS, lang, '24-who-deceived-whom.png'), '-vf',
      `scale=7680:4320:flags=neighbor,zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${FPS},format=yuv420p`, '-t', String(sb.d), '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', stillClip]);

    // ---- one ffmpeg run: trim, dissolve, captions, end card, music
    const inputs = []; const filters = []; let k = 0;
    const vIdx = BEATS.map((b) => {
      if (b.clip === 'still') inputs.push('-i', stillClip); else inputs.push('-ss', String(b.ss), '-t', String(b.d), '-i', clipPath(lang, b));
      return k++;
    });
    BEATS.forEach((b, i) => filters.push(`[${vIdx[i]}:v]trim=0:${b.d},setpts=PTS-STARTPTS,fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p,setsar=1[v${i}]`));
    let last = 'v0';
    for (let i = 1; i < BEATS.length; i++) {
      filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${starts[i].toFixed(3)}[x${i}]`); last = `x${i}`;
    }
    // overlays: captions (fade in/out 0.3 s) and the end card (fades in over the last beat)
    const overlays = [];
    BEATS.forEach((b, i) => {
      if (capFiles[i]) overlays.push({ file: capFiles[i], s: starts[i] + 0.35, e: starts[i] + b.d - FADE - 0.1 });
      if (b.endCard) overlays.push({ file: endCard, s: starts[i] + 0.8, e: total + 1 });
    });
    overlays.forEach((o, j) => {
      const idx = k++; const dur = Math.max(0.6, o.e - o.s);
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(2), '-i', o.file);
      filters.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${(dur - 0.3).toFixed(2)}:d=0.3:alpha=1,setpts=PTS+${o.s.toFixed(3)}/TB[o${j}]`);
      filters.push(`[${last}][o${j}]overlay=eof_action=pass:format=auto[y${j}]`); last = `y${j}`;
    });
    const audioIdx = k++; inputs.push('-i', audio);
    const out = join(VIDEO, `keepfall-trailer-${lang}.mp4`);
    ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', `[${last}]`, '-map', `${audioIdx}:a`,
      '-t', total.toFixed(2), '-r', String(FPS), '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '17', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
    console.log('wrote', out, (statSync(out).size / 1e6).toFixed(1) + ' MB');

    // ---- 10 s loop GIF (the march and the gate battle), 960x540, 20 fps, two-pass palette
    const gifStart = starts[BEATS.findIndex((b) => b.march)];
    const palette = join(tmp, `palette-${lang}.png`);
    const gif = join(VIDEO, `keepfall-loop-${lang}.gif`);
    ffmpeg(['-ss', gifStart.toFixed(2), '-t', '10', '-i', out, '-vf', 'fps=20,scale=960:540:flags=lanczos,palettegen=max_colors=192:stats_mode=diff', palette]);
    ffmpeg(['-ss', gifStart.toFixed(2), '-t', '10', '-i', out, '-i', palette, '-lavfi', 'fps=20,scale=960:540:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', gif]);
    console.log('wrote', gif, (statSync(gif).size / 1e6).toFixed(1) + ' MB');

    // ---- contact sheet: a frame every 2.5 s (also what to look at to judge the cut)
    ffmpeg(['-i', out, '-vf', 'fps=1/2.5,scale=480:270,tile=4x5', '-frames:v', '1', join(VIDEO, `trailer-frames-${lang}.png`)]);
  }
} finally { r.close(); }
