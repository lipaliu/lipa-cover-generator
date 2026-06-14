import {
  Archive,
  Check,
  Download,
  ChevronDown,
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
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteHistoryBatch, getHistory, saveHistoryBatch } from "./lib/history";
import { downloadDataUrl, fileToDataUrl, formatTime, urlToDataUrl } from "./lib/image";
import type { CoverResult, GenerateCount, GenerateEvent, HistoryBatch, ImageEngine } from "./lib/types";

const countOptions: GenerateCount[] = [1, 2, 4, 10];
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

export function App() {
  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");
  const [title, setTitle] = useState("为什么越来越多人开始徒步旅行?");
  const [subtitle, setSubtitle] = useState("一场治愈身心的自由之旅");
  const [keywords, setKeywords] = useState("徒步 | 旅行 | 治愈 | 自由 | 风景");
  const [engine, setEngine] = useState<ImageEngine>("openai");
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
    setImagePreview("/samples/base-hiker.png");
    setImageName("示例底图");
    setCount(4);
    setTotal(4);
    setProgress(3);
    setResults(demoResults);
    setRunState("demo");
    setMessage("正在生成 3/4");
    setErrorMessage("");
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
                    onClick={() => cover.image_url && setSelectedCover(cover)}
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
                    <button type="button" aria-label="更多" onClick={() => cover.image_url && setSelectedCover(cover)}>
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
                <strong>{selectedCover.label}</strong>
              </div>
              <button type="button" onClick={() => setSelectedCover(null)} aria-label="关闭">
                <X size={22} />
              </button>
            </header>
            {selectedCover.image_url && <img src={selectedCover.image_url} alt={selectedCover.label} />}
            <footer>
              <button className="secondary-action" type="button" onClick={() => setSelectedCover(null)}>
                <RotateCcw size={18} />
                返回
              </button>
              <button className="primary-action" type="button" onClick={() => downloadCover(selectedCover)}>
                <Download size={18} />
                下载
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
