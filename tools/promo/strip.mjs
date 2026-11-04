// A contact strip of a clip: node tools/promo/strip.mjs <clip.mp4> [frames=6] -> <clip>.strip.png (next to it)
import { spawnSync } from 'node:child_process';
const f = process.argv[2], n = Number(process.argv[3] ?? 6);
const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout);
const sel = Array.from({ length: n }, (_, i) => `eq(n\,${Math.round((i / (n - 1)) * (dur * 60 - 2))})`).join('+');
const cols = n > 3 ? 3 : n;
spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', f, '-vf', `select='${sel}',scale=640:-1,tile=${cols}x${Math.ceil(n / cols)}`, '-frames:v', '1', f.replace(/\.mp4$/, '.strip.png')], { stdio: 'inherit' });
