// Runs inside headless Chrome (see tools/art-clean.mjs): turns one of the generated pictures (magenta background, fake pixels) into a clean sprite on
// its real(ish) pixel grid: transparent background, no pink halo, one pixel per grid cell, a limited palette.
(() => {
  const load = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const magenta = (r, g, b) => (r + b) / 2 - g;

  // Flood the magenta from the picture's border; then eat the pink fringe of what is left (a few passes, only pinkish pixels touching the background).
  function backgroundMask(d, w, h, fill) {
    const bg = new Uint8Array(w * h);
    const isBg = (i) => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return magenta(r, g, b) > 95 && r > 140 && b > 140; };
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (bg[i] || !isBg(i)) continue;
      bg[i] = 1;
      const x = i % w, y = (i - x) / w;
      if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w);
    }
    // Enclosed magenta (inside a loop of the picture) too: only the clearly pure ones.
    for (let i = 0; i < w * h; i++) if (!bg[i] && magenta(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > 150 && d[i * 4] > 200 && d[i * 4 + 2] > 200) {
      if (fill) { d[i * 4] = fill[0]; d[i * 4 + 1] = fill[1]; d[i * 4 + 2] = fill[2]; } else bg[i] = 1;
    }
    for (let pass = 0; pass < 5; pass++) {
      const eat = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (bg[i]) continue;
        if (!(bg[i - 1] || bg[i + 1] || bg[i - w] || bg[i + w])) continue;
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        if (magenta(r, g, b) > 42 && r > 135 && b > 120) eat.push(i);
      }
      for (const i of eat) bg[i] = 1;
    }
    return bg;
  }

  // Drops tiny specks of leftovers (JPEG noise) that are not connected to anything big.
  function dropSpecks(bg, w, h, min) {
    const seen = new Uint8Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (bg[s] || seen[s]) continue;
      const comp = [s]; seen[s] = 1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], x = i % w, y = (i - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!bg[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
        }
      }
      if (comp.length < min) for (const i of comp) bg[i] = 1;
    }
  }

  // Keeps only the biggest connected piece (a stray object inside a frame goes).
  function keepLargest(bg, w, h) {
    const seen = new Uint8Array(w * h); let best = null;
    for (let s0 = 0; s0 < w * h; s0++) {
      if (bg[s0] || seen[s0]) continue;
      const comp = [s0]; seen[s0] = 1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], x = i % w, y = (i - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!bg[j] && !seen[j]) { seen[j] = 1; comp.push(j); } }
      }
      if (!best || comp.length > best.length) best = comp;
    }
    const keep = new Uint8Array(w * h);
    for (const i of best ?? []) keep[i] = 1;
    for (let i = 0; i < w * h; i++) if (!keep[i]) bg[i] = 1;
  }

  function bbox(bg, w, h) {
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }

  // The size of the picture's fake pixels: the period at which the colour edges recur most strongly (both axes together).
  function findGrid(d, bg, w, h) {
    const lum = (i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const ex = new Float64Array(w), ey = new Float64Array(h);
    for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
      const i = y * w + x;
      if (bg[i] || bg[i - 1] || bg[i - w]) continue;
      ex[x] += Math.abs(lum(i) - lum(i - 1));
      ey[y] += Math.abs(lum(i) - lum(i - w));
    }
    const score = (e, p, phase) => { let s = 0; for (let x = 0; x < e.length; x++) { const c = Math.cos((2 * Math.PI * (x - phase)) / p); if (c > 0.6) s += e[x] * c * c; } return s; };
    let best = { p: 0, s: -1, px: 0, py: 0 }, total = 0, count = 0;
    for (let p = 6; p <= 40; p += 0.05) {
      let bx = -1, by = -1, phx = 0, phy = 0;
      for (let ph = 0; ph < p; ph += 0.5) { const sx = score(ex, p, ph); if (sx > bx) { bx = sx; phx = ph; } const sy = score(ey, p, ph); if (sy > by) { by = sy; phy = ph; } }
      const s = bx + by;
      total += s; count++;
      if (s > best.s) best = { p, s, px: phx, py: phy };
    }
    best.ratio = best.s / (total / count);
    return best;
  }

  // One pixel per cell: the mean colour of the middle of the cell; transparent unless most of the cell is picture.
  function sampleGrid(d, bg, w, h, grid) {
    const { p, px, py } = grid;
    const nx = Math.floor((w - px) / p), ny = Math.floor((h - py) / p);
    const out = new Uint8ClampedArray(nx * ny * 4);
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      const x0 = Math.round(px + cx * p + p * 0.25), x1 = Math.round(px + cx * p + p * 0.75), y0 = Math.round(py + cy * p + p * 0.25), y1 = Math.round(py + cy * p + p * 0.75);
      let r = 0, g = 0, b = 0, n = 0, solid = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x; n++;
        if (bg[i]) continue;
        solid++; r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2];
      }
      const o = (cy * nx + cx) * 4;
      if (n && solid / n >= 0.5) { out[o] = r / solid; out[o + 1] = g / solid; out[o + 2] = b / solid; out[o + 3] = 255; }
    }
    return { w: nx, h: ny, data: out };
  }

  // Median cut: the colours of the picture reduced to `n`.
  function quantize(img, n) {
    const px = [];
    for (let i = 0; i < img.w * img.h; i++) if (img.data[i * 4 + 3]) px.push(i);
    let boxes = [px];
    const range = (box, c) => { let lo = 255, hi = 0; for (const i of box) { const v = img.data[i * 4 + c]; if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
    while (boxes.length < n) {
      let bi = -1, bc = 0, bs = 0;
      boxes.forEach((box, k) => { if (box.length < 2) return; for (let c = 0; c < 3; c++) { const [lo, hi] = range(box, c); const s = (hi - lo) * Math.sqrt(box.length); if (s > bs) { bs = s; bi = k; bc = c; } } });
      if (bi < 0) break;
      const box = boxes[bi].sort((a, b) => img.data[a * 4 + bc] - img.data[b * 4 + bc]);
      const mid = box.length >> 1;
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    for (const box of boxes) {
      let r = 0, g = 0, b = 0;
      for (const i of box) { r += img.data[i * 4]; g += img.data[i * 4 + 1]; b += img.data[i * 4 + 2]; }
      for (const i of box) { img.data[i * 4] = r / box.length; img.data[i * 4 + 1] = g / box.length; img.data[i * 4 + 2] = b / box.length; }
    }
  }

  // Half the size (2×2 cells become one), keeping the outline: a block with any dark outline pixel and not fully filled takes the darkest of them,
  // a block with fewer than two filled cells and no outline is dropped, the rest take their mean colour.
  function halve(img) {
    const w = Math.ceil(img.w / 2), h = Math.ceil(img.h / 2), out = new Uint8ClampedArray(w * h * 4);
    const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cells = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = x * 2 + dx, sy = y * 2 + dy;
        if (sx >= img.w || sy >= img.h) continue;
        const i = (sy * img.w + sx) * 4;
        if (img.data[i + 3]) cells.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
      }
      if (!cells.length) continue;
      const dark = cells.reduce((m, c) => (lum(...c) < lum(...m) ? c : m), cells[0]);
      const hasOutline = lum(...dark) < 70;
      if (cells.length < 2 && !hasOutline) continue;
      const o = (y * w + x) * 4;
      const c = hasOutline && cells.length < 4 ? dark : cells.reduce((a, c) => [a[0] + c[0] / cells.length, a[1] + c[1] / cells.length, a[2] + c[2] / cells.length], [0, 0, 0]);
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
    return { w, h, data: out };
  }

  function trim(small) {
    let x0 = small.w, y0 = small.h, x1 = 0, y1 = 0;
    for (let y = 0; y < small.h; y++) for (let x = 0; x < small.w; x++) if (small.data[(y * small.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const tw = x1 - x0 + 1, th = y1 - y0 + 1, td = new Uint8ClampedArray(tw * th * 4);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) td.set(small.data.subarray(((y + y0) * small.w + x + x0) * 4, ((y + y0) * small.w + x + x0) * 4 + 4), (y * tw + x) * 4);
    return { w: tw, h: th, data: td };
  }

  const toPng = (img) => {
    const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0);
    return c.toDataURL('image/png');
  };

  window.artSize = async (url) => { const i = await load(url); return [i.naturalWidth, i.naturalHeight]; };
  window.artClean = async (url, opts) => {
    const img = await load(url);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const cells = opts.cells ?? [{ name: '', x: 0, y: 0, w: c.width, h: c.height }];
    const results = [];
    for (const cell of cells) {
      const data = g.getImageData(cell.x, cell.y, cell.w, cell.h);
      const d = data.data, w = cell.w, h = cell.h;
      const bg = backgroundMask(d, w, h, cell.fill ?? null);
      dropSpecks(bg, w, h, 400);
      if (cell.noPurple) {
        // The purple drop shadows under the pieces (violet, not the pure magenta of the background): they go, the piece's own colours stay.
        for (let i = 0; i < w * h; i++) {
          if (bg[i]) continue;
          const r = d[i * 4] / 255, g2 = d[i * 4 + 1] / 255, b2 = d[i * 4 + 2] / 255, mx = Math.max(r, g2, b2), mn = Math.min(r, g2, b2);
          if (mx < 0.2 || (mx - mn) / mx < 0.26) continue;
          let hue = mx === r ? 60 * (((g2 - b2) / (mx - mn)) % 6) : mx === g2 ? 60 * ((b2 - r) / (mx - mn) + 2) : 60 * ((r - g2) / (mx - mn) + 4);
          if (hue < 0) hue += 360;
          if (hue >= 262 && hue <= 332) bg[i] = 1;
        }
        dropSpecks(bg, w, h, 250);
      }
      if (cell.largest) keepLargest(bg, w, h);
      const b = bbox(bg, w, h);
      const cw = b.x1 - b.x0, ch = b.y1 - b.y0;
      const cd = new Uint8ClampedArray(cw * ch * 4), cbg = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const si = (y + b.y0) * w + x + b.x0, di = y * cw + x;
        cd.set(d.subarray(si * 4, si * 4 + 4), di * 4); cbg[di] = bg[si];
      }
      const grid = findGrid(cd, cbg, cw, ch);
      const small = sampleGrid(cd, cbg, cw, ch, grid);
      const half = halve(small);
      quantize(small, opts.colors ?? 28);
      quantize(half, opts.colors ?? 28);
      const out = trim(small), outHalf = trim(half);
      results.push({ name: cell.name, png: toPng(out), pngHalf: toPng(outHalf), w: out.w, h: out.h, wHalf: outHalf.w, hHalf: outHalf.h, period: +grid.p.toFixed(2), ratio: +grid.ratio.toFixed(2), source: [cw, ch] });
    }
    return results;
  };
  return true;
})();
