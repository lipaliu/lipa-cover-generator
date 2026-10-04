/* Server-rendered pages (login, admin, legal, messages): same moving background
   and liquid-glass surfaces as the app.
   Glass filter ported from nikdelvin/liquid-glass (MIT); fluid layer from
   PavelDoGreat/WebGL-Fluid-Simulation (MIT). Licences in /glass/licenses/. */
(function () {
  "use strict";
  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var small = innerWidth < 700;
  /* phones / small / low-core devices: lighter settings, 30 fps, no parallax, pause while scrolling */
  var touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var lite = touch || innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;
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
  function draw(g) {
    var box = g.querySelector(".flt > .box");
    var w = Math.round(g.offsetWidth), h = Math.round(g.offsetHeight);
    if (!box || !w || !h) return;
    var r = Math.min(parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0, w / 2, h / 2);
    var fr = +(g.getAttribute("data-blur") || 0), cab = +(g.getAttribute("data-cab") || 0);
    if (supportsUrl) box.style.backdropFilter = "blur(" + fr / 2 + "px) url('" + dispFilter(w, h, r, 10, 100, cab) + "') blur(" + fr + "px) brightness(1.1) saturate(1.5)";
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
    flow = window.FlowGlass && FlowGlass.create(layer(), lite ? { palette: pal, scale: 0.32, fps: 30 } : { palette: pal, scale: small ? 0.45 : 0.55 });
    if (!flow) return;
    bd.classList.add("on");
    if (still) { flow.draw(); return; }
    flow.start();
    return load("/glass/fluid.js").then(function () {
      var P = FlowGlass.COLORS[pal] || FlowGlass.COLORS.blush;
      var colors = [P.light, P.mid, mix(P.light, "#ffffff", 0.55), mix(P.mid, P.light, 0.5)];
      fluid = FluidBG.create(layer(), lite ? {
        colors: colors, intensity: 0.22, dither: "/glass/LDR_LLL1_0.png", maxPixelRatio: 0.5, initialSplats: 3, ambient: 3.4, fps: 30, maxDt: 0.034,
        config: { TRANSPARENT: true, DYE_RESOLUTION: 256, SIM_RESOLUTION: 64, PRESSURE_ITERATIONS: 12, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.26, SPLAT_FORCE: 5200, BLOOM_ITERATIONS: 4, BLOOM_RESOLUTION: 128, BLOOM_INTENSITY: 0.6, BLOOM_THRESHOLD: 0.45, SUNRAYS: false, COLOR_UPDATE_SPEED: 4 }
      } : {
        colors: colors, intensity: 0.2, dither: "/glass/LDR_LLL1_0.png", maxPixelRatio: 1, initialSplats: 4, ambient: 2.6,
        config: { TRANSPARENT: true, DYE_RESOLUTION: small ? 512 : 768, SIM_RESOLUTION: 128, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.22, SPLAT_FORCE: 5200, BLOOM_INTENSITY: 0.55, BLOOM_THRESHOLD: 0.45, SUNRAYS_WEIGHT: 0.9, COLOR_UPDATE_SPEED: 4 }
      });
      fluid.start();
    });
  }).catch(function () { /* the still image stays */ });

  if (still) return;
  var tx = 0, ty = 0, px = 0, py = 0, raf = 0, scrolling = false, scrollTimer = 0;
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
  if (lite) addEventListener("scroll", function () {
    if (!scrolling) { scrolling = true; run(false); }
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { scrolling = false; if (!document.hidden) run(true); }, 180);
  }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) run(false);
    else if (!scrolling) run(true);
  });
})();
