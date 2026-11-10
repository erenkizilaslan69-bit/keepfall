'use strict';
// The doorkeeper of a hosted game. Every connection a guest opens (a TCP connection on the LAN door, a stream of the Steam tunnel) passes here before a
// single byte reaches the host's game server:
//   - it must begin, within a few seconds, with a short HTTP/1.1 request line for the game hub or /version; anything else (another path, a file, an
//     API, another protocol, garbage, silence, a line that never ends) is answered 404 and closed without the server ever seeing it;
//   - a guest (one LAN address, one Steam id) may hold only a few connections and open only so many in a while; the house as a whole has a ceiling;
//   - the guest's identity is written into the request (X-Keepfall-Peer), so the server can count wrong room codes per guest and keep a player the
//     host put out from coming back;
//   - a connection that goes quiet is closed (the hub pings every 10 s, so a live line never is).
// The server enforces the same list on every request (GuestGate.Allows): this is the first of two locks, not the only one.

const FIRST_LINE_MAX = 1024;      // bytes: "GET /hub?id=<token> HTTP/1.1" is under a hundred
const FIRST_LINE_MS = 5000;       // to send the request line
const IDLE_MS = 75000;            // silence in both directions
const ALLOWED = /^(?:GET|POST|DELETE|OPTIONS) \/(?:hub(?:\/negotiate)?(?:\?[\x21-\x7e]{0,512})?|version) HTTP\/1\.1$/;
const REFUSAL = 'HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const BUSY = 'HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

/** How many connections a guest and the house may have, and how fast a guest may open new ones. */
class Limiter {
  constructor({ perPeer = 8, total = 32, rate = 40, windowMs = 10000 } = {}) {
    this.perPeer = perPeer; this.total = total; this.rate = rate; this.windowMs = windowMs;
    this.open = new Map();   // peer -> connections now
    this.recent = new Map(); // peer -> times of the last openings
    this.count = 0;
    this.refused = 0;
  }
  /** A release function, or null: over a limit. */
  enter(peer) {
    const now = Date.now();
    const times = (this.recent.get(peer) || []).filter((t) => now - t < this.windowMs);
    times.push(now);
    if (this.recent.size > 256) this.recent.clear(); // (the book-keeping itself stays small)
    this.recent.set(peer, times.slice(-this.rate - 1));
    const mine = this.open.get(peer) || 0;
    if (times.length > this.rate || mine >= this.perPeer || this.count >= this.total) { this.refused++; return null; }
    this.open.set(peer, mine + 1);
    this.count++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.count--;
      const left = (this.open.get(peer) || 1) - 1;
      if (left > 0) this.open.set(peer, left); else this.open.delete(peer);
    };
  }
}

const cleanPeer = (peer) => String(peer || 'unknown').replace(/^::ffff:/, '').replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 64) || 'unknown';

/**
 * Lets one guest connection in, or turns it away.
 * @param {import('node:stream').Duplex} socket    the guest's side
 * @param {string} peer                             who it is (a LAN address, "steam:<id>")
 * @param {Limiter} limiter
 * @param {() => import('node:stream').Duplex} connectUpstream   a new connection to the game server's guest port
 * @param {(line: string) => void} [log]
 */
function admit(socket, peer, limiter, connectUpstream, log = () => {}) {
  const who = cleanPeer(peer);
  let up = null, done = false, idle = null;
  const release = limiter.enter(who);
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(first); clearTimeout(idle);
    if (release) release();
    socket.destroy();
    if (up) up.destroy();
  };
  const refuse = (answer, why) => {
    log('guest refused (' + why + '): ' + who);
    try { socket.end(answer); } catch { /* gone */ }
    setTimeout(close, 200);
  };
  socket.on('error', close);
  socket.on('close', close);
  const first = setTimeout(() => { if (!up) refuse(REFUSAL, 'no request in time'); }, FIRST_LINE_MS);
  if (!release) { clearTimeout(first); socket.on('data', () => {}); refuse(BUSY, 'too many connections'); return; }
  const touch = () => { clearTimeout(idle); idle = setTimeout(close, IDLE_MS); };

  let head = Buffer.alloc(0);
  const onHead = (chunk) => {
    head = Buffer.concat([head, chunk]);
    const end = head.indexOf('\r\n');
    if (end < 0) { if (head.length > FIRST_LINE_MAX) { socket.off('data', onHead); refuse(REFUSAL, 'request line too long'); } return; }
    socket.off('data', onHead);
    clearTimeout(first);
    const line = head.subarray(0, end).toString('latin1');
    if (end > FIRST_LINE_MAX || !ALLOWED.test(line)) { refuse(REFUSAL, 'not the game hub'); return; }
    up = connectUpstream();
    up.on('error', close);
    up.on('close', close);
    // the request goes on with the guest's name written right under its first line
    up.write(Buffer.concat([head.subarray(0, end + 2), Buffer.from('X-Keepfall-Peer: ' + who + '\r\n', 'latin1'), head.subarray(end + 2)]));
    socket.on('data', (d) => { touch(); if (!up.write(d)) { socket.pause(); up.once('drain', () => socket.resume()); } });
    up.on('data', (d) => { touch(); if (!socket.write(d)) { up.pause(); socket.once('drain', () => up.resume()); } });
    socket.on('end', () => { try { up.end(); } catch { /* gone */ } });
    up.on('end', () => { try { socket.end(); } catch { /* gone */ } });
    touch();
  };
  socket.on('data', onHead);
}

module.exports = { admit, Limiter, ALLOWED, cleanPeer };
