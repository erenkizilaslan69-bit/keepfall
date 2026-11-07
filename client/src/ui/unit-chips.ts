import type { PlayerColor } from '../types';
import { mountPortrait } from './portraits';

// Small picture-and-number chips for the castle and forge windows: a unit's face (the same animated portrait the deck cards use) or its weapon, then "×8".
// The weapon icons are drawn here as little vector pictures (no pack files); the faces come from portraits.ts, so nothing new is cut from the art pack.

/** A line with a dark edge under it, for the little icons. */
const ln = (x1: number, y1: number, x2: number, y2: number, color: string, w: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3b2a1a" stroke-width="${w + 1.6}" stroke-linecap="round"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;

const WEAPONS: Record<string, string> = {
  kilicli: ln(13, 2.5, 6, 9.5, '#dfe6ea', 2.4) + ln(4.2, 8, 8, 11.8, '#d9a441', 1.8) + ln(6, 10, 3, 13, '#8a5a2b', 1.8),
  mizrakci: ln(2.5, 13.5, 11.5, 4.5, '#9a6a35', 1.8) + `<path d="M14.5 1.5l-1 4.5-3.5-3.5z" fill="#dfe6ea" stroke="#3b2a1a" stroke-width="1" stroke-linejoin="round"/>`,
  kalkanli: `<path d="M3 2h10v6c0 3-2.5 5.2-5 6.2C5.500 13.200 3 11 3 8z" fill="#7d93b8" stroke="#3b2a1a" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 3.200v10" stroke="#d9a441" stroke-width="1.4"/><circle cx="8" cy="7.500" r="1.800" fill="#d9a441" stroke="#3b2a1a" stroke-width=".8"/>`,
  okcu: `<path d="M4.500 1.800Q15 8 4.500 14.200" fill="none" stroke="#3b2a1a" stroke-width="3.400" stroke-linecap="round"/><path d="M4.500 1.800Q15 8 4.500 14.200" fill="none" stroke="#9a6a35" stroke-width="1.800" stroke-linecap="round"/>`
    + `<line x1="4.500" y1="1.800" x2="4.500" y2="14.200" stroke="#eee3c4" stroke-width=".9"/>` + ln(2, 8, 13.200, 8, '#cfd8dc', 1) + `<path d="M15 8l-2.600-1.700v3.400z" fill="#cfd8dc" stroke="#3b2a1a" stroke-width=".7"/>`,
  // A green cross (healing), not a staff.
  kesis: `<path d="M6 1.500h4v4.500h4.500v4H10v4.500H6V10H1.500V6H6z" fill="#4ee06a" stroke="#12301a" stroke-width="1.200" stroke-linejoin="round"/><path d="M7.200 3h1.600v4.200H13v1.600H8.800V13H7.200V8.800H3V7.200h4.200z" fill="#b8ffc6" opacity=".55"/>`,
  mancinik: `<rect x="1.500" y="11" width="13" height="2.200" rx=".6" fill="#8a5a2b" stroke="#3b2a1a" stroke-width="1"/>` + ln(5, 11, 11.500, 3, '#9a6a35', 1.800)
    + `<circle cx="12" cy="2.800" r="1.800" fill="#9aa09c" stroke="#3b2a1a" stroke-width=".9"/><circle cx="4.200" cy="13.600" r="1.700" fill="#6b4a25" stroke="#3b2a1a" stroke-width=".9"/><circle cx="11.800" cy="13.600" r="1.700" fill="#6b4a25" stroke="#3b2a1a" stroke-width=".9"/>`,
  suvari: `<path d="M4 2.200v6.600a4 4 0 0 0 8 0V2.200" fill="none" stroke="#3b2a1a" stroke-width="3.800" stroke-linecap="round"/><path d="M4 2.200v6.600a4 4 0 0 0 8 0V2.200" fill="none" stroke="#c9d1d6" stroke-width="2.200" stroke-linecap="round"/>`
    + `<circle cx="4" cy="4.800" r=".6" fill="#3b2a1a"/><circle cx="12" cy="4.800" r=".6" fill="#3b2a1a"/><circle cx="5.200" cy="10.300" r=".6" fill="#3b2a1a"/><circle cx="10.800" cy="10.300" r=".6" fill="#3b2a1a"/>`,
};
const FALLBACK = ln(13, 2.500, 6, 9.500, '#dfe6ea', 2.400);

/** The little picture of the weapon a unit is made with. */
export function weaponIcon(unitId: string): string {
  return `<svg class="wicon" viewBox="0 0 16 16" aria-hidden="true">${WEAPONS[unitId] ?? FALLBACK}</svg>`;
}

/** A flag, for "away on the march". */
const AWAY = `<svg class="wicon" viewBox="0 0 16 16" aria-hidden="true">${ln(4, 14, 4, 2, '#9a6a35', 1.600)}<path d="M4.800 2.600h8l-2 2.800 2 2.800h-8z" fill="#c8483a" stroke="#3b2a1a" stroke-width="1" stroke-linejoin="round"/></svg>`;

/** The unit's face with a count: `<span class="chip">[face] ×8</span>`; call mountChips once the HTML is in the page. `label` is what a reader without the picture gets. */
export function faceChip(unitId: string, label: string, count: number, field?: string): string {
  return `<span class="chip chip-face" title="${label}" aria-label="${label}"><canvas width="44" height="44" data-face="${unitId}"></canvas><b${field ? ` data-f="${field}"` : ''}>×${count}</b></span>`;
}

/** The weapon's picture with a count. */
export function weaponChip(unitId: string, label: string, count: number, field?: string): string {
  return `<span class="chip chip-weapon" title="${label}" aria-label="${label}">${weaponIcon(unitId)}<b${field ? ` data-f="${field}"` : ''}>×${count}</b></span>`;
}

/** A small icon with a count (an hourglass for "being armed", a flag for "away"). */
export function iconChip(icon: 'arming' | 'away', label: string, count: number, field?: string): string {
  const picture = icon === 'arming' ? '<i class="ico ico-hourglass"></i>' : AWAY;
  return `<span class="chip chip-${icon}" title="${label}" aria-label="${label}">${picture}<b${field ? ` data-f="${field}"` : ''}>×${count}</b></span>`;
}

/** Starts the portraits of every face chip inside <paramref name="root"/> that has not been started (the windows build their HTML once, so this runs once). */
export function mountChips(root: HTMLElement, color: PlayerColor): void {
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas[data-face]:not([data-mounted])')) {
    canvas.dataset.mounted = '1';
    mountPortrait(canvas, canvas.dataset.face!, color);
  }
}

/** Sets the number of a chip and its words (the picture stays as it is). */
export function setChip(root: HTMLElement, field: string, count: number, label: string): void {
  const b = root.querySelector<HTMLElement>(`[data-f="${field}"]`);
  if (!b) return;
  const text = `×${count}`;
  if (b.textContent !== text) b.textContent = text;
  const chip = b.closest<HTMLElement>('.chip');
  if (chip) { chip.title = label; chip.setAttribute('aria-label', label); chip.classList.toggle('chip-zero', count === 0); }
}
