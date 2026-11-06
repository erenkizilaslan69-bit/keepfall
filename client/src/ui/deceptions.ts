// "Who fooled whom": the timeline on the end screen. The server sends the deception log only inside the final result (the match is over, the
// secrets are public), as plain facts; this file words them. Nothing here claims a cause the server did not record.
import { clock, esc } from '../format';
import { t, tr } from '../i18n';
import { emblemHtml } from './emblem';
import type { DeceptionEventView, ResultView } from '../types';

type Who = (seat: number | null | undefined) => string;

const CATEGORY: Record<string, string> = {
  FakeReportSet: 'report', FakeReportRead: 'report', FakeReportSeenThrough: 'report',
  DecoySent: 'decoy', DecoySighted: 'decoy', DecoyFaded: 'decoy', DecoyMet: 'decoy', OracleSawIncoming: 'oracle',
  Bribed: 'bribe', CampRented: 'camp', RentedFought: 'camp',
  EnvoyAsSent: 'mask', EnvoyAsDelivered: 'mask', ArmyAsSent: 'mask', DisguisedFought: 'mask', Unmasked: 'unmask',
};

/** One event as a sentence (HTML: names are escaped here). */
export function deceptionText(e: DeceptionEventView, who: Who): string {
  const a = who(e.actorSeat), b = who(e.targetSeat), c = who(e.asSeat), n = e.count;
  switch (e.kind) {
    case 'FakeReportSet': return t('{0} sahte bir ordu raporu hazırladı ({1} asker gösteriyor).', a, n);
    case 'FakeReportRead': return t('{1} gözcüsü, {0} kalesinde sahte raporu okudu.', a, b);
    case 'FakeReportSeenThrough': return t('Kâhin {1}, {0} kalesinin raporunun sahte olduğunu gördü.', a, b);
    case 'DecoySent': return t('{0}, {1} kalesine {2} kişilik hayalet ordu yolladı.', a, b, n);
    case 'DecoySighted': return t('{1} kalesi, {0} adına yaklaşan hayalet ordunun geldiğini gördü.', a, b);
    case 'DecoyFaded': return t('{0} hayalet ordusu, {1} kalesinin kapısına varıp dağıldı.', a, b);
    case 'DecoyMet': return t('{0} hayalet ordusu, {1} kalesine giderken yolda başka bir orduya rastlayıp dağıldı.', a, b);
    case 'OracleSawIncoming': return e.detail === 'decoy'
      ? t('Kâhin {1}, kalesine gelen ordunun {0} hayaleti olduğunu gördü.', a, b)
      : t('Kâhin {1}, {2} adıyla gelen ordunun gerçekte {0} olduğunu gördü.', a, b, c);
    case 'Bribed': return e.detail === 'decoy'
      ? t('{0}, {1} hayalet ordusundan {2} kişiyi rüşvetle çıkardı.', a, b, n)
      : t('{0}, {1} ordusundan {2} askeri rüşvetle eve döndürdü.', a, b, n);
    case 'CampRented': return t('{0}, bir haydut kampını ({2} haydut) kiralayıp {1} kalesine yolladı.', a, b, n);
    case 'RentedFought': return e.detail === 'fell'
      ? t('{0} kiralık haydutları {1} kalesinin kapısında savaştı; kale düştü.', a, b)
      : t('{0} kiralık haydutları {1} kalesinin kapısında savaştı; kale ayakta kaldı.', a, b);
    case 'EnvoyAsSent': return t('{0}, {1} kalesine {2} adıyla ulak yolladı.', a, b, c);
    case 'EnvoyAsDelivered': return t('{1} kalesine {2} adıyla ulak ulaştı; gerçek gönderen {0}.', a, b, c);
    case 'ArmyAsSent': return t('{0}, {1} kalesine {2} adıyla {3} kişilik ordu yolladı.', a, b, c, n);
    case 'DisguisedFought': return e.detail === 'fell'
      ? t('{2} adıyla gelen ordu ({0}) {1} kalesinin kapısında savaştı; kale düştü.', a, b, c)
      : e.detail === 'road'
        ? t('{2} adıyla yürüyen ordu ({0}) yolda {1} ile savaştı.', a, b, c)
        : t('{2} adıyla gelen ordu ({0}) {1} kalesinin kapısında savaştı; kale ayakta kaldı.', a, b, c);
    case 'Unmasked': return e.detail === 'scout'
      ? t('{1}, gözcüsüyle {0} kalesindeki kılık değiştirmiş ordunun gerçek sahibini öğrendi.', a, b)
      : t('{1}, {2} adıyla gelen ordunun {0} olduğunu öğrendi (süre doldu).', a, b, c);
    default: return esc(e.kind);
  }
}

/** The whole section (empty string when the match had no kingdoms, so nothing to show). */
export function deceptionTimelineHtml(r: ResultView): string {
  const events = r.deceptions ?? [];
  const bySeat = new Map(r.ranking.map((x) => [x.seat, x]));
  const hasKingdoms = r.ranking.some((x) => !!x.kingdom);
  if (!events.length && !hasKingdoms) return '';
  const who: Who = (seat) => {
    const p = seat == null ? undefined : bySeat.get(seat);
    if (!p) return '?';
    return `<b class="dc-name" data-color="${p.color}">${emblemHtml(p.kingdom, 'emblem-rank')}${esc(tr(p.name))}</b>`;
  };
  const rows = events.map((e) => `
    <li class="dc-${CATEGORY[e.kind] ?? 'other'}" data-color="${bySeat.get(e.actorSeat)?.color ?? 'blue'}">
      <span class="dc-at">${clock(e.at)}</span><span class="dc-text">${deceptionText(e, who)}</span>
    </li>`).join('');
  return `
    <section class="deceptions">
      <h2>${t('Kim kimi kandırdı?')}</h2>
      ${events.length ? `<ol class="dc-list">${rows}</ol>` : `<p class="muted small center">${t('Bu maçta kimse hile yapmadı.')}</p>`}
    </section>`;
}
