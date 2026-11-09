// Builds client/src/i18n/langs/<code>.ts from the translated chunks in docs/ceviri-parca/*.tsv. A chunk row is
//   N <TAB> zh-CN <TAB> zh-TW <TAB> ru <TAB> es-ES <TAB> es-419 <TAB> pt-BR <TAB> de <TAB> fr <TAB> ja <TAB> ko <TAB> pl <TAB> it <TAB> uk
// where N is the number of the text in docs/ceviri-kaynak.tsv (tools/i18n-extract.mjs). An empty cell means "not translated yet" (English shows). Each row is checked against its
// Turkish source: the {0} {1} placeholders and the <b>…</b> tags must be the same. The chunks are the working copy of the translations; the generated langs/*.ts files are what the game loads.
//   node tools/i18n-import.mjs [--only ru,ja]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const COLS = ['zh-CN', 'zh-TW', 'ru', 'es-ES', 'es-419', 'pt-BR', 'de', 'fr', 'ja', 'ko', 'pl', 'it', 'uk'];
const only = (process.argv.indexOf('--only') > 0 ? process.argv[process.argv.indexOf('--only') + 1].split(',') : COLS);
const source = new Map(readFileSync(join(ROOT, 'docs', 'ceviri-kaynak.tsv'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { const [n, tr, en] = l.split('\t'); return [Number(n), { tr, en }]; }));
const dir = join(ROOT, 'docs', 'ceviri-parca');
const rows = new Map(COLS.map((c) => [c, new Map()]));
let warn = 0;
const holes = (s) => [...s.matchAll(/\{(\d+)(?::[^{}]*)?\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => (s.match(/<\/?[a-z][^>]*>/gi) || []).join('');
for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.tsv')).sort() : []) {
  const lines = readFileSync(join(dir, f), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const cells = line.split('\t');
    const n = Number(cells[0]), src = source.get(n);
    if (!src) { console.warn(`${f}:${i + 1}: no text number ${cells[0]}`); warn++; return; }
    if (cells.length !== COLS.length + 1) { console.warn(`${f}:${i + 1} (#${n}): ${cells.length - 1} columns, expected ${COLS.length}`); warn++; }
    COLS.forEach((c, j) => {
      let v = (cells[j + 1] ?? '').trim();
      if (!v) return;
      // a source text that begins or ends with spaces (" ve ") keeps them: the code glues it between two other texts
      v = src.tr.match(/^\s*/)[0] + v + src.tr.match(/\s*$/)[0];
      if (holes(v) !== holes(src.tr)) { console.warn(`${f}:${i + 1} #${n} ${c}: placeholders differ (${holes(src.tr)} vs ${holes(v)}): ${v}`); warn++; return; }
      if (tags(v) !== tags(src.tr)) { console.warn(`${f}:${i + 1} #${n} ${c}: markup differs: ${v}`); warn++; return; }
      rows.get(c).set(n, v);
    });
  });
}
for (const c of COLS) {
  if (!only.includes(c)) continue;
  const m = rows.get(c);
  const body = [...m.keys()].sort((a, b) => a - b).map((n) => `  ${JSON.stringify(source.get(n).tr)}: ${JSON.stringify(m.get(n))},`).join('\n');
  writeFileSync(join(ROOT, 'client', 'src', 'i18n', 'langs', `${c}.ts`), `// ${c}: Turkish key → translation, generated from docs/ceviri-parca/*.tsv by tools/i18n-import.mjs (edit the chunks, not this file). Fixed terms: docs/ceviri-sozlugu.md.\n// A missing key falls back to English; tools/i18n-check.mjs lists them.\nconst D: Record<string, string> = {\n${body}\n};\nexport default D;\n`, 'utf8');
  console.log(`${c}: ${m.size} / ${source.size}`);
}
if (warn) console.warn(`${warn} warning(s): those cells were skipped`);
