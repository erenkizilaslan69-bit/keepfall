// The texts the server makes for players (command errors, notices, names, kingdom data) are Turkish; the client translates them with tr()
// (client/src/i18n). This lists the Turkish string literals of the server code and checks that each has an English entry in
// client/src/i18n/en-server.ts: whole, or as a pattern where the C# interpolation {x} became {0}, {1} ... in order.
//   node tools/i18n-server-scan.mjs            report (exit code 1 when a text has no entry)
//   node tools/i18n-server-scan.mjs --dump f   write the missing texts as JSON
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const FILES = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!/^(bin|obj|BattleSim|Keepfall\.BotHost|Keepfall\.Bots)$/.test(f)) walk(p); }
    else if (/\.cs$/.test(f)) FILES.push(p);
  }
})(ROOT);
// Texts that never reach a player: configuration errors for whoever edits balance.json, the developer log, the browser error log.
const SKIP_FILES = /(BalanceConfig|ClientErrorLog|TickLoop|RoomRegistry|Program|EnvoyMessage)\.cs$/;
// fragments of an interpolation the scan cannot parse (the whole text is entered by hand in the dictionary)
const SKIP_TEXT = /^(\)\?\.|Maskeler düştü: \{0\}$|\+120 yemek)/; // the loot line ("+120 yemek, ...") is translated word by word in tr()
const TR = /[çğıöşüÇĞİÖŞÜ]/;
const WORDS = /\b(Kale|Tarla|Oduncu|Maden|Demirhane|Orman|Sandık|Köy|Çiftçi|Madenci|Demirci|Boşta|Bot|Oyuncu|Mavi|Kırmızı|Sarı|Mor|Okçu|Kılıçlı|Mızrakçı|Kalkanlı|Keşiş|Mancınık|Süvari|Haydut|Hayalet)\b/;

/** The text of a C# string literal with its interpolations as {0}, {1}, ... (null when it has none that matter). */
function convert(raw, interpolated) {
  let out = '', n = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (interpolated && c === '{') {
      if (raw[i + 1] === '{') { out += '{'; i++; continue; }
      let depth = 1, j = i + 1;
      while (j < raw.length && depth > 0) { if (raw[j] === '{') depth++; else if (raw[j] === '}') depth--; j++; }
      out += `{${n++}}`; i = j - 1; continue;
    }
    if (interpolated && c === '}' && raw[i + 1] === '}') { out += '}'; i++; continue; }
    if (c === '\\') { const e = raw[++i]; out += e === 'n' ? '\n' : e === 't' ? '\t' : e; continue; }
    out += c;
  }
  return out;
}

const found = new Map(); // text → first place
for (const file of FILES) {
  if (SKIP_FILES.test(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, li) => {
    const code = line.replace(/\/\/.*$/, (m, off) => (line.slice(0, off).split('"').length % 2 === 1 ? '' : m));
    const re = /(\$)?(@)?"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(code))) {
      const text = convert(m[3], !!m[1]);
      const plain = text.replace(/\{\d+\}/g, '');
      if (!(TR.test(plain) || (WORDS.test(plain) && /[A-Za-zçğıöşü]{3}/.test(plain)))) continue;
      if (!/[A-Za-zçğıöşüÇĞİÖŞÜ]{3}/.test(plain)) continue;
      if (/^[a-z]+(\.[a-z]+)*$/.test(text)) continue; // ids
      if (SKIP_TEXT.test(text)) continue;
      if (!found.has(text)) found.set(text, `${relative(ROOT, file)}:${li + 1}`);
    }
  });
}

// the dictionary: plain object literal(s)
const dict = {};
const dir = fileURLToPath(new URL('../client/src/i18n/', import.meta.url));
for (const f of readdirSync(dir).filter((x) => /^en.*\.ts$/.test(x))) {
  const text = readFileSync(join(dir, f), 'utf8');
  Object.assign(dict, new Function(`return ${text.slice(text.indexOf('{', text.indexOf('export const')), text.lastIndexOf('}') + 1)}`)());
}
const patterns = Object.keys(dict).filter((k) => /\{\d+\}/.test(k)).map((k) => new RegExp(`^${k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d+\}/g, '(.+?)')}$`, 's'));
const known = (text) => text in dict || patterns.some((re) => re.test(text));

const missing = [...found].filter(([text]) => !known(text));
for (const [text, where] of missing) console.log(`NO-EN ${where}  ${JSON.stringify(text)}`);
const dump = process.argv.indexOf('--dump');
if (dump > 0) writeFileSync(process.argv[dump + 1], JSON.stringify(missing.map(([t, w]) => [t, w]), null, 1));
console.log(`\n${found.size} server text(s), ${missing.length} without English`);
process.exit(missing.length ? 1 : 0);
