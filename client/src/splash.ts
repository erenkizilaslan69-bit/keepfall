// The game's side of the loading screen (public/splash/splash.js draws it before this code runs): the real work it shows.
//  - server: the hub connection (in the desktop build the shell's own loading page already waited for the local server);
//  - images: the interface art, the menu's meadow and the fonts;
//  - sound: the effect recordings (and on the desktop the menu music) fetched into the browser's cache, so the first click plays them at once.
// Nothing waits on its own: done() the moment the menu is up. A slow web connection never holds the menu for the sounds (they keep loading behind it).

interface SplashApi {
  step(stage: 'server' | 'images' | 'sound', done: number, total: number): void;
  fail(detail?: string, desktop?: boolean): void;
  done(): void;
  onRetry: (() => void) | null;
  lang: string;
}

const api = (): SplashApi | null => (window as unknown as { kfSplash?: SplashApi }).kfSplash ?? null;

/** How long the server may take before the screen says it could not connect (and offers "Try again"). */
export const SERVER_WAIT_MS = 20_000;

export const splashStep = (stage: 'server' | 'images' | 'sound', done: number, total: number): void => { api()?.step(stage, done, total); };

/** The language the loading screen showed (the desktop shell remembers it for its own loading page next time). */
export const splashLang = (): string | null => api()?.lang ?? null;

/** Runs the jobs (a few at a time), telling the screen how many are done. Never rejects: a file that fails counts as done (the game loads it again when needed). */
export async function loadCounted(stage: 'images' | 'sound', jobs: (() => Promise<unknown>)[], parallel = 6): Promise<void> {
  let done = 0, next = 0;
  splashStep(stage, 0, jobs.length);
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await job(); } catch { /* counted all the same */ }
      splashStep(stage, ++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) || 1 }, worker));
  splashStep(stage, jobs.length, jobs.length);
}

/** A picture, fully decoded. */
export const loadImage = (url: string) => (): Promise<void> => new Promise((resolve) => {
  const img = new Image();
  img.onload = img.onerror = () => resolve();
  img.src = url;
});

/** A file into the browser's cache (sounds: they are decoded after the first click). */
export const prefetch = (url: string) => (): Promise<void> => fetch(url).then((r) => r.blob()).then(() => undefined, () => undefined);

/**
 * Waits for `connect` with the screen's 20-second rule: when it does not succeed in time the screen says so with "Try again", and a click tries once more
 * (`abort` first drops the attempt that hung). Resolves when connected.
 */
export async function connectWithSplash(connect: () => Promise<void>, abort: () => Promise<void>): Promise<void> {
  const s = api();
  for (;;) {
    splashStep('server', 0, 1);
    const attempt = connect();
    attempt.catch(() => undefined);
    const ok = await Promise.race([attempt.then(() => true, () => false), new Promise<false>((r) => setTimeout(() => r(false), SERVER_WAIT_MS))]);
    if (ok) { splashStep('server', 1, 1); return; }
    await abort().catch(() => undefined);
    if (!s) throw new Error('no connection'); // (no loading screen: the caller shows its own message)
    s.fail('connect');
    await new Promise<void>((resolve) => { s.onRetry = () => { s.onRetry = null; resolve(); }; });
  }
}

/** Everything is ready: the screen fades into the menu. */
export function splashDone(): void { api()?.done(); }
