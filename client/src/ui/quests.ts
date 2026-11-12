// The mission list in the corner of the match: the goals of the challenge being played, or (in an ordinary match) a few things worth doing, with the
// player's own running numbers (CastleView.stats). It reads nothing but what the player already knows about their own castle: no rival's secret
// is in it. A small "+XP" note shows when a mission is done. J folds / unfolds the list; Settings > Game can hide it altogether.
import { t } from '../i18n';
import { esc } from '../format';
import { goalText } from './challenges';
import { tutorialArmed } from './tutorial';
import type { CastleView, ChallengeCard, LiveStats } from '../types';
import './profile-look.css';

const KEY = 'keepfall.showQuests', FOLD = 'keepfall.questsFolded';
export const showsQuests = (): boolean => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export function setShowQuests(on: boolean): void { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* lasts until the page closes */ } quests?.sync(); }
const folded = (): boolean => { try { return localStorage.getItem(FOLD) === '1'; } catch { return false; } };

interface Item { id: string; type: string; text: string; have: number; need: number; xp: number; limit: boolean }

/** The stat a goal type counts (null: nothing to count live). */
function statOf(type: string, s: LiveStats, c: CastleView): number | null {
  switch (type) {
    case 'minVillages': return s.villages;
    case 'minCamps': return s.camps;
    case 'minChests': return s.chests;
    case 'minCastlesFelled': return s.castlesFelled;
    case 'minBattlesWon': return s.battlesWon;
    case 'minEnemiesKilled': return s.enemiesKilled;
    case 'minGold': return Math.round(s.goldGained);
    case 'minScouts': return s.scouts;
    case 'minReports': return s.reports;
    case 'minEnvoys': return s.envoys;
    case 'minDecoys': return s.decoys;
    case 'minFakeReports': return s.fakeReports;
    case 'minBribed': return s.bribed;
    case 'minCampsRented': return s.campsRented;
    case 'minDisguises': return s.disguises;
    case 'minPopulation': return c.population;
    case 'maxSoldiersLost': return s.soldiersLost;
    case 'maxBattlesLost': return s.battlesLost;
    default: return null; // win, winWithin: only the end tells
  }
}
const LIMIT = new Set(['maxSoldiersLost', 'maxBattlesLost']);
/** Counts that only grow, so a mission done now stays done (the end pays it: the server's goal XP). Population can fall again. */
const MONOTONIC = (type: string): boolean => type.startsWith('min') && type !== 'minPopulation';
const GOAL_XP = 15; // Keepfall.Core.Progress.Xp.GoalXp

function itemsFor(c: CastleView, card: ChallengeCard | null): Item[] {
  const s = c.stats;
  if (!s) return [];
  if (card) {
    return card.goals.map((g, i): Item | null => {
      const have = statOf(g.type, s, c);
      if (have === null) return null;
      return { id: `g${i}`, type: g.type, text: goalText(g.type, g.value), have, need: g.value, xp: MONOTONIC(g.type) ? GOAL_XP : 0, limit: LIMIT.has(g.type) };
    }).filter((x): x is Item => !!x);
  }
  // an ordinary match: what pays XP as a moment, plus the one thing the kingdom's own trick is for
  const out: Item[] = [
    { id: 'village', type: 'minVillages', text: goalText('minVillages', 1), have: s.villages, need: 1, xp: 15, limit: false },
    { id: 'camp', type: 'minCamps', text: goalText('minCamps', 1), have: s.camps, need: 1, xp: 15, limit: false },
    { id: 'felled', type: 'minCastlesFelled', text: goalText('minCastlesFelled', 1), have: s.castlesFelled, need: 1, xp: 60, limit: false },
  ];
  const k = c.kingdom?.id;
  if (k === 'tuccar') out.push({ id: 'bribe', type: 'minBribed', text: goalText('minBribed', 1), have: s.bribed, need: 1, xp: 30, limit: false });
  else if (k === 'golge') out.push({ id: 'decoy', type: 'minDecoys', text: goalText('minDecoys', 1), have: s.decoys, need: 1, xp: 0, limit: false });
  else if (k === 'entrikaci') out.push({ id: 'disguise', type: 'minDisguises', text: goalText('minDisguises', 1), have: s.disguises, need: 1, xp: 0, limit: false });
  else if (k === 'kahin') out.push({ id: 'report', type: 'minReports', text: goalText('minReports', 1), have: s.reports, need: 1, xp: 0, limit: false });
  return out;
}

