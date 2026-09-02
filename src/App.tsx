import {
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  LoaderCircle,
  Minus,
  Plus,
  Sparkles,
  Square,
  Type,
  Upload,
  Palette,
  Settings2,
  History,
  Trash2,
  Archive,
  RectangleHorizontal,
  RectangleVertical,
  SquareIcon,
  RotateCw,
  LogOut,
  ShieldCheck,
  Home,
  Heart,
  Copy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { deleteHistoryBatch, getHistory, saveHistoryBatch } from "./lib/history";
import { downloadImageUrl, exportImageUrl, fileToDownscaledDataUrl, formatTime, urlToDataUrl } from "./lib/image";
import type { CoverResult, CoverPlan, GenerateEvent, HistoryBatch, ImageEngine, TitlePlan } from "./lib/types";
import { LoginModal } from "./components/LoginModal";
import { CreditsBadge } from "./components/CreditsBadge";
import { RechargeModal } from "./components/RechargeModal";
import { fetchMe, logout as apiLogout, getToken, getCreditsCost, fetchBalance, generateTitlePlans, type UserInfo } from "./lib/api";
import "./components/auth-styles.css";

/* ─── Constants ─── */
const allEngineOptions: Array<{
  id: ImageEngine;
  title: string;
  vendor: string;
  description: string;
}> = [
  { id: "image2", title: "Image2", vendor: "OpenAI", description: "设计师风格，精细，目前最好的生图模型" },
  { id: "seedream", title: "Seedream", vendor: "火山·豆包", description: "快速，准确" },
  { id: "seedance", title: "SeeDance", vendor: "即梦", description: "复用本机即梦账号积分" },
];

// 私有实例模式：本机访问，或构建时设了 VITE_LOCAL_MODE=1（如自用的公网隧道/私有部署，
// 已有访问口令保护）。此模式下免登录、不计积分。
/* ─── 风格定制的预览卡样式（美图/滤镜式，可视化选择）─── */
// 字体预览：用系统近似字体渲染示例字，感受字形气质
const FONT_PREVIEW: Record<string, { style: CSSProperties; sample?: string; dark?: boolean }> = {
  A1: { style: { fontFamily: '"Xingkai SC","Kaiti SC",cursive', fontWeight: 900 } },
  A2: { style: { fontFamily: '"Xingkai SC","Kaiti SC",cursive', fontWeight: 600 } },
  A3: { style: { fontFamily: '"Songti SC","STSong",serif', fontWeight: 700 } },
  A4: { style: { fontFamily: '"PingFang SC",sans-serif', fontWeight: 900 } },
  A5: { style: { fontFamily: '"Yuanti SC","PingFang SC",sans-serif', fontWeight: 700 } },
  A6: { style: { fontFamily: '"Hannotate SC","Kaiti SC",cursive', fontWeight: 500 } },
  A7: { style: { fontFamily: 'Didot,"Times New Roman",serif', fontWeight: 700 }, sample: "Aa" },
  A8: { style: { fontFamily: '"Avenir Next","Helvetica Neue",sans-serif', fontWeight: 800 }, sample: "Aa" },
  A10: { style: { fontFamily: 'Luminari,fantasy', fontWeight: 700 }, sample: "Aa", dark: true },
  A11: { style: { fontFamily: 'Copperplate,serif', fontWeight: 700, letterSpacing: 2 }, sample: "Aa" },
  A12: { style: { fontFamily: '"PingFang SC",sans-serif', fontWeight: 200, letterSpacing: 4 } },
  A13: { style: { fontFamily: '"PingFang SC",sans-serif', fontWeight: 900 } },
  A14: { style: { fontFamily: '"PingFang SC",sans-serif', fontWeight: 700, color: "#7ff0ff", textShadow: "0 0 6px #22d3ee, 0 0 14px #a78bfa" }, dark: true },
  A15: { style: { fontFamily: '"Xingkai SC","Kaiti SC",cursive', fontWeight: 900, fontStyle: "italic" } },
  A16: { style: { fontFamily: '"Snell Roundhand","Hannotate SC",cursive', fontWeight: 600 }, sample: "Aa" },
  A18: { style: { fontFamily: '"Songti SC",serif', fontWeight: 900, color: "#C0392B" } },
  A19: { style: { fontFamily: '"Courier New",monospace', fontWeight: 700 }, sample: "Aa" },
};
// 色彩风格预览：三色条
const PALETTE_PREVIEW: Record<string, string[]> = {
  D1: ["#111111", "#FFFFFF", "#9ca3af"],
  D2: ["#1A1A1A", "#D4AF37", "#8a6d1f"],
  D3: ["#FFFFFF", "#C0C0C0", "#8e959c"],
  D4: ["#A8998C", "#B5C4B1", "#C4A882"],
  D5: ["#FF00FF", "#00FFFF", "#39FF14"],
  D6: ["#8B6914", "#654321", "#2E4A1E"],
  D7: ["#003366", "#0077B6", "#90E0EF"],
  D8: ["#FF6B35", "#FFB347", "#FF1744"],
  D9: ["#1B4332", "#40916C", "#95D5B2"],
  D10: ["#7B2D8B", "#B388FF", "#E1BEE7"],
  D11: ["#FF6B6B", "#4ECDC4", "#FFE66D"],
  D12: ["#0d1b2a", "#415a77", "#a9bcd0"],
  D13: ["#E63946", "#2A9D8F", "#F4A261"],
  D14: ["#e5e7eb", "#1f2937", "#FF3B30"],
  D15: ["#E8D5B7", "#C9956B", "#7d8c6f"],
  D16: ["#FFDE00", "#FFF176", "#F57F17"],
  D17: ["#FF6B6B", "#FFB4B4", "#FFFFFF"],
  D18: ["#00D4FF", "#E3F2FD", "#0D47A1"],
  D19: ["#6F4E37", "#C68642", "#F5DEB3"],
  D20: ["#FFB7C5", "#FFF0F5", "#8B4513"],
};
// 文字效果预览：给示例字上效果
const EFFECT_PREVIEW: Record<string, { style: CSSProperties; dark?: boolean }> = {
  C1: { style: { color: "#241a3d", fontWeight: 800 } },
  C2: { style: { color: "transparent", WebkitTextStroke: "2px #241a3d", fontWeight: 900 } },
  C3: { style: { background: "linear-gradient(180deg,#f472b6,#60a5fa)", WebkitBackgroundClip: "text", color: "transparent", fontWeight: 900 } },
  C4: { style: { color: "#fff", textShadow: "3px 3px 0 #7c69f6", fontWeight: 900 } },
  C5: { style: { color: "#7ff0ff", textShadow: "0 0 8px #22d3ee, 0 0 16px #a78bfa", fontWeight: 800 }, dark: true },
  C6: { style: { background: "rgba(255,255,255,0.6)", padding: "2px 9px", borderRadius: 6, fontWeight: 800, color: "#241a3d" } },
  C7: { style: { background: "#241a3d", color: "#fff", padding: "2px 9px", borderRadius: 4, fontWeight: 800 } },
  C8: { style: { color: "rgba(36,26,61,0.38)", fontWeight: 900 } },
  C9: { style: { background: "linear-gradient(180deg,#fde68a,#b45309)", WebkitBackgroundClip: "text", color: "transparent", fontWeight: 900 } },
  C10: { style: { color: "rgba(255,255,255,0.9)", textShadow: "0 2px 4px rgba(0,0,0,0.35)", fontWeight: 800 }, dark: true },
  C11: { style: { fontFamily: '"Hannotate SC","Kaiti SC",cursive', textDecorationLine: "underline", textDecorationStyle: "wavy", textDecorationColor: "#f43f5e", fontWeight: 600, color: "#241a3d" } },
  C12: { style: { background: "#fff", border: "2px solid #241a3d", padding: "1px 8px", borderRadius: 8, boxShadow: "2px 2px 0 rgba(0,0,0,0.25)", fontWeight: 800, color: "#241a3d" } },
  C13: { style: { color: "#C0392B", border: "2px solid #C0392B", padding: "1px 7px", borderRadius: 4, transform: "rotate(-6deg)", fontWeight: 900 } },
  C14: { style: { background: "#fff", padding: "2px 9px", clipPath: "polygon(0 10%, 100% 0, 95% 100%, 5% 90%)", fontWeight: 800, color: "#241a3d" } },
};
// 装饰预览：符号示意
const DECOR_GLYPH: Record<string, string> = {
  E1: "·", E2: "▭", E3: "▬", E4: "◦◦", E5: "◤", E6: "✂️", E7: "🏷️", E8: "📮", E9: "📄", E10: "▦",
  E11: "◎", E12: "✨", E13: "〰️", E14: "➜", E15: "01", E16: "✏️", E17: "🌿", E18: "▒", E19: "☀️", E20: "💬",
  E21: "⸬", E22: "🖼️", E23: "「」",
};
// 整体风格预览：底色 + 示例字气质
const MOOD_PREVIEW: Record<string, { bg: string; style: CSSProperties; sample?: string }> = {
  G1: { bg: "linear-gradient(160deg,#f4f4f5,#d4d4d8)", style: { color: "#27272a", fontWeight: 300, letterSpacing: 3 } },
  G2: { bg: "linear-gradient(160deg,#ffedd5,#fdba74)", style: { color: "#7c2d12", fontWeight: 700 } },
  G3: { bg: "linear-gradient(135deg,#facc15,#fb7185)", style: { color: "#1e1b4b", fontWeight: 900 } },
  G4: { bg: "linear-gradient(160deg,#18181b,#3f3f46)", style: { color: "#e4e4e7", fontWeight: 800 } },
  G5: { bg: "linear-gradient(160deg,#ecfeff,#d9f99d)", style: { color: "#155e75", fontWeight: 400 } },
  G6: { bg: "linear-gradient(160deg,#d9c8a3,#a3876a)", style: { color: "#4a2c17", fontFamily: '"Songti SC",serif', fontWeight: 700 } },
  G7: { bg: "linear-gradient(160deg,#0f172a,#1d4ed8)", style: { color: "#67e8f9", fontWeight: 700 } },
  G8: { bg: "linear-gradient(160deg,#dcfce7,#86efac)", style: { color: "#14532d", fontWeight: 500 } },
  G9: { bg: "linear-gradient(160deg,#141414,#3b2f14)", style: { color: "#D4AF37", fontFamily: '"Songti SC",serif', fontWeight: 700 } },
  G10: { bg: "linear-gradient(135deg,#fda4af,#fde047)", style: { color: "#831843", fontWeight: 800 } },
  G11: { bg: "linear-gradient(160deg,#1c1917,#44403c)", style: { color: "#fafaf9", fontFamily: '"Songti SC",serif', fontWeight: 300, letterSpacing: 5 }, sample: "电影节" },
  G12: { bg: "linear-gradient(160deg,#111827,#7f1d1d)", style: { color: "#facc15", fontWeight: 900, WebkitTextStroke: "1px #fff" }, sample: "小Lin" },
};

const isLocalLipa =
  import.meta.env.VITE_LOCAL_MODE === "1" ||
  (typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));

// 即梦(SeeDance)是本机 CLI：只有开发、真·本机、或构建时显式设了 VITE_ENABLE_SEEDANCE=1
// （本地隧道分享时）才显示。云端没有 CLI，自动隐藏，只剩 Image2 + Seedream。
const enableSeedance =
  import.meta.env.DEV ||
  import.meta.env.VITE_ENABLE_SEEDANCE === "1" ||
  (typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname));
const engineOptions = enableSeedance
  ? allEngineOptions
  : allEngineOptions.filter((e) => e.id !== "seedance");

type AspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "bilibili-safe";

const ratioOptions: Array<{
  id: AspectRatio;
  label: string;
  desc: string;
  w: number;
  h: number;
  icon: "landscape" | "portrait" | "square";
}> = [
  { id: "3:4", label: "小红书封面", desc: "3:4 竖版主力", w: 3, h: 4, icon: "portrait" },
  { id: "9:16", label: "竖版长图", desc: "9:16 全面屏", w: 9, h: 16, icon: "portrait" },
  { id: "bilibili-safe", label: "B站封面（安全框）", desc: "16:9 出图·核心居中防裁切", w: 16, h: 9, icon: "landscape" },
  { id: "16:9", label: "横版 16:9", desc: "环境延展宽屏", w: 16, h: 9, icon: "landscape" },
  { id: "4:3", label: "横版 4:3", desc: "环境延展经典", w: 4, h: 3, icon: "landscape" },
  { id: "1:1", label: "方形 1:1", desc: "通用方形", w: 1, h: 1, icon: "square" },
];

type RatioSelection = Record<AspectRatio, number>; // 0 = not selected, 1-8 = count

type Step = 1 | 2 | 3 | 4;
type RunState = "idle" | "analyzing" | "planning" | "generating" | "done" | "error";

/* ─── Utilities ─── */
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizeStoredEngine(value?: string | null): ImageEngine {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "seedance" || normalized === "jimeng" || normalized === "dreamina") return "seedance";
  if (normalized === "seedream" || normalized === "ark" || normalized === "doubao") return "seedream";
  return "image2";
}

// 引擎短标签（逐张选择器 / 封面角标用）。
function engineShortLabel(id?: ImageEngine | string | null): string {
  if (id === "seedance") return "即梦";
  if (id === "seedream") return "Seedream";
  return "Image2";
}

