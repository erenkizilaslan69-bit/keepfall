// "Tofu" check for tools/i18n-check.mjs --tofu: every character the texts of a language use must be drawn by one of the fonts the language's stack has (client/src/ui/fonts.css),
// otherwise the browser falls back to some system font (or shows an empty box). The code points of a font come from its cmap table, read straight from the WOFF2 file
// (the cmap table is not transformed in WOFF2, so it needs only the Brotli stream to be opened).
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { join } from 'node:path';

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** The set of code points a WOFF2 file maps to a glyph. */
export function codePoints(file) {
  const b = readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${file} is not a WOFF2 file`);
  const numTables = b.readUInt16BE(12), totalCompressed = b.readUInt32BE(20);
  let p = 48; const tables = [];
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const x = b[p++]; v = (v << 7) | (x & 0x7f); if (!(x & 0x80)) break; } return v >>> 0; };
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++]; let tag = flags & 0x3f, xform = flags >> 6;
    tag = tag === 63 ? (p += 4, b.toString('latin1', p - 4, p)) : KNOWN[tag];
    const orig = base128();
    // glyf/loca: version 0 means "transformed" (then a transformed length follows); every other table is transformed only with a non-zero version
    const transformed = tag === 'glyf' || tag === 'loca' ? xform === 0 : xform !== 0;
    const len = transformed ? base128() : orig;
    tables.push({ tag, len });
  }
  const data = brotliDecompressSync(b.subarray(p, p + totalCompressed));
  let off = 0; let cmap = null;
  for (const t of tables) { if (t.tag === 'cmap') cmap = data.subarray(off, off + t.len); off += t.len; }
  if (!cmap) throw new Error(`${file}: no cmap`);
  const set = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const o = cmap.readUInt32BE(4 + i * 8 + 4), fmt = cmap.readUInt16BE(o);
    if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(o + 6), seg = segX2 / 2, endO = o + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let s = 0; s < seg; s++) {
        const end = cmap.readUInt16BE(endO + s * 2), start = cmap.readUInt16BE(startO + s * 2), ro = cmap.readUInt16BE(rangeO + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g = 0;
          if (ro === 0) g = (c + cmap.readInt16BE(deltaO + s * 2)) & 0xffff;
          else { const gi = rangeO + s * 2 + ro + (c - start) * 2; g = gi + 2 <= cmap.length ? cmap.readUInt16BE(gi) : 0; if (g) g = (g + cmap.readInt16BE(deltaO + s * 2)) & 0xffff; }
          if (g) set.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = cmap.readUInt32BE(o + 12);
      for (let g = 0; g < groups; g++) { const s = cmap.readUInt32BE(o + 16 + g * 12), e = cmap.readUInt32BE(o + 20 + g * 12), gl = cmap.readUInt32BE(o + 24 + g * 12); if (gl) for (let c = s; c <= e; c++) set.add(c); }
    }
  }
  return set;
}

/** Prints, per language, the characters of its texts that no font of its stack draws. Returns true when some language has any. */
export async function tofu(root, LANG, languages, SOURCE) {
  const nm = join(root, 'client', 'node_modules', '@fontsource');
  const cjk = (f) => join(root, 'client', 'src', 'fonts', 'fusion-pixel', `fusion-pixel-12px-proportional-${f}.otf.woff2`);
  const latin = ['latin', 'latin-ext'].flatMap((s) => [codePoints(join(nm, 'pixelify-sans', 'files', `pixelify-sans-${s}-400-normal.woff2`)), codePoints(join(nm, 'atkinson-hyperlegible-next', 'files', `atkinson-hyperlegible-next-${s}-400-normal.woff2`))]);
  const cyr = [codePoints(cjk('latin')), codePoints(join(nm, 'noto-sans', 'files', 'noto-sans-cyrillic-400-normal.woff2'))];
  const stacks = { 'zh-CN': [...latin, codePoints(cjk('zh_hans'))], 'zh-TW': [...latin, codePoints(cjk('zh_tw'))], ja: [...latin, codePoints(cjk('ja'))], ko: [...latin, codePoints(cjk('ko'))], ru: [...latin, ...cyr], uk: [...latin, ...cyr] };
  let any = false;
  for (const l of languages) {
    const stack = stacks[l] ?? latin;
    const bad = new Map();
    for (const [k, v] of Object.entries(LANG[l] ?? {})) for (const ch of String(v)) {
      const c = ch.codePointAt(0);
      if (c < 0x20 || c === 0xa0 || c === 0x200b || (c >= 0xfe00 && c <= 0xfe0f)) continue; // controls, no-break space, zero-width, variation selectors
      if (!stack.some((s) => s.has(c))) { if (!bad.has(ch)) bad.set(ch, k); }
    }
    if (bad.size) { any = true; console.log(`${l}: ${bad.size} character(s) no font draws: ${[...bad.keys()].join(' ')}`); for (const [ch, k] of [...bad].slice(0, 5)) console.log(`   ${ch}  U+${ch.codePointAt(0).toString(16).toUpperCase()}  in ${JSON.stringify(k)}`); }
    else console.log(`${l}: ok (${Object.keys(LANG[l] ?? {}).length} texts)`);
  }
  return any;
}