class QuestTracker {
  private el: HTMLElement | null = null;
  private done = new Set<string>();
  private first = true;
  private items: Item[] = [];
  /** The player opened the list with J while the tutorial was running (so the new player is not shown two lists at once unless they ask). */
  private openedInTutorial = false;
  hasItems(): boolean { return this.items.length > 0; }
  /** The tutorial's own list is the only one a new player sees; this one waits until it is over (or J opens it). */
  hiddenByTutorial(): boolean { return tutorialArmed() && !this.openedInTutorial; }
  /** J: unfolds a list the tutorial was hiding, otherwise folds / unfolds it. */
  key(): void { if (this.hiddenByTutorial()) { this.openedInTutorial = true; try { localStorage.setItem(FOLD, '0'); } catch { /* */ } this.paint(); } else this.toggle(); }

  private ensure(): HTMLElement {
    if (this.el?.isConnected) return this.el;
    const el = document.createElement('aside');
    el.className = 'quests';
    el.setAttribute('aria-label', t('Görevler'));
    el.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('header')) this.toggle(); });
    document.body.appendChild(el);
    this.el = el;
    return el;
  }

  toggle(): void {
    try { localStorage.setItem(FOLD, folded() ? '0' : '1'); } catch { /* */ }
    this.paint();
  }

  /** Called with every castle picture; `card` is the challenge being played (null in an ordinary match). */
  update(c: CastleView, card: ChallengeCard | null): void {
    this.items = itemsFor(c, card);
    const now = new Set(this.items.filter((i) => !i.limit && i.have >= i.need).map((i) => i.id));
    if (!this.first) for (const i of this.items) if (now.has(i.id) && !this.done.has(i.id) && i.xp > 0) this.toast(i.xp);
    this.first = false;
    this.done = now;
    this.paint();
  }

  private toast(xp: number): void {
    const n = document.createElement('div');
    n.className = 'quest-toast';
    n.setAttribute('role', 'status');
    n.textContent = t('Görev tamamlandı +{0} XP', xp);
    document.body.appendChild(n);
    window.setTimeout(() => n.remove(), 2800);
  }

  sync(): void { this.paint(); }

  private paint(): void {
    const show = showsQuests() && this.items.length > 0 && !this.hiddenByTutorial();
    if (!show) { this.el?.classList.add('hidden'); return; }
    const el = this.ensure();
    el.classList.remove('hidden');
    el.classList.toggle('folded', folded());
    const left = this.items.filter((i) => i.limit || i.have < i.need).length;
    el.innerHTML = `<header title="${esc(t('Aç / kapa'))}"><b>${esc(t('Görevler'))} <small>${this.items.length - left}/${this.items.length}</small></b><kbd>J</kbd></header>
      <ul>${this.items.map((i) => {
        const ok = !i.limit && i.have >= i.need;
        const n = i.limit ? `${i.have} / ≤${Math.round(i.need)}` : `${Math.min(i.have, Math.round(i.need))}/${Math.round(i.need)}`;
        return `<li class="${ok ? 'done' : ''}"><span class="q-tick">${ok ? '✓' : '•'}</span><span class="q-text">${esc(i.text)}</span><span class="q-n">${n}</span></li>`;
      }).join('')}</ul>`;
  }

  hide(): void { this.el?.remove(); this.el = null; this.items = []; this.done.clear(); this.first = true; this.openedInTutorial = false; }
}

const quests = new QuestTracker();
export const questTracker = quests;

window.addEventListener('keydown', (e) => {
  if (e.key !== 'j' && e.key !== 'J') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) return;
  if (quests.hasItems() && showsQuests()) quests.key();
});
