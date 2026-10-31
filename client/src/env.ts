// Where the game's files and the game server live.
//  - Files: the build's base is '/' (served by the game server) or './' (the itch.io / CrazyGames zip, where the page sits in a sub-folder),
//    so every runtime file address goes through asset().
//  - Server: empty = the page's own server (development, Production on 5080); VITE_SERVER_URL (client/.env.itch) = the hosted game server
//    that an itch.io page talks to (https://..., the SignalR hub uses wss on its own).
const BASE: string = import.meta.env.BASE_URL;
/** The './' build sits in a sub-folder of someone else's site: the page's address is not ours to change, and files are found from where the page was first loaded. */
export const embedded = BASE !== '/';
const ROOT = embedded ? new URL(BASE, location.href).href : '/';

/** The address of a file in public/ ("/art/ui/logo.png" → ".../art/ui/logo.png" next to the page for the './' build). */
export const asset = (path: string): string => ROOT + path.replace(/^\//, '');

/** Puts a route such as "/oda/ABCD" in the address bar (the self-hosted build only; an itch.io iframe keeps its address). */
export function setRoute(path: string, mode: 'push' | 'replace' = 'push'): void {
  if (embedded) return;
  if (mode === 'push') history.pushState(null, '', path); else history.replaceState(null, '', path);
}

export const SERVER_URL: string = String(import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/+$/, '');

/** The address of a game-server route ("/hub", "/api/guide"). */
export const serverUrl = (path: string): string => SERVER_URL + path;
