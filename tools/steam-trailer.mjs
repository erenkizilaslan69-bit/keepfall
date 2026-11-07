// A first cut of the Steam trailer (≈ 42 s, 1920x1080, 30 fps) from the clips that tools/promo already made (art/promo/clips/cNN-<clean|ui>.mp4).
// The order is docs/steam-magaza.md's frame plan. Video only + the CC0 war music as a placeholder; captions are put on in an editor (the plan lists them).
//   node tools/steam-trailer.mjs [--dry] [--music path.mp3] [--out art/shots/steam/trailer.mp4]
// Needs ffmpeg (winget install Gyan.FFmpeg). The output holds Tiny Swords art: art/shots/ is git-ignored, never commit it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const clips = join(root, 'art', 'promo', 'clips');
const out = opt('--out', join(root, 'art', 'shots', 'steam', 'trailer.mp4'));
const music = opt('--music', join(root, 'client', 'public', 'audio', 'music', 'war.mp3'));

// [clip, variant, start s, length s]  (what each beat says is in docs/steam-magaza.md)
const PLAN = [
  ['c01', 'clean', 0, 4],   // the castle at work
  ['c03', 'ui', 0, 3],      // weapons forged, workers armed: "every soldier is a worker lost"
  ['c04', 'clean', 0, 3],   // the scout and the fog
  ['c06', 'ui', 0, 3],      // the envoy writes
  ['c07', 'clean', 0, 4],   // the phantom army (Shadow)
  ['c09', 'clean', 0, 3],   // four kingdoms
  ['c10', 'clean', 0, 4],   // the army marches
  ['c11', 'clean', 0, 3],   // armies meet on the road
  ['c12', 'ui', 0, 5],      // the gate battle
  ['c13', 'clean', 0, 3],   // the castle falls
  ['c14', 'clean', 0, 4],   // the war from above
  ['c15', 'ui', 0, 3.5],    // victory
];
const total = PLAN.reduce((s, p) => s + p[3], 0);
console.log(`${PLAN.length} beats, ${total.toFixed(1)} s`);
const files = PLAN.map(([c, v]) => join(clips, `${c}-${v}.mp4`));
const missing = files.filter((f) => !existsSync(f));
if (missing.length) { console.error('Missing clips (run tools/promo/*.mjs, finish.mjs):\n' + missing.join('\n')); process.exit(1); }
if (args.includes('--dry')) process.exit(0);

mkdirSync(dirname(out), { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'kf-trailer-'));
const parts = PLAN.map(([c, v, ss, t], i) => {
  const p = join(tmp, `p${String(i).padStart(2, '0')}.mp4`);
  // each beat: trimmed, 30 fps, a quarter-second fade in/out so the cuts are soft
  const vf = `fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=${(t - 0.25).toFixed(2)}:d=0.25`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(ss), '-t', String(t), '-i', join(clips, `${c}-${v}.mp4`), '-vf', vf, '-an', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', p]);
  return p;
});
const list = join(tmp, 'list.txt');
writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const withMusic = existsSync(music);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...(withMusic ? ['-i', music, '-af', `afade=t=in:st=0:d=1,afade=t=out:st=${(total - 2).toFixed(1)}:d=2`, '-shortest'] : []),
  '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', ...(withMusic ? ['-c:a', 'aac', '-b:a', '192k'] : []), '-movflags', '+faststart', out]);
console.log('wrote', out);
