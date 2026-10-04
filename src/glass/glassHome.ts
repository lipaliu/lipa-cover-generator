/* Behaviour for the liquid-glass homepage (see components/GlassHome.tsx).
   - Glass: SVG displacement map + per-channel chromatic aberration used as backdrop-filter,
     ported from nikdelvin/liquid-glass (MIT, commit 4925186; licence in public/glass/licenses).
     Chromium shows the refraction; Safari/Firefox fall back to a plain frosted blur.
   - Background: our flowing-glass shader (public/glass/flow-glass.js) with a transparent layer of
     PavelDoGreat/WebGL-Fluid-Simulation (MIT, commit a2d2929; adapted in public/glass/fluid.js)
     on top: the pointer drags glowing fluid, wisps drift in on their own, a tap bursts light.
   Plain DOM/WebGL work, mounted from a React effect and fully cleaned up on unmount. */

type Engine = {
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

function drawGlass(g: HTMLElement) {
  const box = g.querySelector<HTMLElement>(":scope > .gh-flt > .gh-box");
  if (!box) return;
  const w = Math.round(g.offsetWidth), h = Math.round(g.offsetHeight);
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0, w / 2, h / 2);
  const d = +(g.dataset.depth || 10), s = +(g.dataset.strength || 100), cab = +(g.dataset.cab || 0);
  const btn = g.hasAttribute("data-btn"), sat = btn ? 1.2 : 1.5, bri = btn ? 1.6 : 1.1;
  const img = g.querySelector<HTMLImageElement>(":scope > .gh-inner img");
  if (img && img.getAttribute("src")) { img.style.width = w + "px"; img.style.height = w + "px"; }
  if (supportsUrl) {
    const fr = +(g.dataset.blur || 0);
    box.style.backdropFilter = `blur(${fr / 2}px) url('${dispFilter(w, h, r, d, s, cab)}') blur(${fr}px) brightness(${bri}) saturate(${sat})`;
  } else {
    box.style.setProperty("-webkit-backdrop-filter", `blur(${Math.round(w / 10)}px) saturate(180%)`);
    box.style.backdropFilter = `blur(${Math.round(w / 10)}px) saturate(180%)`;
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

export function mountGlassHome(root: HTMLElement): () => void {
  const w = window as GlassWindow;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = innerWidth < 700;
  const bd = root.querySelector<HTMLElement>(".gh-bd");
  let disposed = false;
  let pal = readPalette();
  let flow: Engine | null = null, fluid: Engine | null = null;
  const canvases: HTMLCanvasElement[] = [];

  /* glass */
  const glasses = Array.from(root.querySelectorAll<HTMLElement>("[data-glass]"));
  const ro = new ResizeObserver((es) => es.forEach((e) => drawGlass(e.target as HTMLElement)));
  glasses.forEach((g) => { ro.observe(g); drawGlass(g); });

  const layer = () => {
    const c = document.createElement("canvas");
    bd?.appendChild(c);
    canvases.push(c);
    return c;
  };
  const fluidColors = (n: string) => {
    const P = w.FlowGlass?.COLORS[n] || w.FlowGlass?.COLORS.blush;
    if (!P) return [];
    return [P.light, P.mid, mix(P.light, "#ffffff", 0.55), mix(P.mid, P.light, 0.5)];
  };

  /* dock thumbnails: one still frame of each palette, cropped */
  function renderThumbs() {
    if (!w.FlowGlass) return;
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

  function setPaletteUI(n: string) {
    root.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach((b) => {
      const on = b.dataset.palette === n;
      b.setAttribute("aria-pressed", String(on));
      const box = b.querySelector(".gh-box");
      if (box) box.className = "gh-box " + (on ? "white" : "clear");
    });
  }
  setPaletteUI(pal);

  const onPick = (e: Event) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-palette]");
    if (!b || !b.dataset.palette) return;
    pal = b.dataset.palette;
    savePalette(pal);
    setPaletteUI(pal);
    flow?.palette?.(pal);
    fluid?.colors?.(fluidColors(pal));
  };
  root.addEventListener("click", onPick);

  /* background */
  (async () => {
    try {
      await loadScript(BASE + "flow-glass.js");
      if (disposed || !bd || !w.FlowGlass) return;
      flow = w.FlowGlass.create(layer(), { palette: pal, scale: small ? 0.45 : 0.55 });
      if (!flow) return;
      bd.classList.add("on");
      renderThumbs();
      if (still) { flow.draw?.(); return; }
      flow.start();
      await loadScript(BASE + "fluid.js");
      if (disposed || !w.FluidBG) return;
      fluid = w.FluidBG.create(layer(), {
        colors: fluidColors(pal), intensity: 0.2, dither: BASE + "LDR_LLL1_0.png", maxPixelRatio: 1, initialSplats: 5, ambient: 2.4,
        config: { TRANSPARENT: true, DYE_RESOLUTION: small ? 512 : 768, SIM_RESOLUTION: 128, DENSITY_DISSIPATION: 1.4, VELOCITY_DISSIPATION: 0.35, CURL: 24, SPLAT_RADIUS: 0.22, SPLAT_FORCE: 5200, BLOOM_INTENSITY: 0.55, BLOOM_THRESHOLD: 0.45, SUNRAYS_WEIGHT: 0.9, COLOR_UPDATE_SPEED: 4 },
      });
      fluid.start();
    } catch {
      /* no WebGL or a script failed: the still image behind stays, the page keeps working */
    }
  })();

  /* pointer: parallax of the whole backdrop, waves bend, fluid follows */
  let tx = 0, ty = 0, px = 0, py = 0, raf = 0;
  const onMove = (e: PointerEvent) => {
    tx = (e.clientX / innerWidth - 0.5) * -24;
    ty = (e.clientY / innerHeight - 0.5) * -18;
    flow?.pointer(e.clientX, e.clientY, 0);
    fluid?.pointer(e.clientX, e.clientY);
  };
  const loop = () => {
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    if (bd) bd.style.transform = `translate3d(${px.toFixed(2)}px,${py.toFixed(2)}px,0)`;
    raf = requestAnimationFrame(loop);
  };
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, label, textarea, select, .site-header, .gh-dock")) return;
    fluid?.tap?.(e.clientX, e.clientY);
  };
  const onVis = () => {
    if (document.hidden) { flow?.stop(); fluid?.stop(); }
    else if (!still) { flow?.start(); fluid?.start(); }
  };
  if (!still) {
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown);
    raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", onVis);

  return () => {
    disposed = true;
    ro.disconnect();
    root.removeEventListener("click", onPick);
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onDown);
    document.removeEventListener("visibilitychange", onVis);
    cancelAnimationFrame(raf);
    flow?.stop();
    fluid?.destroy?.();
    canvases.forEach((c) => { loseContext(c); c.remove(); });
    bd?.classList.remove("on");
    flow = fluid = null;
  };
}
