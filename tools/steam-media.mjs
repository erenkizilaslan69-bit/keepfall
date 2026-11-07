// Steam store media from a recording of a real match: one trailer and eight 1920x1080 screenshots (all in art/steam/, git-ignored: Tiny Swords art inside).
// Usage: node tools/steam-media.mjs --rec "<match recording.mp4>" [--only trailer|shots]
// The recording is read only. Source times below are seconds in the recording of 2026-11-07 (12:35, 1080p30); for another recording, re-pick them
// (ffmpeg contact sheet: ffmpeg -i rec.mp4 -vf "fps=1/5,scale=384:216,tile=5x4" -frames:v 1 sheet.png).
// The trailer keeps the 30 fps of the source. Captions use the game's own pixel font (Pixelify Sans, via headless Chrome); the end card is plain typography,
// no generated art. Music: the game's CC0 tracks (client/public/audio/music).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRenderer, root } from './steam-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const REC = opt('--rec', null);
const only = opt('--only', 'all');
if (!REC || !existsSync(REC)) { console.error('--rec <recording.mp4> is required'); process.exit(1); }
const OUT = join(root, 'art', 'steam');
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'kf-steam-'));
const FPS = 30, FADE = 0.4;
const MUSIC_A = join(root, 'client', 'public', 'audio', 'music', 'prep-bg.mp3');
const MUSIC_B = join(root, 'client', 'public', 'audio', 'music', 'war.mp3');

