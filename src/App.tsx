import {
  Archive,
  Check,
  Download,
  ChevronDown,
  Coins,
  Crown,
  History,
  ImagePlus,
  LoaderCircle,
  MoreHorizontal,
  Play,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Upload,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { deleteHistoryBatch, getHistory, saveHistoryBatch } from "./lib/history";
import { downloadDataUrl, fileToDataUrl, formatTime, urlToDataUrl } from "./lib/image";
import type { CoverResult, GenerateCount, GenerateEvent, HistoryBatch, ImageEngine } from "./lib/types";

const countOptions: GenerateCount[] = [1, 2, 4, 10];
type AccountTier = "guest" | "creator" | "internal";
type TonePreset = "auto" | "sweet" | "clean" | "neon" | "luxury" | "clinic";
type FontPreset = "auto" | "bold" | "cute" | "handwriting" | "editorial";
type HarmonyMode = "auto" | "complementary" | "analogous" | "triad" | "mono";

const accountOptions: Array<{
  id: AccountTier;
  name: string;
  label: string;
  credits: number;
  internal: boolean;
}> = [
  { id: "internal", name: "LIPA 内部账号", label: "内部免扣", credits: 9999, internal: true },
  { id: "creator", name: "创作者账号", label: "套餐用户", credits: 86, internal: false },
  { id: "guest", name: "游客预览", label: "需登录", credits: 0, internal: false },
];

const toneOptions: Array<{ id: TonePreset; title: string; colors: string[]; prompt: string }> = [
  { id: "auto", title: "智能配色", colors: ["#FF4FD8", "#FFE76A", "#FFFFFF"], prompt: "auto choose a viral color palette based on the uploaded image" },
  { id: "sweet", title: "甜辣粉橘", colors: ["#FF4DA6", "#FF8A5C", "#FFF1F8"], prompt: "sweet influencer pink and warm coral tones" },
  { id: "clean", title: "清透蓝白", colors: ["#33C7FF", "#FFFFFF", "#EAF7FF"], prompt: "fresh clean blue and white tones" },
  { id: "neon", title: "高亮撞色", colors: ["#B7FF2A", "#FFEA00", "#111111"], prompt: "high saturation neon contrast colors" },
  { id: "luxury", title: "黑金高级", colors: ["#111111", "#E8C26A", "#FFF7E8"], prompt: "premium black gold editorial palette" },
  { id: "clinic", title: "健康科普", colors: ["#23CFA7", "#F6FFFB", "#1E5C4B"], prompt: "clinical wellness mint green and clean white palette" },
];

const fontOptions: Array<{ id: FontPreset; title: string; prompt: string }> = [
  { id: "auto", title: "智能字体", prompt: "auto choose typography" },
  { id: "bold", title: "爆款粗黑", prompt: "extra bold viral Chinese headline type" },
  { id: "cute", title: "美图可爱", prompt: "rounded cute Meitu-style Chinese type" },
  { id: "handwriting", title: "手写笔记", prompt: "casual handwritten note-style Chinese type" },
  { id: "editorial", title: "杂志标题", prompt: "fashion magazine editorial Chinese headline type" },
];

const harmonyOptions: Array<{ id: HarmonyMode; title: string; hint: string }> = [
  { id: "auto", title: "智能", hint: "自动推荐" },
  { id: "complementary", title: "互补", hint: "强对比" },
  { id: "analogous", title: "邻近", hint: "柔和统一" },
  { id: "triad", title: "三色", hint: "活泼跳色" },
  { id: "mono", title: "单色", hint: "高级克制" },
];

const colorRoles = ["标题", "强调", "贴纸", "主色", "底色"];

const engineOptions: Array<{
  id: ImageEngine;
  title: string;
  vendor: string;
  description: string;
  badge: string;
}> = [
  {
    id: "openai",
    title: "GPT-Image-2",
    vendor: "OpenAI",
    description: "风格更多变，创意更强",
    badge: "默认",
  },
  {
    id: "auto",
    title: "自动选择",
    vendor: "智能分配",
    description: "根据内容与已配置密钥分配",
    badge: "AUTO",
  },
  {
    id: "wanxiang",
    title: "通义万相",
    vendor: "阿里",
    description: "中文渲染质量高，强烈推荐",
    badge: "推荐",
  },
  {
    id: "jimeng",
    title: "即梦",
    vendor: "字节",
    description: "中文更准，速度更快",
    badge: "CLI",
  },
  {
    id: "cogview",
    title: "CogView-4",
    vendor: "智谱",
    description: "中文理解好，新用户赠送 tokens",
    badge: "预留",
  },
  {
    id: "wenxin",
    title: "文心一格",
    vendor: "百度",
    description: "中文渲染稳定",
    badge: "预留",
  },
];

const demoResults: CoverResult[] = [
  {
    id: 1,
    combination: "A1+B1+C3+D7+E4",
    label: "书法 / 明黄 / 霸屏",
    image_url: "/samples/cover-calligraphy.png",
  },
  {
    id: 2,
    combination: "A3+B2+C11+D3+E9",
    label: "手写 / 白字 / 自然风",
    image_url: "/samples/cover-handwriting.png",
  },
  {
    id: 3,
    combination: "A7+B8+C10+D1+E1",
    label: "标题体 / 绿色 / 清新",
    image_url: "/samples/cover-editorial.png",
  },
];

type RunState = "demo" | "idle" | "analyzing" | "planning" | "generating" | "done" | "error";
type EditLayer = {
  title: string;
  subtitle: string;
  color: string;
  accent: string;
  x: number;
  y: number;
  size: number;
};
type PaletteScheme = {
  id: string;
  title: string;
  subtitle: string;
  colors: string[];
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

async function readSseStream(response: Response, onEvent: (event: GenerateEvent) => void) {
  if (!response.body) {
    throw new Error("浏览器没有返回可读取的数据流。");
  }
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
      const dataLine = chunk
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.replace(/^data:\s?/u, "");
      onEvent(JSON.parse(json) as GenerateEvent);
    }
  }
}

