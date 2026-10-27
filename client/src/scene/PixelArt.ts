// @ts-nocheck
// Pixel art drawn in code, so it can sit in the repository: the chibi horse of the cavalry and the catapult (Tiny Swords style: one dark
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

// Chibi horseman: a round, chubby horse (big head, short thick legs, fluffy mane and tail) with the pack's Lancer sunk into the saddle.
// phase: 0..3 is one of the four run frames.
function horseman(lancerImg, team = 'blue', phase = 0, lf = 0) {
  const S = new Spr(240, 150); S.oy = 24; // everything below is drawn 24 px lower
  const [t1, t2, t3] = TEAM[team];
  const coat = ['#c08a56', '#94643a', '#e0b07a', '#6e4526'];       // base, shade, light, deep
  const mane = ['#5c3a24', '#432818', '#7a5236', '#2e1a10'];
  const cream = ['#f0dcb4', '#cdb48a', '#fff4d8', '#a58e66'];
  const hoof = ['#3a2c36', '#261c26', '#54444e', '#1a121a'];
  const gold = ['#f0d070', '#c29a3a', '#fff0a8'];
  // Four clearly different gallop poses: stretched out (body up), gathered under the body, contact (body down), gathered again.
  const POSES = [
    { front: [15, 3], back: [-15, 2], bob: -4, sway: -4 },
    { front: [2, 11], back: [-2, 11], bob: 0, sway: 0 },
    { front: [7, 0], back: [-7, 0], bob: 4, sway: 4 },
    { front: [-6, 10], back: [5, 10], bob: -1, sway: 0 },
  ];
  const pose = POSES[((phase % 4) + 4) % 4];
  const bob = pose.bob;
  const T = (m, c) => S.part3(m, c[0], c[1], c[2], c[3]);
  // legs: thick, short; a leg is described by how far its foot swings and how high it is lifted
  const leg = (hx, swing, lift, far) => {
    const fx = hx + swing, fy = 118 - lift, top = 100 + bob;
    const c = far ? [coat[1], coat[3], coat[0], '#4a2c18'] : coat;
    T(S.union(S.line(hx, top, (hx + fx) / 2, (top + fy) / 2, 11), S.line((hx + fx) / 2, (top + fy) / 2, fx, fy - 3, 10)), c);
    T(S.union(S.ell(fx, fy - 1, 5.5, 4)), hoof);
  };
  leg(40, pose.back[0] * 0.8, pose.back[1] + 1, true); leg(80, pose.front[0] * 0.8, pose.front[1] + 1, true);
  // tail (fluffy blobs) and body
  const sw = pose.sway; // thin tail in the mane's tone hanging from the rump, swinging with the stride
  T(S.poly([[27, 80 + bob], [22, 86 + bob], [17 + sw, 100], [13 + sw, 110], [19 + sw, 109], [26 + sw, 96], [31, 86 + bob]]), mane);
  T(S.union(S.ell(58, 92 + bob, 30, 18), S.ell(82, 90 + bob, 16, 16), S.ell(40, 92 + bob, 16, 17)), coat);
  // belly patch
  S.flat(S.ell(60, 107 + bob, 18, 4), cream[0]);
  const H = new Spr(240, 150); H.oy = 24;
  const TH = (m, c) => H.part3(m, c[0], c[1], c[2], c[3]);
  // fluffy mane down the neck, then the big round head
  TH(H.union(H.ell(88, 58 + bob, 9, 10), H.ell(82, 72 + bob, 9, 10), H.ell(78, 86 + bob, 8, 9), H.ell(92, 48 + bob, 7, 7)), mane);
  TH(H.union(H.ell(100, 68 + bob, 20, 19), H.ell(114, 77 + bob, 11, 9)), coat);
  TH(H.ell(117, 79 + bob, 9, 7), cream);                                        // muzzle
  H.flat(H.rect(121, 77 + bob, 124, 80 + bob), '#4a2c2c');                        // nostril
  // ears joined to the head, with pink insides
  TH(H.poly([[86, 58 + bob], [87, 38 + bob], [99, 52 + bob]]), coat);
  TH(H.poly([[103, 50 + bob], [110, 37 + bob], [117, 56 + bob]]), coat);
  H.flat(H.poly([[90, 54 + bob], [90, 44 + bob], [96, 52 + bob]]), '#e8a0a0');
  H.flat(H.poly([[106, 51 + bob], [110, 44 + bob], [113, 54 + bob]]), '#e8a0a0');
  // forelock and a big shiny eye
  TH(H.union(H.ell(98, 52 + bob, 9, 6), H.ell(110, 55 + bob, 7, 5)), mane);
  H.flat(H.ell(110, 69 + bob, 4.2, 5.2), '#150f1a'); H.flat(H.rect(109, 66 + bob, 111.5, 69 + bob), '#ffffff');
  // bridle
  TH(H.poly([[104, 74 + bob], [114, 80 + bob], [111, 85 + bob], [102, 79 + bob]]), [t1, t2, t3, t2]);
  // composite: horse behind, the pack's lancer sitting in the saddle (its soft ground shadow is dropped)
  const C = new Spr(240, 150);
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const c = S.px[y * S.w + x]; if (c) C.set(x, y, c); }
  C.blit(lancerImg, lf * 320 + 135, 120, 175, 75, 27, 30 + bob);
  // the horse's near flank and the saddle cloth cover the rider's lower half so it sits IN the saddle
  const B2 = new Spr(240, 150); B2.oy = 24;
  const flank = B2.mask((x, y) => ((x - 58) ** 2) / 30 ** 2 + ((y - 90 - bob) ** 2) / 21 ** 2 <= 1 && y > 88 + bob);
  for (let i = 0; i < flank.length; i++) if (flank[i]) { const x = i % 240, y = (i / 240) | 0; const c = S.px[i]; if (c) C.set(x, y, c); }
  for (let y = 0; y < H.h; y++) for (let x = 0; x < H.w; x++) { const c = H.px[y * H.w + x]; if (c) C.set(x, y, c); }
  // ornate saddle cloth: scalloped hem and gold trim
  const cloth = C.mask((x, y) => x >= 44 && x <= 78 && y >= 100 + bob && y <= 118 + bob);
  const sc = C;
  sc.ox = 0; sc.oy = 0;
  const hem = [];
  for (let k = 0; k < 4; k++) hem.push([46 + k * 8.5, 118 + bob], [50 + k * 8.5, 124 + bob], [54 + k * 8.5, 118 + bob]);
  sc.part3(sc.poly([[44, 98 + bob], [78, 98 + bob], [80, 118 + bob], ...hem.reverse(), [42, 118 + bob]]), t1, t2, t3, t2);
  sc.flat(sc.rect(44, 101 + bob, 79, 103 + bob), gold[0]);
  sc.flat(sc.rect(44, 111 + bob, 79, 113 + bob), gold[0]);
  for (let k = 0; k < 4; k++) sc.flat(sc.rect(49 + k * 8.5, 105 + bob, 52 + k * 8.5, 109 + bob), gold[0]);
  // the rider's boot dangling at the flank (inside the cloth's edge)
  sc.part3(sc.union(sc.line(72, 98 + bob, 74, 114 + bob, 8)), '#2f4a86', '#1f3466', '#4a68a8', '#162650');
  sc.part3(sc.ell(75, 118 + bob, 6.5, 4), '#6a4a34', '#4a3224', '#8a6448', '#32201a');
  // near legs on top of everything below the belly
  S.px = new Array(S.w * S.h).fill(null);
  leg(50, pose.back[0], pose.back[1], false); leg(88, pose.front[0], pose.front[1], false);
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) { const c = S.px[y * S.w + x]; if (c) C.set(x, y, c); }
  return C;
}

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
/** One frame of the cavalry: `phase` 0..3 is a gallop pose, `lancerFrame` 0..2 the Lancer's thrust. 240×150, feet at y≈142. */
export function horsemanCanvas(lancerImage: CanvasImageSource, team: TeamName, phase = 0, lancerFrame = 0): HTMLCanvasElement {
  return toCanvas(horseman(lancerImage, team, phase, lancerFrame));
}
/** One frame of the catapult: 180×130, ground at y≈114. */
export function catapultCanvas(team: TeamName, fired: boolean, wheel = 0): HTMLCanvasElement {
  return toCanvas(catapult(team, fired, wheel));
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
