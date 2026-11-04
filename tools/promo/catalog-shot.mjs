// Screenshot of the clip catalogue (art/promo/clips/index.html) -> art/promo/catalog.png
import { launch, sleep } from './lib.mjs';
import { writeFileSync } from 'node:fs';
const b = await launch({ url: 'about:blank' });
await b.goto(new URL('../../art/promo/clips/index.html', import.meta.url).href);
await b.js('document.querySelectorAll("video").forEach((v) => { v.currentTime = 1.5; })');
await sleep(4000);
const r = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
writeFileSync('art/promo/catalog.png', Buffer.from(r.result.data, 'base64'));
b.close();
