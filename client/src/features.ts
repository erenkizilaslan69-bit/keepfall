// Build-time feature flags. `0` switches a feature off; anything else (or nothing) leaves it on. The CrazyGames build (client/.env.crazy) turns both off for now:
// the code stays, only the doors are closed (see docs/sonraki-plan.md for the way back).
const on = (v: unknown): boolean => v !== '0' && v !== 'false';

/** Private rooms for friends: "Oda kur", join by code, ?room= / /oda/KOD links, the lobby's code and link sharing, "back to the lobby" after a match. */
export const FEATURE_PRIVATE_ROOM: boolean = on(import.meta.env.VITE_FEATURE_PRIVATE_ROOM);
/** The CrazyGames invitation layer: updateRoom, invite button, getInviteParam, join listener, the site's instant multiplayer. */
export const FEATURE_CRAZY_INVITE: boolean = on(import.meta.env.VITE_FEATURE_CRAZY_INVITE);
