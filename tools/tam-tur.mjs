// The full screen tour runner: node tools/tam-tur.mjs <tr|en> <A,B,... | ALL> [out-root]   (see tam-tur-lib.mjs)
import { existsSync } from 'node:fs';
import { runStages, STAGES, LANG } from './tam-tur-lib.mjs';
for (const letter of STAGES) {
  const f = new URL(`./tam-tur.${letter.toLowerCase()}.mjs`, import.meta.url);
  if (existsSync(f)) await import(f.href); else console.log(`stage ${letter}: no file yet`);
}
await runStages(); console.log('done', LANG);
process.exit(0);
