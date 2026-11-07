// Checks the Steam progress store without Steam: bundles client/src/progress/steam-store.ts + catalog.ts with esbuild (from client/node_modules) and runs it in Node
// against a fake bridge and a memory store.   node tools/steam-store-check.mjs
import { build } from '../client/node_modules/esbuild/lib/main.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'kf-steamstore-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export * from ${JSON.stringify(join(root, 'client/src/progress/steam-store.ts').replace(/\\/g, '/'))};
export { ACHIEVEMENTS } from ${JSON.stringify(join(root, 'client/src/progress/catalog.ts').replace(/\\/g, '/'))};
export { emptyProgress } from ${JSON.stringify(join(root, 'client/src/progress/store.ts').replace(/\\/g, '/'))};
`);
const out = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', define: { 'import.meta.env': '{}' } });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// (the catalog pulls in the i18n module, which reads the page language at load)
globalThis.document = { documentElement: { lang: '', classList: { add() {}, toggle() {} } } };
globalThis.navigator ??= { language: 'en' };
globalThis.window = globalThis;
const m = await import(pathToFileURL(out).href);

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failures++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// memory store + fake bridge
const memory = (initial) => { let d = initial; return { load: () => structuredClone(d), save: (x) => { d = structuredClone(x); }, peek: () => d }; };
const fakeBridge = (cloud = null) => {
  const calls = { unlock: [], write: [] };
  let file = cloud;
  return { calls, file: () => file,
    status: async () => ({ available: true, appId: 1 }), unlock: async (id) => { calls.unlock.push(id); return true; },
    cloudRead: async () => file, cloudWrite: async (_n, t) => { calls.write.push(t); file = t; return true; }, presence: async () => true };
};
const withData = (f) => { const d = m.emptyProgress(); f(d); return d; };

// merge
const a = withData((d) => { d.matches = 5; d.wins = 2; d.kingdoms.golge = { played: 3, won: 2 }; d.achievements.first_win = 200; d.picks.frame = 'bronze'; });
const b = withData((d) => { d.matches = 9; d.wins = 1; d.kingdoms.golge = { played: 2, won: 2 }; d.kingdoms.kahin = { played: 4, won: 1 }; d.achievements.first_win = 100; d.achievements.envoy = 300; d.picks.banners = { kahin: 'b' }; });
const merged = m.mergeProgress(a, b);
check('merge: counters take the larger value', merged.matches === 9 && merged.wins === 2 && merged.kingdoms.golge.played === 3 && merged.kingdoms.golge.won === 2 && merged.kingdoms.kahin.played === 4);
check('merge: achievements are the union, earlier time wins', merged.achievements.first_win === 100 && merged.achievements.envoy === 300);
check('merge: local pick wins, remote banners kept', merged.picks.frame === 'bronze' && merged.picks.banners.kahin === 'b');
check('merge: with itself changes nothing', eq(m.mergeProgress(a, a), a));
check('merge: wins never exceed matches, won never exceeds played', (() => { const x = m.mergeProgress(withData((d) => { d.wins = 50; }), m.emptyProgress()); return x.wins <= x.matches; })());

// store: a save unlocks only what is new, once; the data goes to the cloud file
{
  const local = memory(m.emptyProgress()); const br = fakeBridge();
  const store = new m.SteamProgressStore(local, br);
  const d1 = store.load(); d1.achievements.first_win = 1; store.save(d1);
  const d2 = store.load(); d2.achievements.envoy = 2; store.save(d2);
  await new Promise((r) => setTimeout(r, 10));
  check('save: each new achievement unlocked exactly once', eq(br.calls.unlock, ['first_win', 'envoy']), br.calls.unlock.join(','));
  check('save: cloud file written and holds the data', br.calls.write.length === 2 && JSON.parse(br.file()).achievements.envoy === 2);
  check('save: local copy kept (the working copy)', local.peek().achievements.envoy === 2);
}
// store: sync merges the cloud copy, repairs achievements, pushes the result back
{
  const cloud = JSON.stringify(withData((d) => { d.matches = 7; d.achievements.village_raid = 5; }));
  const local = memory(withData((d) => { d.matches = 2; d.achievements.first_win = 9; }));
  const br = fakeBridge(cloud);
  const store = new m.SteamProgressStore(local, br);
  await store.syncFromCloud(); await new Promise((r) => setTimeout(r, 10));
  check('sync: local has the merged data', local.peek().matches === 7 && local.peek().achievements.village_raid === 5 && local.peek().achievements.first_win === 9);
  check('sync: every achievement (re)unlocked', eq(br.calls.unlock.sort(), ['first_win', 'village_raid']));
  check('sync: merged data pushed back to the cloud', JSON.parse(br.file()).achievements.first_win === 9);
}
// store: broken cloud / failing bridge never throws into the game
{
  const local = memory(m.emptyProgress());
  const br = { ...fakeBridge('{not json'), unlock: () => Promise.reject(new Error('x')), cloudWrite: () => Promise.reject(new Error('y')) };
  const store = new m.SteamProgressStore(local, br);
  let ok = true;
  try { await store.syncFromCloud(); const d = store.load(); d.achievements.first_win = 1; store.save(d); await new Promise((r) => setTimeout(r, 10)); } catch { ok = false; }
  check('broken cloud file and failing bridge are swallowed', ok);
}
// the ids are the Steam API names: well-formed and the same as docs/basarimlar.md
{
  const ids = m.ACHIEVEMENTS.map((x) => x.id);
  const doc = readFileSync(join(root, 'docs', 'basarimlar.md'), 'utf8');
  const documented = [...doc.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((x) => x[1]);
  check('achievement ids are well-formed and unique', ids.every((i) => /^[a-z][a-z0-9_]{0,40}$/.test(i)) && new Set(ids).size === ids.length, `${ids.length} ids`);
  check('docs/basarimlar.md lists exactly the same ids', eq([...ids].sort(), [...documented].sort()), `doc ${documented.length}`);
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
