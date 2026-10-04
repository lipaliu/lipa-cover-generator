/* Behaviour for the liquid-glass homepage (see components/GlassHome.tsx).
   - Glass: SVG displacement map + per-channel chromatic aberration used as backdrop-filter,
     ported from nikdelvin/liquid-glass (MIT, commit 4925186; licence in public/glass/licenses).
     Chromium shows the refraction; Safari/Firefox fall back to a plain frosted blur.
   - Background: our flowing-glass shader (public/glass/flow-glass.js) with a transparent layer of
     PavelDoGreat/WebGL-Fluid-Simulation (MIT, commit a2d2929; adapted in public/glass/fluid.js)
     on top: the pointer drags glowing fluid, wisps drift in on their own, a tap bursts light.
   Plain DOM/WebGL work, mounted from a React effect and fully cleaned up on unmount. */

type Engine = {
  setFps?(n: number): void;
  setScale?(v: number): void;
  start(): void;
  stop(): void;
  draw?(): void;
  palette?(name: string): void;
  pointer(x: number, y: number, speed?: number): void;
  tap?(x: number, y: number): void;
  colors?(list: string[]): void;
  destroy?(): void;
};
type Palette = { skyA: string; skyB: string; deep: string; mid: string; light: string; drops: number };
type GlassWindow = Window & {
  FlowGlass?: { create(canvas: HTMLCanvasElement, opts: Record<string, unknown>): Engine | null; COLORS: Record<string, Palette> };
  FluidBG?: { create(canvas: HTMLCanvasElement, opts: Record<string, unknown>): Engine };
};

export const GLASS_PALETTES = [
  { id: "blush", label: "珊瑚红" },
  { id: "tahoe", label: "Tahoe 蓝" },
  { id: "mint", label: "薄荷" },
  { id: "iris", label: "虹彩" },
  { id: "silver", label: "银" },
] as const;

const PALETTE_KEY = "baka-glass-palette";
/* Phones and small/low-core devices start from a lighter version of the same look
   (half-resolution fluid without sunrays, lower-resolution waves, no parallax, plain blur
   on the small dock swatches). Every device then runs an adaptive check: if the page can't
   hold ~50 fps it steps down until it can, so motion stays fluid instead of stuttering. */
export const LITE = typeof window !== "undefined" && (
  matchMedia("(pointer: coarse)").matches || innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4
);
const TOUCH = typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;
const BASE = "/glass/";
const scripts: Record<string, Promise<void>> = {};

function loadScript(src: string): Promise<void> {
  if (!scripts[src]) {
    scripts[src] = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete scripts[src]; reject(new Error(`load ${src}`)); };
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

export function readPalette(): string {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    if (v && GLASS_PALETTES.some((p) => p.id === v)) return v;
  } catch { /* storage unavailable */ }
  return "blush";
}

function savePalette(v: string) {
  try { localStorage.setItem(PALETTE_KEY, v); } catch { /* storage unavailable */ }
}

/* ── glass filter (port of LiquidGlass.astro) ── */
const enc = (s: string) => "data:image/svg+xml;utf8," + encodeURIComponent(s);
function dispMap(w: number, h: number, r: number, d: number) {
  return enc(`<svg height="${h}" width="${w}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><style>.mix{mix-blend-mode:screen}</style><defs><linearGradient id="Y" x1="0" x2="0" y1="${Math.ceil(r / h * 15)}%" y2="${Math.floor(100 - r / h * 15)}%"><stop offset="0%" stop-color="#0F0"/><stop offset="100%" stop-color="#000"/></linearGradient><linearGradient id="X" x1="${Math.ceil(r / w * 15)}%" x2="${Math.floor(100 - r / w * 15)}%" y1="0" y2="0"><stop offset="0%" stop-color="#F00"/><stop offset="100%" stop-color="#000"/></linearGradient></defs><rect x="0" y="0" height="${h}" width="${w}" fill="#808080"/><g filter="blur(2px)"><rect x="0" y="0" height="${h}" width="${w}" fill="#000080"/><rect x="0" y="0" height="${h}" width="${w}" fill="url(#Y)" class="mix"/><rect x="0" y="0" height="${h}" width="${w}" fill="url(#X)" class="mix"/><rect x="${d}" y="${d}" height="${h - 2 * d}" width="${w - 2 * d}" fill="#808080" rx="${r}" ry="${r}" filter="blur(${d}px)"/></g></svg>`);
}
function dispFilter(w: number, h: number, r: number, d: number, s: number, cab: number) {
  const ch = (k: number, m: string) => `<feDisplacementMap in="SourceGraphic" in2="map" scale="${s + cab * k}" xChannelSelector="R" yChannelSelector="G"/><feColorMatrix type="matrix" values="${m}" result="c${k}"/>`;
  return enc(`<svg height="${h}" width="${w}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="displace" color-interpolation-filters="sRGB"><feImage x="0" y="0" height="${h}" width="${w}" href="${dispMap(w, h, r, d)}" result="map"/>${ch(2, "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0")}${ch(1, "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0")}${ch(0, "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0")}<feBlend in="c2" in2="c1" mode="screen"/><feBlend in2="c0" mode="screen"/></filter></defs></svg>`) + "#displace";
}
const supportsUrl = (() => {
  if (typeof document === "undefined") return false;
  const t = document.createElement("div");
  t.style.cssText = "backdrop-filter:url(#t)";
  return /url/.test(t.style.backdropFilter);
})();

