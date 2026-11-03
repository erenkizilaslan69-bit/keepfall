// CORS / iframe check: a page on another origin (a crazygames.com iframe) must reach the hub: the negotiate request answers with the right CORS headers and
// the WebSocket (the real transport) opens with that Origin. Usage: node tools/cors-check.mjs [http://localhost:5081]
import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const WebSocket = require('ws');
const base = process.argv[2] ?? 'http://localhost:5081';
const origins = ['https://www.crazygames.com', 'https://games.crazygames.com', 'https://keepfall-12345.game-files.crazygames.com', 'https://example.org'];
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

for (const origin of origins) {
  const pre = await fetch(`${base}/hub/negotiate?negotiateVersion=1`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-signalr-user-agent,content-type' } });
  ok(pre.headers.get('access-control-allow-origin') === origin, `preflight ${origin}: allow-origin = ${pre.headers.get('access-control-allow-origin')}, credentials = ${pre.headers.get('access-control-allow-credentials')}`);
  const neg = await fetch(`${base}/hub/negotiate?negotiateVersion=1`, { method: 'POST', headers: { Origin: origin } });
  const body = await neg.json();
  ok(neg.status === 200 && neg.headers.get('access-control-allow-origin') === origin && body.connectionToken, `negotiate ${origin}: ${neg.status}, allow-origin ${neg.headers.get('access-control-allow-origin')}`);
  const url = base.replace('http', 'ws') + `/hub?id=${encodeURIComponent(body.connectionToken)}`;
  const state = await new Promise((resolve) => {
    const ws = new WebSocket(url, { headers: { Origin: origin } });
    const t = setTimeout(() => { ws.terminate(); resolve('timeout'); }, 5000);
    ws.on('open', () => { ws.send('{"protocol":"json","version":1}\x1e'); });
    ws.on('message', (d) => { if (String(d).startsWith('{}')) { clearTimeout(t); ws.close(); resolve('handshake'); } });
    ws.on('error', (e) => { clearTimeout(t); resolve('error ' + e.message); });
  });
  ok(state === 'handshake', `websocket ${origin}: ${state}`);
}
process.exit(bad ? 1 : 0);