function createEmptySlots(total: number, results: CoverResult[], isGenerating: boolean): CoverResult[] {
  const sorted = [...results].sort((a, b) => a.id - b.id);
  if (!isGenerating) return sorted;
  const ids = new Set(sorted.map((item) => item.id));
  const items = [...sorted];
  for (let index = 1; index <= total; index += 1) {
    if (!ids.has(index)) {
      items.push({
        id: index,
        combination: "pending",
        label: index === sorted.length + 1 ? "生成中" : "排队中",
      });
    }
  }
  return items.sort((a, b) => a.id - b.id);
}

function readableHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function hexToRgb(hex: string) {
  const raw = hex.replace("#", "").trim();
  const value = raw.length === 3
    ? raw.split("").map((item) => `${item}${item}`).join("")
    : raw.padEnd(6, "0").slice(0, 6);
  return {
    red: parseInt(value.slice(0, 2), 16) || 30,
    green: parseInt(value.slice(2, 4), 16) || 30,
    blue: parseInt(value.slice(4, 6), 16) || 30,
  };
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
    if (max === g) hue = (b - r) / delta + 2;
    if (max === b) hue = (r - g) / delta + 4;
    hue *= 60;
  }

  return { hue: normalizeHue(hue), saturation: saturation * 100, lightness: lightness * 100 };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const h = normalizeHue(hue) / 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;

  if (s === 0) {
    const gray = readableHex(l * 255);
    return `#${gray}${gray}${gray}`;
  }

  const hueToRgb = (p: number, q: number, tValue: number) => {
    let t = tValue;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const red = hueToRgb(p, q, h + 1 / 3);
  const green = hueToRgb(p, q, h);
  const blue = hueToRgb(p, q, h - 1 / 3);
  return `#${readableHex(red * 255)}${readableHex(green * 255)}${readableHex(blue * 255)}`;
}

function uniqueColors(colors: string[]) {
  return [...new Set(colors.map((color) => color.toUpperCase()))];
}

function buildHarmonyPalette(hex: string, mode: HarmonyMode) {
  const { red, green, blue } = hexToRgb(hex);
  const { hue, saturation, lightness } = rgbToHsl(red, green, blue);
  const vivid = clamp(Math.max(saturation, 46) + 16, 48, 88);
  const sourceLightness = clamp(lightness, 32, 64);
  const source = hslToHex(hue, vivid, sourceLightness);
  const ground = lightness < 52 ? hslToHex(hue, 42, 94) : hslToHex(hue, 34, 14);
  const title = lightness < 52 ? "#281125" : "#D8F2DA";

  if (mode === "complementary") {
    return uniqueColors([title, hslToHex(hue + 180, vivid, 56), hslToHex(hue + 22, 82, 58), source, ground]);
  }
  if (mode === "analogous") {
    return uniqueColors([title, hslToHex(hue - 28, vivid, 58), hslToHex(hue + 32, vivid, 62), source, ground]);
  }
  if (mode === "triad") {
    return uniqueColors([title, hslToHex(hue + 120, vivid, 56), hslToHex(hue + 240, vivid, 58), source, ground]);
  }
  if (mode === "mono") {
    return uniqueColors([title, hslToHex(hue, vivid, 72), hslToHex(hue, clamp(vivid - 10, 38, 78), 42), source, ground]);
  }

  return uniqueColors([title, hslToHex(hue + 150, vivid, 56), hslToHex(hue + 34, 86, 62), source, ground]);
}

function buildSuggestedPalette(hex: string) {
  return buildHarmonyPalette(hex, "auto");
}

function relativeLuminance(hex: string) {
  const { red, green, blue } = hexToRgb(hex);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastGrade(ratio: number) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "LOW";
}

async function analyzePaletteFromDataUrl(dataUrl: string): Promise<{ dominant: string; suggestions: string[] }> {
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
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 180) continue;
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
    count += 1;
  }
  if (count === 0) return { dominant: "#6F7C79", suggestions: ["#FFFFFF", "#FFE15A", "#FF4FA3"] };
  const dominant = `#${readableHex(red / count)}${readableHex(green / count)}${readableHex(blue / count)}`;
  return { dominant, suggestions: buildSuggestedPalette(dominant) };
}

