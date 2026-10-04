/* 巴卡巴卡 flowing glass backdrop (plain WebGL1, no dependencies).
   Layered translucent glass waves sweep across a soft sky, back layers softer (depth of field),
   front edges catch a thin highlight. The pointer bends the waves and leaves water ripples;
   a few faint droplets sit on the front sheet and tiny sparkles drift. */
(function (global) {
  const NR = 10;
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uNow; uniform vec2 uMouse;
uniform vec3 uSkyA; uniform vec3 uSkyB; uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uLight; uniform float uDrops;
uniform vec4 uR[${NR}];
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n+17.1));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
vec2 rot(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c)*p;}
vec2 ripple(vec2 p,out float light){
  vec2 off=vec2(0.); light=0.;
  for(int i=0;i<${NR};i++){
    vec4 r=uR[i]; if(r.w<=0.) continue;
    float age=uNow-r.z; if(age<0.||age>4.) continue;
    vec2 c=(r.xy-.5*uRes)/min(uRes.x,uRes.y); vec2 d=p-c; float dist=length(d);
    float front=age*.34; float band=exp(-pow((dist-front)*8.,2.));
    float w=sin((dist-front)*55.)*band*exp(-age*1.05)*r.w;
    off+=normalize(d+1e-5)*w*.02; light+=w;
  }
  return off;
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
  vec2 uv=gl_FragCoord.xy/uRes;
  float t=uTime;
  float rl; p+=ripple(p,rl);
  vec2 m=(uMouse-.5*uRes)/min(uRes.x,uRes.y);

  /* sky: warm cream to soft blue with a slow haze */
  float sk=smoothstep(-.55,.7,p.y-p.x*.35+.12*sin(t*.2));
  vec3 col=mix(uSkyB,uSkyA,sk);
  col=mix(col,uLight*.6+uSkyA*.4,.18*smoothstep(.45,.85,fbm(p*1.2+t*.03)));

  /* glass waves, back to front */
  /* four sheets, each with its own angle, height, wave, focus and tone:
     0 far & soft (upper right) · 1 main sharp sheet · 2 second sheet · 3 pale out-of-focus foreground */
  for(int i=0;i<4;i++){
    float ang,off,amp,frq,soft,alpha,rimK,tone;
    if(i==0){ang=-.95;off=.42;amp=.16;frq=.8;soft=.2;alpha=.75;rimK=0.;tone=.35;}
    else if(i==1){ang=-.62;off=.1;amp=.22;frq=.9;soft=.018;alpha=.9;rimK=1.;tone=0.;}
    else if(i==2){ang=-.4;off=-.2;amp=.16;frq=1.1;soft=.07;alpha=.8;rimK=.45;tone=-.15;}
    else {ang=-.12;off=-.47;amp=.11;frq=1.3;soft=.15;alpha=.7;rimK=0.;tone=-.75;}
    float fi=float(i);
    vec2 q=rot(p,ang);
    float x=q.x;
    float yc=off+amp*sin(x*frq+t*(.17+fi*.04)+fi*1.9)+amp*.3*sin(x*frq*2.3-t*(.14+fi*.03)+fi*3.1);
    vec2 mq=rot(m,ang);
    yc+=.08*exp(-pow((x-mq.x)*1.8,2.))*exp(-pow((q.y-mq.y)*2.5,2.))*(.5+fi*.2);
    float d=q.y-yc;
    float fill=smoothstep(soft,-soft,d);
    if(fill<=.001) continue;
    float D=max(-d,0.);
    vec3 c=mix(uLight,uMid,smoothstep(0.,.18,D));
    c=mix(c,uDeep,smoothstep(.15,.6,D));
    float pool=fbm(q*vec2(1.1,2.2)+vec2(t*.04,fi*2.));
    c=mix(c,uLight,.3*smoothstep(.55,.85,pool)*smoothstep(.55,.0,D));
    c*=.88+.2*pool;
    c+=uLight*.16*pow(.5+.5*sin(D*8.-x*1.6+t*.45+fi),6.)*smoothstep(.45,0.,D);
    /* tone: >0 deeper (far), <0 paler (near, washed with light) */
    c=tone>0.?mix(c,uDeep*.8,tone):mix(c,mix(uLight,vec3(1.),.45),-tone);
    float w=.003;
    c+=vec3(1.)*exp(-pow(d/w,2.))*.5*rimK;
    c+=vec3(1.)*exp(-pow((d+.014)/(w*2.5),2.))*.12*rimK;
    c*=1.-.1*rimK*exp(-pow((d+.035)/.03,2.));
    if(i==1 && uDrops>0.){
      vec2 g=q*vec2(24.,24.); vec2 id=floor(g); vec2 f=fract(g)-.5; vec2 o=(h22(id)-.5)*.5;
      float rr=.08+.2*h21(id+4.);
      float dd=length(f-o);
      float on=step(.74,h21(id+11.))*smoothstep(.0,.08,D);
      float rim=smoothstep(rr,rr*.82,dd)-smoothstep(rr*.82,rr*.55,dd);
      float hi=smoothstep(rr*.35,0.,length(f-o-vec2(-rr*.35,rr*.35)));
      c=mix(c,c*.66,rim*.5*on*uDrops); c+=vec3(1.)*hi*.22*on*uDrops;
    }
    col=mix(col,c,fill*alpha);
  }

  /* ripple light */
  col+=vec3(1.)*max(rl,0.)*.1; col-=vec3(.04)*max(-rl,0.);

  /* drifting sparkles */
  for(int L=0;L<2;L++){
    float fl=float(L); float dens=16.+fl*14.;
    vec2 g=p*dens+vec2(t*(.4+fl*.3),-t*(.9+fl*.6)); vec2 id=floor(g); vec2 f=fract(g)-.5;
    vec2 o=h22(id)-.5; float sz=.03+.05*h21(id+3.1);
    float tw=.5+.5*sin(t*7.+h21(id)*30.);
    float s=smoothstep(sz,0.,length(f-o*.7))*step(.78,h21(id+9.))*tw;
    col+=vec3(1.,.98,.95)*s*(.55-fl*.2);
  }

  col+=(h21(gl_FragCoord.xy+fract(uNow)*91.)-.5)*.018;
  col*=mix(.9,1.,smoothstep(1.2,.25,length(uv-.5)*1.5));
  gl_FragColor=vec4(col,1.);
}`;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const PALETTES = {
    tahoe:  { skyA: '#f1e6c8', skyB: '#a8c3ec', deep: '#0a3ccf', mid: '#2b7bf3', light: '#9fd8f8', drops: .6 },
    blush:  { skyA: '#6f8fae', skyB: '#2f4f70', deep: '#c50f45', mid: '#ff3d62', light: '#ffa04a', drops: 1 },
    mint:   { skyA: '#f0f4ea', skyB: '#bfe2df', deep: '#0b7f86', mid: '#33c2b6', light: '#bff3e4', drops: .6 },
    iris:   { skyA: '#e9defa', skyB: '#a7b5f2', deep: '#5b2fe0', mid: '#e94fb0', light: '#ffd27a', drops: .6 },
    silver: { skyA: '#f1f1f4', skyB: '#c9ccd6', deep: '#3f4554', mid: '#8a91a3', light: '#eef0f6', drops: .5 }
  };
  function create(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!(opts.still || opts.preserve) });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);
    const u = { res: U('uRes'), time: U('uTime'), now: U('uNow'), mouse: U('uMouse'), skyA: U('uSkyA'), skyB: U('uSkyB'), deep: U('uDeep'), mid: U('uMid'), light: U('uLight'), drops: U('uDrops'), R: U('uR') };
    const scale = opts.scale || .6;
    const S = { t: opts.t0 || 6, now: 0, pal: PALETTES[opts.palette || 'tahoe'], running: false, mx: -1e4, my: -1e4, tx: -1e4, ty: -1e4, ripples: [], ri: 0, lastRip: 0 };
    const Rf = new Float32Array(NR * 4);
    function size() { const w = Math.max(2, Math.round(canvas.clientWidth * scale)), h = Math.max(2, Math.round(canvas.clientHeight * scale)); if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, w, h); }
    function frame() {
      size();
      if (S.mx < -1e3 && S.tx > -1e3) { S.mx = S.tx; S.my = S.ty; }
      S.mx += (S.tx - S.mx) * .08; S.my += (S.ty - S.my) * .08;
      Rf.fill(0); S.ripples.forEach((r, i) => { Rf[i * 4] = r.x; Rf[i * 4 + 1] = r.y; Rf[i * 4 + 2] = r.t; Rf[i * 4 + 3] = r.a; });
      const P = S.pal;
      gl.uniform2f(u.res, canvas.width, canvas.height); gl.uniform1f(u.time, S.t); gl.uniform1f(u.now, S.now); gl.uniform2f(u.mouse, S.mx, S.my);
      gl.uniform3fv(u.skyA, hex(P.skyA)); gl.uniform3fv(u.skyB, hex(P.skyB)); gl.uniform3fv(u.deep, hex(P.deep)); gl.uniform3fv(u.mid, hex(P.mid)); gl.uniform3fv(u.light, hex(P.light)); gl.uniform1f(u.drops, P.drops);
      gl.uniform4fv(u.R, Rf);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    let last = 0;
    const minGap = opts.fps ? 1000 / opts.fps - 4 : 0; /* optional frame cap (phones) */
    function loop(ts) { if (!S.running) return; if (last && ts - last < minGap) { requestAnimationFrame(loop); return; } const dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts; S.now += dt; S.t += dt * .35; frame(); requestAnimationFrame(loop); }
    function toCanvas(x, y) { const r = canvas.getBoundingClientRect(); return [(x - r.left) * (canvas.width / r.width), (r.height - (y - r.top)) * (canvas.height / r.height)]; }
    function addRipple(x, y, a) { S.ripples[S.ri % NR] = { x, y, t: S.now, a }; S.ri++; }
    return {
      start() { if (S.running) return; S.running = true; last = 0; requestAnimationFrame(loop); },
      stop() { S.running = false; },
      tick(dt) { S.now += dt; S.t += dt * .35; frame(); },
      draw: () => frame(),
      palette(name) { S.pal = PALETTES[name] || PALETTES.tahoe; if (!S.running) frame(); },
      pointer(x, y, speed) { const [cx, cy] = toCanvas(x, y); S.tx = cx; S.ty = cy; if (speed > 6 && S.now - S.lastRip > .12) { S.lastRip = S.now; addRipple(cx, cy, Math.min(1, speed / 40) * .55); } },
      tap(x, y) { const [cx, cy] = toCanvas(x, y); addRipple(cx, cy, 1.2); return false; },
      state: S
    };
  }
  global.FlowGlass = { create, PALETTES: Object.keys(PALETTES), COLORS: PALETTES };
  global.OilSlick = global.BubbleField = global.FlowGlass;
})(window);
