// A server started with Keepfall__MaxRooms=1: the second room is refused with "Sunucu dolu…" and joining the first still works. Usage: node tools/full-check.mjs http://localhost:5083
import { createRequire } from 'node:module';
const signalR = createRequire(new URL('../client/package.json', import.meta.url))('@microsoft/signalr');
const base = process.argv[2] ?? 'http://localhost:5083';
const conn = async () => { const h = new signalR.HubConnectionBuilder().withUrl(`${base}/hub`, { withCredentials: false }).configureLogging(signalR.LogLevel.Error).build(); await h.start(); return h; };
const a = await conn(), b = await conn(), c = await conn();
const first = await a.invoke('CreateRoom', 'A');
const second = await b.invoke('CreateRoom', 'B');
console.log('first room:', first.ok, first.code, '| second:', second.ok, second.error);
const join = await c.invoke('JoinRoom', first.code, 'C', null, false);
console.log('joining the existing room still works:', join.ok);
const ok = first.ok && !second.ok && /Sunucu dolu/.test(second.error ?? '') && join.ok;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