/* the quality level this device settled on is remembered for a day, so the next page starts there */
const LEVEL_KEY = "baka-glass-level";
function readLevel(): number {
  try {
    const v = JSON.parse(localStorage.getItem(LEVEL_KEY) || "null");
    if (v && Date.now() - v.at < 864e5) return Math.max(0, Math.min(4, v.level | 0));
  } catch { /* storage unavailable */ }
  return 0;
}
function saveLevel(level: number) {
  try { localStorage.setItem(LEVEL_KEY, JSON.stringify({ level, at: Date.now() })); } catch { /* storage unavailable */ }
}

let glassPlain = false;
/** Switch every glass surface on the page between the refraction filter and a plain frosted blur. */
export function setGlassPlain(v: boolean) {
  if (glassPlain === v) return;
  glassPlain = v;
  document.querySelectorAll<HTMLElement>("[data-glass]").forEach(drawGlass);
}

export function drawGlass(g: HTMLElement) {
  const box = g.querySelector<HTMLElement>(":scope > .gh-flt > .gh-box");
  if (!box) return;
  const w = Math.round(g.offsetWidth), h = Math.round(g.offsetHeight);
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0, w / 2, h / 2);
  const d = +(g.dataset.depth || 10), s = +(g.dataset.strength || 100), cab = +(g.dataset.cab || 0);
  const btn = g.hasAttribute("data-btn"), sat = btn ? 1.2 : 1.5, bri = btn ? 1.6 : 1.1;
  const img = g.querySelector<HTMLImageElement>(":scope > .gh-inner img");
  if (img && img.getAttribute("src")) { img.style.width = w + "px"; img.style.height = w + "px"; }
  const plain = glassPlain || (LITE && g.hasAttribute("data-strength"));
  if (supportsUrl && !plain) {
    const fr = +(g.dataset.blur || 0);
    box.style.backdropFilter = `blur(${fr / 2}px) url('${dispFilter(w, h, r, d, s, cab)}') blur(${fr}px) brightness(${bri}) saturate(${sat})`;
  } else {
    const br = Math.min(Math.round(w / 10), 14), sat2 = plain ? 130 : 180;
    box.style.setProperty("-webkit-backdrop-filter", `blur(${br}px) saturate(${sat2}%)`);
    box.style.backdropFilter = `blur(${br}px) saturate(${sat2}%)`;
    if (img && img.getAttribute("src")) img.style.filter = `blur(${w / 50}px) saturate(180%)`;
  }
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a: number[]) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

