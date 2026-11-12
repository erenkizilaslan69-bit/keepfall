// Translation status of the 15 languages: which keys (the Turkish source texts of client/src/i18n/en*.ts, the server's text lists included) a language has not translated,
// stale keys, broken {0} placeholders and plural forms, empty values. English is the fallback, so a missing key shows English, never nothing.
//   node tools/i18n-check.mjs                       -> a table, one line per language (exit code 0)
//   node tools/i18n-check.mjs --lang ru             -> the missing keys of one language (also the problems)
//   node tools/i18n-check.mjs --strict              -> exit code 1 when any language has a problem (placeholders, empty values) — or, with --complete, any missing key
//   node tools/i18n-check.mjs --report docs/i18n-durum.md   -> the table written as a markdown file
//   node tools/i18n-check.mjs --csv out.csv --langs zh-CN,ru,es-ES   -> key, en, <langs...> for a native speaker to check (UTF-8 with BOM, so Excel opens it right)
//   node tools/i18n-check.mjs --tofu                -> characters of each language's texts that its font (docs/yazi-tipi-lisanslari.md) cannot draw
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const flag = (n) => process.argv.includes(n);
const LANGS = ['en', 'tr', 'zh-CN', 'zh-TW', 'ru', 'es-ES', 'es-419', 'pt-BR', 'de', 'fr', 'ja', 'ko', 'pl', 'it', 'uk'];
const TRANSLATED = LANGS.filter((l) => l !== 'tr' && l !== 'en');
/** Plural forms a language may write in {0:a|b|c}: Chinese/Japanese/Korean have one (a single form), the East Slavic ones and Polish three, the rest two. */
const FORMS = { 'zh-CN': [1], 'zh-TW': [1], ja: [1], ko: [1], ru: [3], uk: [3], pl: [3] };

