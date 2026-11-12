import { t } from '../i18n';
import type { ProgressData } from './store';

// XP, levels, titles and banner patterns. The numbers and ids match the server (Keepfall.Core/Progress/Xp.cs: the server pays the XP and only
// accepts the ids listed there); everything here is looks only: nothing gives power in a match.

export const MAX_LEVEL = 30;

/** Total XP needed to be at `level` (level 1 = 0): 80 · (level − 1)^1.42 to the nearest ten, as the server computes it. */
export function xpFor(level: number): number {
  if (level <= 1) return 0;
  return Math.round(80 * Math.pow(Math.min(level, MAX_LEVEL) - 1, 1.42) / 10) * 10;
}

export function levelOf(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpFor(level + 1)) level++;
  return level;
}

/** How far through the current level the XP is, 0–1 (1 at the top level). */
export function levelFill(xp: number): number {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) return 1;
  const lo = xpFor(level), hi = xpFor(level + 1);
  return Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

// ---- titles ------------------------------------------------------------------------------------------------------------------------------------------------------

export interface TitleInfo { id: string; name: string; need: string; unlocked: (d: ProgressData) => boolean }

const byMoment = (id: string, n: number) => (d: ProgressData): boolean => (d.moments[id] ?? 0) >= n;
const byLevel = (n: number) => (d: ProgressData): boolean => levelOf(d.xp) >= n;

export const TITLES: readonly TitleInfo[] = [
  { id: 'recruit', name: t('Yeni Komutan'), need: t('Başlangıç unvanı'), unlocked: byLevel(1) },
  { id: 'keeper', name: t('Kale Bekçisi'), need: t('Seviye {0}', 5), unlocked: byLevel(5) },
  { id: 'warlord', name: t('Savaş Beyi'), need: t('Seviye {0}', 10), unlocked: byLevel(10) },
  { id: 'commander', name: t('Ordu Komutanı'), need: t('Seviye {0}', 15), unlocked: byLevel(15) },
  { id: 'marshal', name: t('Büyük Mareşal'), need: t('Seviye {0}', 20), unlocked: byLevel(20) },
  { id: 'grandmaster', name: t('Keepfall Efendisi'), need: t('Seviye {0}', 30), unlocked: byLevel(30) },
  { id: 'ghost_general', name: t('Hayalet Generali'), need: t('Hayalet ordunla 3 maçta rakibi kandır'), unlocked: byMoment('decoy', 3) },
  { id: 'liar_king', name: t('Yalancı Kral'), need: t('Sahte raporunu 3 maçta bir gözcüye okut'), unlocked: byMoment('fake_report', 3) },
  { id: 'masked_envoy', name: t('Maskeli Elçi'), need: t('Başkasının adıyla ulak gönderip 3 maçta yakalanma'), unlocked: byMoment('envoy_lie', 3) },
  { id: 'gold_tongue', name: t('Altın Dilli'), need: t('3 maçta bir orduya rüşvet ver'), unlocked: byMoment('bribe', 3) },
  { id: 'castle_breaker', name: t('Kale Yıkan'), need: t('3 maçta bir kale düşür'), unlocked: byMoment('felled', 3) },
  { id: 'triple_conqueror', name: t('Üçlü Fatih'), need: t('Üç taraflı kuşatmada bir kale düşür'), unlocked: byMoment('felled_triple', 1) },
  { id: 'last_standing', name: t('Son Kale'), need: t('3 maçta son ayakta kalan kale ol'), unlocked: byMoment('last_castle', 3) },
];

export const titleInfo = (id: string | null | undefined): TitleInfo | undefined => (id ? TITLES.find((x) => x.id === id) : undefined);

// ---- banner patterns -----------------------------------------------------------------------------------------------------------------------------------------

export interface PatternInfo { id: string; name: string; level: number }

/** Patterns are drawn in the player's own colour and say nothing about a kingdom (the kingdom stays hidden). */
export const PATTERNS: readonly PatternInfo[] = [
  { id: 'plain', name: t('Sade'), level: 1 },
  { id: 'stripes', name: t('Şeritli'), level: 3 },
  { id: 'chevron', name: t('Sırma'), level: 6 },
  { id: 'cross', name: t('Haç'), level: 9 },
  { id: 'diamond', name: t('Baklava'), level: 13 },
  { id: 'ribbon', name: t('Kurdeleli'), level: 17 },
  { id: 'star', name: t('Yıldızlı'), level: 22 },
  { id: 'crest', name: t('Armalı'), level: 27 },
];

export const patternInfo = (id: string | null | undefined): PatternInfo | undefined => (id ? PATTERNS.find((x) => x.id === id) : undefined);
export const patternUnlocked = (p: PatternInfo, d: ProgressData): boolean => levelOf(d.xp) >= p.level;

// ---- what is worn --------------------------------------------------------------------------------------------------------------------------------------------

export interface Profile { title: string | null; level: number; pattern: string | null }

/** The title, level and pattern the player really has open (a pick of something not earned falls back to the plain look). */
export function effectiveProfile(d: ProgressData): Profile {
  const title = TITLES.find((x) => x.id === d.picks.title);
  const pattern = PATTERNS.find((x) => x.id === d.picks.pattern);
  return {
    title: title && title.unlocked(d) ? title.id : null,
    level: levelOf(d.xp),
    pattern: pattern && patternUnlocked(pattern, d) && pattern.id !== 'plain' ? pattern.id : null,
  };
}

/** What a finished match opened (titles and patterns), by comparing the progress before and after. */
export function newRewards(before: ProgressData, after: ProgressData): { titles: TitleInfo[]; patterns: PatternInfo[] } {
  return {
    titles: TITLES.filter((x) => x.unlocked(after) && !x.unlocked(before)),
    patterns: PATTERNS.filter((x) => patternUnlocked(x, after) && !patternUnlocked(x, before)),
  };
}

// ---- the moments (what the server names) ------------------------------------------------------------------------------------------------------------------

export const MOMENT_NAMES = (): Record<string, string> => ({
  decoy: t('Hayalet ordun rakibi kandırdı'),
  fake_report: t('Sahte raporunu bir gözcü okudu'),
  envoy_lie: t('Başkasının adıyla ulak gönderdin, yakalanmadın'),
  disguise: t('Başkasının adıyla ordu yürüttün, yakalanmadın'),
  bribe: t('Bir orduya rüşvet verdin'),
  camp_rent: t('Bir haydut kampı kiraladın'),
  village: t('Bir köyü yağmaladın'),
  camp: t('Bir haydut kampını temizledin'),
  felled: t('Bir kale düşürdün'),
  felled_triple: t('Üç taraflı kuşatmada kale düşürdün'),
  last_castle: t('Son ayakta kalan kale oldun'),
});
