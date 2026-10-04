/* 巴卡巴卡 background engines — every option mounts into the same backdrop host and shares one API:
   { palette(name), pointer(x, y, speed), tap(x, y), start(), stop(), destroy() }.
   Heavy libraries load only when that option is picked. Sources and licences: see licenses/ and the comparison page. */
(function (global) {
  'use strict';
  const C = () => global.FlowGlass.COLORS;
  const small = () => innerWidth < 700;
  const cache = {};
  const load = src => cache[src] || (cache[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }));
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const num = h => parseInt(h.slice(1), 16);
  const lose = c => { try { const g = c.getContext('webgl') || c.getContext('webgl2'); const l = g && g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); } catch (e) {} };
  function layer(host, tag) { const el = document.createElement(tag || 'canvas'); el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'; host.appendChild(el); return el; }
  function flowLayer(host, pal, extra) {
    const c = layer(host); const f = global.FlowGlass.create(c, Object.assign({ palette: pal, scale: small() ? .45 : .55 }, extra || {}));
    return { c, f };
  }

  /* pointer light: a soft warm spot that trails the cursor, plus a ring on tap (used where the library itself has no pointer response) */
  function pointerLight(host) {
    const spot = layer(host, 'div'); spot.style.cssText += ';pointer-events:none;mix-blend-mode:soft-light;background:radial-gradient(520px circle at var(--x,50%) var(--y,40%),rgba(255,246,236,.85),rgba(255,246,236,0) 62%)';
    const glow = layer(host, 'div'); glow.style.cssText += ';pointer-events:none;mix-blend-mode:screen;background:radial-gradient(260px circle at var(--x,50%) var(--y,40%),rgba(255,236,222,.22),rgba(255,236,222,0) 70%)';
    let x = innerWidth / 2, y = innerHeight * .4, tx = x, ty = y, raf = 0, on = false;
    const r = host.getBoundingClientRect();
    function loop() { if (!on) return; x += (tx - x) * .08; y += (ty - y) * .08; const b = host.getBoundingClientRect(); [spot, glow].forEach(el => { el.style.setProperty('--x', (x - b.left) + 'px'); el.style.setProperty('--y', (y - b.top) + 'px'); }); raf = requestAnimationFrame(loop); }
    return {
      start() { if (on) return; on = true; raf = requestAnimationFrame(loop); }, stop() { on = false; cancelAnimationFrame(raf); },
      move(px, py) { tx = px; ty = py; },
      ring(px, py) {
        const b = host.getBoundingClientRect(); const d = document.createElement('div');
        d.style.cssText = `position:absolute;left:${px - b.left - 40}px;top:${py - b.top - 40}px;width:80px;height:80px;border-radius:50%;pointer-events:none;mix-blend-mode:screen;box-shadow:0 0 0 2px rgba(255,240,230,.7),0 0 40px 10px rgba(255,220,200,.35)`;
        host.appendChild(d);
        const a = d.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(4)', opacity: 0 }], { duration: 1400, easing: 'cubic-bezier(.2,.7,.2,1)' }); a.onfinish = () => d.remove();
      },
      remove() { this.stop(); spot.remove(); glow.remove(); }
    };
  }

  const E = {};

  /* 0 — our own flowing glass (current version) */
  E.flow = { async mount(host, pal) {
    const { c, f } = flowLayer(host, pal); f.start();
    return { palette: n => f.palette(n), pointer: (x, y, s) => f.pointer(x, y, s), tap: (x, y) => f.tap(x, y), start: () => f.start(), stop() { f.stop(); f.draw(); }, destroy() { f.stop(); lose(c); c.remove(); } };
  } };

  /* 1 — PavelDoGreat/WebGL-Fluid-Simulation: light trails with bloom + sunrays, composited over the flowing glass */
  E.fluid = { async mount(host, pal, base) {
    await load(base + 'bg/fluid.js');
    const { c, f } = flowLayer(host, pal);
    const fc = layer(host);
    const cols = n => { const P = C()[n] || C().blush; return [P.light, P.mid, mix(P.light, '#ffffff', .55), mix(P.mid, P.light, .5)]; };
    const fl = global.FluidBG.create(fc, {
      colors: cols(pal), intensity: .2, dither: base + 'bg/LDR_LLL1_0.png', maxPixelRatio: 1, initialSplats: 5, ambient: 2.4,
      config: { TRANSPARENT: true, DYE_RESOLUTION: small() ? 512 : 768, SIM_RESOLUTION: 128, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: .35, CURL: 24, SPLAT_RADIUS: .22, SPLAT_FORCE: 5200, BLOOM_INTENSITY: .55, BLOOM_THRESHOLD: .45, SUNRAYS_WEIGHT: .9, COLOR_UPDATE_SPEED: 4 }
    });
    f.start(); fl.start();
    return {
      palette(n) { f.palette(n); fl.colors(cols(n)); },
      pointer(x, y, s) { f.pointer(x, y, 0); fl.pointer(x, y); },
      tap(x, y) { fl.tap(x, y); },
      start() { f.start(); fl.start(); }, stop() { f.stop(); fl.stop(); },
      destroy() { f.stop(); fl.destroy(); lose(c); c.remove(); fc.remove(); }
    };
  } };

  /* 2 — sirxemic/jquery.ripples: real water simulation refracting the flowing glass, highlight follows the pointer */
  E.ripples = { async mount(host, pal, base) {
    await load(base + 'bg/ripples.js');
    const { c, f } = flowLayer(host, pal, { preserve: true });
    c.style.visibility = 'hidden';
    const tint = n => mix((C()[n] || C().blush).light, '#ffffff', .7);
    const rp = global.RipplesBG.create(host, c, { onFrame: dt => f.tick(dt), tint: tint(pal), resolution: small() ? 256 : 384, scale: small() ? .75 : 1 });
    if (!rp) { c.style.visibility = ''; f.start(); return E.flow.mount(host, pal, base); }
    rp.start();
    return {
      palette(n) { f.palette(n); rp.tint(tint(n)); },
      pointer(x, y, s) { f.pointer(x, y, 0); rp.pointer(x, y, s); },
      tap(x, y) { rp.tap(x, y); },
      start: () => rp.start(), stop: () => rp.stop(),
      destroy() { rp.destroy(); lose(c); c.remove(); }
    };
  } };

  /* 3 — tengbao/vanta CLOUDS: sunlit cloud sky, the camera (and the sun) turn toward the pointer */
  const cloudsOpts = n => { const P = C()[n] || C().blush; return {
    backgroundColor: num(P.deep), skyColor: num(mix(P.mid, P.deep, .25)), cloudColor: num(mix(P.light, '#ffffff', .45)), cloudShadowColor: num(mix(P.deep, '#000000', .45)),
    sunColor: num(mix(P.light, '#ffffff', .2)), sunGlareColor: num(P.mid), sunlightColor: num(P.light), speed: .9 }; };
  E.clouds = { async mount(host, pal, base) {
    await load(base + 'bg/vendor/three.r134.min.js'); await load(base + 'bg/vendor/vanta.clouds.min.js');
    const el = layer(host, 'div');
    const v = global.VANTA.CLOUDS(Object.assign({ el, THREE: global.THREE, mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 4 }, cloudsOpts(pal)));
    return {
      palette(n) { v.setOptions(cloudsOpts(n)); },
      pointer() {}, tap() {}, start() {}, stop() {},
      destroy() { v.destroy(); el.remove(); }
    };
  } };

  /* 4 — tengbao/vanta WAVES: a lit, glossy water surface; the camera follows the pointer so the highlights slide */
  const wavesOpts = n => { const P = C()[n] || C().blush; return { color: num(mix(P.deep, '#1a0610', .5)), shininess: 90, waveHeight: 16, waveSpeed: .7, zoom: .8 }; };
  E.waves = { async mount(host, pal, base) {
    await load(base + 'bg/vendor/three.r134.min.js'); await load(base + 'bg/vendor/vanta.waves.min.js');
    const el = layer(host, 'div');
    const v = global.VANTA.WAVES(Object.assign({ el, THREE: global.THREE, mouseControls: true, touchControls: true, gyroControls: false, minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 1 }, wavesOpts(pal)));
    return {
      palette(n) { v.setOptions(wavesOpts(n)); },
      pointer() {}, tap() {}, start() {}, stop() {},
      destroy() { v.destroy(); el.remove(); }
    };
  } };

  /* 5 — paper-design/shaders MeshGradient + GodRays: a slow colour field with light rays whose source follows the pointer */
  E.rays = { async mount(host, pal, base) {
    await load(base + 'bg/paper-shaders.js');
    const L = global.PaperShaders, col = L.getShaderColorFromString;
    const size = { u_fit: L.ShaderFitOptions.cover, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0, u_originX: .5, u_originY: .5, u_worldWidth: 0, u_worldHeight: 0 };
    const meshCols = n => { const P = C()[n] || C().blush; return [P.deep, P.mid, P.light, mix(P.skyB, P.deep, .35)].map(col); };
    const rayCols = n => { const P = C()[n] || C().blush; return [P.light + 'aa', mix(P.mid, '#ffffff', .3) + 'cc', '#fff6ee', P.light].map(col); };
    const m1 = layer(host, 'div'), m2 = layer(host, 'div'); m2.style.mixBlendMode = 'screen'; m2.style.opacity = '.85';
    const mesh = new L.ShaderMount(m1, L.meshGradientFragmentShader, Object.assign({ u_colors: meshCols(pal), u_colorsCount: 4, u_distortion: .85, u_swirl: .25, u_grainMixer: 0, u_grainOverlay: 0 }, size), undefined, .35, 0, small() ? 1 : 1, small() ? 1e6 : 2.2e6);
    const noise = L.getShaderNoiseTexture();
    await new Promise(r => noise.complete ? r() : (noise.onload = r));
    const RU = { u_colorBloom: col((C()[pal] || C().blush).mid), u_colorBack: col('#000000'), u_colors: rayCols(pal), u_colorsCount: 4, u_density: .28, u_spotty: .32, u_midIntensity: .45, u_midSize: .25, u_intensity: .7, u_bloom: .45, u_noiseTexture: noise };
    const rays = new L.ShaderMount(m2, L.godRaysFragmentShader, Object.assign({}, RU, size, { u_offsetX: 0, u_offsetY: -.55 }), undefined, .55, 0, 1, small() ? 1e6 : 2.2e6);
    let tx = 0, ty = -.55, ox = 0, oy = -.55, boost = 0, raf = 0, on = true;
    function loop() { if (!on) return; ox += (tx - ox) * .05; oy += (ty - oy) * .05; boost *= .94; rays.setUniforms({ u_offsetX: ox, u_offsetY: oy, u_intensity: .7 + boost, u_bloom: .45 + boost * .6 }); raf = requestAnimationFrame(loop); }
    raf = requestAnimationFrame(loop);
    return {
      palette(n) { mesh.setUniforms({ u_colors: meshCols(n) }); rays.setUniforms({ u_colors: rayCols(n), u_colorBloom: col((C()[n] || C().blush).mid) }); },
      pointer(x, y) { const b = host.getBoundingClientRect(); tx = ((x - b.left) / b.width - .5) * 1.1; ty = -.62 + ((y - b.top) / b.height) * .5; },
      tap() { boost = .6; },
      start() { if (on) return; on = true; mesh.setSpeed(.35); rays.setSpeed(.55); raf = requestAnimationFrame(loop); },
      stop() { on = false; cancelAnimationFrame(raf); mesh.setSpeed(0); rays.setSpeed(0); },
      destroy() { this.stop(); mesh.dispose(); rays.dispose(); m1.remove(); m2.remove(); }
    };
  } };

  /* 6 — mikhailmogilnikov/mesh-gradient: the Stripe / SwiftUI-style flowing mesh, plus a pointer light of our own */
  E.mesh = { async mount(host, pal, base) {
    await load(base + 'bg/mesh-gradient.js');
    const cv = layer(host);
    const cols = n => { const P = C()[n] || C().blush; return [P.deep, P.mid, P.light, mix(P.skyB, P.deep, .4)]; };
    const g = new global.MeshGradientLib.MeshGradient().init(cv, { colors: cols(pal), seed: 7, animationSpeed: 1.1, appearance: 'default', reducedMotion: 'ignore', useLegacyLoadedClassBehavior: false });
    const pl = pointerLight(host); pl.start();
    return {
      palette(n) { g.update({ colors: cols(n) }); },
      pointer(x, y) { pl.move(x, y); },
      tap(x, y) { pl.ring(x, y); },
      start() { g.play(); pl.start(); }, stop() { g.pause(); pl.stop(); },
      destroy() { pl.remove(); g.destroy(); cv.remove(); }
    };
  } };

  /* 3 — our own cloud sea (bg/clouds.js), same look as Vanta CLOUDS but no third-party shader code */
  E.cloudsea = { async mount(host, pal, base) {
    await load(base + 'bg/clouds.js');
    const c = layer(host);
    const cs = global.CloudSea.create(c, { palette: pal, scale: small() ? .42 : .5 });
    if (!cs) { c.remove(); return E.flow.mount(host, pal, base); }
    cs.start();
    return { palette: n => cs.palette(n), pointer: (x, y) => cs.pointer(x, y), tap: () => cs.tap(), start: () => cs.start(), stop() { cs.stop(); cs.draw(); }, destroy() { cs.destroy(); c.remove(); }, tick: dt => cs.tick(dt) };
  } };

  global.BGEngines = E;
  global.BG_LIST = [
    ['fluid', '流体光晕', '1'],
    ['flow', '流光玻璃', '0'],
    ['ripples', '水波折光', '2'],
    ['clouds', '云海日光', '3'],
    ['cloudsea', '云海 · 自研', '3′'],
    ['waves', '光泽水面', '4'],
    ['rays', '光束渐变', '5'],
    ['mesh', '网格流光', '6']
  ];
})(window);