const run = (cmd, a) => { const r = spawnSync(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'] }); if (r.status !== 0) throw new Error(`${cmd} failed: ${a.slice(0, 14).join(' ')}`); };
const ffmpeg = (a) => run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', ...a]);
// The early part of the recording shows the game's small FPS box at the bottom left (a player option); it is painted out there.
const DELOGO = 'delogo=x=6:y=1049:w=102:h=26';

// [file name, source second, paint out the FPS box]
const SHOTS = [
  ['01-castle-economy', 92, true],
  ['02-forge-and-weapons', 534.5, true],
  ['03-fog-and-scout', 57, true],
  ['04-army-marches', 660, false],
  ['05-gate-battle', 670, false],
  ['06-castle-falls', 676.5, false],
  ['07-second-siege', 729, false],
  ['08-victory', 743.5, false],
];

// beats: source second, length, delogo, captions [text, size 'big'|'small', start, length] (start relative to the beat)
const BEATS = [
  { ss: 91, d: 4, logo: true, caps: [['Every soldier…', 's', 0.5, 1.6], ['…is a worker lost.', 's', 2.1, 1.5]] },
  { ss: 533, d: 3, logo: true, caps: [['Forge weapons. Raise an army.', 's', 0.4, 2.2]] },
  { ss: 54.5, d: 3.5, logo: true, caps: [['SCOUT.', 'b', 0.5, 2.6]] },
  { ss: 370, d: 3, logo: true, caps: [['Send envoys. Make deals.', 's', 0.4, 2.2]] },
  { ss: 647, d: 3.2, war: true, caps: [['Raid villages. Beat bandits.', 's', 0.4, 2.4]] },
  { ss: 659, d: 3, caps: [['One battle…', 's', 0.4, 2.2]] },
  { ss: 668, d: 4, caps: [['CONQUER.', 'b', 0.5, 3]] },
  { ss: 674, d: 5, caps: [['…one castle falls.', 's', 0.6, 3.6]] },
  { ss: 727, d: 3.5, caps: [] },
  { ss: 741.5, d: 3.5, caps: [] },
  { end: true, d: 4.5, caps: [] },
];

try {
  if (only === 'all' || only === 'shots') {
    for (const [name, t, logo] of SHOTS) ffmpeg(['-ss', String(t), '-i', REC, '-frames:v', '1', ...(logo ? ['-vf', DELOGO] : []), join(OUT, `${name}.png`)]);
    console.log('wrote', SHOTS.length, 'screenshots');
  }
  if (only === 'all' || only === 'trailer') {
    const starts = BEATS.map((b, i) => BEATS.slice(0, i).reduce((s, x) => s + x.d, 0) - i * FADE);
    const total = BEATS.reduce((s, b) => s + b.d, 0) - (BEATS.length - 1) * FADE;
    console.log(`${BEATS.length} beats, ${total.toFixed(1)} s`);

    // caption + end card PNGs (transparent, game font)
    const r = await openRenderer();
    const overlays = []; // { file, s, e }
    try {
      const style = (big) => `position:absolute;left:0;right:0;${big ? 'bottom:150px;font-size:150px' : 'bottom:110px;font-size:78px'};text-align:center;font-family:KF,sans-serif;line-height:1.1;color:#fff4d6;-webkit-text-stroke:${big ? 22 : 14}px #1c120a;paint-order:stroke fill;letter-spacing:${big ? 4 : 1}px;text-shadow:0 6px 0 rgba(0,0,0,.35)`;
      let n = 0;
      for (let i = 0; i < BEATS.length; i++) for (const [text, size, from, len] of BEATS[i].caps) {
        const f = join(tmp, `cap${n++}.png`);
        await r.render(`<div style="${style(size === 'b')}">${text}</div>`, 1920, 1080, f, { transparent: true });
        overlays.push({ file: f, s: starts[i] + from, e: starts[i] + from + len });
      }
      const endFile = join(tmp, 'end.png');
      await r.render(`<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,#1b2a44 0%,#0a101c 75%)"></div>
        <div style="position:absolute;left:0;right:0;top:330px;text-align:center;font:230px KF,sans-serif;color:#ffd45a;-webkit-text-stroke:30px #2a1608;paint-order:stroke fill;letter-spacing:8px;text-shadow:0 14px 0 rgba(0,0,0,.45)">KEEPFALL</div>
        <div style="position:absolute;left:0;right:0;top:640px;text-align:center;font:64px KF,sans-serif;color:#fff4d6;-webkit-text-stroke:11px #1c120a;paint-order:stroke fill">Wishlist on Steam</div>
        <div style="position:absolute;left:0;right:0;bottom:70px;text-align:center;font:36px KF,sans-serif;color:#e9dfc4;-webkit-text-stroke:7px #1c120a;paint-order:stroke fill">Art: Tiny Swords by Pixel Frog</div>`, 1920, 1080, endFile);
      overlays.push({ file: endFile, s: 0, e: 0, end: true });
    } finally { r.close(); }

    // music: calm track, the war track crossfaded in at the first war beat
    const warAt = starts[BEATS.findIndex((b) => b.war)];
    const audio = join(tmp, 'music.wav');
    ffmpeg(['-i', MUSIC_A, '-i', MUSIC_B, '-filter_complex',
      `[0:a]atrim=0:${(warAt + 2).toFixed(2)},asetpts=PTS-STARTPTS[a];[1:a]atrim=0:${(total - warAt + 2).toFixed(2)},asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=2:c1=tri:c2=tri,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2.5).toFixed(2)}:d=2.5,atrim=0:${total.toFixed(2)},loudnorm=I=-18:TP=-2[out]`,
      '-map', '[out]', '-ac', '2', audio]);

    // one ffmpeg run: trim, dissolve, captions, end card, music
    const inputs = []; const filters = []; let k = 0;
    const vIdx = BEATS.map((b) => {
      if (b.end) inputs.push('-f', 'lavfi', '-t', String(b.d), '-i', 'color=c=black:s=1920x1080:r=30'); else inputs.push('-ss', String(b.ss), '-t', String(b.d), '-i', REC);
      return k++;
    });
    BEATS.forEach((b, i) => filters.push(`[${vIdx[i]}:v]trim=0:${b.d},setpts=PTS-STARTPTS,fps=${FPS},scale=1920:1080:flags=lanczos,${b.logo ? DELOGO + ',' : ''}format=yuv420p,setsar=1[v${i}]`));
    let last = 'v0';
    for (let i = 1; i < BEATS.length; i++) { filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${starts[i].toFixed(3)}[x${i}]`); last = `x${i}`; }
    const endStart = starts[BEATS.length - 1];
    overlays.forEach((o, j) => {
      const s = o.end ? endStart : o.s; const e = o.end ? total : o.e; const dur = Math.max(0.6, e - s);
      const idx = k++;
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(2), '-i', o.file);
      filters.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=${o.end ? FADE : 0.3}:alpha=1,${o.end ? '' : `fade=t=out:st=${(dur - 0.3).toFixed(2)}:d=0.3:alpha=1,`}setpts=PTS+${s.toFixed(3)}/TB[o${j}]`);
      filters.push(`[${last}][o${j}]overlay=eof_action=pass:format=auto[y${j}]`); last = `y${j}`;
    });
    filters.push(`[${last}]fade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6[final]`);
    const audioIdx = k++; inputs.push('-i', audio);
    const out = join(OUT, 'keepfall-trailer-en.mp4');
    ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[final]', '-map', `${audioIdx}:a`, '-t', total.toFixed(2), '-r', String(FPS),
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
    console.log('wrote', out, (statSync(out).size / 1e6).toFixed(1) + ' MB');
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
