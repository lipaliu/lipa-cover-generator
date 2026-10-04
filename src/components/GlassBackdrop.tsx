import { useEffect, useRef } from "react";
import { mountBackdrop } from "../glass/glassHome";

/* Full-screen moving background shared by every screen: flowing glass + fluid glow. */
export function GlassBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? mountBackdrop(ref.current) : undefined), []);
  return <div className="gh-bd" ref={ref} aria-hidden="true" />;
}
