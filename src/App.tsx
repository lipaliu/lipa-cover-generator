import {
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  Square,
  Type,
  Upload,
  Palette,
  Settings2,
  History,
  Trash2,
  Archive,
  Play,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { deleteHistoryBatch, getHistory, saveHistoryBatch } from "./lib/history";
import { downloadImageUrl, fileToDataUrl, formatTime, urlToDataUrl } from "./lib/image";
import type { CoverResult, GenerateCount, GenerateEvent, HistoryBatch, ImageEngine } from "./lib/types";

/* ─── Constants ─── */
const countOptions: GenerateCount[] = [1, 2, 4, 10];

const engineOptions: Array<{
  id: ImageEngine;
  title: string;
  vendor: string;
  description: string;
}> = [
  { id: "openai", title: "GPT-Image-2", vendor: "OpenAI", description: "风格多变，创意强" },
  { id: "auto", title: "自动选择", vendor: "智能分配", description: "根据内容自动分配" },
  { id: "wanxiang", title: "通义万相", vendor: "阿里", description: "中文渲染质量高" },
  { id: "jimeng", title: "即梦", vendor: "字节", description: "中文更准，速度快" },
  { id: "cogview", title: "CogView-4", vendor: "智谱", description: "中文理解好" },
  { id: "wenxin", title: "文心一格", vendor: "百度", description: "中文渲染稳定" },
];

type Step = 1 | 2 | 3 | 4;
type RunState = "idle" | "analyzing" | "planning" | "generating" | "done" | "error";

/* ─── Utilities ─── */
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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

  // Step 1: Image
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [detectedColor, setDetectedColor] = useState("#6F7C79");
  const [imageColors, setImageColors] = useState<string[]>([]);

  // Step 2: Copy
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [keywords, setKeywords] = useState("");

  // Step 3: Style
  const [engine, setEngine] = useState<ImageEngine>("openai");
  const [count, setCount] = useState<GenerateCount>(4);

  // Step 4: Generate
  const [runState, setRunState] = useState<RunState>("idle");
  const [results, setResults] = useState<CoverResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState<GenerateCount>(4);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // History
  const [history, setHistory] = useState<HistoryBatch[]>([]);

  const isGenerating = runState === "analyzing" || runState === "planning" || runState === "generating";
  const completedCount = results.filter((r) => r.image_url || r.error).length;
  const progressPercent = total > 0 ? Math.min(100, Math.round((Math.max(progress, completedCount) / total) * 100)) : 0;

  const refreshHistory = useCallback(async () => {
    try { setHistory(await getHistory()); } catch { setHistory([]); }
  }, []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  /* ─── File Handling ─── */
  const handleFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setImagePreview(dataUrl);
    setImageName(file.name);
    try {
      const palette = await analyzePaletteFromDataUrl(dataUrl);
      setDetectedColor(palette.dominant);
      setImageColors(palette.imageColors);
    } catch { /* ignore */ }
  };

  const getImageDataUrl = async (): Promise<string> => {
    if (!imagePreview) throw new Error("请先上传底图");
    if (imagePreview.startsWith("data:")) return imagePreview;
    return urlToDataUrl(imagePreview);
  };

  /* ─── Generation ─── */
  const startGenerate = async () => {
    if (!imagePreview) { setErrorMessage("请先上传底图"); setRunState("error"); return; }
    if (!title.trim()) { setErrorMessage("请先填写标题"); setRunState("error"); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("analyzing");
    setErrorMessage("");
    setResults([]);
    setProgress(0);
    setTotal(count);
    setMessage("正在分析底图...");

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
          setResults((prev) => {
            const filtered = prev.filter((item) => item.id !== event.result?.id);
            return [...filtered, event.result as CoverResult].sort((a, b) => a.id - b.id);
          });
        }
        if (event.status === "done") {
          const final = fillMissingResults(event.results || collected, event.total || count);
          setResults(final);
          setProgress(event.total || count);
          setRunState("done");
          // Save to history
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

  const downloadCover = (cover: CoverResult) => {
    if (!cover.image_url) return;
    downloadImageUrl(cover.image_url, `lipa-cover-${String(cover.id).padStart(2, "0")}.png`);
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
    setStep(4);
    setShowHistory(false);
  };

  /* ─── Step Navigation ─── */
  const canProceed = (s: Step): boolean => {
    if (s === 1) return !!imagePreview;
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

  /* ─── Render ─── */
  return (
    <main className="app-shell">
      {/* Background gradient */}
      <div className="bg-gradient" aria-hidden="true" />

      {/* Header */}
      <header className="site-header">
        <div className="header-brand">
          <span className="brand-mark">L</span>
          <span className="brand-text">
            <strong>Lipa</strong> Cover
          </span>
        </div>
        <nav className="header-nav">
          <button
            type="button"
            className={cn("nav-btn", showHistory && "is-active")}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={18} />
            <span>历史</span>
          </button>
          <button
            type="button"
            className={cn("nav-btn", showSettings && "is-active")}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 size={18} />
            <span>设置</span>
          </button>
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
            <label className="setting-item">
              <span>生成数量</span>
              <div className="count-selector">
                {countOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={cn(opt === count && "is-selected")}
                    onClick={() => { setCount(opt); setTotal(opt); }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </label>
            <div className="setting-item">
              <span>输出尺寸</span>
              <strong>1024 × 1536（小红书 3:4）</strong>
            </div>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero">
        <h1 className="hero-title">Create Your Cover</h1>
        <p className="hero-subtitle">AI 驱动的封面创作工坊，从底图到成品，一步步引导你完成设计</p>
      </section>

      {/* Step Indicator */}
      <nav className="step-indicator" aria-label="创作步骤">
        {stepLabels.map((s) => (
          <button
            key={s.num}
            type="button"
            className={cn(
              "step-dot",
              step === s.num && "is-current",
              step > s.num && "is-done",
            )}
            onClick={() => {
              if (s.num <= step || (s.num === step + 1 && canProceed(step))) {
                setStep(s.num as Step);
              }
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
      <section className="step-content">
        {/* Step 1: Upload Image */}
        {step === 1 && (
          <div className="step-panel fade-in">
            <div className="step-header">
              <span className="step-number">01</span>
              <div>
                <h2>选择底图</h2>
                <p>上传一张图片作为封面底图，AI 将在此基础上进行创作</p>
              </div>
            </div>
            <label className="upload-zone">
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
                  <div className="upload-icon-wrap">
                    <ImagePlus size={40} strokeWidth={1.5} />
                  </div>
                  <strong>点击或拖拽上传底图</strong>
                  <small>支持 JPG、PNG、WebP，建议竖版 3:4 比例</small>
                </div>
              )}
            </label>
            {imageName && <p className="file-name">{imageName}</p>}
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
                <p>选择生成引擎和数量，准备开始创作</p>
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
                  <span className="summary-label">引擎</span>
                  <span className="summary-value">
                    {engineOptions.find((e) => e.id === engine)?.title || engine}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">数量</span>
                  <span className="summary-value">{count} 张</span>
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
                <div className="style-count">
                  <span>生成数量</span>
                  <div className="count-selector">
                    {countOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        className={cn(opt === count && "is-selected")}
                        onClick={() => { setCount(opt); setTotal(opt); }}
                      >
                        {opt}张
                      </button>
                    ))}
                  </div>
                </div>
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
                <p>{runState === "done" ? "点击封面即可下载" : isGenerating ? message : "一切就绪，点击下方按钮开始 AI 创作"}</p>
              </div>
            </div>

            {/* Progress */}
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

            {/* Error */}
            {runState === "error" && errorMessage && (
              <div className="gen-error">
                <p>{errorMessage}</p>
              </div>
            )}

            {/* Results Grid */}
            {results.length > 0 && (
              <div className="results-grid">
                {results.map((cover) => (
                  <article key={cover.id} className={cn("result-card", !cover.image_url && !cover.error && "is-loading")}>
                    {cover.image_url ? (
                      <button type="button" className="result-image" onClick={() => downloadCover(cover)}>
                        <img src={cover.image_url} alt={cover.label} />
                        <span className="result-download">
                          <Download size={20} />
                        </span>
                      </button>
                    ) : cover.error ? (
                      <div className="result-error">
                        <p>{cover.error}</p>
                      </div>
                    ) : (
                      <div className="result-loading">
                        <LoaderCircle className="spin" size={28} />
                        <small>生成中...</small>
                      </div>
                    )}
                    <footer className="result-meta">
                      <span>{cover.label}</span>
                    </footer>
                  </article>
                ))}
              </div>
            )}

            {/* Action */}
            {!isGenerating && runState !== "done" && (
              <button type="button" className="generate-btn" onClick={startGenerate}>
                <Sparkles size={20} />
                开始生成封面
              </button>
            )}
            {isGenerating && (
              <button type="button" className="stop-btn" onClick={stopGenerate}>
                <Square size={16} />
                停止生成
              </button>
            )}
            {runState === "done" && (
              <button type="button" className="generate-btn" onClick={() => { setResults([]); setRunState("idle"); startGenerate(); }}>
                <Sparkles size={20} />
                重新生成
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step Navigation */}
      <footer className="step-nav">
        <button
          type="button"
          className="nav-prev"
          onClick={prevStep}
          disabled={step === 1}
        >
          <ArrowLeft size={18} />
          上一步
        </button>
        {step < 4 ? (
          <button
            type="button"
            className="nav-next"
            onClick={nextStep}
            disabled={!canProceed(step)}
          >
            下一步
            <ArrowRight size={18} />
          </button>
        ) : (
          !isGenerating && runState !== "done" && (
            <button type="button" className="nav-next generate" onClick={startGenerate}>
              <Sparkles size={18} />
              生成封面
            </button>
          )
        )}
      </footer>
    </main>
  );
}
