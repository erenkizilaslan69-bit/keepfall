// The loading screen (a plain script, before the game's own code: the page shows it the moment it opens, and the desktop shell shows the same page,
// splash.html, while the local game server starts). The KEEPFALL logo, the menu's own meadow (the same Tiny Swords pieces, the same seed as ui/scenery.ts,
// so the menu comes up behind it without a jump) with clouds drifting over it, a bar that only moves for real work (the server, the pictures, the sounds),
// a tip that changes every few seconds. No waiting of its own: the game calls kfSplash.done() when its menu is up and the screen fades out.
//   kfSplash.step(stage, done, total)   stage: 'server' | 'images' | 'sound'   (done/total: what is loaded of it; done === total: finished)
//   kfSplash.fail(text?, desktop?)      the server did not come: the message and "Try again" (kfSplash.onRetry, or the desktop shell's retry)
//   kfSplash.done()                     everything is ready: a soft fade into the menu
(function () {
  'use strict';
  var script = document.currentScript;
  var BASE = script && script.src ? script.src.replace(/splash\/splash\.js(\?.*)?$/, '') : './';
  var PACK = BASE + 'assets/tiny-swords/Tiny%20Swords%20(Free%20Pack)/';
  var qs = new URLSearchParams(location.search);
  var TEXT = window.KF_SPLASH_TEXT || {};

  // the language: the same rule as the game's (i18n/langs.ts detectLang): saved, ?lang=, the browser's languages, English
  function fromTag(tag) {
    var t = String(tag || '').toLowerCase().replace(/_/g, '-');
    if (!t) return null;
    if (t.indexOf('zh') === 0) return /hant|-tw$|-hk$|-mo$/.test(t) ? 'zh-TW' : 'zh-CN';
    if (t.indexOf('es') === 0) return /^es-(419|mx|ar|cl|co|pe|ve|ec|uy|py|bo|cr|do|gt|hn|ni|pa|pr|sv|us|cu)$/.test(t) ? 'es-419' : 'es-ES';
    if (t.indexOf('pt') === 0) return 'pt-BR';
    var base = t.split('-')[0];
    return TEXT[base] ? base : null;
  }
  var lang = null;
  try { lang = localStorage.getItem('keepfall_lang'); } catch (e) { /* blocked storage */ }
  // (the CrazyGames build starts in English for everybody unless the player picked a language: its page carries the site's SDK)
  var crazy = !!document.querySelector('script[src*="crazygames-sdk"]');
  if (!TEXT[lang] && !crazy) lang = TEXT[qs.get('lang')] ? qs.get('lang') : fromTag(qs.get('lang'));
  if (!lang && !crazy) { var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]; for (var i = 0; i < tags.length && !lang; i++) lang = fromTag(tags[i]); }
  if (!TEXT[lang]) lang = 'en';
  var L = TEXT[lang] || TEXT.en || { ui: {}, tips: [] };
  var SCRIPT = { 'zh-CN': 'sc', 'zh-TW': 'tc', ja: 'ja', ko: 'ko', ru: 'cyrillic', uk: 'cyrillic' }[lang] || 'latin';

  // ---- the page ----
  var root = document.getElementById('kf-splash');
  if (!root) { root = document.createElement('div'); root.id = 'kf-splash'; (document.body || document.documentElement).appendChild(root); }
  root.className = 'kfs';
  root.setAttribute('data-script', SCRIPT);
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = '<canvas class="kfs-bg" aria-hidden="true"></canvas><div class="kfs-shade" aria-hidden="true"></div>'
    + '<div class="kfs-mid">'
    + '<div class="kfs-logo" role="img" aria-label="Keepfall"><img class="kfs-castle" alt="" draggable="false" src="' + PACK + 'Buildings/Blue%20Buildings/Castle.png">'
    + '<div class="kfs-word"><span class="keep">KEEP</span><span class="fall">FALL</span></div></div>'
    + '<div class="kfs-bar" aria-hidden="true"><div class="kfs-fill"></div></div>'
    + '<p class="kfs-status"></p>'
    + '<div class="kfs-error" hidden><p class="kfs-error-text"></p><button type="button" class="kfs-retry"></button></div>'
    + '</div>'
    + '<p class="kfs-tip"><b></b> <span></span></p>';
  var fill = root.querySelector('.kfs-fill'), status = root.querySelector('.kfs-status'), errBox = root.querySelector('.kfs-error');
  var retry = root.querySelector('.kfs-retry');
  retry.textContent = L.ui.retry || 'Try again';
  root.querySelector('.kfs-tip b').textContent = (L.ui.tip || 'Tip') + ':';

  // ---- the bar: three real stages, weighted ----
  var WEIGHT = { server: 0.3, images: 0.5, sound: 0.2 };
  var state = { server: [0, 1], images: [0, 1], sound: [0, 1] };
  var current = qs.get('stage') === 'server' ? 'start' : 'connect';
  function paint() {
    var p = 0;
    for (var k in WEIGHT) p += WEIGHT[k] * Math.min(1, state[k][1] > 0 ? state[k][0] / state[k][1] : 1);
    fill.style.width = (Math.round(p * 1000) / 10) + '%';
    var label = L.ui[current] || '';
    if ((current === 'images' || current === 'sound') && state[current][1] > 1) label += ' ' + state[current][0] + '/' + state[current][1];
    status.textContent = label;
  }
  paint();

  // ---- tips: a random one first, then the next every few seconds ----
  var tips = L.tips || [], tipAt = Math.floor(Math.random() * Math.max(1, tips.length)), tipEl = root.querySelector('.kfs-tip span'), tipBox = root.querySelector('.kfs-tip');
  function showTip() { if (tips.length) tipEl.textContent = tips[tipAt % tips.length]; }
  showTip();
  var tipTimer = setInterval(function () {
    tipBox.classList.add('swap');
    setTimeout(function () { tipAt++; showTip(); tipBox.classList.remove('swap'); }, 350);
  }, 5000);

  // ---- the meadow (ui/scenery.ts buildMeadow: the same pieces and seed) with clouds drifting over it ----
  var canvas = root.querySelector('.kfs-bg'), g = canvas.getContext('2d');
  var BG = { w: 2752, h: 1536 }, MW = 1376, MH = 768;
  var imgs = {};
  function img(path) { if (!imgs[path]) { var im = new Image(); im.src = PACK + path.split('/').map(encodeURIComponent).join('/'); imgs[path] = im; } var i2 = imgs[path]; return i2.complete && i2.naturalWidth ? i2 : null; }
  var NEED = ['Terrain/Tileset/Tilemap_color1.png'];
  [1, 2, 3, 4].forEach(function (i) { NEED.push('Terrain/Resources/Wood/Trees/Tree' + i + '.png', 'Terrain/Decorations/Bushes/Bushe' + i + '.png', 'Terrain/Decorations/Rocks/Rock' + i + '.png'); });
  ['Blue', 'Red', 'Yellow', 'Purple'].forEach(function (c) { NEED.push('Buildings/' + c + ' Buildings/Castle.png'); });
  var CLOUDS = [1, 3, 5, 7].map(function (i) { return 'Terrain/Decorations/Clouds/Clouds_0' + i + '.png'; });
  NEED.forEach(img); CLOUDS.forEach(img);
  var meadow = null;
  function buildMeadow() {
    for (var n = 0; n < NEED.length; n++) if (!img(NEED[n])) return null;
    var c = document.createElement('canvas'); c.width = MW; c.height = MH;
    var m = c.getContext('2d'); m.imageSmoothingEnabled = false;
    var tiles = img(NEED[0]);
    for (var y = 0; y < MH; y += 64) for (var x = 0; x < MW; x += 64) m.drawImage(tiles, 64, 64, 64, 64, x, y, 64, 64);
    function road(width, color) { m.strokeStyle = color; m.lineWidth = width; m.lineCap = 'round'; m.beginPath(); m.moveTo(-40, MH * 0.62); m.bezierCurveTo(MW * 0.3, MH * 0.78, MW * 0.6, MH * 0.5, MW + 40, MH * 0.66); m.stroke(); }
    road(58, '#a98b57'); road(46, '#d8b779');
    var seed = 20261105;
    function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
    var pieces = [];
    function put(im, fw, fh, x, y, s) { pieces.push({ y: y, draw: function () { m.drawImage(im, 0, 0, fw, fh, x - (fw * s) / 2, y - fh * s * 0.85, fw * s, fh * s); } }); }
    var castles = ['Blue', 'Red', 'Yellow', 'Purple'].map(function (c2) { return img('Buildings/' + c2 + ' Buildings/Castle.png'); });
    [[0.1, 0.24], [0.9, 0.24], [0.1, 0.9], [0.9, 0.9]].forEach(function (f, i) { put(castles[i], 320, 256, f[0] * MW, f[1] * MH, 0.8); });
    for (var i = 0; i < 46; i++) {
      var left = rnd() < 0.5;
      var tx = (left ? rnd() * 0.24 : 0.76 + rnd() * 0.24) * MW, ty = (0.06 + rnd() * 0.9) * MH;
      var corner = (tx < 0.2 * MW || tx > 0.8 * MW) && (ty < 0.4 * MH || ty > 0.74 * MH);
      if (corner) continue;
      var t = Math.floor(rnd() * 4);
      put(img('Terrain/Resources/Wood/Trees/Tree' + (t + 1) + '.png'), 192, t < 2 ? 256 : 192, tx, ty, 0.7 + rnd() * 0.3);
    }
    for (var j = 0; j < 26; j++) {
      var bx = rnd() * MW, by = (0.05 + rnd() * 0.92) * MH;
      if (rnd() < 0.6) put(img('Terrain/Decorations/Bushes/Bushe' + (Math.floor(rnd() * 4) + 1) + '.png'), 128, 128, bx, by, 0.6);
      else put(img('Terrain/Decorations/Rocks/Rock' + (Math.floor(rnd() * 4) + 1) + '.png'), 64, 64, bx, by, 0.7);
    }
    pieces.sort(function (p, q) { return p.y - q.y; }).forEach(function (p) { p.draw(); });
    return c;
  }
  var clouds = [0, 1, 2, 3, 4].map(function (i) { return { k: i % CLOUDS.length, x: (i * 0.27 + 0.05) % 1.2 - 0.1, y: 0.08 + ((i * 0.37) % 0.8), v: 0.004 + (i % 3) * 0.0015 }; });
  var last = 0, running = true;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 1000 / 20) return; // a calm picture: 20 frames a second is plenty
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    var w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    g.imageSmoothingEnabled = false;
    meadow = meadow || buildMeadow();
    var k = Math.max(w / BG.w, h / BG.h), ox = (w - BG.w * k) / 2, oy = (h - BG.h * k) / 2;
    if (meadow) g.drawImage(meadow, ox, oy, BG.w * k, BG.h * k); else { g.fillStyle = '#5a9a3c'; g.fillRect(0, 0, w, h); }
    var s = Math.max(1, Math.round(h / 540));
    clouds.forEach(function (c) {
      c.x += c.v * dt; if (c.x > 1.15) c.x = -0.25;
      var im = img(CLOUDS[c.k]); if (!im) return;
      g.globalAlpha = 0.55;
      g.drawImage(im, Math.round(c.x * w), Math.round(c.y * h), im.naturalWidth * s, im.naturalHeight * s);
      g.globalAlpha = 1;
    });
  }
  requestAnimationFrame(frame);

  // ---- the commands ----
  var finished = false;
  /** When each stage finished (ms since the page began): tools/measure-startup.mjs reads it. */
  var timing = {};
  window.kfSplash = {
    timing: timing,
    step: function (stage, done, total) {
      if (!state[stage] || finished) return;
      state[stage] = [Math.max(0, done), Math.max(0, total)];
      if (done >= total && total > 0 && !timing[stage]) timing[stage] = Math.round(performance.now());
      if (stage === 'server' && done >= total) { if (current === 'start' || current === 'connect') current = 'images'; }
      else if (stage === 'images' && done >= total && state.server[0] >= state.server[1]) current = 'sound';
      else if (done < total && stage !== 'server' && (stage === 'images' || state.images[0] >= state.images[1])) current = stage;
      if (state.server[0] >= state.server[1] && state.images[0] >= state.images[1] && state.sound[0] >= state.sound[1]) current = 'ready';
      errBox.hidden = true; status.hidden = false;
      paint();
    },
    fail: function (detail, desktop) {
      errBox.hidden = false; status.hidden = true;
      root.querySelector('.kfs-error-text').textContent = (desktop || qs.get('stage') === 'server' ? L.ui.failStart : L.ui.failConnect) || 'The server did not answer.';
      if (detail) root.querySelector('.kfs-error-text').title = String(detail);
      retry.focus();
    },
    onRetry: null,
    done: function () {
      if (finished) return; finished = true;
      timing.done = Math.round(performance.now());
      for (var k2 in state) state[k2] = [1, 1];
      current = 'ready'; paint();
      clearInterval(tipTimer);
      root.classList.add('kfs-out');
      setTimeout(function () { running = false; if (root.parentNode) root.parentNode.removeChild(root); }, 450);
    },
    /** The language the screen picked (the game tells the desktop shell, for the next launch). */
    lang: lang || 'en',
  };
  retry.addEventListener('click', function () {
    errBox.hidden = true; status.hidden = false; state.server = [0, 1]; current = qs.get('stage') === 'server' ? 'start' : 'connect'; paint();
    var bridge = window.keepfallSteam;
    if (qs.get('stage') === 'server' && bridge && bridge.retryServer) bridge.retryServer();
    else if (typeof window.kfSplash.onRetry === 'function') window.kfSplash.onRetry();
    else location.reload();
  });
})();
