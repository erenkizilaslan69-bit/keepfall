// The language menu: the language button (top bar, menus) opens a list of the 15 languages in their own names; the settings window has the same list as a drop-down.
import { LANGS, lang, langInfo, setLang, t, type Lang } from '../i18n';
import './lang-menu.css';

/** The short label on the button: the language code in capitals ("EN", "TR", "RU"), or a glyph for the CJK ones. */
export function langLabel(code: Lang = lang): string {
  return ({ 'zh-CN': '简', 'zh-TW': '繁', ja: '日', ko: '한' } as Partial<Record<Lang, string>>)[code] ?? code.split('-')[0].toUpperCase();
}

let menu: HTMLElement | null = null;
const close = (): void => { menu?.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', onKey, true); };
const outside = (e: Event): void => { if (menu && !menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-lang]')) close(); };
const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

/** Opens (or closes) the list under/near the button that asked. */
export function toggleLangMenu(anchor: HTMLElement): void {
  if (menu) { close(); return; }
  menu = document.createElement('div');
  menu.className = 'lang-menu paper';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', t('Dil'));
  menu.innerHTML = LANGS.map((l) => `<button class="lang-item${l.code === lang ? ' on' : ''}" role="option" aria-selected="${l.code === lang}" lang="${l.code}" data-code="${l.code}">${l.native}</button>`).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, r.bottom + 6))}px`;
  menu.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-code]'); if (b) { const code = b.dataset.code as Lang; close(); if (code !== lang) setLang(code); } });
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', onKey, true);
}

/** The drop-down for the settings window (all native names; a change saves and reloads). */
export function langSelectHtml(): string {
  return `<select id="set-lang" class="set-select" aria-label="${t('Dil')}">${LANGS.map((l) => `<option value="${l.code}" lang="${l.code}"${l.code === lang ? ' selected' : ''}>${l.native}</option>`).join('')}</select>`;
}
export const langTitle = (): string => `${t('Dili değiştir')} (${langInfo(lang).native})`;
