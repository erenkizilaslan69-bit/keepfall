import { t } from '../i18n';
import { KINGDOM_IDS, progressStore, type KingdomId, type ProgressData } from './store';

// What can be earned. The ids are the contract with the server (match achievements are worked out there, see Keepfall.Core/Progress)
// and with Steam later; names and descriptions are for this screen only. docs/basarimlar.md lists them with the Steam text.

export interface AchievementInfo { id: string; kind: 'match' | 'meta'; name: string; desc: string }

/** Decided by the server at the end of a match (the ids of Keepfall.Core.Progress.Achievements). */
const MATCH: [string, string, string][] = [
  ['first_win', t('İlk Zafer'), t('Bir maçı kazan.')],
  ['challenge_win', t('Meydan Okuyucu'), t('Bir meydan okumayı kazan.')],
  ['challenge_3star', t('Üç Yıldız'), t('Bir meydan okumayı üç yıldızla bitir.')],
  ['daily_win', t('Günün Şampiyonu'), t('Günlük meydan okumayı kazan.')],
  ['ghost_win', t('Hayalet Zafer'), t('Hayalet orduyla rakibi oyalayıp maçı kazan.')],
  ['village_raid', t('Köy Yağması'), t('Ormandaki bir köyü yağmala.')],
  ['village_x3', t('Üç Köy Yandı'), t('Tek maçta üç köy yağmala.')],
  ['camp_clear', t('Haydut Avcısı'), t('Bir haydut kampını temizle.')],
  ['early_win', t('Kıtlık Gelmeden'), t('Kıtlık başlamadan maçı kazan.')],
  ['castle_felled', t('Kale Yıkıcı'), t('Bir rakip kaleyi düşür.')],
  ['flawless', t('Kansız Zafer'), t('Hiç asker kaybetmeden, en az bir savaş kazanarak maçı kazan.')],
  ['comeback', t('Küllerinden'), t('İki savaş kaybedip yine de maçı kazan.')],
  ['last_standing', t('Son Ayakta'), t('Üç ya da dört kişilik maçta tüm rakipleri eleyerek kazan.')],
  ['full_table', t('Dört Kişilik Masa'), t('Üç rakibe karşı maçı kazan.')],
  ['hard_bot_win', t('Zoru Yendin'), t('Zor bir botun olduğu maçı kazan.')],
  ['scout_report', t('Göz Kulak'), t('Bir gözcü gönder ve raporunu oku.')],
  ['envoy', t('Ulak Postası'), t('Bir ulağın rakibe ulaşsın.')],
  ['fake_report', t('Yalancı Şahit'), t('Gölge olarak sahte bir ordu tablosu yaz.')],
  ['bribe', t('Altın Dil'), t('Tüccar olarak bir orduya rüşvet ver.')],
  ['camp_rent', t('Kiralık Kılıç'), t('Tüccar olarak bir haydut kampı kirala.')],
  ['disguise', t('Maskeli Balo'), t('Entrikacı olarak başkasının adıyla ordu ya da ulak gönder.')],
  ['brave_fall', t('Onurlu Düşüş'), t('Kalen düşsün ama önce en az üç savaş kazan.')],
];

/** What the client works out from the history (the browser's own store, plus the stars of the challenges). */
export interface MetaContext { data: ProgressData; challengeStars: Record<string, number>; challengeCount: number }
const fixed = (c: MetaContext): [string, number][] => Object.entries(c.challengeStars).filter(([id]) => !id.startsWith('daily-'));

