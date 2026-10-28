import type { ScoutReportView } from '../types';

// The emblems of the four kingdoms (public/art/ui/emblems, cleaned by tools/art-ui.mjs). Ours shows on the kingdom button, the decree and the guide;
// a rival's only where its kingdom is known: while its castle is in live sight, in a scout report, and on the end screen (the match is over by then).

const IDS = ['golge', 'tuccar', 'kahin', 'entrikaci'] as const;
/** The css looks of the kingdoms (kd-*) map to the same emblems. */
const OF_LOOK: Record<string, string> = { shadow: 'golge', merchant: 'tuccar', oracle: 'kahin', schemer: 'entrikaci' };

const live = new Map<number, string>();

/** The castles in live sight with their kingdom (from the map state). */
export function setLiveKingdoms(list: { seat: number; faction: string }[] | null | undefined): void {
  live.clear();
  for (const k of list ?? []) live.set(k.seat, k.faction);
}

export const emblemId = (idOrLook: string | null | undefined): string | null => {
  const id = idOrLook ? OF_LOOK[idOrLook] ?? idOrLook : null;
  return id && (IDS as readonly string[]).includes(id) ? id : null;
};

/** The rival's kingdom as far as we may know it: live sight first, then their last scout report. */
export function rivalKingdom(seat: number, report?: ScoutReportView | null): string | null {
  return emblemId(live.get(seat) ?? report?.kingdom ?? null);
}

/** The emblem as an inline picture (empty when there is none). */
export function emblemHtml(idOrLook: string | null | undefined, cls = ''): string {
  const id = emblemId(idOrLook);
  return id ? `<i class="emblem emblem-${id} ${cls}" aria-hidden="true"></i>` : '';
}
