// Small display helpers shared by the panels.

export const fmt = (n: number) => Math.floor(n + 1e-6).toString();

export const rate = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1);

export const clock = (seconds: number) => {
  const t = Math.ceil(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const COLOR_NAMES: Record<string, string> = { blue: 'Mavi', red: 'Kırmızı', yellow: 'Sarı', purple: 'Mor' };
export const COLOR_CSS: Record<string, string> = { blue: '#4a8fd9', red: '#d9534a', yellow: '#e2b93b', purple: '#9b6bd1' };
