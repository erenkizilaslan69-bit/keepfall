// A setup for tools/clip.mjs: a close-up (zoom 2, no fog, no interface) of one castle's way from its door to the gap in its wall, for before/after
// pictures of how that way is drawn. Set by tools/paving-shots.mjs: globalThis.__pvRegion (index among the castles that are there) and __pvLevel
// (our own castle's buildings at that level, 1–4; the development scene draws them so; other castles keep what the match gives them).
(async () => {
  const s = window.keepfallScene; s.apply = () => {}; s.setMap = () => {};
  document.getElementById('kingdom-decree')?.remove();
  document.querySelectorAll('.ui-root, #stage > :not(canvas)').forEach((e) => { e.style.display = 'none'; });
  s.fog?.setVisible(false);
  const seated = s.layout.regions.filter((r) => r.seat !== null && r.color);
  const r = seated[globalThis.__pvRegion ?? 0] ?? seated[0];
  const level = globalThis.__pvLevel;
  if (level && r.seat === window.keepfallUi.mySeat && s.state?.buildings) s.setState({ ...s.state, buildings: s.state.buildings.map((b) => ({ ...b, level })) });
  const W = await import('/src/scene/world.ts');
  const east = r.corner === 'northWest' || r.corner === 'southWest';
  // from the castle door to the gap in the side wall, looked at from a little to the gap's side
  const at = W.toWorld({ x: r.origin.x + (east ? 11.5 : 4.5), y: r.origin.y + 452 / 64 });
  const cam = s.cameras.main; cam.setZoom(2); cam.centerOn(at.x, at.y);
  const hold = () => { cam.setZoom(2); cam.centerOn(at.x, at.y); requestAnimationFrame(hold); };
  hold();
  return `region ${r.corner} seat ${r.seat}${r.seat === window.keepfallUi.mySeat ? ' (ours, level ' + (level ?? 'as is') + ')' : ''}`;
})()
