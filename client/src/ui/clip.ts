// Share-able battle clip, the smallest version that works: while a battle replay plays (those are the battles the player is in), the game canvas is
// recorded with MediaRecorder for up to CLIP_SECONDS; the best clip of the match is kept in memory (a siege that took a castle beats a siege, which beats a
// fight on the road; later beats earlier). The end screen's "Klibi kaydet" gives it to the player as a .webm download. Nothing is uploaded or stored on
// disk by the game: the file only goes where the player saves it. Browsers without MediaRecorder/captureStream never record and the button stays hidden.
export const CLIP_SECONDS = 10;

type Importance = 1 | 2 | 3;
let recorder: MediaRecorder | null = null;
let best: { blob: Blob; importance: Importance; mime: string } | null = null;
let stopTimer: number | undefined;

export function clipSupported(): boolean {
  try {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  } catch { return false; }
}

const pickMime = (): string | null => {
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* try the next */ }
  }
  return null;
};

/** A new battle replay begins: record it unless one is being recorded already. `seconds` is how long the replay lasts in real time. */
export function clipBattleStarted(canvas: HTMLCanvasElement | undefined, importance: Importance, seconds: number): void {
  if (!canvas || recorder || !clipSupported()) return;
  const mime = pickMime();
  if (!mime) return;
  try {
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      recorder = null;
      stream.getTracks().forEach((tr) => tr.stop());
      if (stopTimer !== undefined) { clearTimeout(stopTimer); stopTimer = undefined; }
      const blob = new Blob(chunks, { type: mime });
      if (blob.size > 2000 && (!best || importance >= best.importance)) best = { blob, importance, mime };
    };
    rec.onerror = () => { recorder = null; };
    rec.start(500);
    recorder = rec;
    stopTimer = window.setTimeout(() => { try { if (rec.state !== 'inactive') rec.stop(); } catch { recorder = null; } }, Math.min(CLIP_SECONDS, Math.max(3, seconds + 0.6)) * 1000);
  } catch { recorder = null; /* a canvas that cannot be captured: no clip */ }
}

export const clipAvailable = (): boolean => !!best;

/** Forget the clip (a new match begins). */
export function clipReset(): void {
  try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
  best = null;
}

/** Offer the clip to the player as a file; false when there is none. */
export function clipDownload(name = 'keepfall-savas'): boolean {
  if (!best) return false;
  const url = URL.createObjectURL(best.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
