import { COLOR_CSS, botMark, esc } from '../format';
import { t, tr } from '../i18n';
import type { BattleReportView } from '../types';

export const dot = (color?: string) => `<span class="dot" style="background:${COLOR_CSS[color ?? ''] ?? '#888'}"></span>`;

export function resultWord(b: BattleReportView): string {
  if (b.winner === 'draw') return t('berabere');
  return b.youWon ? t('kazandın') : t('kaybettin');
}

/** "Kırmızı'dan" etc. for "an army is coming" lines. */
export const ABLATIVE: Record<string, string> = { blue: "Mavi'den", red: "Kırmızı'dan", yellow: "Sarı'dan", purple: "Mor'dan" };

/** A battle report: both armies side by side with losses, then the castle (for a battle at a castle). */
export function reportHtml(b: BattleReportView): string {
  const side = (title: string, lines: BattleReportView['attackerUnits']) => `
    <div class="rep-side"><h3>${title}</h3>${lines.length === 0 ? `<p class="rep-none">${t('Kalede asker yoktu.')}</p>`
      : lines.map((l) => `<div>${l.count} ${esc(tr(l.name))} <span class="loss">−${l.lost}</span></div>`).join('')}</div>`;
  const them = `${dot(b.opponentColor)}${botMark(b.opponentSeat)}${esc(tr(b.opponentName))}`;
  const color = b.winner === 'draw' ? 'yellow' : b.youWon ? 'blue' : 'red';
  if (b.kind === 'camp') {
    return `
      <div class="rep-title ribbon ribbon-${color}">${t('Haydut kampı')} — ${resultWord(b)}</div>
      <div class="rep-sides">
        ${side(t('Senin ordun'), b.attackerUnits)}
        ${side(t('Haydutlar'), b.defenderUnits)}
      </div>
      <p class="rep-note">${b.winner === 'attacker' ? t('Kamp temizlendi: altın ve silahlar ordu eve dönünce gelir.') : t('Kamp kalan haydutlarla yerinde duruyor.')}</p>`;
  }
  if (b.kind === 'field') {
    return `
      <div class="rep-title ribbon ribbon-${color}">${t('Yolda {0} ile çarpışma', them)} — ${resultWord(b)}</div>
      <div class="rep-sides">
        ${side(b.attacking ? t('Senin ordun') : t('Onların ordusu'), b.attackerUnits)}
        ${side(b.attacking ? t('Onların ordusu') : t('Senin ordun'), b.defenderUnits)}
      </div>`;
  }
  const title = b.attacking ? t('{0} kalesine saldırı', them) : t('{0} saldırdı', them);
  return `
    <div class="rep-title ribbon ribbon-${color}">${title} — ${resultWord(b)}</div>
    <div class="rep-sides">
      ${side(b.attacking ? t('Senin ordun') : t('Saldıran'), b.attackerUnits)}
      ${side(b.attacking ? t('Savunan') : t('Senin savunman'), b.defenderUnits)}
    </div>
    <p class="rep-note">${b.raid ? (b.attacking ? t('<b>Süvari baskını kazandı:</b> tarlalar yandı, kale düşmedi.') : t('<b>Süvari baskını:</b> tarlaların yandı, yemek üretimin bir süre yarıya iner.')) : b.defenderEliminated ? t('<b>Kale düştü!</b>') : b.attacking ? (b.youWon ? t('Savunma yenilemedi.') : t('Kale ayakta kaldı.')) : (b.youWon ? t('Saldırıyı püskürttün, kalen ayakta.') : t('Kale ayakta kaldı.'))}</p>${lootLine(b)}`;
}

/** "Ganimet: +120 yemek, +40 altın, +4 kişi, +3 esir" for the report of a castle that fell (only the attacker takes any). */
const lootLine = (b: BattleReportView): string => {
  const l = b.loot;
  if (!l) return '';
  const parts = ([[l.food, t('yemek')], [l.wood, t('odun')], [l.iron, t('demir')], [l.gold, t('altın')], [l.people, t('kişi')], [l.prisoners, t('esir')]] as [number, string][])
    .filter(([n]) => n > 0).map(([n, name]) => `+${n} ${name}`);
  if (parts.length === 0) return '';
  return `<p class="rep-note rep-loot">${b.attacking ? t('Ganimet (ordu eve dönünce gelir)') : t('Düşüren ordunun aldığı')}: <b>${parts.join(', ')}</b></p>`;
};
