import { clock, esc } from '../format';
import { lang, t, tr } from '../i18n';
import { emblemHtml } from './emblem';
import { safeLocal } from './safe-storage';
import { logoHtml } from '../screens';
import type { ChallengeCard, ChallengeList, ChallengeResult } from '../types';

// Challenge mode ("Meydan Okuma"): one player against computer players in a fixed match. The server sets the match up and works out the goals;
// this file only lists the challenges, remembers the stars in this browser and shows the result.

const KEY = 'keepfall_challenges';

/** Stars per challenge id (the daily ones too: "daily-20261106"). Lives in the browser's storage; a blocked storage keeps it until the page closes. */
export function loadStars(): Record<string, number> {
  try {
    const raw = JSON.parse(safeLocal.get(KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && v >= 0 && v <= 3) out[id] = Math.floor(v);
    return out;
  } catch { return {}; }
}

/** Keeps the best result of a challenge; returns the stars it had before. */
export function saveStars(id: string, stars: number): number {
  const all = loadStars();
  const before = all[id] ?? 0;
  if (stars > before) {
    all[id] = stars;
    // (daily results of old days are not worth keeping: the last 40 are)
    const dailies = Object.keys(all).filter((k) => k.startsWith('daily-')).sort();
    for (const k of dailies.slice(0, Math.max(0, dailies.length - 40))) delete all[k];
    safeLocal.set(KEY, JSON.stringify(all));
  }
  return before;
}

/** The first challenge is open; every other opens when the one before it has a star. The daily one is always open. */
export function isOpen(card: ChallengeCard, list: ChallengeList, stars: Record<string, number>): boolean {
  if (card.daily || card.order <= 1) return true;
  const prev = list.challenges.find((c) => c.order === card.order - 1);
  return !prev || (stars[prev.id] ?? 0) >= 1;
}

/** The challenge after this one in the list, if there is one. */
export function nextOf(card: ChallengeCard, list: ChallengeList): ChallengeCard | null {
  return card.daily ? null : list.challenges.find((c) => c.order === card.order + 1) ?? null;
}

export const pick = (x: { tr: string; en: string }): string => (lang === 'en' ? x.en : x.tr);

/** One goal as a sentence. */
export function goalText(type: string, value: number): string {
  const n = Math.round(value);
  switch (type) {
    case 'win': return t('Kazan');
    case 'winWithin': return t('Savaş başladıktan sonra {0} içinde kazan', clock(value));
    case 'maxSoldiersLost': return t('En çok {0} asker kaybet', n);
    case 'maxBattlesLost': return n === 0 ? t('Hiç savaş kaybetme') : t('En çok {0} savaş kaybet', n);
    case 'minPopulation': return t('Nüfusun en az {0} olsun', n);
    case 'minBattlesWon': return t('En az {0} savaş kazan', n);
    case 'minCastlesFelled': return t('En az {0} kale düşür', n);
    case 'minEnemiesKilled': return t('En az {0} düşman öldür', n);
    case 'minGold': return t('En az {0} altın kazan', n);
    case 'minVillages': return t('En az {0} köy yağmala', n);
    case 'minCamps': return t('En az {0} haydut kampı temizle', n);
    case 'minChests': return t('En az {0} sandık al', n);
    case 'minScouts': return t('En az {0} gözcü gönder', n);
    case 'minReports': return t('En az {0} gözcü raporu al', n);
    case 'minEnvoys': return t('En az {0} ulak ulaştır', n);
    case 'minDecoys': return t('En az {0} hayalet ordu gönder', n);
    case 'minFakeReports': return t('Sahte bir ordu tablosu yaz');
    case 'minBribed': return t('En az {0} askere rüşvet ver', n);
    case 'minCampsRented': return t('En az {0} haydut kampı kirala', n);
    case 'minDisguises': return t('Kılık değiştirerek en az {0} kez gönder', n);
    default: return type;
  }
}

/** What the player got of a goal, for the result list ("2 / 3", "0:45"). */
function progressText(type: string, actual: number, target: number): string {
  if (type === 'win') return '';
  if (type === 'winWithin') return clock(actual);
  return `${Math.round(actual)} / ${Math.round(target)}`;
}

const KINGDOM_NAMES: Record<string, string> = {
  golge: t('Gölge Krallığı'), tuccar: t('Tüccar Cumhuriyeti'), kahin: t('Kâhinler'), entrikaci: t('Entrikacılar'),
};
const UNIT_NAMES: Record<string, string> = {
  okcu: t('Okçu'), kilicli: t('Kılıçlı'), mizrakci: t('Mızrakçı'), kalkanli: t('Kalkanlı'), kesis: t('Keşiş'), mancinik: t('Mancınık'), suvari: t('Süvari'),
};
const LEVEL_NAMES: Record<string, string> = { easy: t('Kolay'), medium: t('Orta'), hard: t('Zor') };

export const starsHtml = (n: number, cls = ''): string =>
  `<span class="ch-stars ${cls}" role="img" aria-label="${t('{0} / 3 yıldız', n)}">${[1, 2, 3].map((i) => `<i class="ch-star${i <= n ? ' on' : ''}"></i>`).join('')}</span>`;

function goalsByStar(card: ChallengeCard): string {
  return [1, 2, 3].map((s) => {
    const goals = card.goals.filter((g) => g.star === s);
    if (!goals.length) return '';
    return `<li><span class="ch-goal-star">${starsHtml(s)}</span><span>${goals.map((g) => esc(goalText(g.type, g.value))).join(' · ')}</span></li>`;
  }).join('');
}

function botsLine(card: ChallengeCard): string {
  const n = card.botLevels.length;
  const levels = card.botLevels.map((l) => LEVEL_NAMES[l] ?? l).join(', ');
  return `${n === 1 ? t('1 rakip bot') : t('{0} rakip bot', n)} (${esc(levels)})`;
}

function cardHtml(card: ChallengeCard, open: boolean, stars: number): string {
  const kingdom = KINGDOM_NAMES[card.kingdom] ?? card.kingdom;
  const deck = card.deck?.map((u) => esc(UNIT_NAMES[u] ?? u)).join(', ');
  return `
    <article class="ch-card${open ? '' : ' locked'}${card.daily ? ' daily' : ''}" data-id="${esc(card.id)}">
      <header>
        <span class="ch-num">${card.daily ? t('Günlük') : card.order}</span>
        <h3>${esc(pick(card.name))}</h3>
        ${open ? starsHtml(stars) : `<span class="ch-lock" title="${t('Önceki meydan okumayı geçince açılır')}"><i class="ico ico-shield"></i></span>`}
      </header>
      <p class="ch-desc">${esc(pick(card.description))}</p>
      <p class="ch-facts muted small">${emblemHtml(card.kingdom, 'emblem-rank')}<span>${t('Krallığın')}: <b>${esc(kingdom)}</b></span> · <span>${botsLine(card)}</span>${deck ? ` · <span>${t('Deste')}: ${deck}</span>` : ''}</p>
      <ul class="ch-goals">${goalsByStar(card)}</ul>
      ${open
        ? `<button class="btn ${stars > 0 ? '' : 'kf-btn--green'}" data-play="${esc(card.id)}">${stars > 0 ? t('Tekrar oyna') : t('Başla')}</button>`
        : `<p class="ch-locked muted small">${t('Önceki meydan okumayı bir yıldızla geçince açılır.')}</p>`}
    </article>`;
}

/** The challenge list: today's daily one on top, then the numbered ones. */
export class ChallengeScreen {
  constructor(parent: HTMLElement, list: ChallengeList, actions: { play: (id: string) => Promise<string | null>; back: () => void }) {
    const stars = loadStars();
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="screen menu paper challenges">
        ${logoHtml()}
        <div class="title-ribbon ribbon ribbon-blue">${t('Meydan Okuma')}</div>
        <p class="muted center">${t('Tek kişilik, sabit maçlar: her biri tek bir fikri öğretir. Hedefleri yap, yıldız topla.')}</p>
        <div class="ch-list">
          ${cardHtml(list.daily, true, stars[list.daily.id] ?? 0)}
          ${list.challenges.map((c) => cardHtml(c, isOpen(c, list, stars), stars[c.id] ?? 0)).join('')}
        </div>
        <p class="error" id="ch-error"></p>
        <div class="start"><button class="btn wide" data-back>${t('Ana menüye dön')}</button></div>
      </div>`;
    parent.appendChild(root);
    const error = root.querySelector<HTMLElement>('#ch-error')!;
    root.addEventListener('click', async (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-back]')) { actions.back(); return; }
      const play = el.closest<HTMLButtonElement>('[data-play]');
      if (!play) return;
      const buttons = root.querySelectorAll<HTMLButtonElement>('button');
      buttons.forEach((b) => (b.disabled = true));
      error.textContent = tr((await actions.play(play.dataset.play!)) ?? '');
      buttons.forEach((b) => (b.disabled = false));
    });
  }
}

/** The goals and stars of a finished challenge, for the end screen. `before` is the stars the player had earlier. */
export function resultHtml(card: ChallengeCard | null, r: ChallengeResult, before: number): string {
  const rows = r.goals.map((g) => {
    const detail = progressText(g.type, g.actual, g.target);
    return `<li class="${g.passed ? 'pass' : 'fail'}"><i class="ch-tick" aria-hidden="true"></i><span class="ch-goal-text">${esc(goalText(g.type, g.target))}</span>
      <span class="ch-detail muted small">${esc(detail)}</span>${starsHtml(g.star)}</li>`;
  }).join('');
  const verdict = r.stars === 0 ? t('Bu sefer olmadı — tekrar dene!') : r.stars === 3 ? t('Üç yıldız! Kusursuz.') : t('{0} yıldız kazandın.', r.stars);
  const better = r.stars > before && before > 0 ? `<p class="ch-new muted small">${t('Yeni en iyi sonucun!')}</p>` : '';
  return `
    <h2>${card ? esc(pick(card.name)) : t('Meydan Okuma')}</h2>
    <div class="ch-result ${r.stars > 0 ? 'won' : 'lost'}">
      ${starsHtml(r.stars, 'big')}
      <p class="ch-verdict">${verdict}</p>${better}
      <ul class="ch-goal-results">${rows}</ul>
      ${card && r.stars < 3 && card.tip ? `<p class="ch-tip muted small"><b>${t('İpucu')}:</b> ${esc(pick(card.tip))}</p>` : ''}
    </div>`;
}
