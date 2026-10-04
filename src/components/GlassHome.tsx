import { useEffect, useRef, type ReactNode } from "react";
import { GLASS_PALETTES, mountGlassHome, readPalette } from "../glass/glassHome";
import "../glass/glass-home.css";

type Props = { onStartCover: () => void; onStartText: () => void };

/* One liquid-glass surface: tint, optional inner texture, content, and the refracting filter layer. */
function Glass({ as: Tag = "div", className, box = "clear", children, ...rest }: {
  as?: "div" | "h1" | "button" | "span";
  className: string;
  box?: "clear" | "black" | "white";
  children?: ReactNode;
} & Record<string, unknown>) {
  const T = Tag as "div";
  return (
    <T className={`gh-lg ${className}`} data-glass="" {...rest}>
      <span className="gh-tint" />
      <span className="gh-inner"><img alt="" /></span>
      <span className="gh-content">{children}</span>
      <span className="gh-flt"><span className={`gh-box ${box}`} /></span>
    </T>
  );
}

export function GlassHome({ onStartCover, onStartText }: Props) {
  const ref = useRef<HTMLElement>(null);
  const initial = readPalette();

  useEffect(() => {
    if (!ref.current) return;
    return mountGlassHome(ref.current);
  }, []);

  return (
    <section className="glass-home" ref={ref} aria-labelledby="gh-title">
      <div className="gh-bd" aria-hidden="true" />
      <div className="gh-col">
        <Glass as="h1" className="gh-slab" id="gh-title" aria-label="巴卡巴卡" data-cab="2" data-blur="3">
          <img className="gh-logo" src="/glass/logo-white.png" alt="" />
        </Glass>
        <Glass className="gh-slab gh-sub" data-cab="2" data-blur="3">下一张封面，换一种可能。</Glass>
        <div className="gh-btns">
          <Glass as="button" type="button" className="gh-btn dark" box="black" data-cab="2" data-blur="2" data-btn="" onClick={onStartCover}>
            上传底图，做我的封面
            <span className="gh-dot" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fafafa" strokeWidth="1.6" strokeLinecap="round"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /></svg>
            </span>
          </Glass>
          <Glass as="button" type="button" className="gh-btn light" box="white" data-cab="2" data-blur="2" data-btn="" onClick={onStartText}>
            从完整原文开始
          </Glass>
        </div>
      </div>
      <nav className="gh-dock" aria-label="背景配色">
        {GLASS_PALETTES.map((p) => (
          <button key={p.id} type="button" data-palette={p.id} aria-label={p.label} aria-pressed={p.id === initial}>
            <Glass as="span" className="gh-swatch" box={p.id === initial ? "white" : "clear"} data-strength="10" data-cab="1" />
          </button>
        ))}
      </nav>
    </section>
  );
}
