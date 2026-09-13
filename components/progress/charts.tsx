"use client";

/**
 * Small animated chart set, hand-rolled in SVG.
 *
 * A chart library would add weight to an app that ships to phones over patchy
 * site wifi, and these cover what the page needs at a fraction of the size. The
 * animations are plain CSS so they cost nothing at runtime, and every one is
 * disabled under prefers-reduced-motion in globals.css.
 *
 * Every chart here compares output against the weekly target. A bar on its own
 * only says the crew was busy; a bar against the line says whether the job is
 * being delivered.
 */

import { useEffect, useRef, useState } from "react";
import type { Bucket } from "@/lib/progress";

const AHEAD = "#059669";
const BEHIND = "#dc2626";
const NEUTRAL = "#111827";
const MUTED = "#d4d4d8";

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
      setShown(from + (value - from) * eased);
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

/**
 * Frames handed over per period against the target, with the target drawn as a
 * line across the bars. Bars that clear the line are green, bars that miss are
 * red, and the period still running is outlined rather than filled so an
 * unfinished week does not read as a failure.
 */
export function TargetBars({
  buckets,
  target,
  unitLabel,
}: {
  buckets: Bucket[];
  target: number;
  unitLabel: string;
}) {
  const peak = Math.max(target * 1.15, ...buckets.map((b) => b.handedOver), 1);
  const targetPct = (target / peak) * 100;
  const gap = buckets.length > 12 ? 2 : 4;

  return (
    <div className="w-full">
      <div className="relative h-44">
        {/* Target line, labelled so the number is unambiguous. */}
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-neutral-400"
          style={{ bottom: `${targetPct}%` }}
        >
          <span className="absolute -top-2 right-0 rounded bg-white px-1 text-[10px] font-semibold text-neutral-500">
            target {Math.round(target * 10) / 10}
          </span>
        </div>

        <div className="flex h-full items-end" style={{ gap: `${gap}px` }}>
          {buckets.map((b, i) => {
            const height = (b.handedOver / peak) * 100;
            const met = b.handedOver >= target;
            const color = b.partial ? NEUTRAL : met ? AHEAD : BEHIND;
            return (
              <div key={b.start} className="group relative flex h-full flex-1 items-end">
                <div
                  className="chart-bar w-full rounded-t-[3px]"
                  style={{
                    height: `${Math.max(b.handedOver > 0 ? 2 : 0, height)}%`,
                    background: b.partial ? "transparent" : color,
                    border: b.partial ? `2px dashed ${color}` : undefined,
                    animationDelay: `${i * 30}ms`,
                  }}
                />
                <span className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[10px] font-medium text-white group-hover:block">
                  {b.handedOver} {unitLabel} · {b.label}
                  {b.partial ? " (so far)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex text-[10px] text-neutral-400" style={{ gap: `${gap}px` }}>
        {buckets.map((b) => (
          <span key={b.start} className="flex-1 truncate text-center">
            {b.tick ? b.label : "\u00a0"}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Cumulative earned frames against the cumulative target. The distance between
 * the two lines is how far ahead or behind the job is, measured in frames — the
 * classic progress curve, and the one chart a manager can read in two seconds.
 */
export function PaceCurve({
  earned,
  target,
  labels,
}: {
  earned: number[];
  target: number[];
  labels: string[];
}) {
  const w = 320;
  const h = 150;
  const padY = 12;
  const peak = Math.max(1, ...earned, ...target);
  const stepX = earned.length > 1 ? w / (earned.length - 1) : w;
  const y = (v: number) => h - padY - (v / peak) * (h - padY * 2);
  const path = (values: number[]) =>
    values
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

  const finalEarned = earned[earned.length - 1] ?? 0;
  const finalTarget = target[target.length - 1] ?? 0;
  const behind = finalEarned < finalTarget;
  const accent = behind ? BEHIND : AHEAD;
  const lastX = (earned.length - 1) * stepX;

  // Shaded gap between the two lines: the accumulated surplus or deficit.
  const gapArea = `${path(earned)} L${lastX},${y(finalTarget)} ${[...target]
    .reverse()
    .map((v, i) => `L${(lastX - i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ")} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" preserveAspectRatio="none" role="img">
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

      <path d={gapArea} fill={accent} fillOpacity="0.12" className="chart-area" />
      <path
        d={path(target)}
        fill="none"
        stroke={MUTED}
        strokeWidth="2"
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
        className="chart-line"
        pathLength={1}
      />
      <path
        d={path(earned)}
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="chart-line"
        pathLength={1}
      />
      <circle
        cx={lastX}
        cy={y(finalEarned)}
        r="3.5"
        fill={accent}
        className="chart-dot"
        vectorEffect="non-scaling-stroke"
      />
      <title>
        {`Cumulative earned frames ${finalEarned} against target ${finalTarget}`}
      </title>
      <desc>{labels.join(", ")}</desc>
    </svg>
  );
}

/**
 * Horizontal bar that grows from the left. Used for the stage pile-up and the
 * per-string roll-up, where the comparison is between rows rather than to a
 * target.
 */
export function RailBar({
  label,
  caption,
  pct,
  value,
  color = NEUTRAL,
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
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: color,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      {caption ? <p className="mt-1 text-xs text-neutral-400">{caption}</p> : null}
    </div>
  );
}

/**
 * Attainment dial: output as a share of the target for the period. Reads at a
 * glance, and the colour is the whole message.
 */
export function AttainmentDial({
  attainment,
  actual,
  target,
}: {
  attainment: number;
  actual: number;
  target: number;
}) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const capped = Math.min(1, Math.max(0, attainment));
  const dash = capped * circumference;
  const color = attainment >= 1 ? AHEAD : attainment >= 0.85 ? "#d97706" : BEHIND;

  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 132 132" className="h-[124px] w-[124px] -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#f1f0ed" strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="chart-slice"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none tabular-nums">
          <CountUp value={Math.round(attainment * 100)} format={(n) => `${Math.round(n)}%`} />
        </span>
        <span className="mt-1 text-[11px] text-neutral-500">
          {actual} of {Math.round(target * 10) / 10}
        </span>
      </div>
    </div>
  );
}
