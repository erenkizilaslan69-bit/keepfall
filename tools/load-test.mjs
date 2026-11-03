// Server load: N rooms of 4 humans (SignalR clients) plus M quick-match style rooms (1 human + 3 bots), all started, held for a while; the server's own "Load:" line
// (tick work, tick lateness) is what to read afterwards. Needs the Development server on 5081 (speed control is not used). Usage: node tools/load-test.mjs [rooms4=3] [botRooms=6] [seconds=90] [http://localhost:5081]
import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const signalR = require('@microsoft/signalr');
const [full = 3, botRooms = 6, secs = 90] = process.argv.slice(2, 5).map(Number);
const base = (process.argv[5] ?? 'http://localhost:5081').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function client(name) {
  const hub = new signalR.HubConnectionBuilder().withUrl(base + '/hub', { transport: signalR.HttpTransportType.WebSockets, skipNegotiation: true }).configureLogging(signalR.LogLevel.Error).build();
  hub.on('RoomState', () => {}); hub.on('CastleState', () => {}); hub.on('MapState', () => {}); hub.on('MapLayout', () => {}); hub.on('Notification', () => {});
  hub.on('BattleStarted', () => {}); hub.on('SpectatorState', () => {}); hub.on('SpectatorWait', () => {}); hub.on('MatchEnded', () => {});
  await hub.start();
  return hub;
}
const hubs = [];
let started = 0;
for (let i = 0; i < full; i++) {
  const host = await client('h'); hubs.push(host);
  const made = await host.invoke('CreateRoom', `Host${i}`);
  const guests = [];
  for (let g = 0; g < 3; g++) { const c = await client('g'); hubs.push(c); const r = await c.invoke('JoinRoom', made.code, `G${i}${g}`, null, false); if (!r.ok) console.log('join failed', r.error); guests.push(c); }
  for (const c of guests) await c.invoke('SetReady', true);
  await host.invoke('SetReady', true);
  const s = await host.invoke('StartMatch');
  if (s.ok) started++; else console.log('start failed', s.error);
}
for (let i = 0; i < botRooms; i++) {
  const host = await client('b'); hubs.push(host);
  const made = await host.invoke('CreateRoom', `Solo${i}`);
  for (const l of ['easy', 'medium', 'medium']) await host.invoke('AddBot', l);
  await host.invoke('SetReady', true);
  const s = await host.invoke('StartMatch');
  if (s.ok) started++; else console.log('start failed', s.error);
}
console.log(`${started} matches started (${full} with 4 humans, ${botRooms} with bots); holding ${secs} s`);
await sleep(secs * 1000);
for (const h of hubs) await h.stop();
process.exit(0);