function loseContext(c: HTMLCanvasElement) {
  try {
    const gl = c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { /* ignore */ }
}

/* ── backdrop: one per page, shared by every screen ── */
type Backdrop = { setPalette(n: string): void };
let activeBackdrop: Backdrop | null = null;

const fluidColorsFor = (w: GlassWindow, n: string) => {
  const P = w.FlowGlass?.COLORS[n] || w.FlowGlass?.COLORS.blush;
  if (!P) return [];
  return [P.light, P.mid, mix(P.light, "#ffffff", 0.55), mix(P.mid, P.light, 0.5)];
};

export function mountBackdrop(bd: HTMLElement): () => void {
  const w = window as GlassWindow;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = innerWidth < 700;
  let disposed = false;
  let flow: Engine | null = null, fluid: Engine | null = null;
  const canvases: HTMLCanvasElement[] = [];
  const layer = () => { const c = document.createElement("canvas"); bd.appendChild(c); canvases.push(c); return c; };
  /* adaptive-quality state (see the monitor below); start from the level this device settled on before */
  let level = readLevel(), slow = 0, good = 0, mraf = 0, mLast = 0;
  if (level >= 1) setGlassPlain(true);

  const api: Backdrop = {
    setPalette(n) { flow?.palette?.(n); fluid?.colors?.(fluidColorsFor(w, n)); },
  };
  activeBackdrop = api;

  (async () => {
    try {
      const pal = readPalette();
      await loadScript(BASE + "flow-glass.js");
      if (disposed || !w.FlowGlass) return;
      flow = w.FlowGlass.create(layer(), LITE ? { palette: pal, scale: 0.32 } : { palette: pal, scale: small ? 0.45 : 0.55 });
      if (!flow) return;
      if (level >= 2) flow.setScale?.(0.24);
      if (level >= 4) flow.setFps?.(30);
      bd.classList.add("on");
      document.dispatchEvent(new CustomEvent("glass:ready"));
      if (still) { flow.draw?.(); return; }
      flow.start();
      if (level >= 3) { window.setTimeout(startMonitor, 1200); return; }
      await loadScript(BASE + "fluid.js");
      if (disposed || !w.FluidBG) return;
      fluid = w.FluidBG.create(layer(), LITE ? {
        colors: fluidColorsFor(w, readPalette()), intensity: 0.22, dither: BASE + "LDR_LLL1_0.png", maxPixelRatio: 0.5, initialSplats: 4, ambient: 3.2, maxDt: 0.034,
        config: { TRANSPARENT: true, DYE_RESOLUTION: 256, SIM_RESOLUTION: 64, PRESSURE_ITERATIONS: 12, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.26, SPLAT_FORCE: 5200, BLOOM_ITERATIONS: 4, BLOOM_RESOLUTION: 128, BLOOM_INTENSITY: 0.6, BLOOM_THRESHOLD: 0.45, SUNRAYS: false, COLOR_UPDATE_SPEED: 4 },
      } : {
        colors: fluidColorsFor(w, readPalette()), intensity: 0.2, dither: BASE + "LDR_LLL1_0.png", maxPixelRatio: 1, initialSplats: 5, ambient: 2.4,
        config: { TRANSPARENT: true, DYE_RESOLUTION: small ? 512 : 768, SIM_RESOLUTION: 128, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.22, SPLAT_FORCE: 5200, BLOOM_INTENSITY: 0.55, BLOOM_THRESHOLD: 0.45, SUNRAYS_WEIGHT: 0.9, COLOR_UPDATE_SPEED: 4 },
      });
      fluid.start();
      window.setTimeout(startMonitor, 1200); /* let the first frames and shader compiles settle */
    } catch {
      /* no WebGL or a script failed: the still image stays, the page keeps working */
    }
  })();

  /* pointer: parallax of the whole backdrop, waves bend, fluid follows; tap on empty space bursts light */
  let tx = 0, ty = 0, px = 0, py = 0, raf = 0;
  const loop = () => {
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    bd.style.transform = `translate3d(${px.toFixed(2)}px,${py.toFixed(2)}px,0)`;
    /* stop once settled; the next pointer move starts it again */
    raf = Math.abs(tx - px) > 0.05 || Math.abs(ty - py) > 0.05 ? requestAnimationFrame(loop) : 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!TOUCH) {
      tx = (e.clientX / innerWidth - 0.5) * -24;
      ty = (e.clientY / innerHeight - 0.5) * -18;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    flow?.pointer(e.clientX, e.clientY, 0);
    fluid?.pointer(e.clientX, e.clientY);
  };
  /* adaptive quality: watch the real frame rate and step down until motion is fluid.
     1 plain frosted glass instead of the refraction filter → 2 waves at lower resolution →
     3 drop the fluid layer → 4 waves at an even 30 fps. */
  const deltas: number[] = [];
  function stepDown() {
    level++;
    saveLevel(level);
    if (level === 1) setGlassPlain(true);
    else if (level === 2) flow?.setScale?.(0.24);
    else if (level === 3) {
      if (fluid) { fluid.destroy?.(); const c = canvases.pop(); c?.remove(); fluid = null; }
    } else if (level === 4) flow?.setFps?.(30);
  }
  function monitor(ts: number) {
    if (disposed) return;
    if (mLast && !document.hidden) {
      const d = ts - mLast;
      if (d < 250) deltas.push(d);
    }
    mLast = ts;
    if (deltas.length >= 60) {
      const fps = 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length);
      deltas.length = 0;
      /* clearly too slow: step at once; borderline: only after two windows in a row */
      if (fps < 40) { slow = 0; good = 0; stepDown(); }
      else if (fps < 50) { slow++; good = 0; if (slow >= 2) { slow = 0; stepDown(); } }
      else { good++; slow = 0; }
      if (level >= 4 || good >= 4) return; /* settled */
    }
    mraf = requestAnimationFrame(monitor);
  }
  function startMonitor() { if (!mraf && !still) { mLast = 0; mraf = requestAnimationFrame(monitor); } }
  const onDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    const empty = t === document.body || t.classList.contains("app-shell") || t.classList.contains("glass-home") || t.classList.contains("gh-col");
    if (empty) fluid?.tap?.(e.clientX, e.clientY);
  };
  const onVis = () => {
    if (document.hidden) { flow?.stop(); fluid?.stop(); }
    else if (!still) { flow?.start(); fluid?.start(); }
  };
  if (!still) {
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown);
  }
  document.addEventListener("visibilitychange", onVis);

  return () => {
    disposed = true;
    if (activeBackdrop === api) activeBackdrop = null;
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onDown);
    cancelAnimationFrame(mraf);
    document.removeEventListener("visibilitychange", onVis);
    cancelAnimationFrame(raf);
    flow?.stop();
    fluid?.destroy?.();
    canvases.forEach((c) => { loseContext(c); c.remove(); });
    bd.classList.remove("on");
    flow = fluid = null;
  };
}

