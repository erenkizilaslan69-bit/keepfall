// The Steam tunnel of the desktop shell (tools/steam/shell/tunnel.js) without Steam: two Tunnel ends joined by a made-up packet line (ordered, reliable,
// slow), a real HTTP + WebSocket-like exchange through it, and the rules a host relies on (strangers are refused, a peer's streams end when it goes).
//   node tools/tunnel-check.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { Tunnel } = require('./steam/shell/tunnel.js');

let failed = 0;
const check = (name, ok, note = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); if (!ok) failed++; };

// the "game server": answers /version, echoes a POST body's hash, and a raw upgrade that echoes bytes (a WebSocket's shape)
const server = http.createServer((req, res) => {
  if (req.url === '/version') { res.setHeader('content-type', 'application/json'); res.end('{"protocol":1,"build":"t","hosted":true}'); return; }
  const h = createHash('sha256'); let n = 0;
  req.on('data', (d) => { h.update(d); n += d.length; });
  req.on('end', () => res.end(JSON.stringify({ n, sha: h.digest('hex') })));
});
server.on('upgrade', (_req, socket) => { socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: echo\r\nConnection: Upgrade\r\n\r\n'); socket.pipe(socket); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const serverPort = server.address().port;

// the line: host <-> guest (and a stranger), 20–60 ms each way, in order
const ends = {};
const queues = {};
const line = (me) => ({ send: (peer, data) => {
  // a FIFO per direction: packets leave in the order they were sent, each held 20–60 ms
  const k = me + '>' + peer, q = (queues[k] ??= { list: [], busy: false });
  q.list.push({ at: Date.now() + 20 + Math.random() * 40, data: Buffer.from(data) });
  const drain = () => { const next = q.list[0]; if (!next) { q.busy = false; return; } q.busy = true; setTimeout(() => { q.list.shift(); ends[peer]?.receive(me, next.data); drain(); }, Math.max(0, next.at - Date.now())); };
  if (!q.busy) drain();
  return true;
} });
const host = ends.host = new Tunnel(line('host'));
const guest = ends.guest = new Tunnel(line('guest'));
const stranger = ends.stranger = new Tunnel(line('stranger'));
host.allow = (peer) => peer === 'guest';
host.onStream = (_peer, stream) => { const up = net.connect({ host: '127.0.0.1', port: serverPort }); stream.pipe(up); up.pipe(stream); up.on('error', () => stream.destroy()); stream.on('close', () => up.destroy()); up.on('close', () => stream.destroy()); };

// the guest's local door, as mp.js makes it
const door = (tunnel) => new Promise((resolve) => {
  const s = net.createServer((socket) => { const up = tunnel.connect('host'); socket.pipe(up); up.pipe(socket); socket.on('error', () => up.destroy()); up.on('close', () => socket.destroy()); socket.on('close', () => up.destroy()); });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const guestDoor = await door(guest), strangerDoor = await door(stranger);
const get = (port, path, body) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port, path, method: body ? 'POST' : 'GET', timeout: 5000, agent: false }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => resolve(t)); });
  req.on('error', (e) => resolve('error: ' + e.message)); req.on('timeout', () => { req.destroy(); resolve('timeout'); });
  req.end(body);
});

check('a GET through the tunnel', (await get(guestDoor.address().port, '/version')).includes('"hosted":true'));
const big = randomBytes(700_000);
const echoed = JSON.parse(await get(guestDoor.address().port, '/upload', big));
check('a 700 KB body arrives whole and in order', echoed.n === big.length && echoed.sha === createHash('sha256').update(big).digest('hex'));
const many = await Promise.all(Array.from({ length: 8 }, () => get(guestDoor.address().port, '/version')));
check('eight streams at once', many.every((t) => t.includes('"protocol":1')));

// an upgraded connection that stays open and carries bytes both ways
const ws = net.connect({ host: '127.0.0.1', port: guestDoor.address().port });
const got = [];
ws.on('data', (d) => got.push(d));
ws.write('GET /hub HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n');
await new Promise((r) => setTimeout(r, 400));
const t0 = Date.now();
for (let i = 0; i < 50; i++) ws.write(`frame-${i};`);
await new Promise((r) => setTimeout(r, 600));
const text = Buffer.concat(got).toString();
check('an upgraded connection echoes 50 frames in order', text.includes('101 Switching') && text.endsWith(Array.from({ length: 50 }, (_, i) => `frame-${i};`).join('')), `${Date.now() - t0} ms`);

check('a stranger (not in the lobby) is refused', /error|timeout/.test(await get(strangerDoor.address().port, '/version')) );
host.dropPeer('guest');
await new Promise((r) => setTimeout(r, 300));
check('when the peer goes its open connection ends', ws.destroyed || ws.readableEnded);
check('nothing is left open', host.streams.size === 0, `${host.streams.size} streams`);

server.closeAllConnections?.(); server.close(); guestDoor.close(); strangerDoor.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
