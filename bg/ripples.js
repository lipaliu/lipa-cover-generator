/*
 * Water ripples over a live canvas.
 * Simulation, drop and refraction shaders adapted from sirxemic/jquery.ripples
 * (MIT, commit e90bd54, Copyright (c) 2017 Pim Schreurs — see licenses/jquery-ripples-MIT.txt).
 * Changes for 巴卡巴卡: no jQuery, the background is another canvas re-uploaded every frame
 * (so the flowing glass keeps moving under the water), the highlight direction follows the
 * pointer and drifts with time, and the highlight is tinted by the palette.
 */
(function (global) {
  'use strict';

  function floatConfig(gl) {
    const ext = {};
    ['OES_texture_float', 'OES_texture_half_float', 'OES_texture_float_linear', 'OES_texture_half_float_linear'].forEach(n => { const e = gl.getExtension(n); if (e) ext[n] = e; });
    const configs = [];
    const mk = (type, glType, arrayType) => ({ type: glType, arrayType, linear: ('OES_texture_' + type + '_linear') in ext });
    if (ext.OES_texture_float) configs.push(mk('float', gl.FLOAT, Float32Array));
    if (ext.OES_texture_half_float) configs.push(mk('half_float', ext.OES_texture_half_float.HALF_FLOAT_OES, null));
    const tex = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    let found = null;
    for (const c of configs) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, c.type, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) { found = c; break; }
    }
    gl.deleteTexture(tex); gl.deleteFramebuffer(fb); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return found;
  }

  function program(gl, vs, fs) {
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const id = gl.createProgram(); gl.attachShader(id, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(id, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(id, 0, 'vertex'); gl.linkProgram(id);
    if (!gl.getProgramParameter(id, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(id));
    const loc = {}; let m; const re = /uniform (\w+) (\w+)/g;
    while ((m = re.exec(vs + fs))) loc[m[2]] = gl.getUniformLocation(id, m[2]);
    return { id, loc };
  }

  const VS = 'attribute vec2 vertex;varying vec2 coord;void main(){coord=vertex*0.5+0.5;gl_Position=vec4(vertex,0.0,1.0);}';
  const DROP = `precision highp float;const float PI=3.141592653589793;
uniform sampler2D texture;uniform vec2 center;uniform float radius;uniform float strength;varying vec2 coord;
void main(){vec4 info=texture2D(texture,coord);float drop=max(0.0,1.0-length(center*0.5+0.5-coord)/radius);drop=0.5-cos(drop*PI)*0.5;info.r+=drop*strength;gl_FragColor=info;}`;
  const UPDATE = `precision highp float;uniform sampler2D texture;uniform vec2 delta;varying vec2 coord;
void main(){vec4 info=texture2D(texture,coord);vec2 dx=vec2(delta.x,0.0);vec2 dy=vec2(0.0,delta.y);
float average=(texture2D(texture,coord-dx).r+texture2D(texture,coord-dy).r+texture2D(texture,coord+dx).r+texture2D(texture,coord+dy).r)*0.25;
info.g+=(average-info.r)*2.0;info.g*=0.995;info.r+=info.g;gl_FragColor=info;}`;
  const RVS = 'attribute vec2 vertex;uniform vec2 containerRatio;varying vec2 ripplesCoord;varying vec2 backgroundCoord;void main(){backgroundCoord=vertex*0.5+0.5;ripplesCoord=vertex*containerRatio*0.5+0.5;gl_Position=vec4(vertex,0.0,1.0);}';
  const RENDER = `precision highp float;
uniform sampler2D samplerBackground;uniform sampler2D samplerRipples;uniform vec2 delta;uniform float perturbance;
uniform vec2 lightDir;uniform vec3 lightTint;uniform float lightK;
varying vec2 ripplesCoord;varying vec2 backgroundCoord;
void main(){
  float height=texture2D(samplerRipples,ripplesCoord).r;
  float heightX=texture2D(samplerRipples,vec2(ripplesCoord.x+delta.x,ripplesCoord.y)).r;
  float heightY=texture2D(samplerRipples,vec2(ripplesCoord.x,ripplesCoord.y+delta.y)).r;
  vec3 dx=vec3(delta.x,heightX-height,0.0);vec3 dy=vec3(0.0,heightY-height,delta.y);
  vec2 offset=-normalize(cross(dy,dx)).xz;
  float specular=pow(max(0.0,dot(offset,normalize(lightDir))),4.0);
  float back=pow(max(0.0,dot(offset,-normalize(lightDir))),6.0);
  vec3 c=texture2D(samplerBackground,backgroundCoord+offset*perturbance).rgb;
  c+=lightTint*specular*lightK;
  c*=1.0-back*0.18;
  gl_FragColor=vec4(c,1.0);
}`;

  function create(host, source, opts) {
    opts = Object.assign({ resolution: 384, dropRadius: 22, perturbance: 0.045, scale: 1, rain: 0.55, tint: '#fff4ea' }, opts || {});
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
    if (!gl) { canvas.remove(); return null; }
    const cfg = floatConfig(gl);
    if (!cfg) { canvas.remove(); return null; }

    const res = opts.resolution, delta = new Float32Array([1 / res, 1 / res]);
    const textures = [], fbs = []; let wi = 0, ri = 1;
    const data = cfg.arrayType ? new cfg.arrayType(res * res * 4) : null;
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture(), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.bindTexture(gl.TEXTURE_2D, t);
      const flt = cfg.linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, flt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, flt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, res, res, 0, gl.RGBA, cfg.type, data);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      textures.push(t); fbs.push(f);
    }
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const dropP = program(gl, VS, DROP), updP = program(gl, VS, UPDATE), renP = program(gl, RVS, RENDER);
    const bg = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, bg);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const bind = (t, u) => { gl.activeTexture(gl.TEXTURE0 + (u || 0)); gl.bindTexture(gl.TEXTURE_2D, t); };
    const quadDraw = () => { gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4); };
    const swap = () => { wi = 1 - wi; ri = 1 - ri; };

    const S = { running: false, t: 0, lx: -.6, ly: 1, tx: -.6, ty: 1, rain: 0, tint: hex(opts.tint), raf: 0, last: 0 };
    function hex(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255); }
    function size() {
      const w = Math.max(2, Math.round(canvas.clientWidth * opts.scale)), h = Math.max(2, Math.round(canvas.clientHeight * opts.scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function drop(x, y, radius, strength) {
      const r = canvas.getBoundingClientRect(); const w = r.width, h = r.height, L = Math.max(w, h);
      x -= r.left; y -= r.top;
      gl.viewport(0, 0, res, res);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[wi]); bind(textures[ri]);
      gl.useProgram(dropP.id);
      gl.uniform1i(dropP.loc.texture, 0);
      gl.uniform2f(dropP.loc.center, (2 * x - w) / L, (h - 2 * y) / L);
      gl.uniform1f(dropP.loc.radius, radius / L); gl.uniform1f(dropP.loc.strength, strength);
      quadDraw(); swap();
    }
    function update() {
      gl.viewport(0, 0, res, res);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[wi]); bind(textures[ri]);
      gl.useProgram(updP.id); gl.uniform1i(updP.loc.texture, 0); gl.uniform2fv(updP.loc.delta, delta);
      quadDraw(); swap();
    }
    function render() {
      size();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
      bind(bg, 0);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); } catch (e) {}
      bind(textures[0], 1);
      gl.useProgram(renP.id);
      const r = canvas.getBoundingClientRect(), L = Math.max(r.width, r.height);
      gl.uniform2f(renP.loc.containerRatio, r.width / L, r.height / L);
      gl.uniform2fv(renP.loc.delta, delta); gl.uniform1f(renP.loc.perturbance, opts.perturbance);
      gl.uniform1i(renP.loc.samplerBackground, 0); gl.uniform1i(renP.loc.samplerRipples, 1);
      gl.uniform2f(renP.loc.lightDir, S.lx, S.ly); gl.uniform3fv(renP.loc.lightTint, S.tint); gl.uniform1f(renP.loc.lightK, 1.0);
      quadDraw();
    }
    function frame(dt) {
      S.t += dt;
      /* light swings toward the pointer side, and drifts slowly on its own */
      const ax = S.tx + .35 * Math.sin(S.t * .4), ay = S.ty + .25 * Math.cos(S.t * .33);
      S.lx += (ax - S.lx) * .06; S.ly += (ay - S.ly) * .06;
      if (opts.rain > 0) {
        S.rain -= dt;
        if (S.rain <= 0) {
          S.rain = opts.rain * (.4 + Math.random() * 1.2);
          const r = canvas.getBoundingClientRect();
          drop(r.left + Math.random() * r.width, r.top + Math.random() * r.height, 10 + Math.random() * 18, .025 + Math.random() * .04);
        }
      }
      if (opts.onFrame) opts.onFrame(dt);
      update(); if (dt > .025) update();
      render();
    }
    function loop(ts) { if (!S.running) return; const dt = S.last ? Math.min(.05, (ts - S.last) / 1000) : .016; S.last = ts; frame(dt); S.raf = requestAnimationFrame(loop); }

    return {
      canvas,
      start() { if (S.running) return; S.running = true; S.last = 0; S.raf = requestAnimationFrame(loop); },
      stop() { S.running = false; cancelAnimationFrame(S.raf); },
      tick(dt) { frame(dt); },
      pointer(x, y, speed) {
        const r = canvas.getBoundingClientRect();
        S.tx = ((x - r.left) / r.width - .5) * 2; S.ty = .6 + (.5 - (y - r.top) / r.height) * 1.6;
        if (speed > 1) drop(x, y, opts.dropRadius, Math.min(.03, .006 + speed * .0006));
      },
      tap(x, y) { drop(x, y, opts.dropRadius * 1.5, .14); },
      tint(h) { S.tint = hex(h); },
      destroy() { this.stop(); const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); canvas.remove(); }
    };
  }

  global.RipplesBG = { create };
})(window);
