// Friend-hosted multiplayer of the desktop (Steam) build: the player who makes the room runs the match on their own computer, friends come in over
// LAN / direct IP or over Steam (the desktop shell's mp.js does the plumbing; the page only says "host" or "join" and points its hub at the door).
// In a browser (the web build, or a friend who opened the host's LAN address in a browser) there is no bridge and nothing here does anything.
import { t } from './i18n';

export interface MpInfo {
  build: string; steam: boolean; steamName: string; hosting: boolean; lanPort: number; addresses: string[]; lobbyId: string | null;
  joined: 'lan' | 'steam' | null; pendingLobby: string | null;
}
export interface MpJoin { ok: boolean; code?: string; base?: string; error?: string; host?: string; mine?: string }
export interface MpHost { ok: boolean; lanPort: number; addresses: string[]; steam: boolean; lobbyId: string | null; error?: string }
export interface MpLobby { id: string; name: string; players: number; max: number; phase: string; compatible: boolean; build: string; mode?: string }
export type MpEvent = { type: 'host-left' | 'line-failed' } | { type: 'steam-join'; lobbyId: string } | { type: 'lobby-members'; count: number };
/** Who may come in: a Steam lobby (friends / anybody / invited only), or 'lan': no Steam, a door on the local network (direct IP). */
export type Visibility = 'friends' | 'public' | 'private' | 'lan';

export interface MpBridge {
  info(): Promise<MpInfo | null>;
  hostOpen(options: { code: string; steam: 'friends' | 'public' | 'private' | null; lan: boolean; name: string; players: number; max: number; phase: string; mode?: string }): Promise<MpHost>;
  hostUpdate(data: { name?: string; players?: number; max?: number; phase?: string; mode?: string }): Promise<boolean>;
  leave(): Promise<boolean>;
  joinLan(address: string): Promise<MpJoin>;
  joinSteam(lobbyId: string): Promise<MpJoin>;
  lobbies(): Promise<MpLobby[]>;
  invite(): Promise<boolean>;
  probe(): Promise<boolean>;
  onEvent(handler: (event: MpEvent) => void): void;
}

/** The shell's door, or null (a browser, or a shell without it). */
export const mp = (): MpBridge | null => (window as unknown as { keepfallSteam?: { mp?: MpBridge } }).keepfallSteam?.mp ?? null;

/** What this window is in the friend-hosted game right now. */
export type HostedRole = 'none' | 'host' | 'guest';
let role: HostedRole = 'none';
export const hostedRole = (): HostedRole => role;
export function setHostedRole(next: HostedRole): void { role = next; }

/** Where a guest is connected, kept for a reload of the page (a language switch): the tab only. */
const GUEST_KEY = 'keepfall_guest';
export type GuestLink = { kind: 'lan'; address: string } | { kind: 'steam'; lobbyId: string };
export function rememberGuest(link: GuestLink | null): void {
  try { if (link) sessionStorage.setItem(GUEST_KEY, JSON.stringify(link)); else sessionStorage.removeItem(GUEST_KEY); } catch { /* a reload goes to the menu */ }
}
export function rememberedGuest(): GuestLink | null {
  try { const v = JSON.parse(sessionStorage.getItem(GUEST_KEY) ?? 'null') as GuestLink | null; return v && (v.kind === 'lan' || v.kind === 'steam') ? v : null; } catch { return null; }
}

/** The shell's reason for a refused join, in the player's words. */
export function joinError(r: MpJoin): string {
  switch (r.error) {
    case 'bad-address': return t('Adres anlaşılamadı. Örnek: 192.168.1.5:47800#ABCDEF');
    case 'no-code': return t('Adresin sonunda oda kodu yok (örnek: 192.168.1.5:47800#ABCDEF).');
    case 'no-answer': return t('Ev sahibine ulaşılamadı. Adresi ve ev sahibinin oyununun açık olduğunu kontrol et.');
    case 'not-a-host': return t('Bu adreste açık bir Keepfall oyunu yok.');
    case 'version': return t('Sürüm uyuşmuyor: ev sahibi {0}, sen {1}. İkiniz de oyunu güncelleyin.', r.host ?? '?', r.mine ?? '?');
    case 'no-steam': return t('Steam çalışmıyor; adresle katılabilirsin.');
    case 'no-door': return t('Ağ kapısı açılamadı (47800–47809 portları dolu olabilir).');
    default: return t('Odaya katılınamadı.');
  }
}

/** The address a friend types into "Ev sahibinin adresi" to reach a LAN / direct-IP game: the first LAN address, the door's port and the room. */
export function hostLink(h: { addresses: string[]; lanPort: number }, code: string): string | null {
  return h.lanPort > 0 && h.addresses.length ? `${h.addresses[0]}:${h.lanPort}#${code}` : null;
}
