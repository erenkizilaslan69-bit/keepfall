'use strict';
// Friend-hosted multiplayer of the desktop shell ("listen server"): the player who makes the room runs the match on their own computer.
//   host   the bundled game server already runs on loopback. Friends reach its GUEST port through
//            - the LAN door: a plain TCP door on 0.0.0.0:<47800..> (direct IP / LAN, also what the automatic tests use), and/or
//            - the Steam door: streams over Steam's relayed P2P messages (tunnel.js), for members of the host's Steam lobby only.
//   guest  the page keeps coming from the guest's OWN bundled server (same build), only the hub connection goes to http://join.keepfall.localhost,
//          a loopback door of this shell that forwards every connection to the host (over TCP or over the Steam tunnel).
// Nothing of the game's network code changes: it is SignalR over HTTP/WebSocket on both ends.
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');
const { Tunnel, lagPipe, parseLag } = require('./tunnel');
const { admit, Limiter } = require('./gate');

const LAN_PORT = 47800, LAN_TRIES = 10;
const LOBBY_TYPES = { private: 0, friends: 1, public: 2 };
const CB = { LobbyChatUpdate: 5, P2PSessionRequest: 6, P2PSessionConnectFail: 7, GameLobbyJoinRequested: 8 };
const RELIABLE = 2;

/**
 * @param {{ log: (l: string) => void, guestPort: number, joinPort: number, build: string, protocol: () => Promise<number>,
 *           steam: () => ({ client: any, appId: number } | null), notify: (event: object) => void, argv: string[] }} o
 */