const META: [string, string, string, (c: MetaContext) => boolean][] = [
  ['matches_10', t('Kıdemli'), t('On maç bitir.'), (c) => c.data.matches >= 10],
  ['wins_10', t('On Zafer'), t('On maç kazan.'), (c) => c.data.wins >= 10],
  ['wins_25', t('Fatih'), t('Yirmi beş maç kazan.'), (c) => c.data.wins >= 25],
  ['all_kingdoms', t('Dört Krallık'), t('Her krallıkla en az bir maç kazan.'), (c) => KINGDOM_IDS.every((k) => c.data.kingdoms[k].won >= 1)],
  ['kingdom_master', t('Krallık Ustası'), t('Bir krallıkta ustalığın en üst düzeyine çık.'), (c) => KINGDOM_IDS.some((k) => masteryLevel(c.data.kingdoms[k].won) >= 3)],
  ['challenges_all', t('Meydan Okumaların Sonu'), t('Tüm meydan okumaları en az bir yıldızla geç.'), (c) => c.challengeCount > 0 && fixed(c).filter(([, s]) => s >= 1).length >= c.challengeCount],
  ['challenges_perfect', t('Kusursuz Defter'), t('Tüm meydan okumalarda üç yıldız topla.'), (c) => c.challengeCount > 0 && fixed(c).filter(([, s]) => s >= 3).length >= c.challengeCount],
  ['stars_12', t('Yıldız Avcısı'), t('Meydan okumalarda toplam on iki yıldız topla.'), (c) => fixed(c).reduce((n, [, s]) => n + s, 0) >= 12],
];

export const ACHIEVEMENTS: readonly AchievementInfo[] = [
  ...MATCH.map(([id, name, desc]) => ({ id, kind: 'match' as const, name, desc })),
  ...META.map(([id, name, desc]) => ({ id, kind: 'meta' as const, name, desc })),
];

// ---- mastery -----------------------------------------------------------------------------------------------------------------------------------------------

/** Wins with a kingdom needed for mastery level 1, 2 and 3. */
export const MASTERY_WINS = [1, 5, 15] as const;

export function masteryLevel(won: number): number {
  return MASTERY_WINS.filter((n) => won >= n).length;
}

/** Wins still needed for the next level (null at the top). */
export function nextMastery(won: number): number | null {
  return MASTERY_WINS.find((n) => won < n) ?? null;
}

export const KINGDOM_NAMES: Record<KingdomId, string> = {
  golge: t('Gölge Krallığı'), tuccar: t('Tüccar Cumhuriyeti'), kahin: t('Kâhinler'), entrikaci: t('Entrikacılar'),
};

// ---- cosmetics (never change how the game plays) --------------------------------------------------------------------------------------------------------

export interface Cosmetic { id: string; kind: 'banner' | 'frame'; kingdom?: KingdomId; design?: string; frame?: string; name: string; need: string }

export const FRAMES: { id: string; name: string; achievements: number }[] = [
  { id: 'bronze', name: t('Bronz çerçeve'), achievements: 3 },
  { id: 'silver', name: t('Gümüş çerçeve'), achievements: 10 },
  { id: 'gold', name: t('Altın çerçeve'), achievements: 20 },
];

const DESIGN_LEVEL: Record<string, number> = { b: 2, c: 3 };

export const COSMETICS: readonly Cosmetic[] = [
  ...FRAMES.map((f) => ({ id: `frame:${f.id}`, kind: 'frame' as const, frame: f.id, name: f.name, need: t('{0} başarım aç', f.achievements) })),
  ...KINGDOM_IDS.flatMap((k) => ['b', 'c'].map((d) => ({
    id: `banner:${k}:${d}`, kind: 'banner' as const, kingdom: k, design: d,
    name: t('{0} flaması {1}', KINGDOM_NAMES[k], d === 'b' ? 'II' : 'III'),
    need: t('{0} ile {1} maç kazan', KINGDOM_NAMES[k], MASTERY_WINS[DESIGN_LEVEL[d] - 1]),
  }))),
];

export const earnedCount = (data: ProgressData): number => Object.keys(data.achievements).length;

export function isUnlocked(c: Cosmetic, data: ProgressData): boolean {
  if (c.kind === 'frame') return earnedCount(data) >= (FRAMES.find((f) => f.id === c.frame)?.achievements ?? 1e9);
  return masteryLevel(data.kingdoms[c.kingdom!].won) >= DESIGN_LEVEL[c.design!];
}

export const unlockedCosmetics = (data: ProgressData): string[] => COSMETICS.filter((c) => isUnlocked(c, data)).map((c) => c.id);

/** The picks that are really open to the player: a pick of something not yet earned (or after a reset) falls back to the plain look. */
export function effectivePicks(data: ProgressData): { frame: string | null; banners: string[] } {
  const fr = FRAMES.find((f) => f.id === data.picks.frame);
  const frame = fr && isUnlocked(COSMETICS.find((c) => c.id === `frame:${fr.id}`)!, data) ? fr.id : null;
  const banners: string[] = [];
  for (const k of KINGDOM_IDS) {
    const d = data.picks.banners[k];
    if (d && d !== 'a' && COSMETICS.some((c) => c.id === `banner:${k}:${d}` && isUnlocked(c, data))) banners.push(`${k}:${d}`);
  }
  return { frame, banners };
}

