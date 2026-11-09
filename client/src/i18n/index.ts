// 15 languages. Turkish (the source language of the game) is the key: the Turkish text itself is what the code writes:
//   t('Oda kur')                       → "Create Room" in English, as written in Turkish
//   t('{0} sn kaldı', seconds)         → positional parameters, {0} {1} ...
//   tr(serverText)                     → a text the server made ("Bu oyuncu elendi", "Hayalet ordu için 4 altın gerekiyor."): looked up whole, or by pattern
// English lives in en*.ts; every other language in langs/<code>.ts (a dictionary Turkish key → translation, loaded when that language is picked: top-level await below).
// A text without an entry in the picked language falls back to English, and one without an English entry stays Turkish (tools/i18n-check.mjs lists what is missing per language).
// The language is picked once per page load: the saved choice, else `?lang=` / the Steam build's language / the browser's (the CrazyGames build: English); the language menu saves it and reloads the page.
import { EN } from './en';
import { EN_SERVER } from './en-server';
import { EN_GUIDE } from './en-guide';
import { EN_PROGRESS } from './en-progress';
import { detectLang, langInfo, type Lang } from './langs';

export { LANGS, langInfo, type Lang } from './langs';
const KEY = 'keepfall_lang';

function detect(): Lang {
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked: the browser language decides */ }
  // The CrazyGames build starts in English for everybody (their checklist asks for it); another language only when the player picks it.
  if (import.meta.env.VITE_PLATFORM === 'crazygames') return detectLang(saved, '', [], null);
  const steam = (window as unknown as { KEEPFALL_STEAM_LANG?: string }).KEEPFALL_STEAM_LANG ?? null; // set by the Steam wrapper from SteamApps.GetCurrentGameLanguage()
  return detectLang(saved, location.search, navigator.languages?.length ? navigator.languages : [navigator.language || ''], steam);
}

export const lang: Lang = detect();
export const isTurkish = lang === 'tr';
export const isEnglish = lang === 'en';
export const script = langInfo(lang).script;
document.documentElement.lang = lang;
document.documentElement.dataset.script = script; // CSS picks the font of the script from this (theme.css, "fonts of the scripts")

/** Switches the language: saved, then the page loads again (a running match comes back through the same seat). */
export function setLang(next: Lang): void {
  try { localStorage.setItem(KEY, next); } catch { /* not saved: the browser language is used next time */ }
  location.reload();
}
export function toggleLang(): void { setLang(lang === 'tr' ? 'en' : 'tr'); }

const EN_ALL: Record<string, string> = { ...EN, ...EN_SERVER, ...EN_GUIDE, ...EN_PROGRESS };
// This language's dictionary over the English one (so a missing key falls back to English). Turkish uses none.
const EXTRA: Record<string, string> = lang === 'tr' || lang === 'en' ? {} : ((await import(`./langs/${lang}.ts`)) as { default: Record<string, string> }).default;
const DICT: Record<string, string> = lang === 'en' ? EN_ALL : { ...EN_ALL, ...EXTRA };

/** Plural forms: {0:one|other}, or {0:one|few|many} for the languages with three (ru, uk, pl). The form comes from the language's own plural rule (Intl.PluralRules); a single form (zh, ja, ko) is always used. */
const rules = new Intl.PluralRules(lang === 'es-419' ? 'es' : lang);
function pluralForm(n: number, forms: string[]): string {
  if (forms.length === 1) return forms[0];
  const cat = rules.select(n);
  if (forms.length === 2) return cat === 'one' ? forms[0] : forms[1];
  return cat === 'one' ? forms[0] : cat === 'few' ? forms[1] : forms[2];
}

/** {0} {1} ... take the arguments; {0:one|other} (or three forms) picks the form for argument 0 ("{0} {0:soldier|soldiers}"). */
const fill = (text: string, args: readonly (string | number)[]): string => (args.length
  ? text.replace(/\{(\d+):([^{}]*)\}/g, (_m, i, forms) => pluralForm(Number(args[Number(i)]), String(forms).split('|')))
    .replace(/\{(\d+)\}/g, (m, i) => String(args[Number(i)] ?? m))
  : text);

/** A text of the interface (the Turkish original is the key), with {0} {1} ... filled from the arguments. */
export function t(text: string, ...args: (string | number)[]): string {
  return fill(isTurkish ? text : DICT[text] ?? text, args);
}

// Texts the server composes: the dictionary has them whole ("Bu oyuncu elendi.") or as a pattern ("{0} sn sonra ..."; only the server's own entries are patterns).
const patterns: { re: RegExp; en: string }[] = Object.keys(EN_SERVER).filter((k) => /\{\d+\}/.test(k)).map((k) => {
  const esc = k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{\d+\}/g, '\u0000');
  return { re: new RegExp(`^${esc.replace(/\u0000/g, '(.+?)')}$`, 's'), en: DICT[k] ?? EN_SERVER[k] };
}).sort((a, b) => b.re.source.length - a.re.source.length);
const cache = new Map<string, string>();
const LOOT = /^\+\d+ (?:yemek|odun|demir|altın|kişi|esir)(?:, \+\d+ (?:yemek|odun|demir|altın|kişi|esir))*$/;

/** A text that came from the server, in the player's language (unknown texts stay as they are). */
export function tr(text: string): string {
  if (isTurkish || !text) return text;
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

/** A text the server sends in two languages ({ tr, en }: challenge cards): the player's own language, else English. The other languages look the Turkish text up in their dictionary. */
export function pickText(x: { tr: string; en: string }): string {
  if (isTurkish) return x.tr;
  if (isEnglish) return x.en;
  return EXTRA[x.tr] ?? x.en;
}

const COMMA_DECIMAL = new Set<Lang>(['tr', 'de', 'fr', 'es-ES', 'ru', 'pl', 'it', 'pt-BR', 'uk']);
/** A number as the language writes it: 1,5 in Turkish, German, French, ...; 1.5 in English, Chinese, Japanese, Korean, Latin American Spanish. */
export function numLocale(n: number, digits = 1): string {
  const s = Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(digits);
  return COMMA_DECIMAL.has(lang) ? s.replace('.', ',') : s;
}

/** "50%" or "%50": Turkish writes the sign first. */
export const percentText = (x: number): string => (isTurkish ? `%${Math.round(x * 100)}` : `${Math.round(x * 100)}%`);

/** Iframe pages (itch.io, CrazyGames) cannot show a useful address: the room code is what players pass around. */
export function inIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
