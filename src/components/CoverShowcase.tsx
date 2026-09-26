import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const examples = [
  { id: "maldives-vlog", label: "旅行 VLOG", title: "马尔代夫 VLOG", source: "/showcase/maldives-vlog.jpg" },
  { id: "summer-wellness", label: "生活养生", title: "三伏天养生", source: "/showcase/summer-wellness.jpg" },
  { id: "cat", label: "生活随笔", title: "让喜欢的慢慢发生" },
  { id: "city", label: "城市漫游", title: "把城市过成生活" },
  { id: "food", label: "日常烟火", title: "一餐一会" },
];

type Props = { onStartCover: () => void; onStartText: () => void };

export function CoverShowcase({ onStartCover, onStartText }: Props) {
  const [active, setActive] = useState(0);
  const move = (direction: number) => setActive((index) => (index + direction + examples.length) % examples.length);

  return (
    <section className="cover-showcase" aria-labelledby="showcase-title">
      <div className="showcase-intro">
        <p className="showcase-eyebrow">BAKABAKA · KING OF COVER</p>
        <h1 id="showcase-title">下一张封面，换一种可能。</h1>
        <p className="showcase-description">用 AI 把你的内容，变成值得点开的封面。</p>
      </div>
      <div className="showcase-gallery" role="region" aria-label="封面风格示例" aria-roledescription="轮播">
        {[-2, -1, 0, 1, 2].map((offset) => {
          const index = (active + offset + examples.length) % examples.length;
          const example = examples[index];
          return (
            <button key={offset} className={`showcase-cover position-${offset + 2}`} type="button"
              onClick={() => setActive(index)} aria-label={`查看${example.label}示例：${example.title}`} aria-pressed={offset === 0}>
              <img src={example.source ?? `/showcase/${example.id}.webp`} alt={example.title} fetchPriority={offset === 0 ? "high" : "auto"} />
            </button>
          );
        })}
      </div>
      <div className="showcase-controls">
        <button type="button" className="showcase-arrow" onClick={() => move(-1)} aria-label="上一个封面风格"><ChevronLeft size={24} /></button>
        <div className="showcase-caption">
          <p aria-live="polite">{examples[active].label} · 示例</p>
          <div className="showcase-pagination" aria-label="选择封面风格">
            {examples.map((example, index) => (
              <button type="button" key={example.id} onClick={() => setActive(index)}
                aria-label={example.label} aria-pressed={active === index} className={active === index ? "is-current" : ""} />
            ))}
          </div>
        </div>
        <button type="button" className="showcase-arrow" onClick={() => move(1)} aria-label="下一个封面风格"><ChevronRight size={24} /></button>
      </div>
      <div className="showcase-actions">
        <button type="button" className="showcase-start" onClick={onStartCover}>上传底图，做我的封面 <ArrowRight size={23} /></button>
        <button type="button" className="showcase-from-text" onClick={onStartText}>从完整原文开始</button>
      </div>
      <footer className="showcase-footer"><span>多种风格 · 多比例输出</span><span>巴卡巴卡 · 让内容先被看见</span></footer>
    </section>
  );
}
