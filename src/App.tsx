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
  Play,
  Settings,
  Square,
  Trash2,
  Upload,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { deleteHistoryBatch, getHistory, saveHistoryBatch } from "./lib/history";
import { downloadImageUrl, fileToDataUrl, formatTime, urlToDataUrl } from "./lib/image";
import type { CoverResult, GenerateCount, GenerateEvent, HistoryBatch, ImageEngine } from "./lib/types";

const countOptions: GenerateCount[] = [1, 2, 4, 10];
type AccountTier = "guest" | "creator" | "internal";

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

function fillMissingResults(results: CoverResult[], total: number): CoverResult[] {
  const byId = new Map(results.map((result) => [result.id, result]));
  return Array.from({ length: total }, (_, index) => {
    const id = index + 1;
    return byId.get(id) || {
      id,
      combination: "missing",
      label: "未返回",
      error: "这一张没有返回结果，请重试。",
    };
  });
}

function coverDownloadName(cover: CoverResult) {
  return `lipa-cover-${String(cover.id).padStart(2, "0")}.png`;
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

function colorDistance(first: string, second: string) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return Math.sqrt((a.red - b.red) ** 2 + (a.green - b.green) ** 2 + (a.blue - b.blue) ** 2);
}

function buildFontColorOptions(dominant: string, imageColors: string[]) {
  const { red, green, blue } = hexToRgb(dominant);
  const { hue, saturation } = rgbToHsl(red, green, blue);
  const candidates = uniqueColors([
    contrastRatio("#281125", dominant) >= contrastRatio("#FFFFFF", dominant) ? "#281125" : "#FFFFFF",
    "#281125",
    "#FFFFFF",
    "#D8F2DA",
    "#F0CA50",
    "#C1395E",
    "#13B7D9",
    hslToHex(hue + 180, clamp(saturation + 18, 52, 86), 52),
    hslToHex(hue + 36, clamp(saturation + 12, 48, 82), 58),
    ...imageColors.slice(0, 3),
  ]);

  return candidates
    .sort((first, second) => contrastRatio(second, dominant) - contrastRatio(first, dominant))
    .slice(0, 6);
}

async function analyzePaletteFromDataUrl(dataUrl: string): Promise<{ dominant: string; imageColors: string[]; suggestions: string[] }> {
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
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 180) continue;
    const pixelRed = pixels[index];
    const pixelGreen = pixels[index + 1];
    const pixelBlue = pixels[index + 2];
    red += pixelRed;
    green += pixelGreen;
    blue += pixelBlue;
    count += 1;
    const key = `${Math.round(pixelRed / 32) * 32}-${Math.round(pixelGreen / 32) * 32}-${Math.round(pixelBlue / 32) * 32}`;
    const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += pixelRed;
    bucket.green += pixelGreen;
    bucket.blue += pixelBlue;
    buckets.set(key, bucket);
  }
  if (count === 0) {
    const fallback = ["#6F7C79", "#FFFFFF", "#FFE15A", "#FF4FA3"];
    return { dominant: fallback[0], imageColors: fallback, suggestions: buildFontColorOptions(fallback[0], fallback) };
  }
  const dominant = `#${readableHex(red / count)}${readableHex(green / count)}${readableHex(blue / count)}`;
  const imageColors = Array.from(buckets.values())
    .sort((first, second) => second.count - first.count)
    .map((bucket) => `#${readableHex(bucket.red / bucket.count)}${readableHex(bucket.green / bucket.count)}${readableHex(bucket.blue / bucket.count)}`)
    .reduce<string[]>((colors, color) => {
      if (colors.length >= 5) return colors;
      if (colors.every((existing) => colorDistance(existing, color) > 34)) colors.push(color);
      return colors;
    }, []);
  const extractedColors = uniqueColors([dominant, ...imageColors]).slice(0, 5);
  return { dominant, imageColors: extractedColors, suggestions: buildFontColorOptions(dominant, extractedColors) };
}

