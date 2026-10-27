import { COLOR_CSS, botMark, esc } from '../format';
import type { BattleReportView } from '../types';

export const dot = (color?: string) => `<span class="dot" style="background:${COLOR_CSS[color ?? ''] ?? '#888'}"></span>`;

export function resultWord(b: BattleReportView): string {
  if (b.winner === 'draw') return 'berabere';
  return b.youWon ? 'kazandın' : 'kaybettin';
}

/** "Kırmızı'dan" etc. for "an army is coming" lines. */
export const ABLATIVE: Record<string, string> = { blue: "Mavi'den", red: "Kırmızı'dan", yellow: "Sarı'dan", purple: "Mor'dan" };

/** A battle report: both armies side by side with losses, then the castle (for a battle at a castle). */
export function reportHtml(b: BattleReportView): string {
  const side = (title: string, lines: BattleReportView['attackerUnits']) => `
    <div class="rep-side"><h3>${title}</h3>${lines.length === 0 ? '<p class="rep-none">Kalede asker yoktu.</p>'
      : lines.map((l) => `<div>${l.count} ${esc(l.name)} <span class="loss">−${l.lost}</span></div>`).join('')}</div>`;
  const them = `${dot(b.opponentColor)}${botMark(b.opponentSeat)}${esc(b.opponentName)}`;
  const color = b.winner === 'draw' ? 'yellow' : b.youWon ? 'blue' : 'red';
  if (b.kind === 'camp') {
    return `
      <div class="rep-title ribbon ribbon-${color}">Haydut kampı — ${resultWord(b)}</div>
      <div class="rep-sides">
        ${side('Senin ordun', b.attackerUnits)}
        ${side('Haydutlar', b.defenderUnits)}
      </div>
      <p class="rep-note">${b.winner === 'attacker' ? 'Kamp temizlendi: altın ve silahlar ordu eve dönünce gelir.' : 'Kamp kalan haydutlarla yerinde duruyor.'}</p>`;
  }
  if (b.kind === 'field') {
    return `
      <div class="rep-title ribbon ribbon-${color}">Yolda ${them} ile çarpışma — ${resultWord(b)}</div>
      <div class="rep-sides">
        ${side(b.attacking ? 'Senin ordun' : 'Onların ordusu', b.attackerUnits)}
        ${side(b.attacking ? 'Onların ordusu' : 'Senin ordun', b.defenderUnits)}
      </div>`;
  }
  const title = b.attacking ? `${them} kalesine saldırı` : `${them} saldırdı`;
  return `
    <div class="rep-title ribbon ribbon-${color}">${title} — ${resultWord(b)}</div>
    <div class="rep-sides">
      ${side(b.attacking ? 'Senin ordun' : 'Saldıran', b.attackerUnits)}
      ${side(b.attacking ? 'Savunan' : 'Senin savunman', b.defenderUnits)}
    </div>
    <p class="rep-note">${b.defenderEliminated ? '<b>Kale düştü!</b>' : b.attacking ? (b.youWon ? 'Savunma yenilemedi.' : 'Kale ayakta kaldı.') : (b.youWon ? 'Saldırıyı püskürttün, kalen ayakta.' : 'Kale ayakta kaldı.')}</p>${lootLine(b)}`;
}

/** "Ganimet: +120 yemek, +40 altın, +4 kişi" for the report of a castle that fell (only the attacker takes any). */
const lootLine = (b: BattleReportView): string => {
  const l = b.loot;
  if (!l) return '';
  const parts = ([[l.food, 'yemek'], [l.wood, 'odun'], [l.iron, 'demir'], [l.gold, 'altın'], [l.people, 'kişi']] as [number, string][])
    .filter(([n]) => n > 0).map(([n, name]) => `+${n} ${name}`);
  if (parts.length === 0) return '';
  return `<p class="rep-note rep-loot">${b.attacking ? 'Ganimet (ordu eve dönünce gelir)' : 'Düşüren ordunun aldığı'}: <b>${parts.join(', ')}</b></p>`;
};
