// Marks the best take of every clip (art/promo/best.json: { "c01": { "clean": 2, "ui": 1 }, ... }; default take 1), copies it to cNN-clean.mp4 / cNN-ui.mp4,
// writes art/promo/clips/index.html (catalogue with previews and durations) and README.md. Usage: node tools/promo/finish.mjs
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CLIPS } from './lib.mjs';
const NAMES = {
  c01: 'Morning: the castle at work', c02: 'A building rises level 1 to 4', c03: 'Weapons forged, workers armed', c04: 'The scout and the fog', c05: 'The scout report opens',
  c06: 'The envoy writes a message', c07: 'Shadow Kingdom: the phantom army', c08: 'Merchant Republic: a hired bandit camp', c09: 'The four kingdoms', c10: 'The great army marches out',
  c11: 'Two armies meet on the road', c12: 'The gate battle', c13: 'The castle falls', c14: 'The war from above', c15: 'Victory screen',
};
const NOTE = { c05: 'UI version only', c06: 'UI version only', c15: 'UI version only' };
const dir = CLIPS, root = dir + '../';
const best = existsSync(root + 'best.json') ? JSON.parse(readFileSync(root + 'best.json', 'utf8')) : {};
const dur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout) || 0;
const files = readdirSync(dir).filter((f) => /^c\d\d-(clean|ui)-t\d+\.mp4$/.test(f));
const clips = [...new Set(files.map((f) => f.slice(0, 3)))].sort();
const cards = [];
for (const c of clips) {
  const row = { c, tags: [] };
  for (const tag of ['clean', 'ui']) {
    const takes = files.filter((f) => f.startsWith(`${c}-${tag}-t`)).sort();
    if (!takes.length) continue;
    const pick = best[c]?.[tag] ?? 1;
    const chosen = takes.find((f) => f.endsWith(`-t${pick}.mp4`)) ?? takes[0];
    copyFileSync(dir + chosen, `${dir}${c}-${tag}.mp4`);
    row.tags.push({ tag, final: `${c}-${tag}.mp4`, takes, chosen, seconds: dur(dir + chosen) });
  }
  cards.push(row);
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Keepfall trailer clips</title>
<style>:root{color-scheme:dark;--bg:#14181d;--card:#1d242c;--ink:#e8edf2;--mut:#93a1b0;--acc:#f2b84b}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,sans-serif;padding:24px 16px}
h1{margin:0 0 4px}p.sub{color:var(--mut);margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;max-width:1500px;margin:auto}
.card{background:var(--card);border-radius:10px;padding:12px}.card h2{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between;gap:8px}.card h2 small{color:var(--mut);font-weight:400}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair.one{grid-template-columns:1fr}.v{position:relative}video{width:100%;border-radius:6px;background:#000;display:block}
.tag{font-size:12px;color:var(--mut);margin:4px 0 0;display:flex;justify-content:space-between}.best{color:var(--acc)}@media(max-width:600px){.pair{grid-template-columns:1fr}}</style></head><body>
<h1>Keepfall trailer clips</h1><p class="sub">1920x1080, 60 fps, H.264 (CRF 18). Each clip: clean (no interface) and UI versions, best take marked. Not for the repository (Tiny Swords art).</p>
<div class="grid">${cards.map((r) => `<div class="card"><h2><span>${r.c} · ${NAMES[r.c] ?? ''}</span><small>${r.tags[0] ? r.tags[0].seconds.toFixed(1) + ' s' : ''}${NOTE[r.c] ? ' · ' + NOTE[r.c] : ''}</small></h2>
<div class="pair${r.tags.length === 1 ? ' one' : ''}">${r.tags.map((t) => `<div class="v"><video src="${t.final}" controls muted loop preload="metadata" playsinline></video><div class="tag"><span>${t.tag === 'clean' ? 'clean' : 'with UI'}</span><span class="best">best: ${t.chosen.replace(/^.*-(t\d+)\.mp4$/, '$1')} of ${t.takes.length}</span></div></div>`).join('')}</div></div>`).join('')}</div></body></html>`;
writeFileSync(dir + 'index.html', html);
const readme = `# Keepfall trailer clips

Made with \`tools/promo/\` (headed Chrome on the GPU, 1920x1080, recorded with ffmpeg \`ddagrab\` at 60 fps, re-encoded H.264 CRF 18 \`-preset veryfast\`).
Nothing in the game was changed for the shoot: only the dev hooks (\`keepfallScene\` / \`keepfallUi\` / \`keepfallNet\`) and a temporary balance copy
(\`art/promo/balance.promo.json\`: bigger start stores so the scenes can be staged quickly; the real \`config/balance.json\` is untouched).
Player name: Eren. Clean versions hide every HTML layer (labels, bars, windows, minimap); UI versions show the game as played (no debug, no FPS, no dev buttons).

| Clip | What | Seconds | Files |
|---|---|---|---|
${cards.map((r) => `| ${r.c} | ${NAMES[r.c] ?? ''}${NOTE[r.c] ? ' (' + NOTE[r.c] + ')' : ''} | ${r.tags[0]?.seconds.toFixed(1) ?? ''} | ${r.tags.map((t) => `\`${t.final}\` (best: ${t.chosen.replace(/^.*-(t\d+)\.mp4$/, '$1')})`).join(', ')} |`).join('\n')}

All takes are kept as \`cNN-<clean|ui>-tK.mp4\`; the best one is copied to \`cNN-<clean|ui>.mp4\`. Choose another with \`art/promo/best.json\` (\`{ "c01": { "clean": 2 } }\`) and run \`node tools/promo/finish.mjs\`.
Also here: \`../keepfall-logo-transparent.png\` (trimmed, 2488x1100) and \`-fullcanvas.png\` (2752x1536) cut from the generated logo at its full resolution; \`../lobby-background-game.jpg\` (2752x1536, no interface).

Open \`index.html\` for the catalogue. Not for the repository: the clips contain Tiny Swords art (\`art/promo/\` is git-ignored).
`;
writeFileSync(dir + 'README.md', readme);
console.log(cards.length, 'clips catalogued');
