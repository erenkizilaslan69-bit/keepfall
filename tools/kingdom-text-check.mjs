// The four kingdoms' texts, as the server holds them (src/Keepfall.Core/Match/Factions.cs: name, title, the identity sentence, the abilities), checked
// in all 15 languages: every text must have its translation (so no card shows another kingdom's words or falls back to another language), no two
// kingdoms may share a translated name / title / sentence, and an ability must belong to one kingdom only. Prints the English table to read.
//   node tools/kingdom-text-check.mjs [--json]      (--json: the factions as JSON, for tools/shot-kingdom-cards.mjs)
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cs = readFileSync(join(ROOT, 'src', 'Keepfall.Core', 'Match', 'Factions.cs'), 'utf8');
const str = (s) => JSON.parse(`"${s}"`);
const IDS = { Shadow: 'golge', Merchant: 'tuccar', Oracle: 'kahin', Schemer: 'entrikaci' };
export const factions = [...cs.matchAll(/new\((Shadow|Merchant|Oracle|Schemer), "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)", "(\w+)",\s*"((?:[^"\\]|\\.)*)",\s*\[([\s\S]*?)\]\)/g)].map((m) => ({
  id: IDS[m[1]], name: str(m[2]), title: str(m[3]), look: m[4], decree: str(m[5]),
  abilities: [...m[6].matchAll(/new\("(\w+)", "((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\)/g)].map((a) => ({ id: a[1], name: str(a[2]), text: str(a[3]) })),
}));
if (process.argv.includes('--json')) { console.log(JSON.stringify(factions)); process.exit(0); }

const dict = (file) => { const out = new Map(); for (const m of readFileSync(file, 'utf8').matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)) out.set(JSON.parse(m[1]), JSON.parse(m[2])); return out; };
const dir = join(ROOT, 'client', 'src', 'i18n');
const en = new Map(readdirSync(dir).filter((f) => /^en.*\.ts$/.test(f)).flatMap((f) => [...dict(join(dir, f))]));
const langs = { en, ...Object.fromEntries(readdirSync(join(dir, 'langs')).filter((f) => f.endsWith('.ts')).map((f) => [f.replace('.ts', ''), dict(join(dir, 'langs', f))])) };

let bad = 0;
const fail = (m) => { console.log('FAIL ' + m); bad++; };
if (factions.length !== 4 || factions.some((f) => f.abilities.length < 2)) fail(`could not read the four kingdoms from Factions.cs (${factions.length})`);
for (const [lang, d] of Object.entries(langs)) {
  const seen = new Map();
  for (const f of factions) {
    for (const [what, text] of [['name', f.name], ['title', f.title], ['identity sentence', f.decree], ...f.abilities.flatMap((a) => [[`ability ${a.id} name`, a.name], [`ability ${a.id} text`, a.text]])]) {
      const tr = d.get(text);
      if (!tr) { fail(`${lang}: ${f.id} ${what} has no translation ("${text.slice(0, 40)}")`); continue; }
      const key = `${what.replace(/ability \w+ /, 'ability ')}:${tr}`;
      if (seen.has(key) && seen.get(key) !== f.id) fail(`${lang}: ${f.id} and ${seen.get(key)} share the same ${what}: "${tr.slice(0, 40)}"`);
      seen.set(key, f.id);
    }
  }
}
// Turkish (the source): the same uniqueness
for (const what of ['name', 'title', 'decree']) if (new Set(factions.map((f) => f[what])).size !== 4) fail(`tr: two kingdoms share a ${what}`);

console.log('\nThe kingdoms in English (as the cards show them):');
for (const f of factions) {
  console.log(`\n  ${f.id}  ${en.get(f.name)} — ${en.get(f.title)}`);
  console.log(`    "${en.get(f.decree)}"`);
  for (const a of f.abilities) console.log(`    · ${en.get(a.name)}: ${(en.get(a.text) ?? '').slice(0, 90)}…`);
}
console.log(bad ? `\n${bad} problem(s)` : `\nAll four kingdoms have their own name, title, sentence and abilities in ${Object.keys(langs).length + 1} languages`);
process.exit(bad ? 1 : 0);