/* ── homepage glass: refracting slabs/pills and the palette dock ── */
export function mountGlassHome(root: HTMLElement): () => void {
  const w = window as GlassWindow;
  let disposed = false;
  const glasses = Array.from(root.querySelectorAll<HTMLElement>("[data-glass]"));
  const ro = new ResizeObserver((es) => es.forEach((e) => drawGlass(e.target as HTMLElement)));
  glasses.forEach((g) => { ro.observe(g); drawGlass(g); });

  function renderThumbs() {
    if (disposed || !w.FlowGlass) return;
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed;left:-9999px;top:0;width:480px;height:300px";
    document.body.appendChild(c);
    let t: Engine | null = null;
    try { t = w.FlowGlass.create(c, { scale: 1, still: true }); } catch { t = null; }
    const out = document.createElement("canvas"); out.width = out.height = 96;
    const ox = out.getContext("2d");
    root.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach((b) => {
      const g = b.querySelector<HTMLElement>("[data-glass]"), inner = g?.querySelector<HTMLElement>(".gh-inner"), img = inner?.querySelector("img");
      if (!g || !inner || !img) return;
      if (t && ox) {
        t.palette?.(b.dataset.palette || "blush");
        ox.drawImage(c, 230, 110, 120, 120, 0, 0, 96, 96);
        img.src = out.toDataURL("image/jpeg", 0.85);
      } else img.src = BASE + "bg-flow.jpg";
      inner.style.display = "block";
      img.style.width = img.style.height = "100%";
      img.style.objectFit = "cover";
      drawGlass(g);
    });
    loseContext(c);
    c.remove();
  }
  loadScript(BASE + "flow-glass.js").then(renderThumbs).catch(() => {});

  function setPaletteUI(n: string) {
    root.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach((b) => {
      const on = b.dataset.palette === n;
      b.setAttribute("aria-pressed", String(on));
      const box = b.querySelector(".gh-box");
      if (box) box.className = "gh-box " + (on ? "white" : "clear");
    });
  }
  setPaletteUI(readPalette());

  const onPick = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-palette]");
    if (!b || !b.dataset.palette) return;
    savePalette(b.dataset.palette);
    setPaletteUI(b.dataset.palette);
    activeBackdrop?.setPalette(b.dataset.palette);
  };
  root.addEventListener("click", onPick);

  return () => {
    disposed = true;
    ro.disconnect();
    root.removeEventListener("click", onPick);
  };
}
