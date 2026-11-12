// How a player's level, title and banner pattern look beside their name (lobby, end screen, profile screen). Looks only. The banner patterns are drawn here
// with the canvas, small and in the player's own colour: no art file, and nothing that names or hints at a kingdom.
import { COLOR_CSS, esc } from '../format';
import { t } from '../i18n';
import { PATTERNS, titleInfo } from '../progress/level';
import './profile-look.css';

const W = 14, H = 20; // logical pixels; shown scaled up with nearest-neighbour filtering

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const cache = new Map<string, string>();

/** A banner of the player's colour with the pattern on it, as a picture address ('' for an unknown pattern or when the canvas is missing). */
export function patternUrl(pattern: string | null | undefined, color: string | null | undefined): string {
  if (!pattern || !PATTERNS.some((p) => p.id === pattern)) return '';
  const base = COLOR_CSS[color ?? 'blue'] ?? COLOR_CSS.blue;
  const key = `${pattern}:${base}`;
  const have = cache.get(key);
  if (have !== undefined) return have;
  let url = '';
  try {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (g) {
      const cloth = base, light = shade(base, 0.55), dark = shade(base, -0.4);
      const px = (x: number, y: number, w = 1, h = 1, col = light) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
      // pole and cloth (a swallow-tailed banner)
      px(0, 0, W, 1, '#5a4222');
      px(1, 1, W - 2, H - 4, cloth);
      for (let i = 0; i < 3; i++) px(1 + i * 4, H - 3, 4, 3 - (i % 2) * 2 - 1 + 1, i % 2 === 0 ? cloth : cloth);
      px(1, H - 3, 2, 1, cloth); px(W - 3, H - 3, 2, 1, cloth);
      px(5, H - 3, 4, 1, cloth);
      px(1, 1, 1, H - 4, dark); px(W - 2, 1, 1, H - 4, dark);
      switch (pattern) {
        case 'stripes': for (let y = 3; y < H - 4; y += 4) px(2, y, W - 4, 2); break;
        case 'chevron': for (let i = 0; i < 4; i++) { const y = 4 + i * 3; for (let x = 0; x < 5; x++) { px(2 + x, y + Math.min(x, 4 - x), 1, 1); px(W - 3 - x, y + Math.min(x, 4 - x), 1, 1); } } break;
        case 'cross': px(6, 3, 2, H - 8); px(3, 7, 8, 2); break;
        case 'diamond': for (let i = 0; i < 4; i++) { px(7 - i, 5 + i, 2 * i + 2, 1); px(7 - i, 12 - i, 2 * i + 2, 1); } break;
        case 'ribbon': px(2, 4, W - 4, 2, '#e8d7ae'); px(2, 6, 2, 6, '#e8d7ae'); px(W - 4, 6, 2, 6, '#e8d7ae'); px(3, 12, 1, 1, '#e8d7ae'); px(W - 4, 12, 1, 1, '#e8d7ae'); break;
        case 'star': px(6, 4, 2, 9); px(3, 7, 8, 2); px(4, 5, 1, 1); px(9, 5, 1, 1); px(4, 11, 1, 1); px(9, 11, 1, 1); break;
        case 'crest': px(4, 4, 6, 5); px(5, 9, 4, 2); px(6, 11, 2, 2); px(5, 5, 4, 2, dark); break;
        default: break;
      }
      url = c.toDataURL();
    }
  } catch { url = ''; }
  cache.set(key, url);
  return url;
}

export interface LookOf { title?: string | null; level?: number; pattern?: string | null; color?: string | null }

/** "Lv 12", the pattern banner and the title as small inline pieces (empty when the player has none of them). */
export function profileHtml(p: LookOf): string {
  const parts: string[] = [];
  const level = typeof p.level === 'number' && p.level >= 1 && p.level <= 30 ? Math.floor(p.level) : 0;
  if (level) parts.push(`<span class="pf-level" title="${esc(t('Seviye {0}', level))}">${esc(t('Sv {0}', level))}</span>`);
  const url = patternUrl(p.pattern, p.color);
  if (url) parts.push(`<img class="pf-pattern" src="${url}" alt="" draggable="false">`);
  const title = titleInfo(p.title);
  if (title) parts.push(`<span class="pf-title">${esc(title.name)}</span>`);
  return parts.length ? `<span class="pf">${parts.join('')}</span>` : '';
}