// 横构图（缩略图按真实比例完整显示，横竖分排）。
const LANDSCAPE_RATIOS = new Set(["16:9", "4:3", "bilibili-safe"]);
function isLandscapeRatio(ratio?: string): boolean {
  return !!ratio && LANDSCAPE_RATIOS.has(ratio);
}
function ratioAspectCss(ratio?: string): string {
  switch (ratio) {
    case "16:9":
    case "bilibili-safe": return "16 / 9";
    case "4:3": return "4 / 3";
    case "1:1": return "1 / 1";
    case "9:16": return "9 / 16";
    default: return "3 / 4";
  }
}

async function readSseStream(response: Response, onEvent: (event: GenerateEvent) => void) {
  if (!response.body) throw new Error("浏览器没有返回可读取的数据流。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.replace(/^data:\s?/u, "");
      onEvent(JSON.parse(json) as GenerateEvent);
    }
  }
}

function fillMissingResults(results: CoverResult[], total: number): CoverResult[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return Array.from({ length: total }, (_, i) => {
    const id = i + 1;
    return byId.get(id) || { id, combination: "missing", label: "未返回", error: "未返回结果" };
  });
}

/* ─── Color Analysis ─── */
function readableHex(v: number) {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase();
}

async function analyzePaletteFromDataUrl(dataUrl: string): Promise<{ dominant: string; imageColors: string[] }> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("image load failed"));
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(image, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  let r = 0, g = 0, b = 0, count = 0;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 16) {
    if (pixels[i + 3] < 180) continue;
    const pr = pixels[i], pg = pixels[i + 1], pb = pixels[i + 2];
    r += pr; g += pg; b += pb; count++;
    const key = `${Math.round(pr / 32) * 32}-${Math.round(pg / 32) * 32}-${Math.round(pb / 32) * 32}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++; bucket.r += pr; bucket.g += pg; bucket.b += pb;
    buckets.set(key, bucket);
  }
  if (count === 0) return { dominant: "#6F7C79", imageColors: ["#6F7C79", "#FFFFFF", "#FFE15A", "#FF4FA3"] };
  const dominant = `#${readableHex(r / count)}${readableHex(g / count)}${readableHex(b / count)}`;
  const imageColors = Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .map((bk) => `#${readableHex(bk.r / bk.count)}${readableHex(bk.g / bk.count)}${readableHex(bk.b / bk.count)}`)
    .slice(0, 5);
  return { dominant, imageColors: [...new Set([dominant, ...imageColors])].slice(0, 5) };
}