// the dictionaries are TypeScript: bundle them with the esbuild that comes with vite
const require = createRequire(join(ROOT, 'client', 'package.json'));
const esbuild = require('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'kf-i18n-'));
const entry = `import { EN } from ${JSON.stringify(ROOT + '/client/src/i18n/en.ts')};
import { EN_SERVER } from ${JSON.stringify(ROOT + '/client/src/i18n/en-server.ts')};
import { EN_GUIDE } from ${JSON.stringify(ROOT + '/client/src/i18n/en-guide.ts')};
import { EN_PROGRESS } from ${JSON.stringify(ROOT + '/client/src/i18n/en-progress.ts')};
${TRANSLATED.map((l, i) => `import d${i} from ${JSON.stringify(`${ROOT}/client/src/i18n/langs/${l}.ts`)};`).join('\n')}
export const EN_ALL = { ...EN, ...EN_SERVER, ...EN_GUIDE, ...EN_PROGRESS };
export const LANG = { ${TRANSLATED.map((l, i) => `${JSON.stringify(l)}: d${i}`).join(', ')} };`;
writeFileSync(join(dir, 'entry.ts'), entry);
await esbuild.build({ entryPoints: [join(dir, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'out.mjs'), logLevel: 'error' });
const { EN_ALL, LANG } = await import(pathToFileURL(join(dir, 'out.mjs')).href);
rmSync(dir, { recursive: true, force: true });

// the texts the server sends in two languages (challenge cards: { tr, en }) are keys as well; they come from docs/ceviri-kaynaklari.json when that exists (tools/i18n-extract.mjs writes it)
const EXTRA_SRC = join(ROOT, 'docs', 'ceviri-kaynaklari.json');
const extra = existsSync(EXTRA_SRC) ? JSON.parse(readFileSync(EXTRA_SRC, 'utf8')) : {};
const SOURCE = { ...extra, ...EN_ALL }; // Turkish key → English
const keys = Object.keys(SOURCE);

const holes = (s) => [...new Set([...s.matchAll(/\{(\d+)(?::[^{}]*)?\}/g)].map((m) => m[1]))].sort().join(','); // (a {0:one|other} marker names the same hole as {0})
const tags = (s) => (s.match(/<\/?[a-z][^>]*>/gi) || []).join('');
const results = {};
for (const l of TRANSLATED) {
  const d = LANG[l] ?? {};
  const missing = [], problems = [];
  for (const k of keys) {
    const v = d[k];
    if (v === undefined) { missing.push(k); continue; }
    if (typeof v !== 'string' || v.trim() === '') { problems.push(`empty: ${k}`); continue; }
    if (holes(v) !== holes(k)) problems.push(`placeholders differ: ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
    if (tags(v) !== tags(k)) problems.push(`markup differs: ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
    for (const m of v.matchAll(/\{\d+:([^{}]*)\}/g)) { const n = m[1].split('|').length; if (FORMS[l] ? !FORMS[l].includes(n) : n !== 2) problems.push(`plural forms (${n}) not right for ${l}: ${JSON.stringify(v)}`); }
  }
  const stale = Object.keys(d).filter((k) => !(k in SOURCE));
  results[l] = { total: keys.length, done: keys.length - missing.length, missing, problems, stale };
}

if (flag('--csv')) {
  const out = arg('--csv'), langs = (arg('--langs') || 'zh-CN,ru,es-ES').split(',');
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['key', 'en', ...langs].map(q).join(',')];
  for (const k of keys) rows.push([k, SOURCE[k], ...langs.map((l) => LANG[l]?.[k] ?? '')].map(q).join(','));
  writeFileSync(out, '﻿' + rows.join('\r\n') + '\r\n', 'utf8');
  console.log(`wrote ${out}: ${keys.length} rows, columns key, en, ${langs.join(', ')}`);
  process.exit(0);
}

if (flag('--tofu')) {
  const { tofu } = await import('./i18n-tofu.mjs');
  const bad = await tofu(ROOT, LANG, TRANSLATED, SOURCE);
  process.exit(bad ? 1 : 0);
}

const pct = (r) => `${((r.done / r.total) * 100).toFixed(1)}%`;
const lines = [`keys: ${keys.length} (Turkish source) — English has ${keys.filter((k) => EN_ALL[k] !== undefined).length}`, '', 'lang    done / total   %       missing  problems  stale', '------  -------------  ------  -------  --------  -----'];
for (const l of TRANSLATED) { const r = results[l]; lines.push(`${l.padEnd(6)}  ${`${r.done} / ${r.total}`.padEnd(13)}  ${pct(r).padEnd(6)}  ${String(r.missing.length).padEnd(7)}  ${String(r.problems.length).padEnd(8)}  ${r.stale.length}`); }

const one = arg('--lang');
if (one) {
  const r = results[one];
  if (!r) { console.error(`unknown language ${one} (one of ${TRANSLATED.join(', ')})`); process.exit(2); }
  console.log(lines.join('\n'));
  console.log(`\n== ${one}: ${r.missing.length} missing`); for (const k of r.missing) console.log(`  ${JSON.stringify(k)}`);
  if (r.problems.length) { console.log(`\n== ${one}: problems`); for (const p of r.problems) console.log('  ' + p); }
  if (r.stale.length) { console.log(`\n== ${one}: stale keys (no longer in the source)`); for (const k of r.stale) console.log(`  ${JSON.stringify(k)}`); }
} else console.log(lines.join('\n'));

const rep = arg('--report');
if (rep) {
  const md = ['# Çeviri durumu (otomatik: `node tools/i18n-check.mjs --report docs/i18n-durum.md`)', '', `Kaynak: ${keys.length} Türkçe anahtar (İngilizce yedek dil). Eksik anahtar İngilizce görünür.`, '', '| Dil | Çevrilen | % | Eksik | Sorun | Eski anahtar |', '|---|---|---|---|---|---|', ...TRANSLATED.map((l) => { const r = results[l]; return `| ${l} | ${r.done} / ${r.total} | ${pct(r)} | ${r.missing.length} | ${r.problems.length} | ${r.stale.length} |`; }), ''];
  writeFileSync(resolve(rep), md.join('\r\n'), 'utf8');
}
const bad = TRANSLATED.some((l) => results[l].problems.length || (flag('--complete') && results[l].missing.length));
process.exit(flag('--strict') && bad ? 1 : 0);
