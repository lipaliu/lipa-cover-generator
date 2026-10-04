/* 巴卡巴卡 cloud sea (plain WebGL1, written from scratch for this project — no third-party shader code).
   A 2.5D sunset: a sky gradient with a sun and glare, thin high streaks, and three planes of
   value-noise clouds seen from above that keep drifting toward the viewer, fading into haze.
   Interaction: the view turns a little with the pointer, the sun follows the pointer sideways
   (so the light and the lit edges of the clouds move), clouds part softly around the cursor,
   a tap makes the sun flare, and the colour of the light drifts slowly on its own. */
(function (global) {
  'use strict';
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uLook; uniform vec2 uPtr; uniform float uPulse;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uGlare;
uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uSea;
float h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.62,1.17,-1.17,1.62);
  for(int i=0;i<5;i++){v+=a*vnoise(p);p=m*p+vec2(3.1,1.7);a*=.5;}return v;}
float fbm3(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.62,1.17,-1.17,1.62);
  for(int i=0;i<3;i++){v+=a*vnoise(p);p=m*p+vec2(3.1,1.7);a*=.5;}return v;}
vec3 dirFor(vec2 q){
  /* camera: horizon in the upper quarter, yaw and pitch follow the pointer */
  float yaw=uLook.x, pitch=-.3+uLook.y;
  vec3 d=normalize(vec3(q.x,q.y+pitch,1.45));
  float c=cos(yaw),s=sin(yaw);
  return vec3(c*d.x+s*d.z,d.y,-s*d.x+c*d.z);
}
void main(){
  vec2 q=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float t=uTime;
  /* soft parting around the cursor (clouds only) */
  vec2 pd=q-uPtr;
  vec2 qc=q+pd*.22*exp(-dot(pd,pd)*18.);
  vec3 rd=dirFor(q), rc=dirFor(qc);

  /* sun: azimuth follows the pointer, warmth drifts over time */
  float az=uLook.x*.5+uPtr.x*.45+.38;
  vec3 sd=normalize(vec3(sin(az),.035+.03*uPtr.y,cos(az)));
  float warm=.5+.5*sin(t*.11);
  vec3 sunC=mix(uSun,mix(uSun,uGlare,.5),warm*.5);
  float flare=1.+uPulse*1.6;
  float sdot=max(dot(rd,sd),0.);

  /* sky */
  float up=clamp(rd.y,0.,1.);
  vec3 col=mix(uHorizon,uZenith,pow(smoothstep(0.,.24,up),.8));
  col+=sunC*pow(sdot,900.)*1.2;
  col+=sunC*pow(sdot,90.)*.45*flare;
  col+=uGlare*pow(sdot,10.)*.22*flare;
  /* high thin streaks */
  if(rd.y>0.){
    float tt=1.2/(rd.y+.02); vec2 uv=rd.xz*tt*.06+vec2(t*.008,t*.003);
    float st=fbm3(uv*vec2(1.,5.));
    float a=smoothstep(.5,.8,st)*smoothstep(.0,.05,rd.y)*smoothstep(.45,.12,rd.y);
    col=mix(col,mix(uLit,sunC,.5*pow(sdot,4.)),a*.5);
  }

  /* cloud sea: four thin slices of one cloud deck, top slice first.
     Lower slices need less density, so puffs get round tops lit by the sun and deeper bases. */
  if(rc.y<-.002){
    vec3 acc=vec3(0.); float cover=0.;
    vec2 wind=vec2(t*.012,-t*.06);
    vec2 sdx=normalize(sd.xz+1e-4);
    float dj=h21(gl_FragCoord.xy+fract(t*.37)*17.);
    for(int i=0;i<4;i++){
      float fi=float(i)+dj*.4;
      float tt=(1.+fi*.045)/(-rc.y);
      vec2 pos=rc.xz*tt;
      vec2 uv=pos*.62+wind;
      vec2 w=vec2(fbm3(uv*.5+t*.01),fbm3(uv*.5+vec2(5.2,1.3)-t*.01));
      uv+=(w-.5)*.9;
      float n=fbm(uv);
      float th=.34-fi*.04;
      float den=smoothstep(th,th+.22,n);
      if(den<=.001) continue;
      float n2=fbm3(uv+sdx*.12);
      float lit=clamp(.62+(n-n2)*4.-fi*.13,0.,1.);
      vec3 c=mix(uShade,uLit,lit);
      /* silver lining on the sun side of each puff */
      float rim=smoothstep(th+.22,th,n)*smoothstep(.0,1.,dot(normalize(rc.xz),sdx)*.5+.5);
      c+=sunC*rim*.35*flare;
      c+=sunC*.35*pow(sdot,6.)*flare;
      float fog=1.-exp(-tt*.09);
      c=mix(c,uHorizon,fog*.95);
      float a=den*.92;
      acc+=c*a*(1.-cover);
      cover+=a*(1.-cover);
      if(cover>.97) break;
    }
    float far=1.-exp(-(1./max(-rc.y,.002))*.09);
    vec3 gap=mix(mix(uShade,uSea,.55),uHorizon,far);
    acc+=gap*(1.-cover);
    col=mix(col,acc,smoothstep(.0,-.025,rc.y));
  }
  /* haze at the horizon + glare over everything */
  col+=uGlare*.1*exp(-abs(rd.y)*22.)*(.5+.5*pow(sdot,2.))*flare;
  col+=(h21(gl_FragCoord.xy+fract(t)*61.)-.5)*.014;
  vec2 uv=gl_FragCoord.xy/uRes;
  col*=mix(.9,1.,smoothstep(1.25,.3,length(uv-.5)*1.4));
  gl_FragColor=vec4(col,1.);
}`;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const W = [1, 1, 1], K = [0, 0, 0], CREAM = rgb('#fff1e6');
  function colors(name) {
    const P = (global.FlowGlass && global.FlowGlass.COLORS[name]) || global.FlowGlass.COLORS.blush;
    const deep = rgb(P.deep), mid = rgb(P.mid), light = rgb(P.light);
    return {
      zenith: mix(deep, mid, .55),
      horizon: mix(mix(light, mid, .2), W, .3),
      sun: mix(light, W, .65),
      glare: mix(mid, light, .3),
      lit: mix(light, CREAM, .72),
      shade: mix(mix(mid, deep, .25), light, .3),
      sea: mix(deep, mid, .45)
    };
  }
  function create(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!opts.preserve });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const u = {}; ['uRes', 'uTime', 'uLook', 'uPtr', 'uPulse', 'uZenith', 'uHorizon', 'uSun', 'uGlare', 'uLit', 'uShade', 'uSea'].forEach(n => u[n] = U(n));
    const scale = opts.scale || .5;
    const S = { t: opts.t0 || 20, running: false, raf: 0, last: 0, px: 0, py: 0, tx: 0, ty: 0, pulse: 0, col: colors(opts.palette || 'blush'), from: null, k: 1 };
    function size() { const w = Math.max(2, Math.round(canvas.clientWidth * scale)), h = Math.max(2, Math.round(canvas.clientHeight * scale)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, w, h); }
    function cur(key) { return S.from && S.k < 1 ? mix(S.from[key], S.col[key], S.k) : S.col[key]; }
    function frame(dt) {
      size();
      S.t += dt;
      const e = 1 - Math.pow(.04, dt); /* frame-rate independent easing */
      S.px += (S.tx - S.px) * e; S.py += (S.ty - S.py) * e;
      S.pulse *= Math.pow(.18, dt);
      if (S.from && S.k < 1) S.k = Math.min(1, S.k + dt / .8);
      const drift = Math.sin(S.t * .045) * .12;
      gl.uniform2f(u.uRes, canvas.width, canvas.height); gl.uniform1f(u.uTime, S.t);
      gl.uniform2f(u.uLook, drift + S.px * .14, S.py * .035);
      const asp = canvas.width / canvas.height;
      gl.uniform2f(u.uPtr, S.px * .5 * asp, S.py * .5);
      gl.uniform1f(u.uPulse, S.pulse);
      gl.uniform3fv(u.uZenith, cur('zenith')); gl.uniform3fv(u.uHorizon, cur('horizon')); gl.uniform3fv(u.uSun, cur('sun'));
      gl.uniform3fv(u.uGlare, cur('glare')); gl.uniform3fv(u.uLit, cur('lit')); gl.uniform3fv(u.uShade, cur('shade')); gl.uniform3fv(u.uSea, cur('sea'));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function loop(ts) { if (!S.running) return; const dt = S.last ? Math.min(.05, (ts - S.last) / 1000) : .016; S.last = ts; frame(dt); S.raf = requestAnimationFrame(loop); }
    function norm(x, y) { const r = canvas.getBoundingClientRect(); return [((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2]; }
    return {
      start() { if (S.running) return; S.running = true; S.last = 0; S.raf = requestAnimationFrame(loop); },
      stop() { S.running = false; cancelAnimationFrame(S.raf); },
      tick(dt) { frame(dt); },
      draw() { frame(0); },
      palette(name) { const now = { zenith: cur('zenith'), horizon: cur('horizon'), sun: cur('sun'), glare: cur('glare'), lit: cur('lit'), shade: cur('shade'), sea: cur('sea') }; S.from = now; S.col = colors(name); S.k = 0; if (!S.running) { S.k = 1; frame(0); } },
      pointer(x, y) { const [nx, ny] = norm(x, y); S.tx = nx; S.ty = ny; },
      tap() { S.pulse = 1; },
      destroy() { this.stop(); const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); },
      state: S
    };
  }
  global.CloudSea = { create };
})(window);
