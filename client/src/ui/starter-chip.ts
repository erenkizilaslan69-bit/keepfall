// In a starter match (the first three matches, and the guided one) there are no kingdoms: the place where the player's own kingdom button sits shows a small note
// instead of nothing, so it does not look like the kingdom is missing by mistake. Gone as soon as a match with kingdoms starts or the game screen closes.
import { t } from '../i18n';
import './profile-look.css';

export function syncStarterChip(on: boolean): void {
  const have = document.querySelector('.starter-chip');
  if (!on) { have?.remove(); return; }
  if (have) return;
  const el = document.createElement('div');
  el.className = 'starter-chip';
  el.setAttribute('role', 'note');
  el.textContent = t('Başlangıç maçı: krallıklar ilk 3 maçtan sonra açılır');
  document.body.appendChild(el);
}
