"use client";

import { useEffect, useRef, useState } from "react";
import "./AnimatedHeroTitle.css";

function IlluminatedLine({ text, gold = false }: { text: string; gold?: boolean }) {
  const lineRef = useRef<HTMLSpanElement>(null);
  const baselineRef = useRef<HTMLSpanElement>(null);
  const [baseline, setBaseline] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    const measure = () => {
      if (disposed || !lineRef.current || !baselineRef.current) return;
      // Match the SVG to the real HTML baseline at every responsive font size.
      const next = baselineRef.current.getBoundingClientRect().top
        - lineRef.current.getBoundingClientRect().top;
      setBaseline((previous) => previous === next ? previous : next);
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    if (lineRef.current) observer?.observe(lineRef.current);
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  return (
    <span ref={lineRef} className={`sa-hero-title-line${gold ? " sa-hero-title-gold" : ""}`}>
      <span className="sa-hero-title-ink">{text}</span>
      <span ref={baselineRef} className="sa-hero-title-baseline" aria-hidden="true" />
      {baseline !== null && (
        <svg className="sa-hero-title-trace" aria-hidden="true" focusable="false">
          <text x="0" y={baseline} className="sa-hero-title-halo">{text}</text>
          <text x="0" y={baseline} className="sa-hero-title-point">{text}</text>
        </svg>
      )}
    </span>
  );
}

export default function AnimatedHeroTitle() {
  return (
    <h1 className="sa-hero-title">
      <IlluminatedLine text="Maestros" />{" "}
      <br />
      <em><IlluminatedLine text="Del Amor" gold /></em>
    </h1>
  );
}
