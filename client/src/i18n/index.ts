// Two languages, Turkish (the source language of the game) and English. The Turkish text itself is the key:
//   t('Oda kur')                       → "Create Room" in English, as written in Turkish
//   t('{0} sn kaldı', seconds)         → positional parameters, {0} {1} ...
//   tr(serverText)                     → a text the server made ("Bu oyuncu elendi", "Hayalet ordu için 4 altın gerekiyor."): looked up whole, or by pattern
// A text without an English entry stays Turkish (tools/i18n-scan.mjs lists those, so none is missed). The language is picked once per page load:
// the saved choice, else the browser's (Turkish browser → Turkish, anything else → English); the switch button saves it and reloads the page.
import { EN } from './en';
import { EN_SERVER } from './en-server';
import { EN_GUIDE } from './en-guide';

export type Lang = 'tr' | 'en';
const KEY = 'keepfall_lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'tr' || saved === 'en') return saved;
  } catch { /* storage blocked: the browser language decides */ }
  return (navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export const lang: Lang = detect();
export const isEnglish = lang === 'en';
document.documentElement.lang = lang;

/** Switches the language: saved, then the page loads again (a running match comes back through the same seat). */
export function setLang(next: Lang): void {
  try { localStorage.setItem(KEY, next); } catch { /* not saved: the browser language is used next time */ }
  location.reload();
}
export function toggleLang(): void { setLang(lang === 'tr' ? 'en' : 'tr'); }

const DICT: Record<string, string> = { ...EN, ...EN_SERVER, ...EN_GUIDE };

const fill = (text: string, args: readonly (string | number)[]): string => (args.length ? text.replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m)) : text);

/** A text of the interface (the Turkish original is the key), with {0} {1} ... filled from the arguments. */
export function t(text: string, ...args: (string | number)[]): string {
  return fill(isEnglish ? DICT[text] ?? text : text, args);
}

// Texts the server composes: the dictionary has them whole ("Bu oyuncu elendi.") or as a pattern ("{0} sn sonra ..."; only the server's own entries are patterns).
const patterns: { re: RegExp; en: string }[] = Object.entries(EN_SERVER).filter(([k]) => /\{\d+\}/.test(k)).map(([k, en]) => {
  const esc = k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d+\}/g, '\u0000');
  return { re: new RegExp(`^${esc.replace(/\u0000/g, '(.+?)')}$`, 's'), en };
}).sort((a, b) => b.re.source.length - a.re.source.length);
const cache = new Map<string, string>();
const LOOT = /^\+\d+ (?:yemek|odun|demir|altın|kişi|esir)(?:, \+\d+ (?:yemek|odun|demir|altın|kişi|esir))*$/;

/** A text that came from the server, in the player's language (unknown texts stay as they are). */
export function tr(text: string): string {
  if (!isEnglish || !text) return text;
  const whole = DICT[text];
  if (whole !== undefined) return whole;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let out = text;
  if (LOOT.test(text)) {
    // "+120 yemek, +40 altın": what a fallen castle's loot holds, word by word
    out = text.split(', ').map((part) => { const m = /^(\+\d+) (.+)$/.exec(part)!; return `${m[1]} ${DICT[m[2]] ?? m[2]}`; }).join(', ');
    cache.set(text, out);
    return out;
  }
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (m) { out = fill(p.en, m.slice(1).map(tr)); break; }
  }
  cache.set(text, out);
  return out;
}

/** A number as the language writes it: 1,5 in Turkish, 1.5 in English. */
export function numLocale(n: number, digits = 1): string {
  const s = Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(digits);
  return isEnglish ? s : s.replace('.', ',');
}

/** Iframe pages (itch.io, CrazyGames) cannot show a useful address: the room code is what players pass around. */
export function inIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
