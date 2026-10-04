/* Server-rendered pages (login, admin, legal, messages): same moving background
   and liquid-glass surfaces as the app.
   Glass filter ported from nikdelvin/liquid-glass (MIT); fluid layer from
   PavelDoGreat/WebGL-Fluid-Simulation (MIT). Licences in /glass/licenses/. */
(function () {
  "use strict";
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = innerWidth < 700;
  /* phones render at full CSS-pixel resolution and skip parallax; low-core devices start one step lighter;
     every device then steps quality down if it can't hold ~50 fps, so motion stays fluid */
  var touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var phone = touch || innerWidth < 760;
  var flowScale = phone ? 1 : small ? 0.45 : 0.55; /* phones: full CSS-pixel resolution, dense screens need it */
  var pal = "blush";
  try { pal = localStorage.getItem("baka-glass-palette") || "blush"; } catch (e) { /* storage unavailable */ }

  /* glass card */
  var enc = function (s) { return "data:image/svg+xml;utf8," + encodeURIComponent(s); };
  function dispMap(w, h, r, d) {
    return enc('<svg height="' + h + '" width="' + w + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg"><style>.mix{mix-blend-mode:screen}</style><defs><linearGradient id="Y" x1="0" x2="0" y1="' + Math.ceil(r / h * 15) + '%" y2="' + Math.floor(100 - r / h * 15) + '%"><stop offset="0%" stop-color="#0F0"/><stop offset="100%" stop-color="#000"/></linearGradient><linearGradient id="X" x1="' + Math.ceil(r / w * 15) + '%" x2="' + Math.floor(100 - r / w * 15) + '%" y1="0" y2="0"><stop offset="0%" stop-color="#F00"/><stop offset="100%" stop-color="#000"/></linearGradient></defs><rect x="0" y="0" height="' + h + '" width="' + w + '" fill="#808080"/><g filter="blur(2px)"><rect x="0" y="0" height="' + h + '" width="' + w + '" fill="#000080"/><rect x="0" y="0" height="' + h + '" width="' + w + '" fill="url(#Y)" class="mix"/><rect x="0" y="0" height="' + h + '" width="' + w + '" fill="url(#X)" class="mix"/><rect x="' + d + '" y="' + d + '" height="' + (h - 2 * d) + '" width="' + (w - 2 * d) + '" fill="#808080" rx="' + r + '" ry="' + r + '" filter="blur(' + d + 'px)"/></g></svg>');
  }
  function dispFilter(w, h, r, d, s, cab) {
    var ch = function (k, m) { return '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (s + cab * k) + '" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix type="matrix" values="' + m + '" result="c' + k + '"/>'; };
    return enc('<svg height="' + h + '" width="' + w + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg"><defs><filter id="displace" color-interpolation-filters="sRGB"><feImage x="0" y="0" height="' + h + '" width="' + w + '" href="' + dispMap(w, h, r, d) + '" result="map"/>' + ch(2, "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0") + ch(1, "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0") + ch(0, "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0") + '<feBlend in="c2" in2="c1" mode="screen"/><feBlend in2="c0" mode="screen"/></filter></defs></svg>') + "#displace";
  }
  var probe = document.createElement("div");
  probe.style.cssText = "backdrop-filter:url(#t)";
  var supportsUrl = /url/.test(probe.style.backdropFilter);
  /* quality level this device settled on (shared with the app, remembered for a day) */
  var level = 0;
  try { var saved = JSON.parse(localStorage.getItem("baka-glass-q") || "null"); if (saved && Date.now() - saved.at < 864e5) level = Math.max(0, Math.min(4, saved.level | 0)); } catch (e) { /* storage unavailable */ }
  if ((navigator.hardwareConcurrency || 8) <= 4) level = Math.max(level, 2);
  var plainGlass = level >= 1;
  function draw(g) {
    var box = g.querySelector(".flt > .box");
    var w = Math.round(g.offsetWidth), h = Math.round(g.offsetHeight);
    if (!box || !w || !h) return;
    var r = Math.min(parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0, w / 2, h / 2);
    var fr = +(g.getAttribute("data-blur") || 0), cab = +(g.getAttribute("data-cab") || 0);
    if (supportsUrl && !plainGlass) box.style.backdropFilter = "blur(" + fr / 2 + "px) url('" + dispFilter(w, h, r, 10, 100, cab) + "') blur(" + fr + "px) brightness(1.1) saturate(1.5)";
    else { box.style.webkitBackdropFilter = box.style.backdropFilter = "blur(14px) saturate(180%)"; }
  }
  var glasses = document.querySelectorAll("[data-glass]");
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function (es) { es.forEach(function (e) { draw(e.target); }); });
    glasses.forEach(function (g) { ro.observe(g); });
  }
  glasses.forEach(draw);

  /* moving background */
  var bd = document.getElementById("bd");
  if (!bd) return;
  function load(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); }); }
  function layer() { var c = document.createElement("canvas"); bd.appendChild(c); return c; }
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function mix(a, b, t) { var x = hex(a), y = hex(b); return "#" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"); }).join(""); }
  var flow = null, fluid = null;
  load("/glass/flow-glass.js").then(function () {
    flow = window.FlowGlass && FlowGlass.create(layer(), { palette: pal, scale: level >= 2 ? flowScale * 0.6 : flowScale });
    if (!flow) return;
    bd.classList.add("on");
    if (level >= 4 && flow.setFps) flow.setFps(30);
    if (still) { flow.draw(); return; }
    flow.start();
    if (level >= 3) { setTimeout(function () { requestAnimationFrame(monitor); }, 1200); return; }
    return load("/glass/fluid.js").then(function () {
      var P = FlowGlass.COLORS[pal] || FlowGlass.COLORS.blush;
      var colors = [P.light, P.mid, mix(P.light, "#ffffff", 0.55), mix(P.mid, P.light, 0.5)];
      fluid = FluidBG.create(layer(), {
        colors: colors, intensity: 0.2, dither: "/glass/LDR_LLL1_0.png", maxPixelRatio: 1, initialSplats: phone ? 3 : 4, ambient: phone ? 3 : 2.6, maxDt: 0.034,
        config: phone
          ? { TRANSPARENT: true, DYE_RESOLUTION: 512, SIM_RESOLUTION: 96, PRESSURE_ITERATIONS: 16, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.24, SPLAT_FORCE: 5200, BLOOM_ITERATIONS: 6, BLOOM_RESOLUTION: 192, BLOOM_INTENSITY: 0.55, BLOOM_THRESHOLD: 0.45, SUNRAYS_RESOLUTION: 128, SUNRAYS_WEIGHT: 0.9, COLOR_UPDATE_SPEED: 4 }
          : { TRANSPARENT: true, DYE_RESOLUTION: small ? 512 : 768, SIM_RESOLUTION: 128, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.22, SPLAT_FORCE: 5200, BLOOM_INTENSITY: 0.55, BLOOM_THRESHOLD: 0.45, SUNRAYS_WEIGHT: 0.9, COLOR_UPDATE_SPEED: 4 }
      });
      if (level >= 2 && fluid.setSunrays) fluid.setSunrays(false);
      fluid.start();
      setTimeout(function () { requestAnimationFrame(monitor); }, 1200);
    });
  }).catch(function () { /* the still image stays */ });

  if (still) return;
  var tx = 0, ty = 0, px = 0, py = 0, raf = 0;
  function loop() {
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    bd.style.transform = "translate3d(" + px.toFixed(2) + "px," + py.toFixed(2) + "px,0)";
    raf = Math.abs(tx - px) > 0.05 || Math.abs(ty - py) > 0.05 ? requestAnimationFrame(loop) : 0;
  }
  function run(on) { if (flow) on ? flow.start() : flow.stop(); if (fluid) on ? fluid.start() : fluid.stop(); }
  addEventListener("pointermove", function (e) {
    if (!touch) {
      tx = (e.clientX / innerWidth - 0.5) * -24; ty = (e.clientY / innerHeight - 0.5) * -18;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    if (flow) flow.pointer(e.clientX, e.clientY, 0);
    if (fluid) fluid.pointer(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) run(false); else run(true);
  });
  /* adaptive quality: 1 plain frosted glass → 2 waves at lower resolution → 3 drop the fluid → 4 waves at 30 fps */
  var slow = 0, good = 0, mLast = 0, deltas = [], warm = true;
  function stepDown() {
    level++;
    try { localStorage.setItem("baka-glass-q", JSON.stringify({ level: level, at: Date.now() })); } catch (e) { /* storage unavailable */ }
    if (level === 1) { plainGlass = true; glasses.forEach(draw); }
    else if (level === 2) { if (flow && flow.setScale) flow.setScale(flowScale * 0.6); if (fluid && fluid.setSunrays) fluid.setSunrays(false); }
    else if (level === 3) { if (fluid) { fluid.destroy(); var cs = bd.querySelectorAll("canvas"); if (cs.length > 1) cs[cs.length - 1].remove(); fluid = null; } }
    else if (level === 4) { if (flow && flow.setFps) flow.setFps(30); }
  }
  function monitor(ts) {
    if (mLast && !document.hidden) { var d = ts - mLast; if (d < 250) deltas.push(d); }
    mLast = ts;
    if (deltas.length >= 60) {
      var fps = 1000 / (deltas.reduce(function (a, b) { return a + b; }, 0) / deltas.length);
      deltas = [];
      if (warm) { warm = false; requestAnimationFrame(monitor); return; }
      if (fps < 40) { slow = 0; good = 0; stepDown(); }
      else if (fps < 50) { slow++; good = 0; if (slow >= 2) { slow = 0; stepDown(); } }
      else { good++; slow = 0; }
      if (level >= 4 || good >= 4) return;
    }
    requestAnimationFrame(monitor);
  }
})();