export function App() {
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");
  const [title, setTitle] = useState("为什么越来越多人开始徒步旅行?");
  const [subtitle, setSubtitle] = useState("一场治愈身心的自由之旅");
  const [keywords, setKeywords] = useState("");
  const [engine, setEngine] = useState<ImageEngine>("openai");
  const [accountTier, setAccountTier] = useState<AccountTier>("internal");
  const [detectedColor, setDetectedColor] = useState("#6F7C79");
  const [imageColors, setImageColors] = useState(["#6F7C79", "#FFFFFF", "#FFE15A", "#FF4FA3"]);
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
  const [editLayer, setEditLayer] = useState<EditLayer>({
    title: "封面标题",
    subtitle: "点击编辑副标题",
    color: "#FFFFFF",
    accent: "#FF4FA3",
    x: 50,
    y: 22,
    size: 42,
  });
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
  const fontColorOptions = useMemo(() => buildFontColorOptions(detectedColor, imageColors), [detectedColor, imageColors]);
  const contrastBase = detectedColor;
  const currentContrast = contrastRatio(editLayer.color, contrastBase);
  const estimatedCost = selectedAccount.internal ? 0 : count;
  const firstDownload = results.find((result) => result.image_url);

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
        setImageColors(palette.imageColors);
        setEditLayer((previous) => ({
          ...previous,
          color: palette.suggestions[0] || previous.color,
          accent: palette.imageColors[1] || previous.accent,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = ["#6F7C79", "#FFFFFF", "#FFE15A", "#FF4FA3"];
          setDetectedColor("#6F7C79");
          setImageColors(fallback);
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
  };

  const getImageDataUrl = async () => {
    if (imagePreview.startsWith("data:")) return imagePreview;
    return urlToDataUrl(imagePreview);
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
            imageDominantColor: detectedColor,
            imagePalette: imageColors,
            preferredTextColor: editLayer.color,
            preferredAccentColor: editLayer.accent,
            fontColorOptions,
            contrastRatio: Number(currentContrast.toFixed(2)),
            contrastGrade: contrastGrade(currentContrast),
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
          const finalResults = fillMissingResults(event.results || collected, event.total || count);
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
    setKeywords("");
    setEngine("openai");
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
    setKeywords("");
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

  const downloadCover = (cover: CoverResult) => {
    if (!cover.image_url) return;
    downloadImageUrl(cover.image_url, coverDownloadName(cover));
  };

  const saveCoverLocally = async (cover: CoverResult) => {
    if (!cover.image_url) return;
    try {
      const response = await fetch("/api/export-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: cover.image_url,
          filename: coverDownloadName(cover),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; path?: string; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "本地保存失败。");
      }
      setErrorMessage("");
      setMessage(`已保存到本地：${payload.path}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "本地保存失败。");
    }
  };

  const handleCoverDownload = (cover: CoverResult) => {
    downloadCover(cover);
    void saveCoverLocally(cover);
  };

  const downloadFirst = () => {
    if (firstDownload) handleCoverDownload(firstDownload);
  };

  return (
    <main className="app-shell">
      <section className="device-frame" aria-label="封面生成器工作台">
        <header className="topbar">
          <button className="brand" type="button" onClick={resetDemo} aria-label="重置示例">
            <span className="brand-logo-mark" aria-hidden="true">
              <strong>Lipa</strong>
              <em>Cover</em>
            </span>
            <span className="brand-copy">
              <strong>封面生成器</strong>
              <small>AI cover studio</small>
            </span>
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
            <section className="workspace-grid" aria-label="封面生成工作台">
              <div className="workspace-panel setup-panel">
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
                  </div>
                </section>

                <section className="design-zone simple-color-zone" aria-label="颜色分析与字体颜色">
                  <div className="section-heading">
                    <h2>颜色设置</h2>
                    <span>{currentContrast.toFixed(2)} contrast · {contrastGrade(currentContrast)}</span>
                  </div>

                  <div className="simple-color-steps">
                    <article className="simple-color-card">
                      <div className="simple-step-title">
                        <b>01</b>
                        <span>分析底图颜色</span>
                      </div>
                      <div className="pantone-card" aria-label="底图颜色组成">
                        <div className="pantone-strip">
                          {imageColors.map((color) => (
                            <span key={color} style={{ background: color }} />
                          ))}
                        </div>
                        <div className="pantone-meta">
                          <strong>IMAGE PALETTE</strong>
                          <small>主色 {detectedColor}</small>
                        </div>
                        <div className="pantone-hex-list">
                          {imageColors.map((color) => (
                            <span key={color}>{color}</span>
                          ))}
                        </div>
                      </div>
                    </article>

                    <article className="simple-color-card">
                      <div className="simple-step-title">
                        <b>02</b>
                        <span>字体颜色建议</span>
                      </div>
                      <div className="type-color-preview" style={{ background: detectedColor, color: editLayer.color }}>
                        <strong>HELLO</strong>
                        <span>{editLayer.color} · {contrastGrade(currentContrast)}</span>
                      </div>
                      <div className="font-suggestion-row" aria-label="字体颜色建议">
                        {fontColorOptions.slice(0, 4).map((color) => {
                          const ratio = contrastRatio(color, detectedColor);
                          return (
                            <button
                              key={color}
                              type="button"
                              className={classNames(editLayer.color === color && "is-selected")}
                              style={{ "--swatch-color": color } as CSSProperties}
                              onClick={() => {
                                setEditLayer((previous) => ({ ...previous, color }));
                                if (runState === "demo") setRunState("idle");
                              }}
                            >
                              <i />
                              <span>{color}</span>
                              <em>{contrastGrade(ratio)}</em>
                            </button>
                          );
                        })}
                      </div>
                      <label className="custom-color-picker">
                        <span>自定义</span>
                        <input
                          type="color"
                          value={editLayer.color}
                          onChange={(event) => {
                            setEditLayer((previous) => ({ ...previous, color: event.target.value.toUpperCase() }));
                            if (runState === "demo") setRunState("idle");
                          }}
                        />
                        <em>{editLayer.color}</em>
                      </label>
                    </article>
                  </div>
                </section>

                <div className="controls-row">
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
                            if (runState !== "idle") {
                              setResults([]);
                              setProgress(0);
                              setRunState("idle");
                            }
                            setMessage(`准备生成 ${option} 张`);
                          }}
                        >
                          {option}张
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <footer className="action-bar">
                  <button className="primary-action" type="button" onClick={isGenerating ? stopGenerate : startGenerate}>
                    {isGenerating ? <Square size={18} /> : <WandSparkles size={19} />}
                    {isGenerating ? "停止生成" : "生成封面"}
                  </button>
                </footer>
              </div>

              <div className="workspace-panel output-panel">
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
                        onClick={() => handleCoverDownload(cover)}
                        disabled={!cover.image_url}
                        aria-label={cover.image_url ? `下载第 ${cover.id} 张封面` : undefined}
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
                        <span>{cover.error ? "生成失败" : cover.image_url ? "点击图片下载" : cover.label}</span>
                        <button
                          type="button"
                          aria-label={cover.image_url ? `下载第 ${cover.id} 张封面` : "等待生成"}
                          onClick={() => handleCoverDownload(cover)}
                          disabled={!cover.image_url}
                        >
                          <Download size={18} />
                        </button>
                      </footer>
                    </article>
                  ))}
                </section>
              </div>
            </section>
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
    </main>
  );
}