function createMp(o) {
  const { log, guestPort, joinPort, build, notify } = o;
  const lag = parseLag(process.env.KEEPFALL_LAG); // development: "150,50,0.02" slows the guest's line
  const pipeBoth = (a, b) => { lagPipe(a, b, lag || {}); lagPipe(b, a, lag || {}); a.on('error', () => b.destroy()); b.on('error', () => a.destroy()); a.on('close', () => b.destroy()); b.on('close', () => a.destroy()); };

  let lanServer = null, lanPort = 0;
  // Every guest connection (LAN or Steam) passes the doorkeeper (gate.js) before it reaches the game server: hub and /version only, a few
  // connections per guest, a ceiling for the house.
  const limiter = new Limiter();
  const upstream = () => net.connect({ host: '127.0.0.1', port: guestPort });
  const blocked = new Set(); // Steam ids that abused the tunnel: not listened to until the game is closed
  let target = null;          // guest: { kind: 'lan', host, port } | { kind: 'steam', peer }
  let lobby = null;           // the Steam lobby we are in (host or guest)
  let hosting = false;
  let pendingLobby = null;    // a Steam invitation that arrived before the page asked
  let steamReady = false, pollTimer = null;
  const handles = [];

  // ---------- the Steam line ----------
  const tunnel = new Tunnel({
    log,
    send: (peer, data) => { const s = o.steam(); if (!s) return false; try { return s.client.networking.sendP2PPacket(BigInt(peer), RELIABLE, data); } catch (e) { log('p2p send failed: ' + e.message); return false; } },
  });
  const members = () => { try { return lobby ? lobby.getMembers().map((m) => String(m.steamId64)) : []; } catch { return []; } };
  tunnel.allow = (peer) => hosting && !blocked.has(peer) && members().includes(peer);
  tunnel.onStream = (peer, stream) => admit(stream, 'steam:' + peer, limiter, upstream, log);
  tunnel.onAbuse = (peer) => { blocked.add(peer); };

  function startSteamLine() {
    const s = o.steam();
    if (!s || steamReady) return !!s;
    steamReady = true;
    const c = s.client;
    const on = (id, f) => { try { handles.push(c.callback.register(id, (v) => { try { f(v); } catch (e) { log('steam callback failed: ' + e.message); } })); } catch (e) { log('steam callback off: ' + e.message); } };
    // Only somebody in our lobby may talk to us (as host: every member; as guest: the host).
    on(CB.P2PSessionRequest, (v) => { const peer = String(v.remote); if ((hosting && members().includes(peer)) || (target && target.kind === 'steam' && target.peer === peer)) c.networking.acceptP2PSession(v.remote); });
    on(CB.P2PSessionConnectFail, (v) => { const peer = String(v.remote); tunnel.dropPeer(peer); if (target && target.kind === 'steam' && target.peer === peer) notify({ type: 'line-failed' }); });
    on(CB.LobbyChatUpdate, (v) => {
      if (!lobby || v.lobby !== lobby.id) return;
      const who = String(v.user_changed);
      if (v.member_state_change !== 0) { // left, dropped, kicked
        tunnel.dropPeer(who);
        if (target && target.kind === 'steam' && target.peer === who) notify({ type: 'host-left' });
      }
      notify({ type: 'lobby-members', count: members().length });
    });
    on(CB.GameLobbyJoinRequested, (v) => { pendingLobby = String(v.lobby_steam_id); notify({ type: 'steam-join', lobbyId: pendingLobby }); });
    pollTimer = setInterval(() => {
      try {
        for (let n = 0; n < 256; n++) {
          const size = c.networking.isP2PPacketAvailable();
          if (!(size > 0)) break;
          const p = c.networking.readP2PPacket(size);
          tunnel.receive(String(p.steamId.steamId64), p.data);
        }
      } catch (e) { log('p2p read failed: ' + e.message); }
    }, 4);
    return true;
  }

  // "+connect_lobby <id>": Steam started the game because the player accepted an invitation or pressed "Join game".
  const at = o.argv.indexOf('+connect_lobby');
  if (at >= 0 && /^\d{5,20}$/.test(o.argv[at + 1] || '')) pendingLobby = o.argv[at + 1];

  // ---------- helpers ----------
  // this computer's addresses, the home-network ones first (192.168 / 10 / 172.16–31), self-assigned 169.254 ones last
  const rank = (a) => (/^192\.168\./.test(a) ? 0 : /^10\./.test(a) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : /^169\.254\./.test(a) ? 9 : 5);
  const addresses = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address).sort((x, y) => rank(x) - rank(y));

  function getJson(options, ms) {
    return new Promise((resolve) => {
      const req = http.get({ timeout: ms, ...options }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { if (body.length < 4096) body += d; });
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }
  /** The host as it answers through our own door right now (null: no answer). */
  const probe = (ms = 2500) => target ? getJson({ host: '127.0.0.1', port: joinPort, path: '/version' }, ms) : Promise.resolve(null);

  /** The same build on both sides? Otherwise the words for the player (the page translates the key, the numbers are filled in). */
  async function mismatch(theirs) {
    if (!theirs) return { error: 'no-answer' };
    if (theirs.hosted !== true) return { error: 'not-a-host' };
    const mine = await o.protocol();
    if (theirs.protocol !== mine || String(theirs.build || '') !== build) return { error: 'version', host: String(theirs.build || '?').slice(0, 40), mine: build };
    return null;
  }

  // ---------- the guest's door: http://join.keepfall.localhost → the host ----------
  const joinServer = net.createServer((socket) => {
    socket.on('error', () => { /* closed below */ });
    if (!target) { socket.destroy(); return; }
    const up = target.kind === 'lan' ? net.connect({ host: target.host, port: target.port }) : tunnel.connect(target.peer);
    pipeBoth(socket, up);
  });
  joinServer.on('error', (e) => log('join door failed: ' + e.message));
  joinServer.listen(joinPort, '127.0.0.1');

  // ---------- host ----------
  function openLan() {
    return new Promise((resolve) => {
      if (lanServer) { resolve(lanPort); return; }
      const wanted = Number(process.env.KEEPFALL_LAN_PORT) || LAN_PORT;
      const attempt = (n) => {
        if (n >= LAN_TRIES) { resolve(0); return; }
        const s = net.createServer((socket) => { socket.setNoDelay(true); admit(socket, socket.remoteAddress, limiter, upstream, log); });
        s.maxConnections = 48;
        s.once('error', () => attempt(n + 1));
        s.listen(wanted + n, '0.0.0.0', () => { lanServer = s; lanPort = wanted + n; s.on('error', (e) => log('lan door: ' + e.message)); resolve(lanPort); });
      };
      attempt(0);
    });
  }

  const cleanData = (d) => {
    const out = {};
    for (const k of ['code', 'name', 'players', 'max', 'phase']) if (d && d[k] != null) out[k] = String(d[k]).slice(0, 40);
    return out;
  };

  /** The page made a room on our own server: open the doors. `steam`: 'friends' | 'public' | 'private' | null (no Steam lobby). */
  async function hostOpen(opts) {
    const code = String((opts && opts.code) || '').toUpperCase();
    if (!/^[A-Z]{6}$/.test(code)) return { ok: false, error: 'bad-code' };
    leaveSteamLobby();
    target = null;
    hosting = true;
    // The LAN door (a listening port on every network of this computer, and Windows' firewall question) is opened only when the host asks for a
    // LAN / direct-IP game; a game made for Steam friends has no open port at all.
    closeLan();
    const port = opts && opts.lan === true ? await openLan() : 0;
    const result = { ok: true, lanPort: port, addresses: port ? addresses() : [], steam: false, lobbyId: null };
    const kind = opts && opts.steam;
    if (kind && kind in LOBBY_TYPES && startSteamLine()) {
      try {
        lobby = await o.steam().client.matchmaking.createLobby(LOBBY_TYPES[kind], 4);
        lobby.mergeFullData({ kf: '1', build, protocol: String(await o.protocol()), ...cleanData(opts) });
        result.steam = true;
        result.lobbyId = String(lobby.id);
      } catch (e) { log('lobby create failed: ' + e.message); lobby = null; }
    }
    log('host open lan=' + port + ' steam=' + result.steam);
    if (!port && !result.steam) { leave(); return { ok: false, error: opts && opts.lan === true ? 'no-door' : 'no-steam', lanPort: 0, addresses: [], steam: false, lobbyId: null }; }
    return result;
  }

  function hostUpdate(data) {
    if (!hosting || !lobby) return false;
    try { return lobby.mergeFullData(cleanData(data)); } catch { return false; }
  }

  function leaveSteamLobby() {
    if (lobby) { try { lobby.leave(); } catch { /* gone already */ } }
    lobby = null;
    tunnel.dropAll();
  }

  function closeLan() {
    if (lanServer) { try { lanServer.close(); } catch { /* closed */ } }
    lanServer = null; lanPort = 0;
  }

  /** Back to the menu (host or guest): every door shut. */
  function leave() {
    hosting = false;
    target = null;
    blocked.clear();
    closeLan();
    leaveSteamLobby();
    return true;
  }

  // ---------- guest ----------
  /** "192.168.1.5:47800#ABCDEF", "192.168.1.5:47800/?room=ABCDEF" or a whole http:// link the host copied. */
  function parseAddress(text) {
    const m = /^\s*(?:https?:\/\/)?(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?(?:\/?(?:#|\?room=|\/oda\/)([A-Za-z]{6}))?\/?\s*$/.exec(String(text || ''));
    if (!m) return null;
    const port = m[2] ? Number(m[2]) : LAN_PORT;
    if (!(port > 0 && port < 65536)) return null;
    return { host: m[1].replace(/^\[|\]$/g, ''), port, code: m[3] ? m[3].toUpperCase() : null };
  }

  async function joinLan(text) {
    const a = parseAddress(text);
    if (!a) return { ok: false, error: 'bad-address' };
    if (!a.code) return { ok: false, error: 'no-code' };
    leave();
    const bad = await mismatch(await getJson({ host: a.host, port: a.port, path: '/version' }, 4000));
    if (bad) return { ok: false, ...bad };
    target = { kind: 'lan', host: a.host, port: a.port };
    log('join lan ' + a.host + ':' + a.port);
    return { ok: true, code: a.code, base: 'http://join.keepfall.localhost' };
  }

  async function joinSteam(id) {
    if (!/^\d{5,20}$/.test(String(id)) || !startSteamLine()) return { ok: false, error: 'no-steam' };
    leave();
    pendingLobby = null;
    try {
      const joined = await o.steam().client.matchmaking.joinLobby(BigInt(id));
      const data = joined.getFullData();
      const code = String(data.code || '').toUpperCase();
      if (data.kf !== '1' || !/^[A-Z]{6}$/.test(code)) { joined.leave(); return { ok: false, error: 'not-a-host' }; }
      // told before anything is sent to the host: the lobby itself names the host's build
      if (String(data.build || '') !== build || Number(data.protocol) !== await o.protocol()) { joined.leave(); return { ok: false, error: 'version', host: String(data.build || '?').slice(0, 40), mine: build }; }
      lobby = joined;
      target = { kind: 'steam', peer: String(joined.getOwner().steamId64) };
      // ...and asked again over the line itself (also proves the relay works before the page tries)
      const bad = await mismatch(await probe(12000));
      if (bad) { leave(); return { ok: false, ...bad }; }
      log('join steam lobby ' + id);
      return { ok: true, code, base: 'http://join.keepfall.localhost' };
    } catch (e) { leave(); log('lobby join failed: ' + e.message); return { ok: false, error: 'no-answer' }; }
  }

  /** Open Keepfall lobbies (public ones, and friends' as Steam lists them). */
  async function lobbies() {
    if (!startSteamLine()) return [];
    try {
      const mine = await o.protocol();
      const list = await o.steam().client.matchmaking.getLobbies();
      return list.map((l) => ({ l, d: l.getFullData() })).filter((x) => x.d.kf === '1' && /^[A-Za-z]{6}$/.test(x.d.code || '')).slice(0, 50).map(({ l, d }) => ({
        id: String(l.id), name: String(d.name || '').slice(0, 24), players: Number(d.players) || Number(l.getMemberCount()) || 1, max: Number(d.max) || 4,
        phase: String(d.phase || 'lobby').slice(0, 16), compatible: String(d.build || '') === build && Number(d.protocol) === mine, build: String(d.build || '?').slice(0, 40),
      }));
    } catch (e) { log('lobby list failed: ' + e.message); return []; }
  }

  function invite() {
    if (!hosting || !lobby) return false;
    try { lobby.openInviteDialog(); return true; } catch { return false; }
  }

  function info() {
    const s = o.steam();
    let name = '';
    if (s) { try { name = String(s.client.localplayer.getName() || '').slice(0, 32); } catch { /* no name */ } }
    return { build, steam: !!s, steamName: name, hosting, lanPort, addresses: addresses(), lobbyId: lobby ? String(lobby.id) : null,
      joined: target ? target.kind : null, pendingLobby };
  }

  function dispose() {
    leave();
    if (pollTimer) clearInterval(pollTimer);
    for (const h of handles) { try { h.disconnect(); } catch { /* gone */ } }
    try { joinServer.close(); } catch { /* closed */ }
  }

  return { hostOpen, hostUpdate, leave, joinLan, joinSteam, lobbies, invite, info, probe: async () => !!(await probe()), dispose, parseAddress, isHosting: () => hosting };
}

module.exports = { createMp };
