// Storage that survives a browser blocking it (third-party iframe, private mode): when localStorage / sessionStorage throw, the value lives in memory
// until the page is reloaded. Reads and writes never throw.

function make(pick: () => Storage): { get: (k: string) => string | null; set: (k: string, v: string) => void; remove: (k: string) => void } {
  const mem = new Map<string, string>();
  return {
    get(k) { try { return pick().getItem(k); } catch { return mem.get(k) ?? null; } },
    set(k, v) { try { pick().setItem(k, v); } catch { mem.set(k, v); } },
    remove(k) { try { pick().removeItem(k); } catch { mem.delete(k); } },
  };
}

export const safeLocal = make(() => localStorage);
export const safeSession = make(() => sessionStorage);
