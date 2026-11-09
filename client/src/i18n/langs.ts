// The 15 languages of the game. Turkish is the source language (its text is the key); English is the fallback of every other language. A language other than
// tr/en lives in `langs/<code>.ts` (a dictionary from the Turkish key to the translation) and is loaded on demand, so it costs nothing until it is picked.

export type Lang = 'tr' | 'en' | 'zh-CN' | 'zh-TW' | 'ru' | 'es-ES' | 'es-419' | 'pt-BR' | 'de' | 'fr' | 'ja' | 'ko' | 'pl' | 'it' | 'uk';

/** Font group: what the text of the language needs beyond Latin (Pixelify Sans: Latin + Cyrillic; the CJK fonts load only for their languages, see docs/yazi-tipi-lisanslari.md). */
export type Script = 'latin' | 'cyrillic' | 'sc' | 'tc' | 'ja' | 'ko';

export interface LangInfo { code: Lang; native: string; script: Script; steam: string }

/** In the order of the menu. `native` is the name in the language itself (never translated); `steam` is Steam's API language name (SteamApps.GetCurrentGameLanguage). */
export const LANGS: readonly LangInfo[] = [
  { code: 'en', native: 'English', script: 'latin', steam: 'english' },
  { code: 'tr', native: 'Türkçe', script: 'latin', steam: 'turkish' },
  { code: 'zh-CN', native: '简体中文', script: 'sc', steam: 'schinese' },
  { code: 'zh-TW', native: '繁體中文', script: 'tc', steam: 'tchinese' },
  { code: 'ru', native: 'Русский', script: 'cyrillic', steam: 'russian' },
  { code: 'es-ES', native: 'Español (España)', script: 'latin', steam: 'spanish' },
  { code: 'es-419', native: 'Español (Latinoamérica)', script: 'latin', steam: 'latam' },
  { code: 'pt-BR', native: 'Português (Brasil)', script: 'latin', steam: 'brazilian' },
  { code: 'de', native: 'Deutsch', script: 'latin', steam: 'german' },
  { code: 'fr', native: 'Français', script: 'latin', steam: 'french' },
  { code: 'ja', native: '日本語', script: 'ja', steam: 'japanese' },
  { code: 'ko', native: '한국어', script: 'ko', steam: 'koreana' },
  { code: 'pl', native: 'Polski', script: 'latin', steam: 'polish' },
  { code: 'it', native: 'Italiano', script: 'latin', steam: 'italian' },
  { code: 'uk', native: 'Українська', script: 'cyrillic', steam: 'ukrainian' },
];

const BY_CODE = new Map<string, LangInfo>(LANGS.map((l) => [l.code, l]));
const BY_STEAM = new Map<string, LangInfo>(LANGS.map((l) => [l.steam, l]));

export const isLang = (x: unknown): x is Lang => typeof x === 'string' && BY_CODE.has(x);
export const langInfo = (code: Lang): LangInfo => BY_CODE.get(code)!;

/** Spanish of the Americas: every Spanish locale except Spain's (es-419, es-MX, es-AR, es-US, ...). */
const LATAM = /^es-(419|mx|ar|cl|co|pe|ve|ec|uy|py|bo|cr|do|gt|hn|ni|pa|pr|sv|us|cu)$/;

/** A browser/OS language tag ("zh-Hant-HK", "pt-PT", "es-MX", "uk-UA") → one of ours, or null. */
export function fromTag(tag: string): Lang | null {
  const t = tag.toLowerCase().replace(/_/g, '-');
  if (!t) return null;
  if (t.startsWith('zh')) return /hant|-tw$|-hk$|-mo$/.test(t) ? 'zh-TW' : 'zh-CN';
  if (t.startsWith('es')) return LATAM.test(t) ? 'es-419' : 'es-ES';
  if (t.startsWith('pt')) return 'pt-BR'; // Portugal's Portuguese reads close enough; the only Portuguese we have
  const base = t.split('-')[0];
  return BY_CODE.has(base) ? (base as Lang) : null;
}

/** The language of the player: an explicit `?lang=` (also what the Steam build passes: Steam's name such as "schinese", or our code), else the first browser language that is one of ours, else English. */
export function detectLang(saved: string | null, search: string, browser: readonly string[], steamName?: string | null): Lang {
  if (isLang(saved)) return saved;
  const q = new URLSearchParams(search).get('lang');
  if (q) { const hit = isLang(q) ? q : BY_STEAM.get(q.toLowerCase())?.code ?? fromTag(q); if (hit) return hit; }
  if (steamName) { const hit = BY_STEAM.get(steamName.toLowerCase())?.code; if (hit) return hit; }
  for (const tag of browser) { const hit = fromTag(tag); if (hit) return hit; }
  return 'en';
}
