// A setup for tools/clip.mjs: one rival army (as the server tells it: only where it is and which way it goes) walks a chosen kind of road of the map and the
// camera follows it, for before/after clips of how a column marches. The kind is the first line, set by tools/march-clips.mjs:
//   straight | corner | forest | junction | big (a 40-man army on a straight road)
// Usage (normally through march-clips.mjs): node tools/clip.mjs out.mp4 tools/march-scene.js
(async () => {
  const KIND = globalThis.__marchKind ?? 'corner';
  const s = window.keepfallScene; s.apply = () => {}; s.setMap = () => {};
  document.getElementById('kingdom-decree')?.remove();
  document.querySelectorAll('.ui-root, #stage > :not(canvas)').forEach((e) => { e.style.display = 'none'; });
  const roads = s.layout.roads.map((r) => r.points);
  const forest = s.layout.features.find((f) => f.kind === 'forest');
  const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (a, b, c) => { const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: c.x - b.x, y: c.y - b.y }; return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1)))); };
  const inForest = (p) => forest && Math.hypot(p.x - forest.center.x, p.y - forest.center.y) < forest.radius * 0.8;
  // a stretch of road ~22 tiles long through the point of interest (start 11 tiles before it)
  const stretch = (pts, i) => {
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + len(pts[k - 1], pts[k]));
    const from = Math.max(0, cum[i] - 11), to = Math.min(cum[cum.length - 1], cum[i] + 11);
    const at = (d) => { let k = 0; while (k < pts.length - 2 && cum[k + 1] < d) k++; const t = (d - cum[k]) / ((cum[k + 1] - cum[k]) || 1); return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * t, y: pts[k].y + (pts[k + 1].y - pts[k].y) * t }; };
    const out = [at(from)]; for (let k = 0; k < pts.length; k++) if (cum[k] > from && cum[k] < to) out.push(pts[k]); out.push(at(to)); return out;
  };
  let route = null;
  if (KIND === 'corner') {
    let best = null;
    for (const p of roads) for (let i = 1; i + 1 < p.length; i++) { const a = angle(p[i - 1], p[i], p[i + 1]); if (!inForest(p[i]) && (!best || a > best.a)) best = { a, p, i }; }
    route = stretch(best.p, best.i);
  } else if (KIND === 'forest') {
    let best = null;
    for (const p of roads) for (let i = 0; i < p.length; i++) if (inForest(p[i])) { const d = Math.hypot(p[i].x - forest.center.x, p[i].y - forest.center.y); if (!best || d > best.d) best = { d, p, i }; }
    route = stretch(best.p, best.i);
  } else if (KIND === 'junction') {
    const ends = roads.flatMap((p) => [p[0], p[p.length - 1]]);
    let best = null;
    for (const p of roads) for (let i = 1; i + 1 < p.length; i++) {
      const n = ends.filter((e) => len(e, p[i]) < 0.4).length + roads.filter((q) => q !== p && q.some((v) => len(v, p[i]) < 0.4)).length;
      if (n >= 1 && !inForest(p[i]) && (!best || n > best.n)) best = { n, p, i };
    }
    if (!best) for (const p of roads) { const e = p[0]; const n = ends.filter((x) => len(x, e) < 0.4).length; if (n >= 3 && (!best || n > best.n)) best = { n, p, i: 0 }; }
    route = stretch(best.p, best.i);
  } else {
    let best = null; // the longest straight stretch outside the forest
    for (const p of roads) for (let i = 0; i + 1 < p.length; i++) { const l = len(p[i], p[i + 1]); if (!inForest(p[i]) && (!best || l > best.l)) best = { l, p, i }; }
    const a = best.p[best.i], b = best.p[best.i + 1], u = { x: (b.x - a.x) / best.l, y: (b.y - a.y) / best.l };
    route = [{ x: a.x + u.x * 1, y: a.y + u.y * 1 }, { x: a.x + u.x * Math.min(best.l - 1, 23), y: a.y + u.y * Math.min(best.l - 1, 23) }];
  }
  const units = KIND === 'big'
    ? [{ unitId: 'kalkanli', name: 'k', count: 10 }, { unitId: 'kilicli', name: 'k', count: 12 }, { unitId: 'okcu', name: 'o', count: 10 }, { unitId: 'mancinik', name: 'm', count: 4 }, { unitId: 'suvari', name: 's', count: 4 }]
    : [{ unitId: 'kalkanli', name: 'k', count: 3 }, { unitId: 'kilicli', name: 'k', count: 4 }, { unitId: 'okcu', name: 'o', count: 3 }, { unitId: 'mancinik', name: 'm', count: 1 }];
  const cum = [0]; for (let k = 1; k < route.length; k++) cum.push(cum[k - 1] + len(route[k - 1], route[k]));
  const along = (d) => { let k = 0; while (k < route.length - 2 && cum[k + 1] < d) k++; const a = route[k], b = route[k + 1], t = Math.max(0, Math.min(1, (d - cum[k]) / ((cum[k + 1] - cum[k]) || 1))); const l = len(a, b) || 1; return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir: { x: (b.x - a.x) / l, y: (b.y - a.y) / l } }; };
  const speed = 2.5, start = performance.now();
  s.movers.setRoads(roads);
  const tickNews = () => {
    const d = Math.min(cum[cum.length - 1], 6 + ((performance.now() - start) / 1000) * speed); // (starts 6 tiles in: the column is already on the road)
    const a = along(d);
    s.movers.sync({ ...s.state, own: [], seen: [{ id: 'mc1', kind: 'army', ownerColor: 'red', units, position: a.p, velocity: { x: a.dir.x * speed, y: a.dir.y * speed }, heading: a.dir }] });
  };
  tickNews(); setInterval(tickNews, 1000);
  const cam = s.cameras.main; cam.setZoom(KIND === 'big' ? 1.0 : 1.3);
  const L = await import('/src/scene/world.ts');
  const follow2 = () => { const tr = s.movers.debugTracks().find((x) => x.key === 'seen:mc1'); if (tr) { const w = L.toWorld(tr.shown); cam.centerOn(w.x, w.y); } requestAnimationFrame(follow2); };
  follow2();
  return KIND + ' ' + route.length + ' points, ' + cum[cum.length - 1].toFixed(1) + ' tiles';
})()
