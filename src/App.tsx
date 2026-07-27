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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { deleteHistoryBatch, getHistory, saveHistoryBatch } from "./lib/history";
import { downloadImageUrl, exportImageUrl, fileToDownscaledDataUrl, formatTime, urlToDataUrl } from "./lib/image";
import type { CoverResult, CoverPlan, GenerateEvent, HistoryBatch, ImageEngine } from "./lib/types";
import { LoginModal } from "./components/LoginModal";
import { CreditsBadge } from "./components/CreditsBadge";
import { RechargeModal } from "./components/RechargeModal";
import { fetchMe, logout as apiLogout, getToken, getCreditsCost, fetchBalance, type UserInfo } from "./lib/api";
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

type RatioSelection = Record<AspectRatio, number>; // 0 = not selected, 1-10 = count

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
  // 每个比例各自最多 10 张，总数为各比例之和（不再被截断到 10）。
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
      // 每个比例各自 0-10 张，互不影响。
      [id]: Math.max(0, Math.min(10, prev[id] + delta)),
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

  /* ─── Generation ─── */
  const startGenerate = async () => {
    if (sourceMode === "base" && !imagePreview) { setErrorMessage("请先上传底图"); setRunState("error"); return; }
    if (sourceMode === "elements" && elementImages.length === 0) { setErrorMessage("请至少上传一张素材"); setRunState("error"); return; }
    if (sourceMode === "describe" && !imageDescription.trim()) { setErrorMessage("请填写画面描述"); setRunState("error"); return; }
    if (!title.trim()) { setErrorMessage("请先填写标题"); setRunState("error"); return; }
    if (totalCount === 0) { setErrorMessage("请至少选择一种比例和数量"); setRunState("error"); return; }

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
        body: JSON.stringify({
          image: image || undefined,
          title: title.trim(),
          subtitle: subtitle.trim(),
          keywords: keywords.trim(),
          engine,
          count,
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
        }),
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
          // 只保留成功出图的：失败/未返回的直接不显示（少一张就少一张，不弹错误原因）。
          const final = (event.results || collected).filter((r) => r.image_url);
          // 但要保住用户在批量还没跑完时就动手编辑出的「新变体」卡片（id 从 VARIANT_ID_BASE 起）。
          setResults((prev) => {
            const variants = prev.filter((r) => r.id >= VARIANT_ID_BASE);
            return [...final, ...variants].sort((a, b) => a.id - b.id);
          });
          setProgress(event.total || count);
          setRunState("done");
          if (final.length > 0) {
            saveHistoryBatch({
              id: `batch-${Date.now()}`,
              createdAt: new Date().toISOString(),
              title: title.trim(),
              subtitle: subtitle.trim(),
              keywords: keywords.trim(),
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

  // 单张重生：用同一引擎或换一个引擎，另生成一张（原图保留，新的一张追加在后面）。
  const regenerateCover = async (cover: CoverResult, newEngine?: ImageEngine) => {
    const plan = plansById[cover.id];
    if (!plan) {
      setDownloadStatus({ filename: "", message: "这张缺少方案数据（可能来自历史记录），请整批重新生成后再单张重生。" });
      return;
    }
    const useEngine: ImageEngine = newEngine || cover.engine || engine;
    const newId = nextVariantId();
    setPlansById((prev) => ({ ...prev, [newId]: plan }));
    setResults((prev) => [
      ...prev,
      { id: newId, combination: cover.combination, label: cover.label, ratio: cover.ratio, engine: useEngine },
    ]);
    setRegeneratingIds((prev) => [...prev, newId]);
    try {
      const img = await getImageDataUrl();
      const token = getToken();
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          plan,
          ratio: cover.ratio,
          engine: useEngine,
          sourceMode,
          image: img || undefined,
          elementImages: sourceMode === "elements" ? elementImages.map((e) => e.dataUrl) : undefined,
          imageDescription: sourceMode === "describe" ? imageDescription.trim() : undefined,
          inspiration: inspiration.trim() || undefined,
        }),
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
    if (!plan) {
      setDownloadStatus({ filename: "", message: "这张缺少方案数据，无法出同款别的比例。" });
      return;
    }
    setRatioPickerFor(null);
    const newId = nextVariantId();
    const useEngine: ImageEngine = cover.engine || engine;
    setPlansById((prev) => ({ ...prev, [newId]: plan }));
    setResults((prev) => [
      ...prev,
      { id: newId, combination: cover.combination, label: cover.label, ratio: newRatio, engine: useEngine },
    ]);
    setRegeneratingIds((prev) => [...prev, newId]);
    try {
      const img = await getImageDataUrl();
      const token = getToken();
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          plan,
          ratio: newRatio,
          engine: useEngine,
          sourceMode,
          image: img || undefined,
          elementImages: sourceMode === "elements" ? elementImages.map((e) => e.dataUrl) : undefined,
          imageDescription: sourceMode === "describe" ? imageDescription.trim() : undefined,
          inspiration: inspiration.trim() || undefined,
        }),
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

  // 单张「换某一项」：保持组合不变，只替换一个维度（或只换字体颜色），另出一张（原图保留）。
  const regenerateRebuild = async (cover: CoverResult, opts: { swap?: { dimension: string; optionId: string }; textColor?: string }) => {
    if (!cover.combination) return;
    setSwapCoverId(null);
    setSwapDim("");
    const newId = nextVariantId();
    const useEngine: ImageEngine = cover.engine || engine;
    setResults((prev) => [
      ...prev,
      { id: newId, combination: cover.combination, label: cover.label, ratio: cover.ratio, engine: useEngine },
    ]);
    setRegeneratingIds((prev) => [...prev, newId]);
    try {
      const img = await getImageDataUrl();
      const token = getToken();
      const response = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          rebuild: {
            combination: cover.combination,
            swap: opts.swap,
            textColor: opts.textColor ?? (lockedTextColor.length ? lockedTextColor[Math.floor(Math.random() * lockedTextColor.length)] : undefined),
            title: title.trim(),
            subtitle: subtitle.trim(),
            smartScene: smartScene || undefined,
            id: newId,
          },
          ratio: cover.ratio,
          engine: useEngine,
          sourceMode,
          image: img || undefined,
          elementImages: sourceMode === "elements" ? elementImages.map((e) => e.dataUrl) : undefined,
          imageDescription: sourceMode === "describe" ? imageDescription.trim() : undefined,
          inspiration: inspiration.trim() || undefined,
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
    setErrorMessage("");
    setDownloadStatus(null);
    setStep(1);
  };

  const openBatch = (batch: HistoryBatch) => {
    setTitle(batch.title);
    setSubtitle(batch.subtitle);
    setKeywords(batch.keywords || "");
    setEngine(normalizeStoredEngine(batch.engine));
    setRatioSelection({ "16:9": 0, "4:3": 0, "1:1": 0, "3:4": Math.min(10, batch.count), "9:16": 0, "bilibili-safe": 0 });
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
    const canAct = !busy && (!!cover.image_url || !!cover.error) && !!plansById[cover.id];
    return (
      <article key={cover.id} className={cn("result-card", busy && "is-loading")}>
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
                onClick={() => { setSwapCoverId(swapCoverId === cover.id ? null : cover.id); setSwapDim(""); }}
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
        {canAct && cover.image_url && swapCoverId === cover.id && (
          <div className="result-ratio-picker">
            <span className="rrp-hint">这张哪里想换？（其余保持不变）</span>
            <div className="rrp-chips">
              {SWAP_DIMS.map((sd) => (
                <button key={sd.d} type="button" className={cn("result-act", swapDim === sd.d && "is-cur")} onClick={() => setSwapDim(swapDim === sd.d ? "" : sd.d)}>
                  {sd.n}
                </button>
              ))}
            </div>
            {swapDim && swapDim !== "COLOR" && (
              <div className="rrp-chips">
                {dimOptionsOf(swapDim).map((o) => {
                  const isCurrent = (cover.combination || "").split("+").includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={cn("result-act", isCurrent && "is-cur")}
                      title={isCurrent ? "当前就是这个" : `换成「${o.name}」重生这张`}
                      onClick={() => { if (!isCurrent) regenerateRebuild(cover, { swap: { dimension: swapDim, optionId: o.id } }); }}
                    >
                      {o.name}
                    </button>
                  );
                })}
              </div>
            )}
            {swapDim === "COLOR" && (
              <div className="textcolor-row">
                {presetTextColors.map((c) => (
                  <button key={c} type="button" className="tc-swatch" style={{ background: c }} title={`主标题换成 ${c}`} onClick={() => regenerateRebuild(cover, { textColor: c })} />
                ))}
                <label className="tc-custom" title="自定义颜色">
                  <input type="color" defaultValue="#FFDE00" onChange={(e) => regenerateRebuild(cover, { textColor: e.target.value.toUpperCase() })} />
                  自定义
                </label>
              </div>
            )}
          </div>
        )}
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
  const verticalResults = results.filter((r) => !isLandscapeRatio(r.ratio) && !r.error);
  const horizontalResults = results.filter((r) => isLandscapeRatio(r.ratio) && !r.error);
  const doneCount = results.filter((r) => r.image_url).length;

  /* ─── Render ─── */
  return (
    <main className="app-shell">
      <div className="bg-gradient" aria-hidden="true" />

      {/* Header */}
      <header className="site-header">
        <div className="header-brand">
          <span className="brand-plate">
            <img src="/logo.png" alt="巴卡巴卡 BAKABAKA" className="brand-logo" />
          </span>
          <small className="brand-copyright">Copyright © 畅导吃枸杞</small>
        </div>
        <nav className="header-nav">
          <button type="button" className={cn("nav-btn", "nav-btn-history", showHistory && "is-active")} onClick={() => setShowHistory(!showHistory)}>
            <History size={18} />
            <span>我的作品{history.length > 0 ? `（${history.length}）` : ""}</span>
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
                  {styleOptions.moods.map((m) => {
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
                  {styleOptions.fonts.map((f) => {
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
                  {styleOptions.layouts.map((l) => (
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
                  {styleOptions.effects.map((ef) => {
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
                  {styleOptions.colors.map((c) => {
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
                  {styleOptions.decorations.map((de) => (
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
                  {styleOptions.compositions.map((co) => (
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
                <p>输入封面上要展示的标题和副标题</p>
              </div>
            </div>
            <div className="form-fields">
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

            {results.length > 0 && (
              <>
                {verticalResults.length > 0 && (
                  <div className="results-grid is-vertical">{verticalResults.map(renderCard)}</div>
                )}
                {horizontalResults.length > 0 && (
                  <div className="results-grid is-horizontal">{horizontalResults.map(renderCard)}</div>
                )}
              </>
            )}

            {!isGenerating && runState !== "done" && (
              <button type="button" className="generate-btn" onClick={startGenerate}>
                <Sparkles size={20} />
                开始生成封面（{totalCount}张）
              </button>
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