/** The banner design for a kingdom as the game hangs it at the player's own castle ("a" = plain). */
export function bannerDesign(kingdom: string): string {
  const picks = effectivePicks(progressStore().load()).banners.find((b) => b.startsWith(`${kingdom}:`));
  return picks ? picks.split(':')[1] : 'a';
}

export function setFramePick(frame: string | null): void {
  const store = progressStore(), d = store.load();
  d.picks.frame = frame;
  store.save(d);
}

export function setBannerPick(kingdom: KingdomId, design: string): void {
  const store = progressStore(), d = store.load();
  if (design === 'a') delete d.picks.banners[kingdom]; else d.picks.banners[kingdom] = design;
  store.save(d);
}

// ---- recording a finished match ----------------------------------------------------------------------------------------------------------------------------

export interface ProgressDelta {
  /** Achievements earned just now (match ones from the server, then the history ones). */
  newAchievements: AchievementInfo[];
  kingdom: KingdomId | null;
  won: boolean;
  masteryBefore: number;
  masteryAfter: number;
  winsAfter: number;
  /** Cosmetics that opened with this match. */
  newCosmetics: Cosmetic[];
}

const isKingdom = (k: string | null | undefined): k is KingdomId => !!k && (KINGDOM_IDS as readonly string[]).includes(k);

/** Adds the history achievements that are now true. Returns their ids. */
function addMeta(data: ProgressData, ctx: Omit<MetaContext, 'data'>, now: number): string[] {
  const out: string[] = [];
  for (const [id, , , rule] of META) {
    if (data.achievements[id] === undefined && rule({ ...ctx, data })) { data.achievements[id] = now; out.push(id); }
  }
  return out;
}

const info = (id: string): AchievementInfo | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** The result of a match the server reported (only ids this client knows are taken). Saves and says what changed. */
export function recordMatch(
  result: { kingdom: string | null; won: boolean; lesson?: boolean; earned: string[] },
  ctx: Omit<MetaContext, 'data'>, now = Date.now(),
): ProgressDelta {
  const store = progressStore(), data = store.load();
  const cosmeticsBefore = new Set(unlockedCosmetics(data));
  const kingdom = isKingdom(result.kingdom) ? result.kingdom : null;
  const before = kingdom ? masteryLevel(data.kingdoms[kingdom].won) : 0;
  data.matches++;
  if (result.won) data.wins++;
  if (kingdom) { data.kingdoms[kingdom].played++; if (result.won) data.kingdoms[kingdom].won++; }
  const ids: string[] = [];
  for (const id of result.earned) {
    if (info(id)?.kind === 'match' && data.achievements[id] === undefined) { data.achievements[id] = now; ids.push(id); }
  }
  ids.push(...addMeta(data, ctx, now));
  store.save(data);
  return {
    newAchievements: ids.map(info).filter((a): a is AchievementInfo => !!a),
    kingdom, won: result.won, masteryBefore: before, masteryAfter: kingdom ? masteryLevel(data.kingdoms[kingdom].won) : 0,
    winsAfter: kingdom ? data.kingdoms[kingdom].won : 0,
    newCosmetics: COSMETICS.filter((c) => isUnlocked(c, data) && !cosmeticsBefore.has(c.id)),
  };
}

/** After the challenge stars changed: the history achievements that became true. */
export function recordMeta(ctx: Omit<MetaContext, 'data'>, now = Date.now()): Pick<ProgressDelta, 'newAchievements' | 'newCosmetics'> {
  const store = progressStore(), data = store.load();
  const cosmeticsBefore = new Set(unlockedCosmetics(data));
  const ids = addMeta(data, ctx, now);
  if (ids.length) store.save(data);
  return {
    newAchievements: ids.map(info).filter((a): a is AchievementInfo => !!a),
    newCosmetics: COSMETICS.filter((c) => isUnlocked(c, data) && !cosmeticsBefore.has(c.id)),
  };
}