export function App() {
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");
  const [title, setTitle] = useState("为什么越来越多人开始徒步旅行?");
  const [subtitle, setSubtitle] = useState("一场治愈身心的自由之旅");
  const [keywords, setKeywords] = useState("徒步 | 旅行 | 治愈 | 自由 | 风景");
  const [engine, setEngine] = useState<ImageEngine>("openai");
  const [accountTier, setAccountTier] = useState<AccountTier>("internal");
  const [tonePreset, setTonePreset] = useState<TonePreset>("auto");
  const [fontPreset, setFontPreset] = useState<FontPreset>("auto");
  const [harmonyMode, setHarmonyMode] = useState<HarmonyMode>("auto");
  const [selectedPaletteId, setSelectedPaletteId] = useState("image");
  const [detectedColor, setDetectedColor] = useState("#6F7C79");
  const [suggestedColors, setSuggestedColors] = useState(["#FFFFFF", "#FFE15A", "#FF4FA3"]);
  const [imagePreview, setImagePreview] = useState("/samples/base-hiker.png");
  const [imageName, setImageName] = useState("示例底图");
  const [count, setCount] = useState<GenerateCount>(4);
  const [results, setResults] = useState<CoverResult[]>(demoResults);
  const [progress, setProgress] = useState(3);
  const [total, setTotal] = useState<GenerateCount>(4);
  const [message, setMessage] = useState("正在生成 3/4");
  const [runState, setRunState] = useState<RunState>("demo");
  const [errorMessage, setErrorMessage] = useState("");
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [selectedCover, setSelectedCover] = useState<CoverResult | null>(null);
  const [editLayer, setEditLayer] = useState<EditLayer>({
    title: "封面标题",
    subtitle: "点击编辑副标题",
    color: "#FFFFFF",
    accent: "#FF4FA3",
    x: 50,
    y: 22,
    size: 42,
  });
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const isGenerating = runState === "analyzing" || runState === "planning" || runState === "generating";
  const displayResults = useMemo(
    () => createEmptySlots(total, results, isGenerating || runState === "demo"),
    [isGenerating, results, runState, total],
  );
  const completedCount = results.filter((result) => result.image_url || result.error).length;
  const progressPercent = Math.min(100, Math.round((Math.max(progress, completedCount) / total) * 100));
  const canDownload = results.some((result) => result.image_url);
  const selectedEngine = engineOptions.find((option) => option.id === engine) || engineOptions[0];
  const selectedAccount = accountOptions.find((option) => option.id === accountTier) || accountOptions[0];
  const selectedTone = toneOptions.find((option) => option.id === tonePreset) || toneOptions[0];
  const selectedFont = fontOptions.find((option) => option.id === fontPreset) || fontOptions[0];
  const selectedHarmony = harmonyOptions.find((option) => option.id === harmonyMode) || harmonyOptions[0];
  const harmonyPalette = useMemo(() => buildHarmonyPalette(detectedColor, harmonyMode), [detectedColor, harmonyMode]);
  const activeToneColors = tonePreset === "auto" ? suggestedColors : selectedTone.colors;
  const paletteSchemes = useMemo<PaletteScheme[]>(() => {
    const current = uniqueColors(activeToneColors);
    return [
      { id: "image", title: "IMAGE MATCH", subtitle: "从底图提取", colors: current },
      { id: "viral", title: "VIRAL POP", subtitle: "高点击撞色", colors: buildHarmonyPalette(detectedColor, "triad") },
      { id: "soft", title: "SOFT CURATED", subtitle: "柔和网感", colors: buildHarmonyPalette(detectedColor, "analogous") },
      { id: "editorial", title: "EDITORIAL AAA", subtitle: "强对比留白", colors: buildHarmonyPalette(detectedColor, "mono") },
    ];
  }, [activeToneColors, detectedColor]);
  const contrastBase = activeToneColors[4] || detectedColor;
  const currentContrast = contrastRatio(editLayer.color, contrastBase);
  const editorSwatches = useMemo(
    () => uniqueColors([...harmonyPalette, ...activeToneColors, ...suggestedColors, "#FFFFFF", "#111111", "#FF4FA3"]),
    [activeToneColors, harmonyPalette, suggestedColors],
  );
  const estimatedCost = selectedAccount.internal ? 0 : count;

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getHistory());
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const storedTier = window.localStorage.getItem("lipa-account-tier") as AccountTier | null;
    if (storedTier && accountOptions.some((option) => option.id === storedTier)) {
      setAccountTier(storedTier);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lipa-account-tier", accountTier);
  }, [accountTier]);

  useEffect(() => {
    let cancelled = false;
    getImageDataUrl()
      .then((dataUrl) => analyzePaletteFromDataUrl(dataUrl))
      .then((palette) => {
        if (cancelled) return;
        setDetectedColor(palette.dominant);
        setSuggestedColors(palette.suggestions);
        if (tonePreset === "auto") {
          setEditLayer((previous) => ({ ...previous, color: palette.suggestions[0], accent: palette.suggestions[1] }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetectedColor("#6F7C79");
          setSuggestedColors(["#FFFFFF", "#FFE15A", "#FF4FA3"]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [imagePreview]);

  const handleFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setImagePreview(dataUrl);
    setImageName(file.name);
    setRunState("idle");
    setResults([]);
    setProgress(0);
    setMessage("准备就绪");
    setErrorMessage("");
    setSelectedPaletteId("image");
  };

  const getImageDataUrl = async () => {
    if (imagePreview.startsWith("data:")) return imagePreview;
    return urlToDataUrl(imagePreview);
  };

  const applyPalette = (scheme: PaletteScheme) => {
    const colors = uniqueColors(scheme.colors);
    setSelectedPaletteId(scheme.id);
    setTonePreset("auto");
    setSuggestedColors(colors);
    setEditLayer((previous) => ({
      ...previous,
      color: colors[0] || previous.color,
      accent: colors[1] || previous.accent,
    }));
    if (runState === "demo") setRunState("idle");
  };

  const persistResults = async (finalResults: CoverResult[]) => {
    const successful = finalResults.filter((result) => result.image_url && !result.error);
    if (successful.length === 0) return;
    const batch: HistoryBatch = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title,
      subtitle,
      keywords,
      engine,
      count,
      baseImage: await getImageDataUrl(),
      results: successful,
    };
    await saveHistoryBatch(batch);
    await refreshHistory();
  };

  const startGenerate = async () => {
    if (!title.trim()) {
      setErrorMessage("请先填写主标题。");
      setRunState("error");
      return;
    }
    if (accountTier === "guest") {
      setErrorMessage("游客模式不能生成，请先切换为内部账号或创作者账号。");
      setRunState("error");
      return;
    }
    if (!selectedAccount.internal && selectedAccount.credits < count) {
      setErrorMessage("账户点数不足，请充值后再生成。");
      setRunState("error");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("analyzing");
    setErrorMessage("");
    setResults([]);
    setProgress(0);
    setTotal(count);
    setMessage("正在分析底图...");
    setActiveTab("generate");

    try {
      const image = await getImageDataUrl();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          title: title.trim(),
          subtitle: subtitle.trim(),
          keywords: keywords.trim(),
          engine,
          count,
          stylePreferences: {
            tone: selectedTone.title,
            tonePrompt: selectedTone.prompt,
            toneColors: activeToneColors,
            harmony: selectedHarmony.title,
            harmonyHint: selectedHarmony.hint,
            paletteId: selectedPaletteId,
            contrastRatio: Number(currentContrast.toFixed(2)),
            contrastGrade: contrastGrade(currentContrast),
            font: selectedFont.title,
            fontPrompt: selectedFont.prompt,
            detectedColor,
            editableTextColor: editLayer.color,
            editableAccentColor: editLayer.accent,
          },
        }),
        signal: controller.signal,
      });

      const collected: CoverResult[] = [];
      await readSseStream(response, (event) => {
        setMessage(event.message || "");
        setProgress(event.progress || 0);
        setTotal((event.total || count) as GenerateCount);
        if (event.status === "analyzing") setRunState("analyzing");
        if (event.status === "planning" || event.status === "planned") setRunState("planning");
        if (event.status === "generating") setRunState("generating");
        if (event.result) {
          collected.push(event.result);
          setResults((previous) => {
            const withoutDuplicate = previous.filter((item) => item.id !== event.result?.id);
            return [...withoutDuplicate, event.result as CoverResult].sort((a, b) => a.id - b.id);
          });
        }
        if (event.status === "done") {
          const finalResults = (event.results || collected).sort((a, b) => a.id - b.id);
          setResults(finalResults);
          setProgress(event.total || count);
          setRunState("done");
          persistResults(finalResults);
        }
        if (event.status === "error") {
          setRunState("error");
          setErrorMessage(event.message || "生成失败。");
        }
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setMessage("已停止生成");
        setRunState("idle");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "生成失败。");
      setRunState("error");
    }
  };

  const stopGenerate = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState("idle");
    setMessage("已停止生成");
  };

  const resetDemo = () => {
    setTitle("为什么越来越多人开始徒步旅行?");
    setSubtitle("一场治愈身心的自由之旅");
    setKeywords("徒步 | 旅行 | 治愈 | 自由 | 风景");
    setEngine("openai");
    setTonePreset("auto");
    setFontPreset("auto");
    setHarmonyMode("auto");
    setSelectedPaletteId("image");
    setImagePreview("/samples/base-hiker.png");
    setImageName("示例底图");
    setCount(4);
    setTotal(4);
    setProgress(3);
    setResults(demoResults);
    setRunState("demo");
    setMessage("正在生成 3/4");
    setErrorMessage("");
    setEditLayer({
      title: "为什么开始徒步?",
      subtitle: "一场治愈身心的自由之旅",
      color: "#FFFFFF",
      accent: "#FFE15A",
      x: 50,
      y: 22,
      size: 42,
    });
    setActiveTab("generate");
  };

  const openBatch = (batch: HistoryBatch) => {
    setTitle(batch.title);
    setSubtitle(batch.subtitle);
    setKeywords(batch.keywords || "");
    setEngine(batch.engine || "openai");
    setCount(batch.count);
    setTotal(batch.count);
    setImagePreview(batch.baseImage);
    setImageName("历史底图");
    setResults(batch.results);
    setProgress(batch.results.length);
    setRunState("done");
    setMessage("已从历史打开");
    setEditLayer((previous) => ({
      ...previous,
      title: batch.title,
      subtitle: batch.subtitle || previous.subtitle,
    }));
    setActiveTab("generate");
  };

  const deleteBatch = async (id: string) => {
    await deleteHistoryBatch(id);
    await refreshHistory();
  };

  const downloadCover = async (cover: CoverResult) => {
    if (!cover.image_url) return;
    const dataUrl = cover.image_url.startsWith("data:") ? cover.image_url : await urlToDataUrl(cover.image_url);
    downloadDataUrl(dataUrl, `lipa-cover-${cover.id}.png`);
  };

  const openCoverEditor = (cover: CoverResult) => {
    setSelectedCover(cover);
    setEditLayer((previous) => ({
      ...previous,
      title,
      subtitle: subtitle || previous.subtitle,
      color: activeToneColors[0] || previous.color,
      accent: activeToneColors[1] || previous.accent,
    }));
  };

  const downloadEditedCover = async () => {
    if (!selectedCover?.image_url) return;
    const imageUrl = selectedCover.image_url.startsWith("data:")
      ? selectedCover.image_url
      : await urlToDataUrl(selectedCover.image_url);
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片载入失败"));
      image.src = imageUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1024;
    canvas.height = image.naturalHeight || 1536;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const x = (editLayer.x / 100) * canvas.width;
    const y = (editLayer.y / 100) * canvas.height;
    const titleSize = Math.round((editLayer.size / 100) * canvas.width);
    context.textAlign = "center";
    context.textBaseline = "top";
    context.lineJoin = "round";
    context.font = `900 ${titleSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.lineWidth = Math.max(8, titleSize * 0.12);
    context.strokeStyle = "rgba(0,0,0,0.72)";
    context.fillStyle = editLayer.color;
    context.strokeText(editLayer.title, x, y);
    context.fillText(editLayer.title, x, y);
    context.font = `700 ${Math.round(titleSize * 0.34)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.lineWidth = Math.max(4, titleSize * 0.045);
    context.strokeStyle = "rgba(0,0,0,0.62)";
    context.fillStyle = editLayer.accent;
    context.strokeText(editLayer.subtitle, x, y + titleSize * 1.08);
    context.fillText(editLayer.subtitle, x, y + titleSize * 1.08);
    downloadDataUrl(canvas.toDataURL("image/png"), `lipa-cover-edited-${selectedCover.id}.png`);
  };

  const downloadFirst = async () => {
    const first = results.find((result) => result.image_url);
    if (first) await downloadCover(first);
  };

  return (
    <main className="app-shell">
      <section className="device-frame" aria-label="封面生成器工作台">
        <header className="topbar">
          <button className="brand" type="button" onClick={resetDemo} aria-label="重置示例">
            <img className="brand-icon" src="/icons/lipa-icon.png" alt="LIPA" />
            <span className="brand-title">封面生成器</span>
          </button>

          <nav className="toolbar" aria-label="工具栏">
            <button
              className={classNames("tool-button", activeTab === "history" && "is-active")}
              type="button"
              onClick={() => setActiveTab(activeTab === "history" ? "generate" : "history")}
            >
              <History size={22} />
              <span>历史</span>
            </button>
            <button className="tool-button" type="button" onClick={downloadFirst} disabled={!canDownload}>
              <Download size={22} />
              <span>下载</span>
            </button>
            <button
              className={classNames("tool-button", settingsOpen && "is-active")}
              type="button"
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <Settings size={23} />
              <span>设置</span>
            </button>
          </nav>
        </header>

        {settingsOpen && (
          <aside className="settings-panel">
            <div>
              <span className="micro-label">OUTPUT</span>
              <strong>小红书 3:4</strong>
            </div>
            <div>
              <span className="micro-label">SIZE</span>
              <strong>1024 x 1536</strong>
            </div>
            <div>
              <span className="micro-label">ENGINE</span>
              <strong>{selectedEngine.title}</strong>
            </div>
          </aside>
        )}

        <section className="account-card" aria-label="账户与点数">
          <div className="account-main">
            <span className="account-avatar">{selectedAccount.internal ? <Crown size={18} /> : <UserRound size={18} />}</span>
            <span>
              <strong>{selectedAccount.name}</strong>
              <small>{selectedAccount.label}</small>
            </span>
          </div>
          <label className="account-select">
            <select value={accountTier} onChange={(event) => setAccountTier(event.target.value as AccountTier)}>
              {accountOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>
          <div className="credit-pill">
            <Coins size={16} />
            <span>{selectedAccount.internal ? "不扣点" : `${selectedAccount.credits} 点`}</span>
            <em>本次 {estimatedCost}</em>
          </div>
        </section>

        {activeTab === "generate" ? (
          <>
            <section className="input-zone">
              <label className="photo-picker">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                <img src={imagePreview} alt="底图预览" />
                <span className="photo-action">
                  <ImagePlus size={20} />
                  更换图片
                </span>
                <span className="photo-name">{imageName}</span>
              </label>

              <div className="copy-fields">
                <label className="field">
                  <span>标题 <small>必填</small></span>
                  <input
                    value={title}
                    maxLength={30}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      if (runState === "demo") setRunState("idle");
                    }}
                    placeholder="输入主标题"
                  />
                  <em>{title.length}/30</em>
                </label>
                <label className="field">
                  <span>副标题 <small>选填</small></span>
                  <input
                    value={subtitle}
                    maxLength={30}
                    onChange={(event) => {
                      setSubtitle(event.target.value);
                      if (runState === "demo") setRunState("idle");
                    }}
                    placeholder="输入副标题"
                  />
                  <em>{subtitle.length}/30</em>
                </label>
                <label className="field">
                  <span>关键词 <small>选填</small></span>
                  <input
                    value={keywords}
                    maxLength={40}
                    onChange={(event) => {
                      setKeywords(event.target.value);
                      if (runState === "demo") setRunState("idle");
                    }}
                    placeholder="徒步 | 旅行 | 治愈"
                  />
                  <em>{keywords.length}/40</em>
                </label>
              </div>
            </section>

            <section className="design-zone" aria-label="生成前视觉偏好">
              <div className="section-heading">
                <h2>配色实验室</h2>
                <span>{currentContrast.toFixed(2)} contrast · {contrastGrade(currentContrast)}</span>
              </div>

              <div className="palette-board" aria-label="专业色板推荐">
                {paletteSchemes.map((scheme) => {
                  const schemeBase = scheme.colors[4] || detectedColor;
                  const schemeRatio = contrastRatio(scheme.colors[0] || "#111111", schemeBase);
                  return (
                    <button
                      key={scheme.id}
                      type="button"
                      className={classNames("palette-card", selectedPaletteId === scheme.id && tonePreset === "auto" && "is-selected")}
                      onClick={() => applyPalette(scheme)}
                    >
                      <span className="palette-card-preview">
                        {scheme.colors.slice(0, 5).map((color) => (
                          <i key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span className="palette-card-copy">
                        <strong>{scheme.title}</strong>
                        <small>{scheme.subtitle}</small>
                        <em>{scheme.colors.slice(0, 3).join(" : ")}</em>
                      </span>
                      <span className="contrast-pill">{schemeRatio.toFixed(2)} {contrastGrade(schemeRatio)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="color-lab">
                <div className="color-wheel-card">
                  <div
                    className="color-wheel"
                    style={
                      {
                        "--source-color": detectedColor,
                        "--title-color": editLayer.color,
                        "--accent-color": editLayer.accent,
                      } as CSSProperties
                    }
                    aria-label={`底图主色 ${detectedColor}`}
                  >
                    <span className="wheel-core" style={{ background: detectedColor }}>
                      <strong>主色</strong>
                      <em>{detectedColor}</em>
                    </span>
                  </div>
                  <div className="color-role-row">
                    <button
                      type="button"
                      style={{ "--role-color": editLayer.color } as CSSProperties}
                      onClick={() => setEditLayer((previous) => ({ ...previous, color: activeToneColors[0] || previous.color }))}
                    >
                      <i />
                      标题色
                    </button>
                    <button
                      type="button"
                      style={{ "--role-color": editLayer.accent } as CSSProperties}
                      onClick={() => setEditLayer((previous) => ({ ...previous, accent: activeToneColors[1] || previous.accent }))}
                    >
                      <i />
                      强调色
                    </button>
                  </div>
                </div>

                <div className="harmony-panel">
                  <div className="harmony-tabs" role="group" aria-label="配色关系">
                    {harmonyOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={classNames(harmonyMode === option.id && "is-selected")}
                        onClick={() => {
                          const palette = buildHarmonyPalette(detectedColor, option.id);
                          setHarmonyMode(option.id);
                          setSelectedPaletteId("image");
                          setTonePreset("auto");
                          setSuggestedColors(palette);
                          setEditLayer((previous) => ({
                            ...previous,
                            color: palette[0] || previous.color,
                            accent: palette[1] || previous.accent,
                          }));
                          if (runState === "demo") setRunState("idle");
                        }}
                      >
                        <strong>{option.title}</strong>
                        <span>{option.hint}</span>
                      </button>
                    ))}
                  </div>

                  <div className="recommended-colors" aria-label="推荐色板">
                    {activeToneColors.map((color, index) => (
                      <button
                        key={`${color}-${index}`}
                        type="button"
                        className={classNames((editLayer.color === color || editLayer.accent === color) && "is-selected")}
                        onClick={() => {
                          setEditLayer((previous) => (
                            index === 1
                              ? { ...previous, accent: color }
                              : { ...previous, color }
                          ));
                          if (runState === "demo") setRunState("idle");
                        }}
                      >
                        <i style={{ background: color }} />
                        <span>{colorRoles[index] || "推荐"}</span>
                        <em>{color}</em>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="tone-grid">
                {toneOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={classNames(tonePreset === option.id && "is-selected")}
                    onClick={() => {
                      setTonePreset(option.id);
                      setSelectedPaletteId(`tone-${option.id}`);
                      const colors = option.id === "auto" ? suggestedColors : option.colors;
                      setEditLayer((previous) => ({
                        ...previous,
                        color: colors[0],
                        accent: colors[1],
                      }));
                      if (runState === "demo") setRunState("idle");
                    }}
                  >
                    <span>
                      {(option.id === "auto" ? harmonyPalette.slice(0, 3) : option.colors).map((color) => (
                        <i key={color} style={{ background: color }} />
                      ))}
                    </span>
                    {option.title}
                  </button>
                ))}
              </div>
              <div className="font-pills">
                {fontOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={classNames(fontPreset === option.id && "is-selected")}
                    onClick={() => {
                      setFontPreset(option.id);
                      if (runState === "demo") setRunState("idle");
                    }}
                  >
                    <Type size={14} />
                    {option.title}
                  </button>
                ))}
              </div>
            </section>

            <section className="engine-zone" aria-label="生成引擎">
              <div className="section-heading">
                <h2>生成引擎</h2>
                <span>{selectedEngine.vendor}</span>
              </div>
              <label className="engine-select-wrap">
                <select
                  value={engine}
                  onChange={(event) => {
                    setEngine(event.target.value as ImageEngine);
                    if (runState === "demo") setRunState("idle");
                  }}
                >
                  {engineOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}（{option.vendor}） - {option.description}
                    </option>
                  ))}
                </select>
                <ChevronDown size={20} aria-hidden="true" />
              </label>
              <div className="engine-current">
                <strong>{selectedEngine.title}</strong>
                <span>{selectedEngine.description}</span>
                <em>{selectedEngine.badge}</em>
              </div>
            </section>

            <section className="count-zone" aria-label="生成数量">
              <h2>生成数量</h2>
              <div className="segmented">
                {countOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={classNames(option === count && "is-selected")}
                    onClick={() => {
                      setCount(option);
                      setTotal(option);
                      if (runState === "demo") setRunState("idle");
                    }}
                  >
                    {option}张
                  </button>
                ))}
              </div>
            </section>

            <section className="progress-card" aria-label="生成进度">
              <div className="steps">
                {[
                  ["分析底图", runState !== "idle" && runState !== "error"],
                  [
                    "生成方案",
                    runState === "planning" || runState === "generating" || runState === "done" || runState === "demo",
                  ],
                  ["并行出图", runState === "generating" || runState === "done" || runState === "demo"],
                ].map(([label, complete], index) => (
                  <div className="step" key={String(label)}>
                    <span className={classNames("step-dot", complete && "is-complete")}>
                      {complete ? <Check size={18} /> : index + 1}
                    </span>
                    <strong>{label}</strong>
                    <small>{complete ? (index < 2 || runState === "done" ? "已完成" : "进行中") : "待开始"}</small>
                  </div>
                ))}
              </div>
              <div className="bar-track">
                <span style={{ width: `${runState === "demo" ? 75 : progressPercent}%` }} />
              </div>
              <div className="status-row">
                <span className="status-main">
                  {isGenerating || runState === "demo" ? <LoaderCircle className="spin" size={18} /> : <Archive size={18} />}
                  {errorMessage || message}
                </span>
                <span>{isGenerating || runState === "demo" ? "预计剩余 00:18" : `${completedCount}/${total}`}</span>
              </div>
            </section>

            <section className="result-grid" aria-label="封面结果">
              {displayResults.map((cover) => (
                <article
                  key={cover.id}
                  className={classNames("cover-card", !cover.image_url && !cover.error && "is-loading")}
                >
                  <button
                    type="button"
                    className="cover-preview"
                    onClick={() => cover.image_url && openCoverEditor(cover)}
                    disabled={!cover.image_url}
                  >
                    <span className="cover-index">{String(cover.id).padStart(2, "0")}</span>
                    {cover.image_url ? (
                      <img src={cover.image_url} alt={cover.label} />
                    ) : cover.error ? (
                      <span className="cover-error">{cover.error}</span>
                    ) : (
                      <span className="cover-loading">
                        <LoaderCircle className="spin" size={34} />
                        AI 生成中...
                        <small>请稍候，精彩即将呈现</small>
                      </span>
                    )}
                  </button>
                  <footer>
                    <span>{cover.error ? "生成失败" : cover.label}</span>
                    <button type="button" aria-label="更多" onClick={() => cover.image_url && openCoverEditor(cover)}>
                      <MoreHorizontal size={19} />
                    </button>
                  </footer>
                </article>
              ))}
            </section>

            <footer className="action-bar">
              <button
                className={classNames("secondary-action", stylePanelOpen && "is-active")}
                type="button"
                onClick={() => setStylePanelOpen((value) => !value)}
              >
                <SlidersHorizontal size={21} />
                风格偏好
              </button>
              <button className="primary-action" type="button" onClick={isGenerating ? stopGenerate : startGenerate}>
                {isGenerating ? <Square size={18} /> : <WandSparkles size={19} />}
                {isGenerating ? "停止生成" : "生成封面"}
              </button>
            </footer>

            {stylePanelOpen && (
              <section className="style-panel">
                {["更像 Mac", "高级灰", "解构标签", "强对比标题"].map((item) => (
                  <button type="button" key={item}>
                    {item}
                  </button>
                ))}
              </section>
            )}
          </>
        ) : (
          <section className="history-view" aria-label="历史记录">
            <div className="history-heading">
              <div>
                <span className="micro-label">LOCAL HISTORY</span>
                <h2>历史记录</h2>
              </div>
              <button className="secondary-action compact" type="button" onClick={resetDemo}>
                <Play size={16} />
                新建
              </button>
            </div>

            {history.length === 0 ? (
              <div className="empty-history">
                <Archive size={28} />
                <strong>还没有真实生成记录</strong>
                <span>完成一次生成后会自动保存到本机。</span>
              </div>
            ) : (
              <div className="history-list">
                {history.map((batch) => (
                  <article className="history-row" key={batch.id}>
                    <button type="button" className="history-main" onClick={() => openBatch(batch)}>
                      <span className="history-thumbs">
                        {batch.results.slice(0, 4).map((cover) => (
                          <img src={cover.image_url} alt={cover.label} key={cover.id} />
                        ))}
                      </span>
                      <span className="history-copy">
                        <strong>{batch.title}</strong>
                        <small>{batch.subtitle || "无副标题"}</small>
                        <em>
                          {batch.count}张 / {formatTime(batch.createdAt)}
                        </em>
                      </span>
                    </button>
                    <button className="icon-danger" type="button" onClick={() => deleteBatch(batch.id)} aria-label="删除">
                      <Trash2 size={18} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <nav className="tabbar" aria-label="底部导航">
          <button
            type="button"
            className={classNames(activeTab === "generate" && "is-active")}
            onClick={() => setActiveTab("generate")}
          >
            <Upload size={20} />
            生成
          </button>
          <button
            type="button"
            className={classNames(activeTab === "history" && "is-active")}
            onClick={() => setActiveTab("history")}
          >
            <History size={20} />
            历史
          </button>
        </nav>
      </section>

      {selectedCover && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="cover-modal">
            <header>
              <div>
                <span className="micro-label">COVER {String(selectedCover.id).padStart(2, "0")}</span>
                <strong>编辑封面图层</strong>
              </div>
              <button type="button" onClick={() => setSelectedCover(null)} aria-label="关闭">
                <X size={22} />
              </button>
            </header>
            {selectedCover.image_url && (
              <div className="editor-stage">
                <img src={selectedCover.image_url} alt={selectedCover.label} />
                <div
                  className="editable-text-layer"
                  style={
                    {
                      "--layer-x": `${editLayer.x}%`,
                      "--layer-y": `${editLayer.y}%`,
                      "--layer-size": `${editLayer.size}px`,
                      "--layer-color": editLayer.color,
                      "--layer-accent": editLayer.accent,
                    } as CSSProperties
                  }
                >
                  <strong>{editLayer.title}</strong>
                  <span>{editLayer.subtitle}</span>
                </div>
              </div>
            )}
            <section className="editor-controls" aria-label="封面编辑">
              <label className="field">
                <span>主标题</span>
                <input
                  value={editLayer.title}
                  maxLength={24}
                  onChange={(event) => setEditLayer((previous) => ({ ...previous, title: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>副标题</span>
                <input
                  value={editLayer.subtitle}
                  maxLength={30}
                  onChange={(event) => setEditLayer((previous) => ({ ...previous, subtitle: event.target.value }))}
                />
              </label>
              <div className="editor-swatches">
                {editorSwatches.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={classNames(editLayer.color === color && "is-selected")}
                    style={{ background: color }}
                    aria-label={`文字颜色 ${color}`}
                    onClick={() => setEditLayer((previous) => ({ ...previous, color }))}
                  />
                ))}
              </div>
              <label className="range-field">
                <span>左右</span>
                <input
                  type="range"
                  min="12"
                  max="88"
                  value={editLayer.x}
                  onChange={(event) => setEditLayer((previous) => ({ ...previous, x: Number(event.target.value) }))}
                />
              </label>
              <label className="range-field">
                <span>上下</span>
                <input
                  type="range"
                  min="8"
                  max="78"
                  value={editLayer.y}
                  onChange={(event) => setEditLayer((previous) => ({ ...previous, y: Number(event.target.value) }))}
                />
              </label>
              <label className="range-field">
                <span>字号</span>
                <input
                  type="range"
                  min="24"
                  max="72"
                  value={editLayer.size}
                  onChange={(event) => setEditLayer((previous) => ({ ...previous, size: Number(event.target.value) }))}
                />
              </label>
            </section>
            <footer>
              <button className="secondary-action" type="button" onClick={() => setSelectedCover(null)}>
                <RotateCcw size={18} />
                返回
              </button>
              <button className="primary-action" type="button" onClick={downloadEditedCover}>
                <Download size={18} />
                导出编辑版
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