/* ─── Main App ─── */
export function App() {
  const [step, setStep] = useState<Step>(1);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);

  // 收藏夹：本机持久化（localStorage）。每个收藏存缩略图 + 它的风格组合，用来在收藏夹里回看，
  // 并统计「你最常收藏的字体/配色/排版…」，自动把这些选项在风格定制里往前排。
  // 收藏时把这张的"生成上下文"（底图/文案/设置）一并存下，打开时还原，编辑才不会串用当前界面的图和字。
  type FavCtx = { image?: string; sourceMode: string; elementImages?: string[]; imageDescription?: string; inspiration?: string; title: string; subtitle: string; smartScene?: boolean };
  type FavItem = { favId: string; coverId: number; combination: string; label: string; ratio?: string; engine?: string; thumb: string; textColor?: string; ts: number; ctx?: FavCtx };
  const [favorites, setFavorites] = useState<FavItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("baka_favs") || "[]"); } catch { return []; }
  });
  const persistFavs = (next: FavItem[]) => {
    setFavorites(next);
    try { localStorage.setItem("baka_favs", JSON.stringify(next)); return; } catch { /* 太大，降级 */ }
    // localStorage 满了：丢掉所有收藏里重量级的底图/素材，只留缩略图和文字上下文，保证收藏本身不丢。
    try {
      const light = next.map((f) => (f.ctx ? { ...f, ctx: { ...f.ctx, image: undefined, elementImages: undefined } } : f));
      localStorage.setItem("baka_favs", JSON.stringify(light));
      setFavorites(light);
    } catch { /* 还是满就算了 */ }
  };
  // 把整图压成 ~240px 缩略图存起来（localStorage 有限，不能存原图）。
  const makeThumb = (dataUrl: string, max = 240): Promise<string> => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try { resolve(canvas.toDataURL("image/jpeg", 0.72)); } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
  const isFavorited = (coverId: number) => favorites.some((f) => f.coverId === coverId);
  const toggleFavorite = async (cover: CoverResult) => {
    if (isFavorited(cover.id)) {
      persistFavs(favorites.filter((f) => f.coverId !== cover.id));
      return;
    }
    if (!cover.image_url || !cover.combination) return;
    const thumb = await makeThumb(cover.image_url);
    // 抓这张的生成上下文（底图/文案/设置），底图/素材压到 ~1024px 省空间，供以后打开编辑用。
    let ctx: FavCtx | undefined;
    try {
      const c = await contextForCover(cover);
      const baseImg = c.image ? await makeThumb(c.image, 1024) : undefined;
      const els = c.elementImages ? await Promise.all(c.elementImages.map((d) => makeThumb(d, 1024))) : undefined;
      ctx = { image: baseImg, sourceMode: c.sourceMode, elementImages: els, imageDescription: c.imageDescription, inspiration: c.inspiration, title: c.title, subtitle: c.subtitle, smartScene: c.smartScene };
    } catch { ctx = undefined; }
    persistFavs([
      { favId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, coverId: cover.id, combination: cover.combination, label: cover.label, ratio: cover.ratio, engine: cover.engine, thumb, ts: Date.now(), ctx },
      ...favorites,
    ]);
  };
  // 从收藏里统计每个风格选项(id)被选中的次数 → 用来自动往前排。
  const styleTally = useMemo(() => {
    const t: Record<string, number> = {};
    for (const f of favorites) for (const id of String(f.combination || "").split("+")) if (id) t[id] = (t[id] || 0) + 1;
    return t;
  }, [favorites]);
  // 按收藏热度给某维度的选项排序（热门在前，其余保持原顺序）。
  const rankByFav = <T extends { id: string }>(opts: T[]): T[] =>
    [...opts].sort((a, b) => (styleTally[b.id] || 0) - (styleTally[a.id] || 0));

  // Auth state
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeInfo, setRechargeInfo] = useState({ required: 0, current: 0 });

  // Step 1: Image + Ratio
  type SourceMode = "base" | "elements" | "describe";
  const [sourceMode, setSourceMode] = useState<SourceMode>("base");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [elementImages, setElementImages] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [imageDescription, setImageDescription] = useState("");
  // 作者灵感（选填）：只控制"底图/场景怎么生"，直接交给大模型理解；花字排版不受影响。
  const [inspiration, setInspiration] = useState("");
  // 读懂标题去配场景（独立开关，任何风格都可搭）：开了才抠图主体 + 按标题含义合成匹配场景。
  const [smartScene, setSmartScene] = useState(false);
  // 当前登录账户是否是管理员（决定是否显示「管理后台」按钮）
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  useEffect(() => {
    fetch("/api/whoami")
      .then((r) => r.json())
      .then((d) => setIsAdminAccount(d?.role === "admin"))
      .catch(() => {});
  }, []);

  // 风格定制（都选填）：锁定字体 / 色彩风格 / 字体颜色；空 = 库内随机、AI 自选
  type StyleOpt = Array<{ id: string; name: string }>;
  const [styleOptions, setStyleOptions] = useState<{ fonts: StyleOpt; layouts: StyleOpt; effects: StyleOpt; colors: StyleOpt; decorations: StyleOpt; compositions: StyleOpt; moods: StyleOpt }>({ fonts: [], layouts: [], effects: [], colors: [], decorations: [], compositions: [], moods: [] });
  // 风格定制全部改为「多选」：每个维度是一组 id，选了多个 = 每张封面在这几个里随机取一个；空 = 库内随机。
  const [lockedFont, setLockedFont] = useState<string[]>([]);
  const [lockedLayout, setLockedLayout] = useState<string[]>([]);
  const [lockedEffect, setLockedEffect] = useState<string[]>([]);
  const [lockedColorScheme, setLockedColorScheme] = useState<string[]>([]);
  const [lockedDecoration, setLockedDecoration] = useState<string[]>([]);
  const [lockedComposition, setLockedComposition] = useState<string[]>([]);
  const [lockedMood, setLockedMood] = useState<string[]>([]);
  const [lockedTextColor, setLockedTextColor] = useState<string[]>([]);
  // 多选切换：点一次加入、再点一次移除。
  const toggleFrom = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  // 字体颜色自定义选色器的当前值（点「加入」才写进 lockedTextColor，避免拖动时狂加色）
  const [customColor, setCustomColor] = useState("#FFDE00");
  // 单张「换某一项」面板：哪张打开、选了哪个维度
  const [swapCoverId, setSwapCoverId] = useState<number | null>(null);
  const [swapDim, setSwapDim] = useState("");
  // 「调整」面板：累积要同时换的多个维度（维度字母 → 选项id）+ 字色，最后一起「应用」。
  const [pendingSwaps, setPendingSwaps] = useState<Record<string, string>>({});
  const [pendingTextColor, setPendingTextColor] = useState("");
  // ─── 任务队列：一次摆好多个独立任务（各自底图/标题/设置），排队自动一个接一个跑完，出多组图 ───
  // 封面统一存进主 results（用 cover.group = task.id 标记属于哪一批），所以队列里的每张封面
  // 和普通封面一样都能单独调整。任务本身只存状态/元信息。
  type QueueTask = {
    id: string; idBase: number; label: string; payload: Record<string, unknown>;
    publishTitle?: string; publishPlatform?: "xiaohongshu" | "douyin"; coverTitle?: string; coverSubtitle?: string;
    status: "pending" | "running" | "done" | "error"; total: number; errorMsg?: string;
  };
  const [queue, setQueue] = useState<QueueTask[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  // 少出图时的说明（比如底图被安全系统拒了）——不再让失败的封面悄悄消失、用户干瞪眼。
  const [shortfallNote, setShortfallNote] = useState<string | null>(null);
  const queueAbortRef = useRef<AbortController | null>(null);
  const queueIdBaseRef = useRef(200000); // 队列封面 id 基数（避开单次 1..N 与变体 100000+）
  useEffect(() => {
    fetch("/api/style-options")
      .then((r) => r.json())
      .then((d) => setStyleOptions({ fonts: d?.fonts || [], layouts: d?.layouts || [], effects: d?.effects || [], colors: d?.colors || [], decorations: d?.decorations || [], compositions: d?.compositions || [], moods: d?.moods || [] }))
      .catch(() => {});
  }, []);
  const presetTextColors = ["#FFFFFF", "#000000", "#FFDE00", "#FF7A00", "#FF3B30", "#FF4FA3", "#34C759", "#00C7BE", "#0A84FF", "#B388FF", "#8B5A2B", "#C0C0C0"];
  const [detectedColor, setDetectedColor] = useState("#6F7C79");
  const [imageColors, setImageColors] = useState<string[]>([]);
  const [ratioSelection, setRatioSelection] = useState<RatioSelection>({
    "16:9": 0, "4:3": 0, "1:1": 0, "3:4": 4, "9:16": 0, "bilibili-safe": 0,
  });

  // Step 2: Copy
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [titleAngle, setTitleAngle] = useState("");
  const [titlePlans, setTitlePlans] = useState<TitlePlan[]>([]);
  const [titlePlansLoading, setTitlePlansLoading] = useState(false);
  const [titlePlansError, setTitlePlansError] = useState("");
  const [selectedTitlePlan, setSelectedTitlePlan] = useState<number | null>(null);
  const [publishPlatform, setPublishPlatform] = useState<"xiaohongshu" | "douyin">("xiaohongshu");
  const [publishTitle, setPublishTitle] = useState("");
  const [deliveryCopied, setDeliveryCopied] = useState(false);

  // Step 3: Style
  const [engine, setEngine] = useState<ImageEngine>("image2");

  // Step 4: Generate
  const [runState, setRunState] = useState<RunState>("idle");
  const [results, setResults] = useState<CoverResult[]>([]);
  // 完整方案（含 prompt），用于单张重生时回传服务端；以及正在重生的封面 id。
  const [plansById, setPlansById] = useState<Record<number, CoverPlan>>({});
  const [regeneratingIds, setRegeneratingIds] = useState<number[]>([]);
  // 单张编辑（重生/换模型/调整/＋比例）都「另存为新的一张」，原图保留。新卡片 id 从一个很高的
  // 基数递增，避免和批量里服务端分配的小 id（1..N）撞车——尤其现在批量还在跑就能改早出的那张。
  const VARIANT_ID_BASE = 100000;
  const variantIdRef = useRef(VARIANT_ID_BASE);
  const nextVariantId = () => (variantIdRef.current += 1);
  // 删除某一张（连它的方案一起清掉）。
  const removeCover = (id: number) => {
    setResults((prev) => prev.filter((c) => c.id !== id));
    setPlansById((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };
  // 新出的一张插在「它的来源那张」紧后面（而不是甩到网格最底下、看着像没反应）。
  const insertAfter = (arr: CoverResult[], sourceId: number, item: CoverResult) => {
    const i = arr.findIndex((c) => c.id === sourceId);
    return i < 0 ? [...arr, item] : [...arr.slice(0, i + 1), item, ...arr.slice(i + 1)];
  };
  // 新卡片高亮 + 滚动到可视区，确保「点了就看得到」。
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashNewCover = (id: number) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1800);
  };
  // 从收藏夹「打开来编辑」：先把这张收藏的原始上下文（底图/文案/设置）还原到界面，再放进结果区。
  // 这样后续编辑用的就是它自己的底图和字，不会串成当前界面的。
  const openFavorite = (fav: FavItem) => {
    const c = fav.ctx;
    if (c) {
      setSourceMode((["base", "elements", "describe"].includes(c.sourceMode) ? c.sourceMode : "base") as SourceMode);
      setImagePreview(c.image || null);
      setImageName(c.image ? "收藏底图" : "");
      setElementImages(c.elementImages ? c.elementImages.map((d, i) => ({ name: `素材${i + 1}`, dataUrl: d })) : []);
      setImageDescription(c.imageDescription || "");
      setInspiration(c.inspiration || "");
      setSmartScene(!!c.smartScene);
      setTitle(c.title || "");
      setSubtitle(c.subtitle || "");
    }
    const newId = nextVariantId();
    setResults((prev) => [...prev, { id: newId, combination: fav.combination, label: fav.label, ratio: fav.ratio, engine: fav.engine as ImageEngine | undefined, image_url: fav.thumb }]);
    setShowFavorites(false);
    setStep(4);
    setRunState("done");
    flashNewCover(newId);
  };
  // 新卡片一出现就滚动到可视区（点了"调整/重生/＋比例"立刻能看到那张，而不是甩到网格底部看不见）。
  useEffect(() => {
    if (flashId == null) return;
    const el = document.querySelector(`[data-cover-id="${flashId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [flashId]);
  // 哪张卡片正打开"出同款别的比例"选择器（按 cover.id）。
  const [ratioPickerFor, setRatioPickerFor] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(4);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadingCoverId, setDownloadingCoverId] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<{
    message: string;
    filename?: string;
    downloadUrl?: string;
  } | null>(null);
  const [previewCover, setPreviewCover] = useState<CoverResult | null>(null);
  // 逐张引擎：每张封面单独指定 Image2 / SeeDance，顺序与后端 jobs 展开一致。
  const [slotEngines, setSlotEngines] = useState<ImageEngine[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // History
  const [history, setHistory] = useState<HistoryBatch[]>([]);

  const totalCount = Object.values(ratioSelection).reduce((sum, v) => sum + v, 0);
  // 每个比例各自最多 8 张，总数为各比例之和。
  const requestedCount = totalCount;
  const selectedRatios = Object.entries(ratioSelection).filter(([, v]) => v > 0) as [AspectRatio, number][];
  // 展开成与后端一致顺序的封面槽位（每个比例按数量展开）。
  const slots = selectedRatios.flatMap(([ratio, count]) => Array.from({ length: count }, () => ({ ratio })));
  const isGenerating = runState === "analyzing" || runState === "planning" || runState === "generating";
  const completedCount = results.filter((r) => r.image_url || r.error).length;
  const progressPercent = total > 0 ? Math.min(100, Math.round((Math.max(progress, completedCount) / total) * 100)) : 0;

  const refreshHistory = useCallback(async () => {
    try { setHistory(await getHistory()); } catch { setHistory([]); }
  }, []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  // 逐张引擎数组长度跟随总张数；新增/未指定的位置用当前默认引擎填充。
  useEffect(() => {
    setSlotEngines((prev) => Array.from({ length: totalCount }, (_, i) => prev[i] ?? engine));
  }, [totalCount, engine]);

  // Check login status on mount
  useEffect(() => {
    if (getToken()) {
      fetchMe().then(({ user: u }) => { if (u) setUser(u); });
    }
  }, []);

  // Computed: credits cost for current selection
  const creditsCost = isLocalLipa ? 0 : getCreditsCost(requestedCount || 1);

  /* ─── Ratio Helpers ─── */
  const toggleRatio = (id: AspectRatio) => {
    setRatioSelection((prev) => ({
      ...prev,
      // 每个比例独立：选中时默认 1 张，不再受其他比例总数限制。
      [id]: prev[id] > 0 ? 0 : 1,
    }));
  };

  const adjustRatioCount = (id: AspectRatio, delta: number) => {
    setRatioSelection((prev) => ({
      ...prev,
      // 每个比例各自 0-8 张，互不影响。
      [id]: Math.max(0, Math.min(8, prev[id] + delta)),
    }));
  };

  /* ─── File Handling ─── */
  const handleFile = async (file: File) => {
    const dataUrl = await fileToDownscaledDataUrl(file);
    setImagePreview(dataUrl);
    setImageName(file.name);
    try {
      const palette = await analyzePaletteFromDataUrl(dataUrl);
      setDetectedColor(palette.dominant);
      setImageColors(palette.imageColors);
    } catch { /* ignore */ }
  };

  const handleMultiFiles = async (files: FileList) => {
    const newElements: Array<{ name: string; dataUrl: string }> = [];
    for (let i = 0; i < Math.min(files.length, 6); i++) {
      const dataUrl = await fileToDownscaledDataUrl(files[i]);
      newElements.push({ name: files[i].name, dataUrl });
    }
    setElementImages((prev) => [...prev, ...newElements].slice(0, 6));
    // Use first image for color analysis
    if (newElements.length > 0 && !imagePreview) {
      setImagePreview(newElements[0].dataUrl);
      try {
        const palette = await analyzePaletteFromDataUrl(newElements[0].dataUrl);
        setDetectedColor(palette.dominant);
        setImageColors(palette.imageColors);
      } catch { /* ignore */ }
    }
  };

  const removeElement = (index: number) => {
    setElementImages((prev) => prev.filter((_, i) => i !== index));
  };

  const getImageDataUrl = async (): Promise<string> => {
    if (sourceMode === "describe") {
      // For describe mode, we'll pass a placeholder and let the backend know
      return "";
    }
    if (sourceMode === "elements" && elementImages.length > 0) {
      return elementImages[0].dataUrl;
    }
    if (!imagePreview) throw new Error("请先上传底图");
    if (imagePreview.startsWith("data:")) return imagePreview;
    return urlToDataUrl(imagePreview);
  };

  const requestTitleMaster = async () => {
    if (sourceText.trim().length < 10) {
      setTitlePlansError("请至少输入 10 个字的全文");
      return;
    }
    setTitlePlansLoading(true);
    setTitlePlansError("");
    try {
      const plans = await generateTitlePlans(sourceText.trim(), titleAngle.trim());
      setTitlePlans(plans);
      setSelectedTitlePlan(null);
    } catch (error) {
      setTitlePlansError(error instanceof Error ? error.message : "标题生成失败，请稍后重试");
    } finally {
      setTitlePlansLoading(false);
    }
  };

  const applyTitlePlan = (plan: TitlePlan, index: number) => {
    setTitle(plan.coverMain);
    setSubtitle(plan.coverSub);
    setPublishTitle(publishPlatform === "xiaohongshu" ? plan.xiaohongshu : plan.videoTitle);
    setSelectedTitlePlan(index);
  };

  const changePublishPlatform = (platform: "xiaohongshu" | "douyin") => {
    setPublishPlatform(platform);
    if (selectedTitlePlan != null) {
      const plan = titlePlans[selectedTitlePlan];
      if (plan) setPublishTitle(platform === "xiaohongshu" ? plan.xiaohongshu : plan.videoTitle);
    }
  };

  const deliveryText = (values?: { publishTitle?: string; coverTitle?: string; coverSubtitle?: string; publishPlatform?: "xiaohongshu" | "douyin" }) => {
    const finalPublishTitle = values?.publishTitle ?? (publishTitle.trim() || title.trim());
    const finalCoverTitle = values?.coverTitle ?? title.trim();
    const finalCoverSubtitle = values?.coverSubtitle ?? subtitle.trim();
    const finalPlatform = values?.publishPlatform ?? publishPlatform;
    return [
      `发布平台：${finalPlatform === "douyin" ? "抖音" : "小红书"}`,
      `发布标题：${finalPublishTitle}`,
      `封面主字：${finalCoverTitle}`,
      finalCoverSubtitle ? `封面副标题：${finalCoverSubtitle}` : "",
    ].filter(Boolean).join("\n");
  };

  const copyDelivery = async (values?: Parameters<typeof deliveryText>[0]) => {
    try {
      await navigator.clipboard.writeText(deliveryText(values));
      setDeliveryCopied(true);
      window.setTimeout(() => setDeliveryCopied(false), 1800);
    } catch {
      downloadDelivery(values);
    }
  };

  const downloadDelivery = (values?: Parameters<typeof deliveryText>[0]) => {
    const blob = new Blob([deliveryText(values)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "发布标题与封面文案.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Generation ─── */
  // 把当前所有输入打包成一个生成请求体（单次生成和「任务队列」共用，避免两处漂移）。
  const collectPayload = (image: string) => ({
    image: image || undefined,
    title: title.trim(),
    subtitle: subtitle.trim(),
    keywords: keywords.trim(),
    engine,
    count: requestedCount,
    sourceMode,
    imageDescription: sourceMode === "describe" ? imageDescription.trim() : undefined,
    inspiration: inspiration.trim() || undefined,
    elementImages: sourceMode === "elements" ? elementImages.map((e) => e.dataUrl) : undefined,
    ratios: selectedRatios.map(([ratio, cnt]) => ({ ratio, count: cnt })),
    slotEngines: slots.map((_, i) => slotEngines[i] ?? engine),
    stylePreferences: {
      imageDominantColor: detectedColor,
      imagePalette: imageColors,
      fontIds: lockedFont.length ? lockedFont : undefined,
      layoutIds: lockedLayout.length ? lockedLayout : undefined,
      effectIds: lockedEffect.length ? lockedEffect : undefined,
      colorSchemeIds: lockedColorScheme.length ? lockedColorScheme : undefined,
      decorationIds: lockedDecoration.length ? lockedDecoration : undefined,
      compositionIds: lockedComposition.length ? lockedComposition : undefined,
      moodIds: lockedMood.length ? lockedMood : undefined,
      textColors: lockedTextColor.length ? lockedTextColor : undefined,
      smartScene: smartScene || undefined,
    },
  });
  // 校验当前输入是否可以生成；可以则返回 null，否则返回错误文案。
  const validateInputs = (): string | null => {
    if (sourceMode === "base" && !imagePreview) return "请先上传底图";
    if (sourceMode === "elements" && elementImages.length === 0) return "请至少上传一张素材";
    if (sourceMode === "describe" && !imageDescription.trim()) return "请填写画面描述";
    if (!title.trim()) return "请先填写标题";
    if (totalCount === 0) return "请至少选择一种比例和数量";
    return null;
  };

  const startGenerate = async () => {
    const invalid = validateInputs();
    if (invalid) { setErrorMessage(invalid); setRunState("error"); return; }

    // Auth check: local LIPA mode does not require login or credits.
    if (!isLocalLipa && !user && !getToken()) {
      setShowLogin(true);
      return;
    }

    const count = requestedCount;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("analyzing");
    setErrorMessage("");
    setShortfallNote(null);
    setResults([]);
    setPlansById({});
    setRegeneratingIds([]);
    setProgress(0);
    setTotal(count);
    setMessage("正在分析底图...");

    try {
      const image = await getImageDataUrl();
      const token = getToken();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(collectPayload(image)),
        signal: controller.signal,
      });

      // Handle auth/credits errors (non-SSE JSON responses)
      if (response.status === 401) {
        setShowLogin(true);
        setRunState("idle");
        return;
      }
      if (response.status === 402) {
        const data = await response.json();
        setRechargeInfo({ required: data.required || 0, current: data.current || 0 });
        setShowRecharge(true);
        setRunState("idle");
        return;
      }
      if (response.status === 413) {
        setErrorMessage("图片太大了，已自动压缩仍超限——请少传几张素材，或换小一点的图。");
        setRunState("error");
        return;
      }
      if (!response.ok) {
        // 优先显示服务器给的原因（如体验额度不足）
        const data = await response.json().catch(() => null);
        setErrorMessage(data?.error || `生成没能开始（服务返回 ${response.status}）。请重试，或换张底图。`);
        setRunState("error");
        return;
      }

      const collected: CoverResult[] = [];
      await readSseStream(response, (event) => {
        setMessage(event.message || "");
        setProgress(event.progress || 0);
        setTotal(event.total || count);
        if (event.status === "analyzing") setRunState("analyzing");
        if (event.status === "planning" || event.status === "planned") setRunState("planning");
        if (event.status === "generating") setRunState("generating");
        if (event.plans && event.plans.length > 0) {
          setPlansById((prev) => {
            const next = { ...prev };
            for (const p of event.plans as CoverPlan[]) next[p.id] = p;
            return next;
          });
        }
        if (event.result) {
          collected.push(event.result);
          setResults((prev) => {
            const filtered = prev.filter((item) => item.id !== event.result?.id);
            return [...filtered, event.result as CoverResult].sort((a, b) => a.id - b.id);
          });
        }
        if (event.status === "done") {
          // 只保留成功出图的；失败的封面本身不显示，但要在下面给个总的说明（别让用户干瞪眼）。
          const final = (event.results || collected).filter((r) => r.image_url);
          // 但要保住用户在批量还没跑完时就动手编辑出的「新变体」卡片（id 从 VARIANT_ID_BASE 起）。
          setResults((prev) => {
            const variants = prev.filter((r) => r.id >= VARIANT_ID_BASE);
            return [...final, ...variants].sort((a, b) => a.id - b.id);
          });
          // 少出图时给原因说明：安全审核拒图（换图/换引擎）还是网络波动（重试）。
          const shortfall = (event.total || count) - final.length;
          if (shortfall > 0) {
            const errText = (event.results || collected).filter((r) => r.error).map((r) => r.error || "").join(" ");
            const isSafety = /安全系统|safety|sexual|敏感|审核|rejected|violat/iu.test(errText);
            setShortfallNote(
              isSafety
                ? `这次少出了 ${shortfall} 张：你这张底图被 ${engine === "image2" ? "OpenAI(Image2)" : "生成平台"} 的安全系统判为敏感、拒掉了（常见误判）。建议换一张更"干净/正常"的底图，或把引擎切到 Seedream 再试——多半就都能出。`
                : `这次少出了 ${shortfall} 张（多半是网络波动）。可点"再生成一批"，或对缺的那几张单独重生。`,
            );
          } else {
            setShortfallNote(null);
          }
          setProgress(event.total || count);
          setRunState("done");
          if (final.length > 0) {
            saveHistoryBatch({
              id: `batch-${Date.now()}`,
              createdAt: new Date().toISOString(),
              title: title.trim(),
              subtitle: subtitle.trim(),
              keywords: keywords.trim(),
              publishTitle: publishTitle.trim() || title.trim(),
              publishPlatform,
              engine,
              count,
              baseImage: imagePreview || "",
              results: final,
            }).then(() => refreshHistory());
          }
          // Refresh credits balance after generation
          if (!isLocalLipa && user) {
            fetchBalance().then((b) => setUser((prev) => prev ? { ...prev, credits: b.credits } : prev)).catch(() => {});
          }
        }
        if (event.status === "error") {
          setRunState("error");
          setErrorMessage(event.message || "生成失败");
        }
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") { setRunState("idle"); return; }
      setErrorMessage(error instanceof Error ? error.message : "生成失败");
      setRunState("error");
    }
  };

  const stopGenerate = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState("idle");
  };

  /* ─── 任务队列 ─── */
  const updateTask = (id: string, updater: (t: QueueTask) => QueueTask) =>
    setQueue((prev) => prev.map((t) => (t.id === id ? updater(t) : t)));

  // 把「当前这一套配置」存成一个任务，加进队列（不立即生成）。
  // 加入队列后，清空这一份的底图/文案/风格，回到第一步，方便直接换图加下一个任务（保留引擎和比例这些常用设定）。
  const resetInputsForNextTask = () => {
    setImagePreview(null);
    setImageName("");
    setElementImages([]);
    setImageDescription("");
    setInspiration("");
    setSmartScene(false);
    setTitle("");
    setSubtitle("");
    setKeywords("");
    setSourceText("");
    setTitleAngle("");
    setTitlePlans([]);
    setTitlePlansError("");
    setSelectedTitlePlan(null);
    setPublishTitle("");
    setLockedFont([]); setLockedLayout([]); setLockedEffect([]); setLockedColorScheme([]);
    setLockedDecoration([]); setLockedComposition([]); setLockedMood([]); setLockedTextColor([]);
    setDetectedColor("");
    setImageColors([]);
    setErrorMessage("");
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addToQueue = async () => {
    const invalid = validateInputs();
    if (invalid) { setErrorMessage(invalid); setRunState("error"); return; }
    if (!isLocalLipa && !user && !getToken()) { setShowLogin(true); return; }
    try {
      const image = await getImageDataUrl();
      const payload = collectPayload(image);
      const idBase = (queueIdBaseRef.current += 1000);
      setQueue((prev) => [
        ...prev,
        {
          id: `qt-${Date.now()}-${prev.length}`,
          idBase,
          label: title.trim() || `任务 ${prev.length + 1}`,
          payload,
          publishTitle: publishTitle.trim() || title.trim(),
          publishPlatform,
          coverTitle: title.trim(),
          coverSubtitle: subtitle.trim(),
          status: "pending",
          total: totalCount,
        },
      ]);
      resetInputsForNextTask(); // 自动清空、回第一步，接着加下一个任务
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "加入队列失败");
    }
  };

  const removeTask = (id: string) => {
    setResults((prev) => prev.filter((c) => c.group !== id)); // 连它那一批的封面一起清掉
    setQueue((prev) => prev.filter((t) => t.id !== id));
  };
  const clearQueue = () => { if (queueRunning) return; setResults((prev) => prev.filter((c) => !queue.some((t) => t.id === c.group))); setQueue([]); };

  // 跑单个任务：流式把结果写进【主 results】（打上 group=task.id 标记），封面 id 用 idBase 偏移保证
  // 全局唯一；方案写进 plansById。这样队列里的每张封面和普通封面一样可单独调整。
  const runOneTask = async (task: QueueTask, signal: AbortSignal) => {
    updateTask(task.id, (t) => ({ ...t, status: "running", errorMsg: undefined }));
    setResults((prev) => prev.filter((c) => c.group !== task.id)); // 清掉本任务旧的（重跑时）
    try {
      const token = getToken();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(task.payload),
        signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        updateTask(task.id, (t) => ({ ...t, status: "error", errorMsg: data?.error || `失败（${response.status}）` }));
        return;
      }
      const collected: CoverResult[] = [];
      await readSseStream(response, (event) => {
        if (event.plans && event.plans.length > 0) {
          setPlansById((prev) => { const n = { ...prev }; for (const p of event.plans as CoverPlan[]) n[task.idBase + p.id] = { ...p, id: task.idBase + p.id }; return n; });
        }
        if (event.result) {
          const uid = task.idBase + event.result.id;
          const cover = { ...(event.result as CoverResult), id: uid, group: task.id };
          collected.push(cover);
          setResults((prev) => { const filtered = prev.filter((c) => c.id !== uid); return [...filtered, cover]; });
        }
        if (event.status === "done") {
          // 丢掉本任务里失败的（没出图的）
          setResults((prev) => prev.filter((c) => c.group !== task.id || c.image_url));
          updateTask(task.id, (t) => ({ ...t, status: "done" }));
        }
      });
    } catch (e) {
      if (signal.aborted) { updateTask(task.id, (t) => ({ ...t, status: "pending" })); setResults((prev) => prev.filter((c) => c.group !== task.id)); return; }
      updateTask(task.id, (t) => ({ ...t, status: "error", errorMsg: e instanceof Error ? e.message : "生成失败" }));
    }
  };

  // 排队自动跑：把当前所有「待生成」任务，一个接一个跑完（稳，不会一下涌太多把服务器压垮）。
  const runQueue = async () => {
    if (queueRunning) return;
    const tasks = queue.filter((t) => t.status === "pending");
    if (tasks.length === 0) return;
    setStep(4); // 跳到「生成」页，边跑边看每组图出来
    setQueueRunning(true);
    const controller = new AbortController();
    queueAbortRef.current = controller;
    for (const task of tasks) {
      if (controller.signal.aborted) break;
      await runOneTask(task, controller.signal);
    }
    queueAbortRef.current = null;
    setQueueRunning(false);
  };
  const stopQueue = () => { queueAbortRef.current?.abort(); queueAbortRef.current = null; setQueueRunning(false); };

  // 单张重生：用同一引擎或换一个引擎，另生成一张（原图保留，新的一张追加在后面）。
  // 关键：编辑某张封面时要用【它自己那一批】的底图/标题/设置，而不是"当前界面"里的。
  // 队列封面(cover.group)从它所属任务的 payload 取；单次/历史/收藏的用当前界面。
  const contextForCover = async (cover: CoverResult) => {
    const task = cover.group ? queue.find((t) => t.id === cover.group) : null;
    if (task) {
      const p = task.payload as Record<string, unknown>;
      return {
        image: (p.image as string) || undefined,
        sourceMode: (p.sourceMode as string) || "base",
        elementImages: p.elementImages as string[] | undefined,
        imageDescription: p.imageDescription as string | undefined,
        inspiration: p.inspiration as string | undefined,
        title: (p.title as string) || "",
        subtitle: (p.subtitle as string) || "",
        smartScene: !!((p.stylePreferences as Record<string, unknown> | undefined)?.smartScene) || undefined,
      };
    }
    return {
      image: (await getImageDataUrl()) || undefined,
      sourceMode,
      elementImages: sourceMode === "elements" ? elementImages.map((e) => e.dataUrl) : undefined,
      imageDescription: sourceMode === "describe" ? imageDescription.trim() : undefined,
      inspiration: inspiration.trim() || undefined,
      title: title.trim(),
      subtitle: subtitle.trim(),
      smartScene: smartScene || undefined,
    };
  };

  const regenerateCover = async (cover: CoverResult, newEngine?: ImageEngine) => {
    const plan = plansById[cover.id];
    // 没有完整方案（比如来自历史记录）时，用组合键重建——一样能重生。
    if (!plan && !cover.combination) {
      setDownloadStatus({ filename: "", message: "这张缺少方案数据，无法重生。" });
      return;
    }
    const useEngine: ImageEngine = newEngine || cover.engine || engine;
    const newId = nextVariantId();
    if (plan) setPlansById((prev) => ({ ...prev, [newId]: plan }));
    setResults((prev) => insertAfter(prev, cover.id, { id: newId, combination: cover.combination, label: cover.label, ratio: cover.ratio, engine: useEngine, group: cover.group }));
    setRegeneratingIds((prev) => [...prev, newId]);
    flashNewCover(newId);
    try {
      const ctx = await contextForCover(cover);
      const token = getToken();
      const body = plan
        ? { plan, ratio: cover.ratio, engine: useEngine, sourceMode: ctx.sourceMode, image: ctx.image,
            elementImages: ctx.elementImages, imageDescription: ctx.imageDescription, inspiration: ctx.inspiration }
        : { rebuild: { combination: cover.combination, title: ctx.title, subtitle: ctx.subtitle, smartScene: ctx.smartScene, id: newId },
            ratio: cover.ratio, engine: useEngine, sourceMode: ctx.sourceMode, image: ctx.image,
            elementImages: ctx.elementImages, imageDescription: ctx.imageDescription, inspiration: ctx.inspiration };
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: abortRef.current?.signal,
      });
      const data = (await response.json().catch(() => ({ error: "重生失败" }))) as CoverResult;
      if (!response.ok && !data.error) data.error = "重生失败";
      setResults((prev) =>
        prev.map((c) =>
          c.id === newId
            ? { ...c, image_url: data.image_url, error: data.error, engine: data.engine || useEngine }
            : c,
        ),
      );
    } catch (error) {
      setResults((prev) =>
        prev.map((c) =>
          c.id === newId
            ? { ...c, error: error instanceof Error ? error.message : "重生失败" }
            : c,
        ),
      );
    } finally {
      setRegeneratingIds((prev) => prev.filter((id) => id !== newId));
    }
  };

  // 同款别的比例：用同一方案（样式不变），额外生成一张别的比例的图，作为新的一张加进结果。
  const generateAnotherRatio = async (cover: CoverResult, newRatio: AspectRatio) => {
    const plan = plansById[cover.id];
    if (!plan && !cover.combination) {
      setDownloadStatus({ filename: "", message: "这张缺少方案数据，无法出同款别的比例。" });
      return;
    }
    setRatioPickerFor(null);
    const newId = nextVariantId();
    const useEngine: ImageEngine = cover.engine || engine;
    if (plan) setPlansById((prev) => ({ ...prev, [newId]: plan }));
    setResults((prev) => insertAfter(prev, cover.id, { id: newId, combination: cover.combination, label: cover.label, ratio: newRatio, engine: useEngine, group: cover.group }));
    setRegeneratingIds((prev) => [...prev, newId]);
    flashNewCover(newId);
    try {
      const ctx = await contextForCover(cover);
      const token = getToken();
      const body = plan
        ? { plan, ratio: newRatio, engine: useEngine, sourceMode: ctx.sourceMode, image: ctx.image,
            elementImages: ctx.elementImages, imageDescription: ctx.imageDescription, inspiration: ctx.inspiration }
        : { rebuild: { combination: cover.combination, title: ctx.title, subtitle: ctx.subtitle, smartScene: ctx.smartScene, id: newId },
            ratio: newRatio, engine: useEngine, sourceMode: ctx.sourceMode, image: ctx.image,
            elementImages: ctx.elementImages, imageDescription: ctx.imageDescription, inspiration: ctx.inspiration };
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: abortRef.current?.signal,
      });
      const data = (await response.json().catch(() => ({ error: "生成失败" }))) as CoverResult;
      if (!response.ok && !data.error) data.error = "生成失败";
      setResults((prev) => prev.map((c) => (c.id === newId ? { ...c, image_url: data.image_url, error: data.error } : c)));
    } catch (error) {
      setResults((prev) =>
        prev.map((c) => (c.id === newId ? { ...c, error: error instanceof Error ? error.message : "生成失败" } : c)),
      );
    } finally {
      setRegeneratingIds((prev) => prev.filter((id) => id !== newId));
    }
  };

  // 单张「调整」：保持组合，换其中一个或【同时换多个】维度（字体+配色+构图…），或换字色，另出一张（原图保留）。
  const regenerateRebuild = async (cover: CoverResult, opts: { swap?: { dimension: string; optionId: string }; swaps?: Array<{ dimension: string; optionId: string }>; textColor?: string }) => {
    if (!cover.combination) return;
    setSwapCoverId(null);
    setSwapDim("");
    setPendingSwaps({});
    setPendingTextColor("");
    const newId = nextVariantId();
    const useEngine: ImageEngine = cover.engine || engine;
    setResults((prev) => insertAfter(prev, cover.id, { id: newId, combination: cover.combination, label: cover.label, ratio: cover.ratio, engine: useEngine, group: cover.group }));
    setRegeneratingIds((prev) => [...prev, newId]);
    flashNewCover(newId);
    try {
      const ctx = await contextForCover(cover);
      const token = getToken();
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          rebuild: {
            combination: cover.combination,
            swap: opts.swap,
            swaps: opts.swaps && opts.swaps.length ? opts.swaps : undefined,
            textColor: opts.textColor ?? (lockedTextColor.length ? lockedTextColor[Math.floor(Math.random() * lockedTextColor.length)] : undefined),
            title: ctx.title,
            subtitle: ctx.subtitle,
            smartScene: ctx.smartScene,
            id: newId,
          },
          ratio: cover.ratio,
          engine: useEngine,
          sourceMode: ctx.sourceMode,
          image: ctx.image,
          elementImages: ctx.elementImages,
          imageDescription: ctx.imageDescription,
          inspiration: ctx.inspiration,
        }),
        signal: abortRef.current?.signal,
      });
      const data = (await response.json().catch(() => ({ error: "调整失败" }))) as CoverResult & { prompt?: string };
      if (!response.ok && !data.error) data.error = "调整失败";
      setResults((prev) =>
        prev.map((c) =>
          c.id === newId
            ? { ...c, image_url: data.image_url, error: data.error, engine: data.engine || useEngine, combination: data.combination || c.combination, label: data.label || c.label }
            : c,
        ),
      );
      // 新的一张沿用换过之后的方案，方便对它继续「重生 / 再调整」
      if (data.combination && data.prompt) {
        setPlansById((prev) => ({ ...prev, [newId]: { id: newId, combination: data.combination, label: data.label || "", description: data.label || "", prompt: data.prompt } }));
      }
    } catch (error) {
      setResults((prev) =>
        prev.map((c) => (c.id === newId ? { ...c, error: error instanceof Error ? error.message : "调整失败" } : c)),
      );
    } finally {
      setRegeneratingIds((prev) => prev.filter((id) => id !== newId));
    }
  };

  // 维度字母 → 选项列表 / 中文名（单张调整面板用）
  const dimOptionsOf = (dim: string): StyleOpt =>
    dim === "A" ? styleOptions.fonts
    : dim === "B" ? styleOptions.layouts
    : dim === "C" ? styleOptions.effects
    : dim === "D" ? styleOptions.colors
    : dim === "E" ? styleOptions.decorations
    : dim === "F" ? styleOptions.compositions
    : styleOptions.moods;
  const SWAP_DIMS: Array<{ d: string; n: string }> = [
    { d: "G", n: "风格" }, { d: "A", n: "字体" }, { d: "B", n: "布局" }, { d: "C", n: "效果" },
    { d: "D", n: "配色" }, { d: "E", n: "装饰" }, { d: "F", n: "构图" }, { d: "COLOR", n: "字色" },
  ];

  const downloadCover = async (cover: CoverResult) => {
    if (!cover.image_url) return;
    const filename = `lipa-cover-${String(cover.id).padStart(2, "0")}.png`;
    setDownloadingCoverId(cover.id);
    setDownloadStatus(null);
    try {
      const exported = await exportImageUrl(cover.image_url, filename);
      downloadImageUrl(exported.downloadUrl, exported.filename);
      setDownloadStatus({
        filename: exported.filename,
        downloadUrl: exported.downloadUrl,
        message: `已导出 ${exported.filename}。如果 Codex 没弹下载，请点右侧链接，或到项目 exports 文件夹查看。`,
      });
    } catch (error) {
      downloadImageUrl(cover.image_url, filename);
      setDownloadStatus({
        filename,
        message: error instanceof Error
          ? `服务端导出失败：${error.message}。已尝试浏览器直接下载。`
          : "服务端导出失败，已尝试浏览器直接下载。",
      });
    } finally {
      setDownloadingCoverId(null);
    }
  };

  const downloadAll = async () => {
    for (const cover of results) {
      if (cover.image_url) await downloadCover(cover);
    }
  };

  // 完成本组、开新封面项目（旧的一组已存入历史，可在「历史」里找回）。
  const startNewProject = () => {
    abortRef.current?.abort();
    setResults([]);
    setPreviewCover(null);
    setRunState("idle");
    setProgress(0);
    setImagePreview(null);
    setImageName("");
    setElementImages([]);
    setImageDescription("");
    setInspiration("");
    setLockedFont([]);
    setLockedLayout([]);
    setLockedEffect([]);
    setLockedColorScheme([]);
    setLockedDecoration([]);
    setLockedComposition([]);
    setLockedMood([]);
    setLockedTextColor([]);
    setSwapCoverId(null);
    setSwapDim("");
    setTitle("");
    setSubtitle("");
    setKeywords("");
    setSourceText("");
    setTitleAngle("");
    setTitlePlans([]);
    setTitlePlansError("");
    setSelectedTitlePlan(null);
    setPublishTitle("");
    setErrorMessage("");
    setDownloadStatus(null);
    setStep(1);
  };

  const openBatch = (batch: HistoryBatch) => {
    setTitle(batch.title);
    setSubtitle(batch.subtitle);
    setKeywords(batch.keywords || "");
    setPublishTitle(batch.publishTitle || batch.title);
    setPublishPlatform(batch.publishPlatform || "xiaohongshu");
    setEngine(normalizeStoredEngine(batch.engine));
    setRatioSelection({ "16:9": 0, "4:3": 0, "1:1": 0, "3:4": Math.min(8, batch.count), "9:16": 0, "bilibili-safe": 0 });
    setTotal(batch.count);
    setImagePreview(batch.baseImage);
    setImageName("历史底图");
    setResults(batch.results);
    setProgress(batch.results.length);
    setRunState("done");
    setStep(4);
    setShowHistory(false);
  };

  /* ─── Step Navigation ─── */
  const canProceed = (s: Step): boolean => {
    if (s === 1) {
      const hasSource = sourceMode === "base" ? !!imagePreview
        : sourceMode === "elements" ? elementImages.length > 0
        : imageDescription.trim().length > 0;
      return hasSource && totalCount > 0;
    }
    if (s === 2) return !!title.trim();
    if (s === 3) return true;
    return false;
  };

  const nextStep = () => {
    if (step < 4 && canProceed(step)) setStep((step + 1) as Step);
  };
  const prevStep = () => {
    if (step > 1) setStep((step - 1) as Step);
  };
  // 回主页：任意步骤都能一键回到第一步并滚到顶部（不清空已生成的结果）。
  const goHome = () => {
    setStep(1);
    setShowHistory(false);
    setShowSettings(false);
    setShowFavorites(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stepLabels = [
    { num: 1, label: "底图", icon: <ImagePlus size={18} /> },
    { num: 2, label: "文案", icon: <Type size={18} /> },
    { num: 3, label: "风格", icon: <Palette size={18} /> },
    { num: 4, label: "生成", icon: <Sparkles size={18} /> },
  ];

  // 单张封面卡片：缩略图按真实比例完整显示，点击放大。
  const renderCard = (cover: CoverResult) => {
    const aspect = ratioAspectCss(cover.ratio);
    const busy = regeneratingIds.includes(cover.id);
    // 一张出图就能马上对它操作——哪怕整批还没跑完（编辑都是「另存为新的一张」，不影响还在生成的）。
    // 有完整方案(plansById) 或 有组合键(combination，历史记录里也有) 都能编辑。
    const canAct = !busy && (!!cover.image_url || !!cover.error) && (!!plansById[cover.id] || !!cover.combination);
    return (
      <article key={cover.id} data-cover-id={cover.id} className={cn("result-card", busy && "is-loading", flashId === cover.id && "is-flash")}>
        {busy ? (
          <div className="result-loading" style={{ aspectRatio: aspect }}>
            <LoaderCircle className="spin" size={28} />
            <small>重新生成中...</small>
          </div>
        ) : cover.image_url ? (
          <button type="button" className="result-image" style={{ aspectRatio: aspect }} onClick={() => setPreviewCover(cover)}>
            <img src={cover.image_url} alt={cover.label} />
            <span className="result-download"><Sparkles size={20} /><small>点击放大</small></span>
          </button>
        ) : cover.error ? (
          <div className="result-error" style={{ aspectRatio: aspect }}><p>{cover.error}</p></div>
        ) : (
          <div className="result-loading" style={{ aspectRatio: aspect }}>
            <LoaderCircle className="spin" size={28} />
            <small>生成中...</small>
          </div>
        )}
        {cover.image_url && (
          <button
            type="button"
            className={cn("fav-btn", isFavorited(cover.id) && "is-fav")}
            title={isFavorited(cover.id) ? "取消收藏" : "收藏这张（会记住你喜欢的风格，下次自动往前排）"}
            onClick={() => toggleFavorite(cover)}
          >
            <Heart size={17} />
          </button>
        )}
        <footer className="result-meta">
          <span>{cover.ratio ? `${cover.ratio} · ${cover.label}` : cover.label}</span>
          {cover.engine && <span style={{ fontSize: 11, opacity: 0.65 }}>{engineShortLabel(cover.engine)}</span>}
        </footer>
        {canAct && (
          <div className="result-actions">
            <button type="button" className="result-act" onClick={() => regenerateCover(cover)} title="用同一引擎重新生成这张">
              <RotateCw size={13} /> 重生
            </button>
            {engineOptions
              .filter((opt) => opt.id !== cover.engine)
              .map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="result-act result-act-engine"
                  onClick={() => regenerateCover(cover, opt.id)}
                  title={`改用 ${opt.title} 重新生成这张`}
                >
                  换{engineShortLabel(opt.id)}
                </button>
              ))}
            {cover.image_url && (
              <button
                type="button"
                className="result-act result-act-ratio"
                onClick={() => setRatioPickerFor(ratioPickerFor === cover.id ? null : cover.id)}
                title="用同款样式，出别的比例"
              >
                ＋比例
              </button>
            )}
            {cover.image_url && cover.combination && (
              <button
                type="button"
                className="result-act result-act-ratio"
                onClick={() => { setSwapCoverId(swapCoverId === cover.id ? null : cover.id); setSwapDim(""); setPendingSwaps({}); setPendingTextColor(""); }}
                title="只换其中一项（字体/风格/配色/字色…），其余保持，另出一张"
              >
                调整
              </button>
            )}
            <button
              type="button"
              className="result-act result-act-del"
              onClick={() => removeCover(cover.id)}
              title="删除这张"
            >
              <Trash2 size={13} /> 删除
            </button>
          </div>
        )}
        {canAct && cover.image_url && swapCoverId === cover.id && (() => {
          const pendingCount = Object.keys(pendingSwaps).length + (pendingTextColor ? 1 : 0);
          const dimName = (d: string) => SWAP_DIMS.find((s) => s.d === d)?.n || d;
          const optName = (d: string, id: string) => dimOptionsOf(d).find((o) => o.id === id)?.name || id;
          return (
          <div className="result-ratio-picker">
            <span className="rrp-hint">想改哪些？可以<b>同时选好几样</b>（字体＋配色＋构图…），也可只改一样，选完点「应用」。</span>
            <div className="rrp-chips">
              {SWAP_DIMS.map((sd) => {
                const picked = sd.d === "COLOR" ? !!pendingTextColor : !!pendingSwaps[sd.d];
                return (
                  <button key={sd.d} type="button" className={cn("result-act", swapDim === sd.d && "is-cur", picked && "has-pick")} onClick={() => setSwapDim(swapDim === sd.d ? "" : sd.d)}>
                    {sd.n}{picked ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
            {swapDim && swapDim !== "COLOR" && (
              <div className="rrp-chips">
                {dimOptionsOf(swapDim).map((o) => {
                  const isCurrent = (cover.combination || "").split("+").includes(o.id);
                  const isPicked = pendingSwaps[swapDim] === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={cn("result-act", isPicked && "is-cur", isCurrent && !isPicked && "has-pick")}
                      title={isCurrent ? "当前就是这个" : `选「${o.name}」`}
                      onClick={() => setPendingSwaps((prev) => { const n = { ...prev }; if (n[swapDim] === o.id) delete n[swapDim]; else n[swapDim] = o.id; return n; })}
                    >
                      {o.name}{isCurrent ? "（当前）" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {swapDim === "COLOR" && (
              <div className="textcolor-row">
                {presetTextColors.map((c) => (
                  <button key={c} type="button" className={cn("tc-swatch", pendingTextColor === c && "is-on")} style={{ background: c }} title={`主标题换成 ${c}`} onClick={() => setPendingTextColor(pendingTextColor === c ? "" : c)} />
                ))}
                <label className="tc-custom" title="自定义颜色">
                  <input type="color" value={pendingTextColor || "#FFDE00"} onChange={(e) => setPendingTextColor(e.target.value.toUpperCase())} />
                  自定义
                </label>
              </div>
            )}
            <div className="rrp-apply">
              <span className="rrp-apply-summary">
                {pendingCount === 0
                  ? "还没选要改什么"
                  : `要改 ${pendingCount} 项：${[...Object.entries(pendingSwaps).map(([d, id]) => `${dimName(d)}→${optName(d, id)}`), ...(pendingTextColor ? [`字色→${pendingTextColor}`] : [])].join("、")}`}
              </span>
              <button
                type="button"
                className="result-act result-act-ratio"
                disabled={pendingCount === 0}
                onClick={() => regenerateRebuild(cover, { swaps: Object.entries(pendingSwaps).map(([dimension, optionId]) => ({ dimension, optionId })), textColor: pendingTextColor || undefined })}
              >
                应用（改 {pendingCount} 项）
              </button>
            </div>
          </div>
          );
        })()}
        {canAct && cover.image_url && ratioPickerFor === cover.id && (
          <div className="result-ratio-picker">
            <span className="rrp-hint">出同款 · 选个比例：</span>
            <div className="rrp-chips">
              {ratioOptions
                .filter((o) => o.id !== cover.ratio)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="result-act"
                    onClick={() => generateAnotherRatio(cover, o.id)}
                    title={`出一张同款的「${o.label}」`}
                  >
                    {o.label}
                  </button>
                ))}
            </div>
          </div>
        )}
      </article>
    );
  };

  // 失败的封面不显示（cover.error 的直接过滤掉，只保留成功或正在生成/重生的）。
  // 未分组的（单次生成/历史/收藏打开的）；队列分批的按 group 单独成组显示。
  const verticalResults = results.filter((r) => !isLandscapeRatio(r.ratio) && !r.error && !r.group);
  const horizontalResults = results.filter((r) => isLandscapeRatio(r.ratio) && !r.error && !r.group);
  const doneCount = results.filter((r) => r.image_url).length;
  const queuePending = queue.filter((t) => t.status === "pending").length;
  const taskStatusText = (s: QueueTask["status"]) =>
    s === "pending" ? "待生成" : s === "running" ? "生成中…" : s === "done" ? "已完成" : "失败";
  // 任务队列面板（步骤条下方全程可见）：每个任务一张卡，显示到哪一步了。
  const queuePanel = queue.length > 0 ? (
    <div className="queue-panel">
      <div className="queue-head">
        <strong>任务队列（{queue.length}）· 每个任务 = 一个独立项目</strong>
        <div className="queue-head-actions">
          {!queueRunning ? (
            <>
              <button type="button" className="generate-btn" style={{ width: "auto" }} disabled={queuePending === 0} onClick={() => { void runQueue(); }}>
                <Sparkles size={18} /> 开始排队生成（{queuePending} 个待生成）
              </button>
              <button type="button" className="stop-btn" style={{ width: "auto" }} onClick={clearQueue}>清空</button>
            </>
          ) : (
            <button type="button" className="stop-btn" style={{ width: "auto" }} onClick={stopQueue}>
              <Square size={16} /> 停止排队
            </button>
          )}
        </div>
      </div>
      <div className="queue-list">
        {queue.map((t, i) => (
          <div key={t.id} className={cn("queue-chip", `is-${t.status}`)}>
            <span className="queue-chip-idx">{i + 1}</span>
            <span className="queue-chip-label" title={t.label}>{t.label}</span>
            <span className="queue-chip-meta">
              {t.total}张 · {taskStatusText(t.status)}
              {t.status === "error" && t.errorMsg ? `（${t.errorMsg}）` : ""}
              {t.status === "running" ? ` ${results.filter((c) => c.group === t.id && c.image_url).length}/${t.total}` : ""}
            </span>
            {!queueRunning && t.status !== "running" && (
              <button type="button" className="queue-chip-del" title="移除" onClick={() => removeTask(t.id)}>×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  /* ─── Render ─── */
  return (
    <main className="app-shell">
      <div className="bg-gradient" aria-hidden="true" />

      {/* Header */}
      <header className="site-header">
        <div className="header-brand">
          <button type="button" className="brand-plate brand-home" title="回主页" onClick={goHome}>
            <img src="/logo.png" alt="巴卡巴卡 BAKABAKA" className="brand-logo" />
          </button>
          <small className="brand-copyright">Copyright © 畅导吃枸杞</small>
        </div>
        <nav className="header-nav">
          <button type="button" className="nav-btn" title="回到第一步" onClick={goHome}>
            <Home size={18} />
            <span>首页</span>
          </button>
          <button type="button" className={cn("nav-btn", "nav-btn-history", showHistory && "is-active")} onClick={() => setShowHistory(!showHistory)}>
            <History size={18} />
            <span>我的作品{history.length > 0 ? `（${history.length}）` : ""}</span>
          </button>
          <button type="button" className={cn("nav-btn", showFavorites && "is-active")} title="收藏夹" onClick={() => setShowFavorites(!showFavorites)}>
            <Heart size={18} />
            <span>收藏夹{favorites.length > 0 ? `（${favorites.length}）` : ""}</span>
          </button>
          <button type="button" className={cn("nav-btn", showSettings && "is-active")} onClick={() => setShowSettings(!showSettings)}>
            <Settings2 size={18} />
            <span>设置</span>
          </button>
          {isAdminAccount && (
            <button type="button" className="nav-btn nav-btn-history" title="账户管理与生成记录" onClick={() => { window.location.href = "/admin"; }}>
              <ShieldCheck size={18} />
              <span>管理后台</span>
            </button>
          )}
          <button type="button" className="nav-btn" title="退出登录" onClick={() => { window.location.href = "/access-logout"; }}>
            <LogOut size={18} />
            <span>退出</span>
          </button>
          {!isLocalLipa && (
            <CreditsBadge
              user={user}
              onLoginClick={() => setShowLogin(true)}
              onLogout={() => { apiLogout(); setUser(null); }}
            />
          )}
        </nav>
      </header>

      {/* History Overlay */}
      {showHistory && (
        <div className="overlay-panel">
          <div className="overlay-header">
            <h2>创作历史</h2>
            <button type="button" onClick={() => setShowHistory(false)} className="close-btn">&times;</button>
          </div>
          {history.length === 0 ? (
            <div className="empty-state">
              <Archive size={32} />
              <p>还没有生成记录</p>
              <small>完成一次创作后会自动保存</small>
            </div>
          ) : (
            <div className="history-list">
              {history.map((batch) => (
                <article className="history-item" key={batch.id}>
                  <button type="button" className="history-main" onClick={() => openBatch(batch)}>
                    <span className="history-thumbs">
                      {batch.results.slice(0, 3).map((c) => (
                        c.image_url && <img src={c.image_url} alt={c.label} key={c.id} />
                      ))}
                    </span>
                    <span className="history-info">
                      <strong>{batch.title}</strong>
                      <small>{batch.count}张 · {formatTime(batch.createdAt)}</small>
                    </span>
                  </button>
                  <button className="icon-btn danger" type="button" onClick={() => { deleteHistoryBatch(batch.id); refreshHistory(); }}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {showFavorites && (() => {
        const nameById: Record<string, string> = {};
        for (const list of [styleOptions.moods, styleOptions.fonts, styleOptions.layouts, styleOptions.effects, styleOptions.colors, styleOptions.decorations, styleOptions.compositions]) {
          for (const o of list) nameById[o.id] = o.name;
        }
        const topStyles = Object.entries(styleTally)
          .filter(([id]) => nameById[id])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([id, count]) => ({ id, name: nameById[id], count }));
        return (
          <div className="overlay-panel">
            <div className="overlay-header">
              <h2>收藏夹{favorites.length > 0 ? `（${favorites.length}）` : ""}</h2>
              <button type="button" onClick={() => setShowFavorites(false)} className="close-btn">&times;</button>
            </div>
            {favorites.length === 0 ? (
              <div className="empty-state">
                <Heart size={32} />
                <p>还没有收藏</p>
                <small>觉得哪张好，点封面右上角的 ♡，它的风格会被记住、下次自动往前排</small>
              </div>
            ) : (
              <>
                {topStyles.length > 0 && (
                  <div className="fav-summary">
                    <span className="fav-summary-title">你最常用的风格（已自动排到「风格定制」最前面）</span>
                    <div className="fav-summary-chips">
                      {topStyles.map((s) => (
                        <span key={s.id} className="fav-chip">{s.name} <i>×{s.count}</i></span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="fav-grid">
                  {favorites.map((f) => (
                    <div className="fav-cell" key={f.favId}>
                      <button type="button" className="fav-cell-open" title="打开来继续调整" onClick={() => openFavorite(f)}>
                        <img src={f.thumb} alt={f.label} />
                        <span className="fav-cell-edit">✎ 打开调整</span>
                      </button>
                      <button type="button" className="fav-remove" title="移出收藏" onClick={() => persistFavs(favorites.filter((x) => x.favId !== f.favId))}>&times;</button>
                      <span className="fav-cell-label">{f.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Settings Overlay */}
      {showSettings && (
        <div className="overlay-panel settings-overlay">
          <div className="overlay-header">
            <h2>高级设置</h2>
            <button type="button" onClick={() => setShowSettings(false)} className="close-btn">&times;</button>
          </div>
          <div className="settings-content">
            <label className="setting-item">
              <span>生成引擎</span>
              <select value={engine} onChange={(e) => setEngine(e.target.value as ImageEngine)}>
                {engineOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.title} — {opt.description}</option>
                ))}
              </select>
            </label>
            <div className="setting-item">
              <span>输出尺寸</span>
              <strong>根据所选比例自动适配</strong>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-logo-plate">
          <img src="/logo.png" alt="巴卡巴卡 BAKABAKA" className="hero-logo" />
        </div>
        <p className="hero-slogan">自媒体封面之王 · King of Cover</p>
        <p className="hero-subtitle">上传一张底图，AI 按爆款审美自动排版花字、多引擎多风格一次出图，一眼挑出最吸睛的封面。</p>
      </section>

      {/* Step Indicator */}
      <nav className="step-indicator" aria-label="创作步骤">
        {stepLabels.map((s) => (
          <button
            key={s.num}
            type="button"
            className={cn("step-dot", step === s.num && "is-current", step > s.num && "is-done")}
            onClick={() => {
              if (s.num <= step || (s.num === step + 1 && canProceed(step))) setStep(s.num as Step);
            }}
          >
            <span className="step-icon">
              {step > s.num ? <Check size={16} /> : s.icon}
            </span>
            <span className="step-label">{s.label}</span>
          </button>
        ))}
        <div className="step-line" style={{ "--progress": `${((step - 1) / 3) * 100}%` } as CSSProperties} />
      </nav>

      {/* 任务队列：步骤条下方，全程可见（每个任务=一个独立项目，能看到排到哪、跑到哪） */}
      {queuePanel}

      {/* Step Content */}
      <section className={cn("step-content", step === 4 && results.length > 0 && "is-wide")}>
        {/* Step 1: Upload Image + Ratio Selection */}
        {step === 1 && (
          <div className="step-panel fade-in">
            <div className="step-header">
              <span className="step-number">01</span>
              <div>
                <h2>选择素材与比例</h2>
                <p>选择素材来源方式，设定封面比例和数量</p>
              </div>
            </div>

            {history.length > 0 && (
              <button type="button" className="recent-banner" onClick={() => setShowHistory(true)}>
                <History size={16} />
                <span>你有 {history.length} 个历史项目，点这里查看 / 继续</span>
                <ArrowRight size={14} />
              </button>
            )}

            {/* Source Mode Selector */}
            <div className="source-modes">
              <button
                type="button"
                className={cn("mode-card", sourceMode === "base" && "is-active")}
                onClick={() => setSourceMode("base")}
              >
                <div className="mode-icon"><ImagePlus size={22} /></div>
                <strong>上传底图</strong>
                <small>一张完整底图，AI 在上面排版</small>
              </button>
              <button
                type="button"
                className={cn("mode-card", sourceMode === "elements" && "is-active")}
                onClick={() => setSourceMode("elements")}
              >
                <div className="mode-icon"><Palette size={22} /></div>
                <strong>素材元素</strong>
                <small>多张素材图，AI 融合拼贴</small>
              </button>
              <button
                type="button"
                className={cn("mode-card", sourceMode === "describe" && "is-active")}
                onClick={() => setSourceMode("describe")}
              >
                <div className="mode-icon"><Type size={22} /></div>
                <strong>文字描述</strong>
                <small>无素材，AI 从描述生成</small>
              </button>
            </div>

            <div className="engine-section">
              <div className="engine-header">
                <h3>选择生成模型</h3>
                <span>{engineOptions.find((opt) => opt.id === engine)?.title || "Image2"}</span>
              </div>
              <div className="engine-grid">
                {engineOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={cn("engine-card", engine === opt.id && "is-active")}
                    onClick={() => { setEngine(opt.id); setSlotEngines(Array.from({ length: totalCount }, () => opt.id)); }}
                  >
                    <span className="engine-title">
                      <Sparkles size={16} />
                      {opt.title}
                    </span>
                    <span className="engine-vendor">{opt.vendor}</span>
                    <span className="engine-desc">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode: Base Image */}
            {sourceMode === "base" && (
              <label className="upload-zone magazine-style">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                {imagePreview ? (
                  <div className="upload-preview">
                    <img src={imagePreview} alt="底图预览" />
                    <div className="upload-overlay">
                      <Upload size={24} />
                      <span>更换图片</span>
                    </div>
                    {imageColors.length > 0 && (
                      <div className="palette-strip">
                        {imageColors.map((c) => (
                          <span key={c} style={{ background: c }} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="magazine-mockup">
                      <div className="mock-cover mock-a">
                        <span className="mock-title">VOGUE</span>
                        <span className="mock-line" />
                        <span className="mock-line short" />
                      </div>
                      <div className="mock-cover mock-b">
                        <span className="mock-title">COVER</span>
                        <span className="mock-line" />
                        <span className="mock-line short" />
                        <span className="mock-line" />
                      </div>
                      <div className="mock-cover mock-c">
                        <span className="mock-title">ELLE</span>
                        <span className="mock-line short" />
                        <span className="mock-line" />
                      </div>
                    </div>
                    <div className="upload-text">
                      <strong>上传一张完整底图</strong>
                      <small>AI 将在底图上进行杂志级排版设计</small>
                    </div>
                  </div>
                )}
              </label>
            )}

            {/* Mode: Element Images */}
            {sourceMode === "elements" && (
              <div className="elements-zone">
                <div className="elements-grid">
                  {elementImages.map((el, i) => (
                    <div key={i} className="element-thumb">
                      <img src={el.dataUrl} alt={el.name} />
                      <button type="button" className="element-remove" onClick={() => removeElement(i)}>&times;</button>
                    </div>
                  ))}
                  {elementImages.length < 6 && (
                    <label className="element-add">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) handleMultiFiles(e.target.files);
                        }}
                      />
                      <Plus size={24} />
                      <small>添加素材</small>
                    </label>
                  )}
                </div>
                <p className="elements-hint">最多 6 张素材元素，AI 将融合拼贴为封面</p>
              </div>
            )}

            {/* Mode: Text Description */}
            {sourceMode === "describe" && (
              <div className="describe-zone">
                <textarea
                  value={imageDescription}
                  onChange={(e) => setImageDescription(e.target.value)}
                  placeholder="描述你想要的封面画面，例如：\n\n一个穿白色连衣裙的女生站在薰衣草花田中，逆光，暖色调，胶片质感"
                  rows={5}
                  maxLength={300}
                />
                <span className="describe-count">{imageDescription.length}/300</span>
              </div>
            )}

            {imageName && sourceMode === "base" && <p className="file-name">{imageName}</p>}

            {/* 作者灵感（选填）：只在有底图的模式显示 */}
            <div className="inspire-zone">
              <label className="inspire-label">
                作者灵感 · 想怎么生这张图？<span className="inspire-optional">选填</span>
              </label>
              <textarea
                value={inspiration}
                onChange={(e) => setInspiration(e.target.value)}
                placeholder={
                  sourceMode === "elements"
                    ? "留空 = 默认把素材拼贴排版。\n填了 = 交给 AI 理解，比如：让这两个人一起坐在饭桌前吃饭 / 一起对着镜头合拍。"
                    : sourceMode === "describe"
                    ? "留空 = 按上面的画面描述生成。\n填了 = 额外的场景/氛围想法，交给 AI 一起理解。"
                    : "留空 = 默认在底图上直接排版加字。\n填了 = 交给 AI 理解画面，比如：把人物放到海边日落的场景里。"
                }
                rows={3}
                maxLength={300}
              />
              <span className="inspire-hint">灵感只影响画面；花字排版仍按你的审美库来。</span>
              {/* 读懂标题去配场景：独立开关，任何风格都可搭 */}
              <button
                type="button"
                className={cn("scene-toggle", smartScene && "is-on")}
                onClick={() => setSmartScene((v) => !v)}
              >
                <span className={cn("scene-switch", smartScene && "is-on")} aria-hidden>
                  <span className="scene-knob" />
                </span>
                <span className="scene-text">
                  <span className="scene-title">读懂标题、配上匹配的场景</span>
                  <span className="scene-desc">
                    开启后：把人物抠出来，按标题含义合成戏剧化场景（金融→钞票K线、奥运→火炬奖牌、国家→国旗…）。适用任何风格。
                  </span>
                </span>
              </button>
            </div>

            {/* 风格定制（选填）：开头就锁定 字体 / 色彩风格 / 字体颜色 */}
            <div className="style-custom">
              <div className="style-custom-head">
                <span style={{ fontWeight: 600 }}>风格定制</span>
                <span className="inspire-optional">选填 · 不选 = 库内随机多样</span>
              </div>
              {/* 整体风格：滤镜式预览卡（多选） */}
              <div className="pv-group">
                <span className="pv-label">整体风格<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedMood.length && "is-on")} onClick={() => setLockedMood([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.moods).map((m) => {
                    const pv = MOOD_PREVIEW[m.id] || { bg: "rgba(255,255,255,0.5)", style: {} };
                    return (
                      <button key={m.id} type="button" className={cn("pv-card", lockedMood.includes(m.id) && "is-on")} style={{ background: pv.bg }} onClick={() => toggleFrom(setLockedMood)(m.id)}>
                        <span className="pv-sample" style={pv.style}>{pv.sample || "标题"}</span>
                        <span className="pv-name" style={{ color: (pv.style.color as string) || "#241a3d" }}>{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 字体：示例字预览卡（多选） */}
              <div className="pv-group">
                <span className="pv-label">字体<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedFont.length && "is-on")} onClick={() => setLockedFont([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.fonts).map((f) => {
                    const pv = FONT_PREVIEW[f.id] || { style: {} };
                    return (
                      <button key={f.id} type="button" className={cn("pv-card pv-font", pv.dark && "pv-dark", lockedFont.includes(f.id) && "is-on")} onClick={() => toggleFrom(setLockedFont)(f.id)}>
                        <span className="pv-sample" style={pv.style}>{pv.sample || "标题"}</span>
                        <span className="pv-name">{f.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 文字布局：小示意图预览卡（多选） */}
              <div className="pv-group">
                <span className="pv-label">文字布局<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedLayout.length && "is-on")} onClick={() => setLockedLayout([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.layouts).map((l) => (
                    <button key={l.id} type="button" className={cn("pv-card", lockedLayout.includes(l.id) && "is-on")} onClick={() => toggleFrom(setLockedLayout)(l.id)}>
                      <span className={`pv-mini lay-${l.id}`} />
                      <span className="pv-name">{l.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* 文字效果：示例字上效果（多选） */}
              <div className="pv-group">
                <span className="pv-label">文字效果<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedEffect.length && "is-on")} onClick={() => setLockedEffect([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.effects).map((ef) => {
                    const pv = EFFECT_PREVIEW[ef.id] || { style: {} };
                    return (
                      <button key={ef.id} type="button" className={cn("pv-card pv-font", pv.dark && "pv-dark", lockedEffect.includes(ef.id) && "is-on")} onClick={() => toggleFrom(setLockedEffect)(ef.id)}>
                        {ef.id === "C16"
                          ? <span className="pv-sample" style={{ fontWeight: 800, color: "#241a3d" }}>标<i style={{ color: "#f59e0b", fontStyle: "normal" }}>题</i></span>
                          : <span className="pv-sample" style={pv.style}>标题</span>}
                        <span className="pv-name">{ef.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 色彩风格：三色条预览卡（多选） */}
              <div className="pv-group">
                <span className="pv-label">色彩风格<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedColorScheme.length && "is-on")} onClick={() => setLockedColorScheme([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.colors).map((c) => {
                    const pal = PALETTE_PREVIEW[c.id] || ["#ddd", "#aaa", "#888"];
                    return (
                      <button key={c.id} type="button" className={cn("pv-card pv-palette", lockedColorScheme.includes(c.id) && "is-on")} onClick={() => toggleFrom(setLockedColorScheme)(c.id)}>
                        <span className="pv-swatches">
                          {pal.map((hex, i) => (<i key={i} style={{ background: hex }} />))}
                        </span>
                        <span className="pv-name">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 装饰：符号示意（多选） */}
              <div className="pv-group">
                <span className="pv-label">装饰元素<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedDecoration.length && "is-on")} onClick={() => setLockedDecoration([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.decorations).map((de) => (
                    <button key={de.id} type="button" className={cn("pv-card", lockedDecoration.includes(de.id) && "is-on")} onClick={() => toggleFrom(setLockedDecoration)(de.id)}>
                      <span className="pv-sample">{DECOR_GLYPH[de.id] || "❖"}</span>
                      <span className="pv-name">{de.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* 构图：小示意图（多选） */}
              <div className="pv-group">
                <span className="pv-label">构图方式<span className="pv-multi">可多选 · 随机搭配</span></span>
                <div className="pv-row">
                  <button type="button" className={cn("pv-card pv-random", !lockedComposition.length && "is-on")} onClick={() => setLockedComposition([])}>
                    <span className="pv-sample">🎲</span>
                    <span className="pv-name">随机</span>
                  </button>
                  {rankByFav(styleOptions.compositions).map((co) => (
                    <button key={co.id} type="button" className={cn("pv-card", lockedComposition.includes(co.id) && "is-on")} onClick={() => toggleFrom(setLockedComposition)(co.id)}>
                      <span className={`pv-mini comp-${co.id}`} />
                      <span className="pv-name">{co.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="textcolor-block">
                <span className="textcolor-label">字体颜色（主标题）<span className="pv-multi">可多选 · 每张随机取一个</span></span>
                <div className="textcolor-row">
                  <button
                    type="button"
                    className={cn("tc-chip", !lockedTextColor.length && "is-on")}
                    onClick={() => setLockedTextColor([])}
                  >
                    AI 自选
                  </button>
                  {presetTextColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={cn("tc-swatch", lockedTextColor.includes(c) && "is-on")}
                      style={{ background: c }}
                      title={c}
                      onClick={() => toggleFrom(setLockedTextColor)(c)}
                    />
                  ))}
                  {imageColors.slice(0, 4).map((c) => (
                    <button
                      key={`img-${c}`}
                      type="button"
                      className={cn("tc-swatch tc-from-image", lockedTextColor.includes(c) && "is-on")}
                      style={{ background: c }}
                      title={`底图取色 ${c}`}
                      onClick={() => toggleFrom(setLockedTextColor)(c)}
                    />
                  ))}
                  <label className="tc-custom" title="自定义颜色">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => setCustomColor(e.target.value.toUpperCase())}
                    />
                    自定义
                  </label>
                  <button
                    type="button"
                    className="tc-add"
                    onClick={() => setLockedTextColor((prev) => (prev.includes(customColor) ? prev : [...prev, customColor]))}
                  >
                    ＋加入
                  </button>
                </div>
                {lockedTextColor.length > 0 && (
                  <div className="tc-picked">
                    <span className="tc-picked-lead">已选 {lockedTextColor.length} 个（每张封面随机取一个）：</span>
                    {lockedTextColor.map((c) => (
                      <button
                        key={`sel-${c}`}
                        type="button"
                        className="tc-picked-chip"
                        title="点击移除"
                        onClick={() => toggleFrom(setLockedTextColor)(c)}
                      >
                        <i style={{ background: c }} /> {c} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ratio Selection */}
            <div className="ratio-section">
              <div className="ratio-header">
                <h3>选择封面比例</h3>
                <span className="ratio-total">共 {totalCount} 张</span>
              </div>
              <div className="ratio-grid">
                {ratioOptions.map((opt) => {
                  const selected = ratioSelection[opt.id] > 0;
                  return (
                    <div key={opt.id} className={cn("ratio-card", selected && "is-selected")}>
                      <button type="button" className="ratio-toggle" onClick={() => toggleRatio(opt.id)}>
                        <div className="ratio-preview" style={{ "--rw": opt.w, "--rh": opt.h } as CSSProperties}>
                          {opt.icon === "landscape" && <RectangleHorizontal size={20} />}
                          {opt.icon === "portrait" && <RectangleVertical size={20} />}
                          {opt.icon === "square" && <SquareIcon size={18} />}
                        </div>
                        <span className="ratio-label">{opt.label}</span>
                        <span className="ratio-desc">{opt.desc}</span>
                      </button>
                      {selected && (
                        <div className="ratio-counter">
                          <button type="button" onClick={() => adjustRatioCount(opt.id, -1)} disabled={ratioSelection[opt.id] <= 1}>
                            <Minus size={14} />
                          </button>
                          <span>{ratioSelection[opt.id]}</span>
                          <button type="button" onClick={() => adjustRatioCount(opt.id, 1)} disabled={ratioSelection[opt.id] >= 10}>
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Title & Copy */}
        {step === 2 && (
          <div className="step-panel fade-in">
            <div className="step-header">
              <span className="step-number">02</span>
              <div>
                <h2>填写文案</h2>
                <p>有全文就让标题大师先写；没有全文就照旧直接填写封面字</p>
              </div>
            </div>
            <div className="form-fields">
              <section className="title-bridge">
                <div className="title-bridge-head">
                  <div>
                    <strong>连接标题大师</strong>
                    <p>选填 · 只负责起标题，不改变巴咔巴咔的任何生图模型与风格设置</p>
                  </div>
                  <span className="title-bridge-badge">豆包 Seed 2.1</span>
                </div>
                <label className="form-field">
                  <span className="field-label">全文 <em>选填</em></span>
                  <textarea
                    value={sourceText}
                    maxLength={20000}
                    rows={7}
                    onChange={(e) => {
                      setSourceText(e.target.value);
                      setTitlePlans([]);
                      setSelectedTitlePlan(null);
                      setTitlePlansError("");
                    }}
                    placeholder="粘贴完整口播稿、录音转写或视频文案。留空时不调用标题大师，下面仍可直接填写封面字。"
                  />
                  <span className="field-count is-textarea">{sourceText.length}/20,000</span>
                </label>
                <label className="form-field">
                  <span className="field-label">创作参考 <em>选填</em></span>
                  <input
                    type="text"
                    value={titleAngle}
                    maxLength={2000}
                    onChange={(e) => {
                      setTitleAngle(e.target.value);
                      setTitlePlans([]);
                      setSelectedTitlePlan(null);
                      setTitlePlansError("");
                    }}
                    placeholder="例如：更犀利，但不要标题党"
                  />
                  <span className="field-count">{titleAngle.length}/2,000</span>
                </label>
                <div className="title-bridge-actions">
                  <div className="platform-toggle" aria-label="发布平台">
                    <button type="button" className={publishPlatform === "xiaohongshu" ? "is-active" : ""} onClick={() => changePublishPlatform("xiaohongshu")}>小红书</button>
                    <button type="button" className={publishPlatform === "douyin" ? "is-active" : ""} onClick={() => changePublishPlatform("douyin")}>抖音</button>
                  </div>
                  <button
                    type="button"
                    className="title-generate-btn"
                    disabled={sourceText.trim().length < 10 || titlePlansLoading}
                    onClick={() => { void requestTitleMaster(); }}
                  >
                    {titlePlansLoading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
                    {titlePlansLoading ? "标题大师正在读全文…" : "生成标题方案"}
                  </button>
                </div>
                {titlePlansError && <p className="title-bridge-error">{titlePlansError}</p>}
                {titlePlans.length > 0 && (
                  <div className="title-plan-grid">
                    {titlePlans.map((plan, index) => (
                      <button
                        type="button"
                        key={`${plan.direction}-${index}`}
                        className={cn("title-plan-card", selectedTitlePlan === index && "is-selected")}
                        onClick={() => applyTitlePlan(plan, index)}
                      >
                        <span className="title-plan-direction">{plan.direction}</span>
                        <strong>{publishPlatform === "xiaohongshu" ? plan.xiaohongshu : plan.videoTitle}</strong>
                        <span>封面：{plan.coverMain}{plan.coverSub ? ` · ${plan.coverSub}` : ""}</span>
                        <em>{selectedTitlePlan === index ? "已用于这张封面" : "选用这套"}</em>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <label className="form-field">
                <span className="field-label">主标题 <em>必填</em></span>
                <input
                  type="text"
                  value={title}
                  maxLength={30}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：为什么越来越多人开始徒步旅行?"
                />
                <span className="field-count">{title.length}/30</span>
              </label>
              <label className="form-field">
                <span className="field-label">副标题 <em>选填</em></span>
                <input
                  type="text"
                  value={subtitle}
                  maxLength={30}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="例如：一场治愈身心的自由之旅"
                />
                <span className="field-count">{subtitle.length}/30</span>
              </label>
              <label className="form-field">
                <span className="field-label">发布标题 <em>交给发布人员</em></span>
                <input
                  type="text"
                  value={publishTitle}
                  maxLength={100}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder="选用标题大师方案后自动填入，也可以手动填写"
                />
                <span className="field-count">{publishTitle.length}/100</span>
              </label>
              <label className="form-field">
                <span className="field-label">关键词 <em>选填</em></span>
                <input
                  type="text"
                  value={keywords}
                  maxLength={60}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="风格关键词，如：清新、自然、治愈系"
                />
                <span className="field-count">{keywords.length}/60</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 3: Style & Settings */}
        {step === 3 && (
          <div className="step-panel fade-in">
            <div className="step-header">
              <span className="step-number">03</span>
              <div>
                <h2>确认风格</h2>
                <p>检查设置，准备开始创作</p>
              </div>
            </div>
            <div className="style-summary">
              <div className="summary-card">
                <div className="summary-item">
                  <span className="summary-label">底图</span>
                  <span className="summary-value">
                    {imagePreview && <img src={imagePreview} alt="" className="summary-thumb" />}
                    {imageName || "已上传"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">标题</span>
                  <span className="summary-value">{title}</span>
                </div>
                {subtitle && (
                  <div className="summary-item">
                    <span className="summary-label">副标题</span>
                    <span className="summary-value">{subtitle}</span>
                  </div>
                )}
                <div className="summary-item">
                  <span className="summary-label">发布标题</span>
                  <span className="summary-value">{publishTitle.trim() || title}</span>
                </div>
                {keywords && (
                  <div className="summary-item">
                    <span className="summary-label">关键词</span>
                    <span className="summary-value">{keywords}</span>
                  </div>
                )}
                <div className="summary-item">
                  <span className="summary-label">比例 × 数量</span>
                  <span className="summary-value">
                    {selectedRatios.map(([r, c]) => `${r}(${c}张)`).join("、") || "未选择"}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">引擎</span>
                  <span className="summary-value">
                    {engineOptions.find((e) => e.id === engine)?.title || engine}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">总计</span>
                  <span className="summary-value">{totalCount} 张</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">消耗积分</span>
                  <span className="summary-value" style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {isLocalLipa ? "0（本地免费）" : user?.role === "admin" ? "0（管理员免费）" : `${creditsCost} 积分`}
                  </span>
                </div>
              </div>

              <div className="style-controls">
                <label className="style-select">
                  <span>生成引擎</span>
                  <div className="select-wrap">
                    <select value={engine} onChange={(e) => setEngine(e.target.value as ImageEngine)}>
                      {engineOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.title} — {opt.description}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>

                {totalCount > 0 && engineOptions.length > 1 && (
                  <div className="slot-engine-section" style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>逐张引擎（共 {totalCount} 张，可单独指定）</span>
                      <div style={{ display: "flex", gap: 8 }}>
                        {engineOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSlotEngines(Array.from({ length: totalCount }, () => opt.id))}
                            style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#cbd5e1", cursor: "pointer", fontSize: 12 }}
                          >
                            全部 {engineShortLabel(opt.id)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
                      {slots.map((slot, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>封面{i + 1} · {slot.ratio}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {engineOptions.map((opt) => {
                              const active = (slotEngines[i] ?? engine) === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setSlotEngines((prev) => {
                                    const next = Array.from({ length: totalCount }, (_, k) => prev[k] ?? engine);
                                    next[i] = opt.id;
                                    return next;
                                  })}
                                  style={{ padding: "3px 9px", borderRadius: 6, cursor: "pointer", fontSize: 11, border: "none", background: active ? "#fbbf24" : "rgba(255,255,255,0.08)", color: active ? "#1a1a1a" : "#cbd5e1", fontWeight: active ? 700 : 400 }}
                                >
                                  {engineShortLabel(opt.id)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Generate & Results */}
        {step === 4 && (
          <div className="step-panel fade-in">
            <div className="step-header">
              <span className="step-number">04</span>
              <div>
                <h2>{runState === "done" ? "创作完成" : isGenerating ? "正在创作..." : "开始生成"}</h2>
                <p>{runState === "done" ? "点击封面放大预览，弹窗内可下载" : isGenerating ? message : "一切就绪，点击下方按钮开始 AI 创作"}</p>
              </div>
            </div>

            {isGenerating && (
              <div className="gen-progress">
                <div className="gen-bar">
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="gen-status">
                  <LoaderCircle className="spin" size={16} />
                  <span>{message}</span>
                  <span>{completedCount}/{total}</span>
                </div>
              </div>
            )}

            {runState === "error" && errorMessage && (
              <div className="gen-error"><p>{errorMessage}</p></div>
            )}

            {shortfallNote && runState === "done" && (
              <div className="shortfall-note"><p>ℹ️ {shortfallNote}</p></div>
            )}

            {runState === "done" && (verticalResults.length > 0 || horizontalResults.length > 0) && (
              <div className="delivery-card">
                <div>
                  <span>交给发布人员</span>
                  <strong>{publishTitle.trim() || title}</strong>
                  <p>封面字：{title}{subtitle ? ` · ${subtitle}` : ""}</p>
                </div>
                <div className="delivery-actions">
                  <button type="button" onClick={() => { void copyDelivery(); }}><Copy size={15} />{deliveryCopied ? "已复制" : "复制文案"}</button>
                  <button type="button" onClick={() => downloadDelivery()}><Download size={15} />下载文案</button>
                </div>
              </div>
            )}

            {/* 队列分批结果：每批一组，组里每张都能单独调整（和普通封面完全一样） */}
            {queue.map((t) => {
              const covers = results.filter((c) => c.group === t.id && !c.error);
              if (covers.length === 0 && t.status !== "running") return null;
              const vs = covers.filter((c) => !isLandscapeRatio(c.ratio));
              const hs = covers.filter((c) => isLandscapeRatio(c.ratio));
              return (
                <div key={`grp-${t.id}`} className="task-group">
                  <div className="task-group-head">
                    <div>
                      <strong>{t.label}</strong>
                      {t.publishTitle && <small>发布标题：{t.publishTitle}</small>}
                    </div>
                    <div className="task-group-delivery">
                      <span>{covers.filter((c) => c.image_url).length} 张 · {taskStatusText(t.status)}</span>
                      {t.status === "done" && t.publishTitle && (
                        <button type="button" onClick={() => { void copyDelivery(t); }}><Copy size={13} />复制交付文案</button>
                      )}
                    </div>
                  </div>
                  {vs.length > 0 && <div className="results-grid is-vertical">{vs.map(renderCard)}</div>}
                  {hs.length > 0 && <div className="results-grid is-horizontal">{hs.map(renderCard)}</div>}
                  {covers.length === 0 && t.status === "running" && <p className="task-group-empty">生成中…</p>}
                </div>
              );
            })}

            {downloadStatus && (
              <div className="download-note">
                <Download size={16} />
                <span>{downloadStatus.message}</span>
                {downloadStatus.downloadUrl && (
                  <a href={downloadStatus.downloadUrl} download={downloadStatus.filename}>
                    打开下载
                  </a>
                )}
              </div>
            )}

            {/* 未分组的封面（单次生成 / 从历史或收藏打开的）——每张都能单独调整 */}
            {(verticalResults.length > 0 || horizontalResults.length > 0) && (
              <>
                {verticalResults.length > 0 && (
                  <div className="results-grid is-vertical">{verticalResults.map(renderCard)}</div>
                )}
                {horizontalResults.length > 0 && (
                  <div className="results-grid is-horizontal">{horizontalResults.map(renderCard)}</div>
                )}
              </>
            )}

            {!isGenerating && !queueRunning && runState !== "done" && (
              <div className="gen-actions" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
                <button type="button" className="generate-btn" style={{ flex: 1, minWidth: 200 }} onClick={startGenerate}>
                  <Sparkles size={20} />
                  开始生成（{totalCount}张）
                </button>
                <button type="button" className="stop-btn" style={{ width: "auto" }} title="把当前这套配置存成一个任务，稍后一起排队生成" onClick={() => { void addToQueue(); }}>
                  ＋ 加入队列
                </button>
              </div>
            )}
            {isGenerating && (
              <button type="button" className="stop-btn" onClick={stopGenerate}>
                <Square size={16} />
                停止生成
              </button>
            )}
            {runState === "done" && (
              <div className="done-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>本组 {doneCount} 张已完成 · 已自动存入「历史」</span>
                <div style={{ display: "flex", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
                  <button type="button" className="stop-btn" style={{ width: "auto" }} onClick={() => { void downloadAll(); }}>
                    <Download size={16} /> 下载全部
                  </button>
                  <button type="button" className="stop-btn" style={{ width: "auto" }} onClick={() => { setResults([]); setRunState("idle"); startGenerate(); }}>
                    <Sparkles size={16} /> 再生成一批
                  </button>
                  <button type="button" className="generate-btn" style={{ width: "auto" }} onClick={startNewProject}>
                    <ImagePlus size={20} /> 新建封面
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step Navigation */}
      <footer className="step-nav">
        <button type="button" className="nav-prev" onClick={prevStep} disabled={step === 1}>
          <ArrowLeft size={18} />
          上一步
        </button>
        {!queueRunning && (
          <button
            type="button"
            className="nav-queue"
            title="把当前这套配置（底图/标题/风格/比例）存成一个任务，加进队列；可以摆好多个再一起排队生成"
            disabled={!!validateInputs()}
            onClick={() => { void addToQueue(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          >
            ＋ 加入队列{queue.length > 0 ? `（已 ${queue.length}）` : ""}
          </button>
        )}
        {step < 4 ? (
          <div className="step-nav-next-group">
            {!canProceed(step) && (
              <span className="step-nav-hint">
                {step === 1 ? "← 先上传底图、选好比例" : step === 2 ? "← 先填写主标题" : ""}
              </span>
            )}
            <button type="button" className="nav-next" onClick={nextStep} disabled={!canProceed(step)}>
              下一步
              <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          !isGenerating && runState !== "done" && (
            <button type="button" className="nav-next generate" onClick={startGenerate}>
              <Sparkles size={18} />
              生成封面
            </button>
          )
        )}
      </footer>

      {/* Auth Modals */}
      {!isLocalLipa && (
        <>
          <LoginModal open={showLogin} onClose={() => setShowLogin(false)} onLogin={setUser} />
          <RechargeModal
            open={showRecharge}
            onClose={() => setShowRecharge(false)}
            currentCredits={rechargeInfo.current}
            requiredCredits={rechargeInfo.required}
          />
        </>
      )}

      {/* Cover Preview Lightbox：点封面放大看，弹窗内可下载 */}
      {previewCover?.image_url && (
        <div
          className="lightbox-overlay"
          onClick={() => setPreviewCover(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 24, gap: 16,
          }}
        >
          <img
            src={previewCover.image_url}
            alt={previewCover.label}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "92vw", maxHeight: "78vh", objectFit: "contain",
              borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          />
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <span style={{ color: "#cbd5e1", fontSize: 14 }}>
              {previewCover.ratio ? `${previewCover.ratio} · ${previewCover.label}` : previewCover.label}
            </span>
            <button
              type="button"
              onClick={() => { void downloadCover(previewCover); }}
              disabled={downloadingCoverId === previewCover.id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 999, border: "none",
                background: "#fbbf24", color: "#1a1a1a", fontWeight: 700, cursor: "pointer",
              }}
            >
              {downloadingCoverId === previewCover.id ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
              下载
            </button>
            <button
              type="button"
              onClick={() => setPreviewCover(null)}
              style={{
                padding: "8px 18px", borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.3)",
                background: "transparent", color: "#fff", cursor: "pointer",
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
