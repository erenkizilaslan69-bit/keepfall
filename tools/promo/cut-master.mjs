// c12 (8 s gate battle) and c13 (4 s: the castle burning, falling, up to the end screen) are cut from the master takes. The end screen's arrival is found by scene detection.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CLIPS, encode } from './lib.mjs';
for (const f of readdirSync(CLIPS).filter((x) => /^master-(clean|ui)-t\d+\.mp4$/.test(x))) {
  const [, tag, t] = /^master-(clean|ui)-(t\d+)\.mp4$/.exec(f);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', CLIPS + f, '-vf', "select='gt(scene,0.2)',metadata=print:file=-", '-f', 'null', '-'], { encoding: 'utf8' });
  const sc = [...r.stdout.matchAll(/pts_time:([0-9.]+)[\s\S]*?lavfi.scene_score=([0-9.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]).filter(([t]) => t > 5);
  const end = sc.sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!end) { console.log(f, 'no end screen found, skipped'); continue; }
  const c13 = Math.max(0, end - 4.15), c12 = Math.max(0.3, Math.min(end - 14.2, 2));
  encode(CLIPS + f, `${CLIPS}c12-${tag}-${t}.mp4`, c12, 8);
  encode(CLIPS + f, `${CLIPS}c13-${tag}-${t}.mp4`, c13, 4);
  console.log(f, 'end screen at', end.toFixed(2), '-> c12 from', c12.toFixed(2), ', c13 from', c13.toFixed(2));
}
