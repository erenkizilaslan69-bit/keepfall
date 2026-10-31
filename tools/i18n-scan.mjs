// Lists the string literals of client/src that look like Turkish text a player reads and are not wrapped in t(...) / tr(...),
// and checks that every t('...') key has an English entry (so a missing translation shows up here, not in front of a player).
//   node tools/i18n-scan.mjs            -> the report (exit code 1 when something is missing)
//   node tools/i18n-scan.mjs --all      -> also the literals that are already wrapped
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = fileURLToPath(new URL('../client/src/', import.meta.url));
const TR = /[çğıöşüÇĞİÖŞÜ]/;
// Turkish words that have no Turkish letter in them (the scan only finds text with one otherwise).
const WORDS = /\b(Kale|Tarla|Orman|Maden|Savas|Rapor|Orta|Zor|Kolay|Hazir|Bot|Mor|Sari|Mavi|Kirmizi|Deste|Oda|Ayarlar|Sandik|Koy|Gozcu|Ulak|Asker|Isci|Altin|Odun|Demir|Yemek|Okcu|Kilicli|Mizrakci|Kalkanli|Kesis|Mancinik|Suvari|Kapat|Sec|Geri|Hasar|Yener|Korkar|Gonder|Tumu|Yarisi|Sur|Nufus|Boste|Bosta|Kralligi|Cumhuriyeti|Kahinler|Entrikacilar|Golge|Tuccar)\b/i;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f) && !p.includes('i18n')) files.push(p);
  }
})(ROOT);

/** Literals of a source file: [{line, text, wrapped}] (comments dropped; a template with ${} keeps the pieces as {0}, {1} ...). */
function literals(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === "'" || c === '"') {
      const start = i, startLine = line; i++;
      let s = '';
      while (i < n && src[i] !== c) { if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; } s += src[i++]; }
      i++;
      out.push({ line: startLine, text: s, wrapped: /\b(t|tt|tr)\(\s*$/.test(src.slice(Math.max(0, start - 12), start)) });
      continue;
    }
    if (c === '`') {
      const start = i, startLine = line; i++;
      let s = '', k = 0;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1; i += 2;
          const inner = i;
          while (i < n && depth > 0) {
            if (src[i] === '{') depth++; else if (src[i] === '}') depth--;
            else if (src[i] === '`') { // a nested template: skip it whole
              i++; while (i < n && src[i] !== '`') { if (src[i] === '\\') i++; i++; }
            }
            if (src[i] === '\n') line++;
            i++;
          }
          // literals inside the expression are scanned too
          for (const l of literals(src.slice(inner, i - 1))) out.push({ ...l, line: startLine + l.line - 1 });
          s += `{${k++}}`;
          continue;
        }
        if (src[i] === '\n') line++;
        s += src[i++];
      }
      i++;
      out.push({ line: startLine, text: s, wrapped: /\b(t|tt|tr)\(\s*$/.test(src.slice(Math.max(0, start - 12), start)) });
      continue;
    }
    i++;
  }
  return out;
}

const IGNORE = new Set(['Türkçe', 'Tiny Swords simgeleri yüklenemedi.', 'yaklaşıyor', 'bot-end hidden', "Mavi'den", "Kırmızı'dan", "Sarı'dan", "Mor'dan", "Mavi'nin", "Kırmızı'nın", "Sarı'nın", "Mor'un", '/art/mancinik.png', 'golge:forge', 'golge:lumberCamp', 'tuccar:forge']);
const looksLikeText = (s) => {
  if (IGNORE.has(s)) return false;
  if (s.includes('/oda/')) return false;
  const plain = s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\{\d+\}/g, ' ');
  if (TR.test(plain)) return true;
  return WORDS.test(plain) && /[A-Za-z]{3}/.test(plain) && !/^[a-z-]+$/.test(plain);
};

let problems = 0;
const used = new Set();
for (const file of files) {
  const rel = file.slice(ROOT.length);
  for (const l of literals(readFileSync(file, 'utf8'))) {
    if (l.wrapped) { used.add(l.text); if (process.argv.includes('--all')) console.log(`ok   ${rel}:${l.line}  ${l.text.slice(0, 80)}`); continue; }
    if (!looksLikeText(l.text)) continue;
    problems++;
    console.log(`TEXT ${rel}:${l.line}  ${l.text.replace(/\s+/g, ' ').slice(0, 110)}`);
  }
}

// every wrapped key must have an English entry
// (the dictionaries are plain object literals: they are read without compiling)
let missing = 0;
const EN = {};
try {
  for (const f of readdirSync(join(ROOT, 'i18n')).filter((x) => /^en.*\.ts$/.test(x))) {
    const text = readFileSync(join(ROOT, 'i18n', f), 'utf8');
    const body = text.slice(text.indexOf('{', text.indexOf('export const')), text.lastIndexOf('}') + 1);
    Object.assign(EN, new Function(`return ${body}`)());
  }
} catch (e) { console.log('dictionary not readable yet:', String(e).slice(0, 80)); }
const dump = process.argv.indexOf('--dump');
const gaps = [];
for (const k of used) if (!(k in EN)) { missing++; gaps.push(k); console.log(`NO-EN ${k.slice(0, 120)}`); }
if (dump > 0) (await import('node:fs')).writeFileSync(process.argv[dump + 1], JSON.stringify(gaps, null, 1));
console.log(`\n${problems} untranslated literal(s), ${used.size} wrapped key(s), ${missing} without English`);
process.exit(problems || missing ? 1 : 0);
