import { serverUrl } from './env';
// Script errors and unhandled promise rejections are sent to the server (POST /api/client-log), which writes them to its log,
// so a freeze or a blank window can be read afterwards instead of described. A few per page, the same one only once.

export interface ErrorContext {
  room?: string;
  seat?: number;
  phase?: string;
  elapsedSeconds?: number;
  /** Free text: what the client was doing (open window, battles being replayed…). */
  context?: string;
}

const MAX_PER_PAGE = 20;
let sent = 0;
const seen = new Set<string>();
let contextOf: () => ErrorContext = () => ({});

/** Send one error by hand (e.g. one caught so the game could carry on). */
export function reportError(kind: string, error: unknown, extra: { source?: string; line?: number; col?: number } = {}): void {
  const e = error instanceof Error ? error : undefined;
  const message = e ? `${e.name}: ${e.message}` : String(error);
  const key = `${kind}|${message}|${extra.source ?? ''}|${extra.line ?? ''}`;
  if (sent >= MAX_PER_PAGE || seen.has(key)) return;
  seen.add(key);
  sent++;
  let ctx: ErrorContext = {};
  try { ctx = contextOf(); } catch { /* the context must never raise a second error */ }
  const body = JSON.stringify({
    kind, message, stack: e?.stack, ...extra, url: location.href, userAgent: navigator.userAgent, ...ctx,
  });
  try {
    void fetch(serverUrl('/api/client-log'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* offline: nothing to do */ }
}

/**
 * Run one step of a frame or of a server message so that a failure in it cannot stop the rest: an error that escapes a Phaser scene's
 * update ends the frame loop for good (the picture freezes), and one that escapes a message handler skips everything after it.
 * The error is reported (once) and the step is simply skipped this time.
 */
export function guarded(kind: string, step: () => void, source?: string): void {
  try {
    step();
  } catch (e) {
    reportError(kind, e, { source });
  }
}

export function installErrorReporting(context: () => ErrorContext): void {
  contextOf = context;
  window.addEventListener('error', (ev) => {
    reportError('error', ev.error ?? ev.message, { source: ev.filename, line: ev.lineno, col: ev.colno });
  });
  window.addEventListener('unhandledrejection', (ev) => reportError('unhandledrejection', ev.reason));
}
