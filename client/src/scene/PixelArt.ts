// @ts-nocheck
import { catapultFrame, FIRE_ARM } from './CatapultArt';
// Pixel art drawn in code, so it can sit in the repository: the catapult's fallback drawing and the camp fire (Tiny Swords style: one dark
// outline, three tones, team colour on the cloth). The rider of the cavalry is the pack's own Lancer, composed at load time from the
// loaded sheet (nothing derived from the pack is ever written to disk). Everything here draws into plain canvases.
// Tiny pixel-art toolkit: parts are masks painted with an outline, a shade on the lower-right and a light on the upper-left.
const OUT = '#1b2a3d';
class Spr {
  constructor(w, h) { this.ox = 0; this.oy = 0; this.w = w; this.h = h; this.px = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  mask(fn) { const m = new Uint8Array(this.w * this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (fn(x + .5 - this.ox, y + .5 - this.oy)) m[y * this.w + x] = 1; return m; }
  ell(cx, cy, rx, ry, rot = 0) { const c = Math.cos(rot), s = Math.sin(rot); return this.mask((x, y) => { const dx = x - cx, dy = y - cy; const u = dx * c + dy * s, v = -dx * s + dy * c; return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1; }); }
  poly(pts) { return this.mask((x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }); }
  rect(x0, y0, x1, y1) { return this.mask((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1); }
  line(x0, y0, x1, y1, t = 1) { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1; return this.mask((x, y) => { const k = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)); return Math.hypot(x - (x0 + k * dx), y - (y0 + k * dy)) <= t / 2; }); }
  union(...ms) { const o = new Uint8Array(this.w * this.h); for (const m of ms) for (let i = 0; i < o.length; i++) if (m[i]) o[i] = 1; return o; }
  at(m, x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && m[y * this.w + x]; }
  /** base colour with a shade, a light and an outline round the whole part */
  part(m, base, shade, light, outline = true) {
    const { w, h } = this;
    if (outline) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!m[y * w + x] && (this.at(m, x - 1, y) || this.at(m, x + 1, y) || this.at(m, x, y - 1) || this.at(m, x, y + 1))) this.px[y * w + x] = OUT;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
      let c = base;
      if (shade && !this.at(m, x - 2, y - 2)) c = shade;
      else if (light && !this.at(m, x + 1, y + 1)) c = light;
      this.px[y * w + x] = c;
    }
  }
  /** three tones: light on the upper-left rim, shade and a deeper shade on the lower-right (outline all round) */
  part3(m, base, shade, light, deep) {
    const { w, h } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!m[y * w + x] && (this.at(m, x - 1, y) || this.at(m, x + 1, y) || this.at(m, x, y - 1) || this.at(m, x, y + 1))) this.px[y * w + x] = OUT;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
      let c = base;
      if (!this.at(m, x + 1, y + 1) || !this.at(m, x, y + 1)) c = deep || shade;
      else if (!this.at(m, x + 2, y + 2) || !this.at(m, x + 1, y + 2)) c = shade;
      else if (!this.at(m, x - 1, y - 1)) c = light;
      this.px[y * w + x] = c;
    }
  }
  flat(m, c) { for (let i = 0; i < m.length; i++) if (m[i]) this.px[i] = c; }
  blit(img, sx, sy, sw, sh, dx, dy) {
    const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
    const g = cv.getContext('2d'); g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const d = g.getImageData(0, 0, sw, sh).data;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const o = (y * sw + x) * 4;
      if (d[o + 3] < 200) continue; // drops the soft ground shadow
      this.set(dx + x, dy + y, `rgb(${d[o]},${d[o + 1]},${d[o + 2]})`);
    }
  }
  draw(g, x, y, s) { for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) { const c = this.px[j * this.w + i]; if (!c) continue; g.fillStyle = c; g.fillRect(x + i * s, y + j * s, s, s); } }
}
const TEAM = {
  blue: ['#3f78c4', '#2a4f8e', '#79aee8'], red: ['#d4503f', '#97302a', '#f08a74'], yellow: ['#e0b73a', '#a47c22', '#f6dc7c'], black: ['#4a4f5c', '#2c3038', '#8a90a0'], purple: ['#9a58c8', '#683a8e', '#c590ea'],
};

