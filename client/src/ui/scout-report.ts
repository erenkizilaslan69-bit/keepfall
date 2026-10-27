import { botMark, esc } from '../format';
import type { CastleView, ScoutReportView } from '../types';
import { dot } from './report-html';

// A scout's report, in the three places it shows: the window that opens from the "scout is back" ribbon or the
// report tag, the sign under the rival's castle on the map, and the rival's window. All of them say only what
// the report says: soldier types with approximate counts, building levels, and how old it is.

/** "Kırmızı'nın" etc. for "the scout is back" lines. */
export const GENITIVE: Record<string, string> = { blue: "Mavi'nin", red: "Kırmızı'nın", yellow: "Sarı'nın", purple: "Mor'un" };

export const scoutKey = (r: ScoutReportView) => `${r.targetSeat}:${r.deliveredAt}`;

/**
 * A "send a scout" button: while the scout we are allowed is out it is disabled and says how long until it is home, whatever it is out for.
 * <paramref name="blocked"/> is any other reason the button must stay off (the label stays as it is then); <paramref name="taken"/>: a scout is already out for this very target.
 */
export function scoutButton(button: HTMLButtonElement, label: string, s: CastleView, blocked: boolean, taken = false): void {
  const away = s.scouting.missions;
  const busy = away.length >= s.scouting.maxScouts;
  const locked = s.scouting.locked && !blocked;
  const who = away.some((m) => m.kind === 'envoy') ? 'Ulak' : 'Gözcü';
  const text = locked ? 'Savaş başlayınca gönderilebilir' : busy && !blocked ? `${who} dönüyor · ${Math.ceil(Math.min(...away.map((m) => m.remainingSeconds)))} sn` : label;
  if (button.textContent !== text) button.textContent = text;
  button.disabled = blocked || busy || taken || s.scouting.locked;
}

/** How old the report is, in minutes of game time ("az önce" below the first). */
export function ago(r: ScoutReportView, now: number): string {
  const minutes = Math.floor(Math.max(0, now - r.observedAt) / 60);
  return minutes < 1 ? 'az önce' : `${minutes} dk önce`;
}

const icon = (unitId: string) => `<i class="unit-ico unit-${esc(unitId)}"></i>`;
const count = (n: number) => (n === 0 ? '0' : `≈${n}`);

/** The soldier types as icons with their approximate counts. */
export function soldiersHtml(r: ScoutReportView): string {
  return r.soldiers.map((u) => `<span class="unit-count${u.count === 0 ? ' none' : ''}" title="${esc(u.name)}">${icon(u.unitId)}<b>${count(u.count)}</b></span>`).join('');
}

/** The small sign under the castle on the map: icons, counts and the age. */
export function scoutSignHtml(r: ScoutReportView, now: number): string {
  return `<div class="wl-sign wl-report" title="Son gözcü raporu">${soldiersHtml(r)}<small class="muted-ink">${ago(r, now)}</small></div>`;
}

/** The report window's content. */
export function scoutReportHtml(r: ScoutReportView, now: number): string {
  return `
    <div class="rep-title ribbon ribbon-yellow">Gözcü raporu: ${dot(r.targetColor)}${botMark(r.targetSeat)}${esc(r.targetName)}</div>
    <p class="rep-note">${ago(r, now)} · gözcü dönünce teslim edildi</p>
    <h3 class="rep-h">Askerler <small class="muted-ink">(yaklaşık)</small></h3>
    <div class="scout-soldiers">${soldiersHtml(r)}</div>
    <div class="scout-names small muted-ink">${r.soldiers.map((u) => `${esc(u.name)} ${count(u.count)}`).join(' · ')}</div>
    <h3 class="rep-h">Binalar</h3>
    <div class="small">${r.buildings.map((b) => `${esc(b.name)} <b>Sv ${b.level}</b>`).join(' · ')}</div>
    <p class="rep-note muted-ink small">Gözcü yalnızca asker türlerini (sayılar ±%20 sapabilir) ve bina seviyelerini görür; işçi, kaynak ve silah deposu görünmez.</p>`;
}
