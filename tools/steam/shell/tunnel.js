'use strict';
// Byte streams over a packet line (Steam's reliable, ordered P2P messages): what lets the guest's ordinary HTTP/WebSocket traffic reach the host's local
// game server without either side knowing about Steam. One Tunnel per process; a stream is opened by the guest (connect) and answered by the host
// (onStream). Nothing here knows Steam: `send(peer, buffer)` and `receive(peer, buffer)` are the whole line, so tools/tunnel-check.mjs can test it
// with a made-up line.
//   packet = [type:1][stream id:4 BE][payload]      OPEN 1 (guest → host), DATA 2, END 3 (no more data from this side), RESET 4 (gone)
const { Duplex } = require('node:stream');

const OPEN = 1, DATA = 2, END = 3, RESET = 4;
const CHUNK = 32 * 1024; // well under Steam's 1 MB reliable limit; small enough not to hold the line for long
const MAX_STREAMS_PER_PEER = 16; // a page needs a handful (negotiate, the socket, a version question)

class Tunnel {
  /** @param {{ send: (peer: string, data: Buffer) => boolean | void, log?: (line: string) => void }} line */
  constructor(line) {
    this.line = line;
    this.log = line.log || (() => {});
    this.streams = new Map(); // "peer:id" -> Duplex
    this.nextId = 1;
    /** Host side: a guest opened a stream. Set by the owner; without it every OPEN is refused. */
    this.onStream = null;
    /** Host side: may this peer open streams at all (a member of our lobby)? */
    this.allow = () => true;
  }

  packet(type, id, payload) {
    const head = Buffer.allocUnsafe(5);
    head.writeUInt8(type, 0);
    head.writeUInt32BE(id, 1);
    return payload && payload.length ? Buffer.concat([head, payload]) : head;
  }

  make(peer, id) {
    const key = peer + ':' + id;
    const tunnel = this;
    let ended = false;
    const stream = new Duplex({
      read() { /* data is pushed as it arrives */ },
      write(chunk, _enc, done) {
        for (let at = 0; at < chunk.length; at += CHUNK) tunnel.line.send(peer, tunnel.packet(DATA, id, chunk.subarray(at, at + CHUNK)));
        done();
      },
      final(done) { ended = true; tunnel.line.send(peer, tunnel.packet(END, id)); done(); },
      destroy(err, done) {
        if (tunnel.streams.get(key) === stream) {
          tunnel.streams.delete(key);
          if (!ended || err) tunnel.line.send(peer, tunnel.packet(RESET, id));
        }
        done(err);
      },
    });
    stream.on('error', () => { /* a broken stream is just closed */ });
    this.streams.set(key, stream);
    return stream;
  }

  /** Guest side: a new stream to the host. */
  connect(peer) {
    const id = this.nextId++;
    if (this.nextId > 0x7fffffff) this.nextId = 1;
    const stream = this.make(peer, id);
    this.line.send(peer, this.packet(OPEN, id));
    return stream;
  }

  /** A packet came in from `peer`. */
  receive(peer, data) {
    if (!data || data.length < 5) return;
    const type = data.readUInt8(0), id = data.readUInt32BE(1), key = peer + ':' + id;
    const stream = this.streams.get(key);
    if (type === OPEN) {
      let open = 0;
      for (const k of this.streams.keys()) if (k.startsWith(peer + ':')) open++;
      if (stream || !this.onStream || !this.allow(peer) || open >= MAX_STREAMS_PER_PEER) { this.line.send(peer, this.packet(RESET, id)); return; }
      this.onStream(peer, this.make(peer, id));
    } else if (!stream) {
      if (type === DATA) this.line.send(peer, this.packet(RESET, id)); // the other side talks into a stream we no longer have
    } else if (type === DATA) stream.push(data.subarray(5));
    else if (type === END) stream.push(null);
    else if (type === RESET) { this.streams.delete(key); stream.destroy(); }
  }

  /** The peer is gone (left the lobby, the line failed): all of its streams end. */
  dropPeer(peer) {
    for (const [key, stream] of [...this.streams]) if (key.startsWith(peer + ':')) stream.destroy(); // (tells the other end too, should it still be listening)
  }

  dropAll() { for (const stream of [...this.streams.values()]) stream.destroy(); }
}

/**
 * Pipes `from` into `to` as a slow, lossy line would: every chunk is held for `ms` (± `jitter`), and with chance `loss` for a retransmission's worth
 * longer; order is kept (as TCP and Steam's reliable messages keep it). Development and tests only (KEEPFALL_LAG, tools/lag-proxy.mjs).
 */
function lagPipe(from, to, { ms = 0, jitter = 0, loss = 0, resend = 250 } = {}) {
  if (!(ms > 0 || loss > 0)) { from.pipe(to); return; }
  let last = 0;
  from.on('data', (chunk) => {
    const hold = ms + (Math.random() * 2 - 1) * jitter + (Math.random() < loss ? resend : 0);
    const at = Math.max(last, Date.now() + Math.max(0, hold));
    last = at;
    setTimeout(() => { if (!to.destroyed) to.write(chunk); }, at - Date.now());
  });
  from.on('end', () => setTimeout(() => { if (!to.destroyed) to.end(); }, Math.max(0, last - Date.now())));
}

/** "150,50,0.02" → { ms: 150, jitter: 50, loss: 0.02 } (one way; both directions get it). */
function parseLag(text) {
  if (!text) return null;
  const [ms, jitter, loss] = String(text).split(',').map(Number);
  return ms > 0 || loss > 0 ? { ms: ms || 0, jitter: jitter || 0, loss: loss || 0 } : null;
}

module.exports = { Tunnel, lagPipe, parseLag };
