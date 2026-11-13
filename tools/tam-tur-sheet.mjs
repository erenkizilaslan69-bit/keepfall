// Contact sheets: node tools/tam-tur-sheet.mjs <dir-with-pngs> <out.png> [columns=8] [thumb-width=400] [from-number] [to-number]
// One big picture: every screen as a thumbnail with its number and name.
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const dir = resolve(process.argv[2]), out = resolve(process.argv[3]);
const cols = Number(process.argv[4] ?? 8), tw = Number(process.argv[5] ?? 400), th = Math.round(tw * 9 / 16);
const from = Number(process.argv[6] ?? 0), to = Number(process.argv[7] ?? 999);
const files = readdirSync(dir).filter((f) => /^\d+-.*\.png$/.test(f)).filter((f) => { const n = parseInt(f, 10); return n >= from && n <= to; }).sort();
const rows = Math.ceil(files.length / cols), cellH = th + 26, W = cols * (tw + 8) + 8, H = rows * (cellH + 8) + 8;
const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#2b2118;font:13px Segoe UI,Arial,sans-serif;color:#f3e6c8"><div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:8px;padding:8px">`
  + files.map((f) => `<div style="width:${tw}px;height:${cellH}px"><img src="${pathToFileURL(join(dir, f)).href}" style="width:${tw}px;height:${th}px;display:block;object-fit:cover;border:1px solid #6b5436"><div style="padding:3px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.replace(/\.png$/, '')}</div></div>`).join('') + '</div>';
const page = join(mkdtempSync(join(tmpdir(), 'kf-sheet-')), 'sheet.html');
writeFileSync(page, html);
const b = await launch({ width: W, height: H });
try {
  await b.send('Page.navigate', { url: pathToFileURL(page).href });
  await b.waitFor(`document.images.length === ${files.length} && [...document.images].every((i) => i.complete)`, 60);
  await sleep(800);
  await b.shot(out);
  console.log(`sheet: ${files.length} pictures -> ${out} (${W}x${H})`);
} finally { b.close(); }
