// The three match lengths (Quick 5+10 / Standard 10+10 / Long 15+10 minutes: preparation + war). The host picks in the lobby; a solo player picks on the main menu
// (kept in this browser). The server holds the real numbers (config match.modes); this file only names them for the picker.
import { t } from '../i18n';
import { esc } from '../format';
import './match-mode.css';

export type MatchModeId = 'quick' | 'standard' | 'long';
export const MODE_IDS: MatchModeId[] = ['quick', 'standard', 'long'];
const PREP_MINUTES: Record<MatchModeId, number> = { quick: 5, standard: 10, long: 15 };
const WAR_MINUTES = 10;

export const isModeId = (v: unknown): v is MatchModeId => v === 'quick' || v === 'standard' || v === 'long';
export const modeName = (m: MatchModeId): string => m === 'quick' ? t('Hızlı') : m === 'standard' ? t('Standart') : t('Uzun');
/** "5+10": the preparation and the war, in minutes (language neutral). */
export const modeMinutes = (m: MatchModeId): string => `${PREP_MINUTES[m]}+${WAR_MINUTES}`;
export const modeTitle = (m: MatchModeId): string => t('Hazırlık {0} dk + savaş {1} dk', PREP_MINUTES[m], WAR_MINUTES);

const KEY = 'keepfall.matchMode';
export function savedMode(): MatchModeId {
  try { const v = localStorage.getItem(KEY); return isModeId(v) ? v : 'quick'; } catch { return 'quick'; }
}
export function saveMode(m: MatchModeId): void { try { localStorage.setItem(KEY, m); } catch { /* lasts until the page closes */ } }

/** The three buttons. `enabled` false: everybody sees the choice, only the host can change it. */
export function modePickerHtml(selected: MatchModeId, enabled: boolean): string {
  return `<div class="mode-pick" role="radiogroup" aria-label="${esc(t('Maç süresi'))}">${MODE_IDS.map((m) => `
    <button type="button" class="mode-btn${m === selected ? ' on' : ''}" role="radio" aria-checked="${m === selected}" data-mode="${m}" title="${esc(modeTitle(m))}"${enabled ? '' : ' disabled'}>
      <b>${esc(modeName(m))}</b><small>${modeMinutes(m)} ${esc(t('dk'))}</small></button>`).join('')}</div>`;
}

/** Marks the chosen button (and enables/disables the row) without redrawing it. */
export function paintModePicker(root: ParentNode, selected: MatchModeId, enabled: boolean): void {
  root.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((b) => {
    const on = b.dataset.mode === selected;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.disabled = !enabled;
  });
}
