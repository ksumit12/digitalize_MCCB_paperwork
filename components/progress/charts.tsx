"use client";

/**
 * Small animated chart set, hand-rolled in SVG.
 *
 * The reference dashboard uses recharts, which would add a chart library to an
 * app that ships to phones over patchy site wifi. These cover what this page
 * needs at a fraction of the weight, and the animations are plain CSS so they
 * cost nothing at runtime. Every animation is disabled under
 * prefers-reduced-motion, in globals.css.
 */

import { useEffect, useRef, useState } from "react";
import type { Bucket } from "@/lib/progress";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Counts up to the target so a changed figure reads as movement, not a jump. */
export function CountUp({
  value,
  duration = 700,
  format = (n: number) => n.toLocaleString(),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const startedAt = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - startedAt) / duration);
      // Ease-out cubic: quick off the mark, settles gently.
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  useEffect(() => {
    if (reduced) fromRef.current = value;
  }, [reduced, value]);

  return <span className={className}>{format(shown)}</span>;
}

export function Sparkbars({ buckets, accent = "#4f46e5" }: { buckets: Bucket[]; accent?: string }) {
  const peak = Math.max(1, ...buckets.map((b) => b.scans));
  const gap = buckets.length > 12 ? 1 : 2;

  return (
    <div className="w-full">
      <div className="flex h-40 items-end gap-px" style={{ gap: `${gap}px` }}>
        {buckets.map((b, i) => {
          const height = (b.scans / peak) * 100;
          return (
            <div key={b.start} className="group relative flex h-full flex-1 items-end">
              <div
                className="chart-bar w-full rounded-t-[3px]"
                style={{
                  height: `${Math.max(b.scans > 0 ? 3 : 0, height)}%`,
                  background: b.scans > 0 ? accent : "transparent",
                  animationDelay: `${i * 22}ms`,
                }}
              />
              {/* Hover read-out, so the bars are not just decoration. */}
              {b.scans > 0 ? (
                <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {b.scans} · {b.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex text-[10px] text-neutral-400" style={{ gap: `${gap}px` }}>
        {buckets.map((b) => (
          <span key={b.start} className="flex-1 text-center">
            {b.tick ? b.label : "\u00a0"}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Cumulative line with a soft fill, drawn on with stroke-dashoffset. */
export function TrendArea({
  values,
  labels,
  accent = "#0ea5e9",
}: {
  values: number[];
  labels: string[];
  accent?: string;
}) {
  const w = 320;
  const h = 130;
  const padY = 10;
  const peak = Math.max(1, ...values);
  const stepX = values.length > 1 ? w / (values.length - 1) : w;

  const points = values.map((v, i) => ({
    x: i * stepX,
    y: h - padY - (v / peak) * (h - padY * 2),
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none" role="img">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={w}
          y1={padY + f * (h - padY * 2)}
          y2={padY + f * (h - padY * 2)}
          stroke="#e5e7eb"
          strokeWidth="1"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <path d={area} fill="url(#trend-fill)" className="chart-area" />
      <path
        d={line}
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="chart-line"
        pathLength={1}
      />
      {last ? (
        <circle cx={last.x} cy={last.y} r="3.5" fill={accent} className="chart-dot" vectorEffect="non-scaling-stroke" />
      ) : null}
      <title>{`Running total, ending at ${values[values.length - 1] ?? 0}`}</title>
      <desc>{labels.join(", ")}</desc>
    </svg>
  );
}

/** Donut whose segments sweep in one after another. */
export function Donut({
  slices,
  centerValue,
  centerLabel,
}: {
  slices: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = 54;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="h-[132px] w-[132px] -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f0ed" strokeWidth="14" />
          {total > 0
            ? slices.map((s, i) => {
                const fraction = s.value / total;
                const dash = fraction * circumference;
                const node = (
                  <circle
                    key={s.label}
                    cx="70"
                    cy="70"
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="14"
                    strokeLinecap="butt"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    className="chart-slice"
                    style={{ animationDelay: `${i * 140}ms` }}
                  />
                );
                offset += dash;
                return node;
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none">{centerValue}</span>
          <span className="mt-1 text-[11px] text-neutral-500">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((s, i) => (
          <li
            key={s.label}
            className="chart-legend flex items-center justify-between gap-2 text-sm"
            style={{ animationDelay: `${200 + i * 90}ms` }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate text-neutral-600">{s.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bar that grows from the left. */
export function RailBar({
  label,
  caption,
  pct,
  value,
  color = "#111827",
  delay = 0,
}: {
  label: string;
  caption?: string;
  pct: number;
  value: string;
  color?: string;
  delay?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{label}</p>
        <p className="shrink-0 text-sm tabular-nums text-neutral-500">{value}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="chart-rail h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color, animationDelay: `${delay}ms` }}
        />
      </div>
      {caption ? <p className="mt-1 text-xs text-neutral-400">{caption}</p> : null}
    </div>
  );
}
