// The texts to translate, in one fixed order: the Turkish keys of client/src/i18n/en*.ts plus the two-language texts of the server (challenge cards of config/challenges.json,
// the daily challenge of Keepfall.Core/Challenges/Challenges.cs: { tr, en } pairs). Writes
//   docs/ceviri-kaynaklari.json   the server's two-language texts { Turkish: English } (tools/i18n-check.mjs reads it, so they count as keys)
//   docs/ceviri-kaynak.tsv        N <TAB> Turkish <TAB> English, the numbering translators use (tools/i18n-import.mjs merges a translated column back by N)
// The numbering is frozen once translators have started: --keep-order appends new texts at the end instead of renumbering.
//   node tools/i18n-extract.mjs [--keep-order]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// ---- the server's { tr, en } texts -----------------------------------------------------------------------------------------------------------------------------------------------
const extra = {};
const add = (tr, en) => { if (tr && en) extra[tr] = en; };
const json = JSON.parse(readFileSync(join(ROOT, 'config', 'challenges.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
for (const c of json.challenges) for (const f of ['name', 'description', 'tip']) if (c[f]) add(c[f].tr, c[f].en);
const cs = readFileSync(join(ROOT, 'src', 'Keepfall.Core', 'Challenges', 'Challenges.cs'), 'utf8');
for (const m of cs.matchAll(/Tr = "((?:[^"\\]|\\.)*)", En = "((?:[^"\\]|\\.)*)"/g)) add(JSON.parse(`"${m[1]}"`), JSON.parse(`"${m[2]}"`));
writeFileSync(join(ROOT, 'docs', 'ceviri-kaynaklari.json'), JSON.stringify(extra, null, 1) + '\n', 'utf8');

// ---- the client dictionaries --------------------------------------------------------------------------------------------------------------------------------------------------
const require = createRequire(join(ROOT, 'client', 'package.json'));
const esbuild = require('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'kf-extract-'));
writeFileSync(join(dir, 'entry.ts'), ['en', 'en-server', 'en-guide', 'en-progress'].map((f, i) => `import * as m${i} from ${JSON.stringify(`${ROOT}/client/src/i18n/${f}.ts`)};`).join('\n') + '\nexport const ALL = Object.assign({}, ...[m0, m1, m2, m3].map((m) => Object.values(m)[0]));');
await esbuild.build({ entryPoints: [join(dir, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'out.mjs'), logLevel: 'error' });
const { ALL } = await import(pathToFileURL(join(dir, 'out.mjs')).href);
rmSync(dir, { recursive: true, force: true });

const SRC = { ...extra, ...ALL };
const TSV = join(ROOT, 'docs', 'ceviri-kaynak.tsv');
const clean = (s) => String(s).replace(/[\t\r\n]+/g, ' ');
let order = [];
if (process.argv.includes('--keep-order') && existsSync(TSV)) {
  order = readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')[1] ?? ''); // the frozen order (cleaned keys: texts with tabs/newlines are not expected)
  for (const k of Object.keys(SRC)) if (!order.includes(clean(k))) order.push(clean(k));
} else order = Object.keys(SRC).map(clean);
const byClean = new Map(Object.keys(SRC).map((k) => [clean(k), k]));
// A text that left the game keeps its number as an empty row (frozen order): otherwise every later number would shift and the translated chunks
// (docs/ceviri-parca, merged by number) would land on the wrong texts. Without --keep-order the list is simply renumbered.
const keep = process.argv.includes('--keep-order');
const lines = (keep ? order : order.filter((k) => byClean.has(k))).map((k, i) => (byClean.has(k) ? `${i + 1}\t${k}\t${clean(SRC[byClean.get(k)])}` : `${i + 1}\t\t`));
writeFileSync(TSV, lines.join('\n') + '\n', 'utf8');
console.log(`${lines.filter((l) => l.split('\t')[1]).length} texts, ${lines.length} numbers (${Object.keys(extra).length} from the server's two-language texts) → docs/ceviri-kaynak.tsv`);
