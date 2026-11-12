// Counted nouns in the interface texts: a Turkish key with {N} whose English text puts a noun after (or before) the number must carry a plural marker {N:one|other}
// in English and a form per plural category in every language that needs one (ru, uk, pl: one|few|many; de, fr, es, pt, it: one|other; zh, ja, ko: a single form).
// Lists what has no marker yet (the English side) and checks the marked ones in all 15 languages (the right number of forms; a single form where the language has no plural).
//   node tools/plural-scan.mjs [--check]
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = join(ROOT, 'client', 'src', 'i18n');
const dict = (file) => { const out = new Map(); for (const m of readFileSync(file, 'utf8').matchAll(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)) out.set(JSON.parse(m[1]), JSON.parse(m[2])); return out; };
const en = new Map(readdirSync(dir).filter((f) => /^en.*\.ts$/.test(f)).flatMap((f) => [...dict(join(dir, f))]));
const FORMS = { en: 2, de: 2, fr: 2, 'es-ES': 2, 'es-419': 2, 'pt-BR': 2, it: 2, ru: 3, uk: 3, pl: 3, 'zh-CN': 1, 'zh-TW': 1, ja: 1, ko: 1 };
const langs = { en, ...Object.fromEntries(readdirSync(join(dir, 'langs')).filter((f) => f.endsWith('.ts')).map((f) => [f.replace('.ts', ''), dict(join(dir, 'langs', f))])) };
// nouns that are counted in the texts (the English words after / before a number)
const NOUNS = 'soldiers?|scouts?|reports?|villages?|camps?|castles?|chests?|enem(?:y|ies)|envoys?|armies|army|battles?|players?|bots?|stars?|workers?|people|persons?|bandits?|times|armies|phantom armies|bandit camps|mercenaries';
const counted = new RegExp(`\\{\\d\\}\\+?\\s+(?:${NOUNS})\\b|(?:${NOUNS})\\s*\\(\\{\\d\\}\\)`, 'i');
let bad = 0;
const marked = (v) => /\{\d:[^{}]*\|[^{}]*\}/.test(v);
const listOnly = !process.argv.includes('--check');
// counts that are never 1 (guide numbers, "(needs 3+ soldiers)"), "N/M soldiers" fractions, and sentences whose {0} is a player's name: no plural to choose
const NO_PLURAL = /^(Çiftlik, kereste|<b>\{0\}<\/b>: savaşın|Her köşenin|<b>Köy<\/b>|Rakibe yürüyen hayalet ordu|\(en az \{0\} asker\)|Silah için odun|Silahlar üretiliyor|\{0\} sahte bir ordu|\{0\}, \{1\} ordusundan|\{0\}, bir haydut kampını|\{0\} dolu:|\{0\} askerlerinin|\{0\} gözcüsü|\{0\} ulağı|\{0\} paralı asker)/;
for (const [k, v] of en) {
  if (NO_PLURAL.test(k)) continue;
  if (!/\{\d\}/.test(k) && !/\{\d:/.test(v)) continue;
  if (counted.test(v.replace(/\{\d:[^{}]*\}/g, ''))) { bad++; console.log('NO MARKER  ' + k + '  =>  ' + v); }
}
if (!listOnly) {
  for (const [lang, d] of Object.entries(langs)) for (const [k, v] of d) {
    for (const m of v.matchAll(/\{(\d):([^{}]*)\}/g)) {
      const n = m[2].split('|').length;
      if (n !== FORMS[lang]) { bad++; console.log(`WRONG FORMS ${lang}: ${k} => ${v} (${n} forms, wants ${FORMS[lang]})`); }
    }
    // a key that carries a marker in English must carry one in the languages that have plurals (unless the sentence was turned round to avoid the count)
  }
}
console.log(bad ? `\n${bad} problem(s)` : '\nNo problems');
process.exit(bad && !listOnly ? 1 : 0);