// Catapult (side view, facing right): wooden frame, two spoked wheels, a throwing arm with a bucket; team colour on the cloth and the wheel hubs.
function catapult(team = 'blue', fired = false, wheel = 0) {
  const S = new Spr(180, 130); S.ox = 26; S.oy = 30; const [t1, t2, t3] = TEAM[team];
  const wood = ['#a56d3c', '#744827', '#cd9459'], dwood = ['#6e4526', '#47291a', '#8f5f38'];
  const W3 = (m) => S.part3(m, wood[0], wood[1], wood[2], '#4a2c18'), D3 = (m) => S.part3(m, dwood[0], dwood[1], dwood[2], '#2e1a10');
  const rope = '#dcc690', iron = ['#8896a6', '#5c6878', '#b4c0cc'];
  const gy = 84;
  const wheelAt = (cx) => {
    D3(S.ell(cx, gy - 12, 13, 13));
    W3(S.ell(cx, gy - 12, 9, 9));
    for (let k = 0; k < 4; k++) { const a = wheel + k * Math.PI / 4; S.flat(S.line(cx - Math.cos(a) * 9, gy - 12 - Math.sin(a) * 9, cx + Math.cos(a) * 9, gy - 12 + Math.sin(a) * 9, 2), dwood[1]); }
    S.part(S.ell(cx, gy - 12, 3.2, 3.2), t1, t2, t3);
  };
  wheelAt(34); wheelAt(88);
  W3(S.rect(16, 54, 104, 64));
  D3(S.rect(20, 64, 100, 69));
  W3(S.poly([[96, 54], [118, 50], [118, 58], [104, 64]]));
  W3(S.poly([[44, 54], [50, 20], [58, 20], [60, 54]]));
  W3(S.poly([[60, 54], [60, 20], [68, 20], [78, 54]]));
  D3(S.rect(46, 34, 76, 38));
  const pivot = [63, 20];
  const ang = fired ? -0.95 : 2.45;
  const ax = (L) => [pivot[0] + Math.cos(ang) * L, pivot[1] + Math.sin(ang) * L];
  const tip = ax(56), tail = ax(-16);
  W3(S.line(tail[0], tail[1], tip[0], tip[1], 5));
  S.part(S.rect(Math.round(tail[0]) - 6, Math.round(tail[1]) - 2, Math.round(tail[0]) + 6, Math.round(tail[1]) + 10), iron[0], iron[1], iron[2]);
  D3(S.poly([[tip[0] - 10, tip[1] - 3], [tip[0] + 10, tip[1] - 3], [tip[0] + 6, tip[1] + 8], [tip[0] - 6, tip[1] + 8]]));
  if (!fired) S.part(S.ell(tip[0], tip[1] - 6, 6.5, 6.5), '#9aa3ac', '#6d7681', '#c9d0d6');
  S.part(S.ell(pivot[0], pivot[1], 4, 4), iron[0], iron[1], iron[2]);
  S.part(S.poly([[48, 40], [74, 40], [74, 52], [61, 47], [48, 52]]), t1, t2, t3);
  S.flat(S.line(tip[0] - 2, tip[1] + 6, 100, 56, 1), rope);
  S.part(S.ell(100, 57, 3, 3), iron[0], iron[1], iron[2]);
  return S;
}


export type TeamName = 'blue' | 'red' | 'yellow' | 'black' | 'purple';
/** One frame of the catapult: 180×130, ground at y≈114. */
export function catapultCanvas(team: TeamName, fired: boolean, wheel = 0): HTMLCanvasElement {
  // The picture-based catapult once it has loaded (`wheel` 0..1 rocks it a little, as the deck cards and the menu use it); else the old drawing.
  return catapultFrame(team, { arm: fired ? FIRE_ARM[2] : 0, bob: Math.round(Math.abs(Math.sin(wheel * Math.PI * 2)) * 1.5) }) ?? toCanvas(catapult(team, fired, wheel));
}
function toCanvas(s) {
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  s.draw(c.getContext('2d'), 0, 0, 1);
  return c;
}

// A camp fire flame: three tongues of flame (outer orange, middle amber, inner yellow, hot core) that lick up and sway; six frames loop.
function flame(frame, frames = 6) {
  const S = new Spr(48, 64);
  const base = 61, t = frame / frames;
  const tongue = (cx, h, hw, sway) => {
    const pts = [[cx - hw, base], [cx - hw * 0.92, base - h * 0.34], [cx - hw * 0.5 + sway * 0.5, base - h * 0.7], [cx + sway, base - h], [cx + hw * 0.5 + sway * 0.5, base - h * 0.7], [cx + hw * 0.92, base - h * 0.34], [cx + hw, base]];
    return S.poly(pts);
  };
  const tongues = [
    [24, 42 + 6 * Math.sin(Math.PI * 2 * t), 13, 2.5 * Math.sin(Math.PI * 2 * t + 1)],
    [13, 27 + 7 * Math.sin(Math.PI * 2 * t + 2), 8, 2 * Math.sin(Math.PI * 2 * t + 3)],
    [35, 25 + 7 * Math.sin(Math.PI * 2 * t + 4), 8, 2 * Math.sin(Math.PI * 2 * t + 5)],
  ];
  const layers = [['#d8421c', 1, 0], ['#f39a1c', 0.72, 1], ['#ffd84a', 0.48, 2], ['#fff6c0', 0.24, 3]];
  for (const [color, k, lift] of layers)
    for (const [cx, h, hw, sway] of tongues) {
      const m = S.poly([[cx - hw * k, base - lift], [cx - hw * k * 0.92, base - lift - h * k * 0.34], [cx - hw * k * 0.5 + sway * 0.5, base - lift - h * k * 0.7], [cx + sway * k, base - lift - h * k],
        [cx + hw * k * 0.5 + sway * 0.5, base - lift - h * k * 0.7], [cx + hw * k * 0.92, base - lift - h * k * 0.34], [cx + hw * k, base - lift]]);
      S.flat(m, color);
    }
  for (let i = 0; i < 3; i++) {
    const p = (t + i / 3) % 1;
    S.set(24 + Math.sin(i * 2.1 + t * 6) * 10, 40 - p * 36, p < 0.8 ? '#ffd84a' : '#f39a1c');
  }
  return S;
}
export function flameCanvas(frame = 0, frames = 6): HTMLCanvasElement { return toCanvas(flame(frame, frames)); }
