// The receiver's side of the envoy filter. Two tiers (docs/kufur-filtresi.md): hate speech is masked by the server, always, before a message ever
// leaves it; ordinary swearing arrives as written and is masked HERE, by the reader's own setting ("Hafif küfürleri filtrele", on by default): each
// player sees what they chose to see. The same rules as EnvoyMessage.cs: `stem*` = a word that begins with it, a plain entry = that whole word,
// Chinese / Japanese / Korean entries match anywhere (no spaces between words); the Turkish dotted and dotless i stand for each other.
import { MILD_LISTS, MILD_STEMS, MILD_WHOLE } from './profanity-lists';

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const letters = (word: string): string => [...word].map((c) => (c === 'i' || c === 'ı' ? '[iıİI]' : esc(c))).join('');

let pattern: RegExp | null | undefined;
function build(): RegExp | null {
  try {
    const stems = MILD_STEMS.map(letters), wholes = MILD_WHOLE.map(letters), cjk: string[] = [];
    for (const [lang, list] of Object.entries(MILD_LISTS)) {
      for (const entry of list) {
        if (lang === 'zh' || lang === 'ja' || lang === 'ko') { if (entry.length >= 2) cjk.push(esc(entry)); continue; }
        const stem = entry.endsWith('*'), word = stem ? entry.slice(0, -1) : entry;
        if (word.length < 3) continue;
        const p = letters(word.toLowerCase()).replace(/ /g, '\\s+').replace(/[её]/g, '[её]');
        (stem ? stems : wholes).push(p);
      }
    }
    const byLength = (l: string[]) => [...new Set(l)].sort((a, b) => b.length - a.length).join('|');
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:${byLength(stems)})\\p{L}*|(?:${byLength(wholes)})(?![\\p{L}\\p{N}]))|(?:${byLength(cjk)})`, 'giu');
  } catch { return null; } // (a browser without look-behind: nothing is masked here; the server's tier still is)
}

/** The text with its mild swear words as stars of the same length. */
export function maskMild(text: string): string {
  if (pattern === undefined) pattern = build();
  return pattern ? text.replace(pattern, (m) => '*'.repeat(m.length)) : text;
}
