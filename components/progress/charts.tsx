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

import { useEffect, useId, useRef, useState } from "react";
import type { Bucket } from "@/lib/progress";

/**
 * One palette for the whole page, and one job per colour: steel is output or a
 * plain measurement, green is work beyond the target, red is the shortfall
 * against it, amber is time piling up. Nothing is coloured for decoration, so a
 * page with no red on it can be trusted at a glance.
 */
export const PALETTE = {
  ink: "var(--ink)",
  steel: "#2f5d8a",
  steelSoft: "#8fb0cc",
  ahead: "#0f7f5b",
  behind: "#b3253c",
  warn: "#b26a09",
  muted: "var(--muted)",
  baseline: "var(--rule)",
  grid: "var(--rule)",
  track: "var(--surface-2)",
};

/** Tints, for fills that sit under a line of the same colour. */
const TINT = {
  steel: "rgba(47, 93, 138, 0.10)",
  ahead: "rgba(15, 127, 91, 0.10)",
  behind: "rgba(179, 37, 60, 0.10)",
  warn: "rgba(178, 106, 9, 0.10)",
};

function tintOf(color: string): string {
  if (color === PALETTE.ahead) return TINT.ahead;
  if (color === PALETTE.behind) return TINT.behind;
  if (color === PALETTE.warn) return TINT.warn;
  return TINT.steel;
}

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

/**
 * Draws its children in from the left behind a growing clip rectangle. Scaling a
 * rectangle is independent of the viewBox stretch, unlike a dash-offset draw,
 * which breaks apart into visible dashes once a chart is much wider than tall.
 */
function Reveal({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  return (
    <>
      <defs>
        <clipPath id={`reveal-${id}`}>
          {/* Overhangs vertically so a round line cap is never shaved off. */}
          <rect className="chart-reveal" x="0" y={-height} width={width} height={height * 3} />
        </clipPath>
      </defs>
      <g clipPath={`url(#reveal-${id})`}>{children}</g>
    </>
  );
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

/** Rounds an axis top up to a figure a person would have chosen. */
function niceTop(value: number): number {
  if (value <= 5) return 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function fmtAxis(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/**
 * Handovers per period against that period's target, drawn as one bar with three
 * readings: steel for what was handed over, a red wash above it for the
 * shortfall, green above the target line for anything beyond it. Colouring only
 * the difference keeps a run of near-misses legible, where a wall of red bars
 * says nothing except that the target is high.
 */
export function TargetBars({
  buckets,
  unitLabel,
  average,
  averageLabel,
}: {
  buckets: Bucket[];
  unitLabel: string;
  /** Trailing average per bucket, drawn over the bars as a trend line. */
  average?: (number | null)[];
  averageLabel?: string;
}) {
  const highest = Math.max(
    ...buckets.map((b) => Math.max(b.handedOver, b.target)),
    ...(average ?? []).map((v) => v ?? 0),
    1,
  );
  const top = niceTop(highest);
  const pct = (v: number) => (v / top) * 100;
  const gap = buckets.length > 12 ? 2 : 3;

  return (
    <div className="w-full">
      <div className="flex">
        <YAxis top={top} height="h-44" />
        <div className="min-w-0 flex-1">
          <div className="relative h-44">
            <Gridlines />
            {average ? <AverageOverlay values={average} top={top} /> : null}

            <div className="flex h-full items-end" style={{ gap: `${gap}px` }}>
              {buckets.map((b) => {
                const met = b.target > 0 && b.handedOver >= b.target;
                const shortfall = b.partial ? 0 : Math.max(0, b.target - b.handedOver);
                const surplus = Math.max(0, b.handedOver - b.target);
                const base = Math.min(b.handedOver, b.target || b.handedOver);
                return (
                  <div key={b.start} className="group relative flex h-full flex-1" tabIndex={0}>
                    {/* Scaling the whole stack grows every segment together. */}
                    <div className="chart-bar absolute inset-0 origin-bottom">
                      <Segment
                        bottom={0}
                        height={pct(base)}
                        fill={b.partial ? STEEL_HATCH : STEEL_FILL}
                        rounded={!surplus}
                      />
                      {surplus > 0 ? (
                        <Segment
                          bottom={pct(b.target)}
                          height={pct(surplus)}
                          fill={PALETTE.ahead}
                          rounded
                        />
                      ) : null}
                      {shortfall > 0 ? (
                        <div
                          className="absolute inset-x-0 rounded-t-[3px]"
                          style={{
                            bottom: `${pct(b.handedOver)}%`,
                            height: `${pct(shortfall)}%`,
                            background: TINT.behind,
                          }}
                        />
                      ) : null}
                      {b.target > 0 ? (
                        <div
                          className="absolute inset-x-0 border-t-2 border-dashed"
                          style={{
                            bottom: `${pct(b.target)}%`,
                            // An unfinished period has not missed anything yet.
                            borderColor: b.partial
                              ? PALETTE.baseline
                              : met
                                ? PALETTE.ahead
                                : PALETTE.behind,
                            opacity: 0.75,
                          }}
                        />
                      ) : null}
                    </div>

                    {b.handedOver > 0 ? (
                      <span
                        className="pointer-events-none absolute inset-x-0 text-center text-[10px] font-medium tabular-nums text-muted"
                        style={{ bottom: `calc(${pct(Math.max(b.handedOver, b.target))}% + 3px)` }}
                      >
                        {b.handedOver}
                      </span>
                    ) : null}

                    <span className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-2 px-2 py-1 text-[10px] font-medium text-ink ring-1 ring-rule group-hover:block group-focus-within:block group-active:block">
                      {b.label}: {b.handedOver} {unitLabel}
                      {b.target > 0 ? ` of ${fmtAxis(b.target)}` : " · not a working day"}
                      {b.partial ? " so far" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <AxisLabels buckets={buckets} gap={gap} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <LegendKey color={PALETTE.steel} label="Handed over" block />
        <LegendKey color={PALETTE.ahead} label="Beyond target" block />
        <LegendKey color={PALETTE.behind} label="Short of target" dashed />
        {average ? <LegendKey color={PALETTE.ink} label={averageLabel ?? "Average"} /> : null}
      </div>
    </div>
  );
}

const STEEL_FILL = `linear-gradient(180deg, #3a6c9d 0%, ${PALETTE.steel} 100%)`;
/** The period still running: real output, but not yet a finished result. */
const STEEL_HATCH = `repeating-linear-gradient(135deg, ${PALETTE.steel} 0 5px, #4f7fae 5px 10px)`;

function Segment({
  bottom,
  height,
  fill,
  rounded,
}: {
  bottom: number;
  height: number;
  fill: string;
  rounded?: boolean;
}) {
  if (height <= 0) return null;
  return (
    <div
      className={`absolute inset-x-0 ${rounded ? "rounded-t-[3px]" : ""}`}
      style={{ bottom: `${bottom}%`, height: `${Math.max(height, 1)}%`, background: fill }}
    />
  );
}

/**
 * Value labels down the left of a chart, so magnitudes need no hovering. Line
 * charts breathe a little at the top and bottom of their viewBox, so `insetPct`
 * shifts the labels onto the same scale the line is drawn on.
 */
function YAxis({
  top,
  height,
  insetPct = 0,
}: {
  top: number;
  height: string;
  insetPct?: number;
}) {
  return (
    <div className={`relative mr-2 w-7 shrink-0 ${height}`}>
      {[1, 0.5, 0].map((f) => (
        <span
          key={f}
          className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted"
          style={{ top: `${insetPct + (1 - f) * (100 - insetPct * 2)}%` }}
        >
          {fmtAxis(top * f)}
        </span>
      ))}
    </div>
  );
}

/**
 * Dates under a bar chart. Only some buckets carry a label, so a label is
 * allowed to spill over its blank neighbours rather than be cut to "22 J…".
 */
function AxisLabels({ buckets, gap }: { buckets: Bucket[]; gap: number }) {
  return (
    <div className="mt-2 flex text-[10px] text-muted" style={{ gap: `${gap}px` }}>
      {buckets.map((b) => (
        <span key={b.start} className="relative flex-1">
          {b.tick ? (
            <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{b.label}</span>
          ) : null}
          &nbsp;
        </span>
      ))}
    </div>
  );
}

/**
 * Dates under a line chart. Only a few positions carry a label, so each one is
 * free to spill over its blank neighbours; the ends pull inside the chart so
 * they are not clipped by the card.
 */
function LineLabels({ labels, shown }: { labels: string[]; shown: (i: number) => boolean }) {
  return (
    <div className="mt-1 flex text-[10px] text-muted">
      {labels.map((label, i) => {
        const first = i === 0;
        const last = i === labels.length - 1;
        return (
          <span key={`${label}-${i}`} className="relative flex-1">
            {shown(i) ? (
              <span
                className={`absolute whitespace-nowrap ${
                  first ? "left-0" : last ? "right-0" : "left-1/2 -translate-x-1/2"
                }`}
              >
                {label}
              </span>
            ) : null}
            &nbsp;
          </span>
        );
      })}
    </div>
  );
}

function Gridlines() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {[0, 0.5, 1].map((f) => (
        <div
          key={f}
          className="absolute inset-x-0 border-t"
          style={{ top: `${f * 100}%`, borderColor: f === 1 ? PALETTE.baseline : PALETTE.grid }}
        />
      ))}
    </div>
  );
}

/**
 * Trend line laid over the bars. Bars are centred in equal columns, so the
 * line's x positions have to land on those centres rather than on the edges.
 */
function AverageOverlay({ values, top }: { values: (number | null)[]; top: number }) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return null;

  const step = 100 / values.length;
  const path = points
    .map((p, n) => {
      const x = step * p.i + step / 2;
      const y = 100 - (p.v / top) * 100;
      return `${n === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      aria-hidden
    >
      <Reveal width={100} height={100}>
        <path
          d={path}
          fill="none"
          stroke={PALETTE.ink}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Reveal>
    </svg>
  );
}

/**
 * Frames opened against frames handed over. Two bars a period: if the pale bar
 * keeps beating the solid one the shop is starting work faster than it finishes
 * it, and the floor fills up whatever the output figures say.
 */
export function FlowBars({ buckets }: { buckets: Bucket[] }) {
  const top = niceTop(Math.max(...buckets.map((b) => Math.max(b.started, b.handedOver)), 1));
  const pct = (v: number) => (v / top) * 100;

  return (
    <div className="w-full">
      <div className="flex">
        <YAxis top={top} height="h-36" />
        <div className="min-w-0 flex-1">
          <div className="relative h-36">
            <Gridlines />
            <div className="flex h-full items-end gap-[3px]">
              {buckets.map((b) => (
                <div key={b.start} className="group relative flex h-full flex-1 items-end gap-[1px]" tabIndex={0}>
                  <div
                    className="chart-bar h-full flex-1 origin-bottom self-end rounded-t-[2px]"
                    style={{
                      height: `${Math.max(b.started > 0 ? 2 : 0, pct(b.started))}%`,
                      background: PALETTE.steelSoft,
                    }}
                  />
                  <div
                    className="chart-bar h-full flex-1 origin-bottom self-end rounded-t-[2px]"
                    style={{
                      height: `${Math.max(b.handedOver > 0 ? 2 : 0, pct(b.handedOver))}%`,
                      background: PALETTE.steel,
                      animationDelay: "80ms",
                    }}
                  />
                  <span className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-2 px-2 py-1 text-[10px] font-medium text-ink ring-1 ring-rule group-hover:block group-focus-within:block group-active:block">
                    {b.label}: {b.started} opened, {b.handedOver} finished
                  </span>
                </div>
              ))}
            </div>
          </div>
          <AxisLabels buckets={buckets} gap={3} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <LegendKey color={PALETTE.steelSoft} label="Frames opened" block />
        <LegendKey color={PALETTE.steel} label="Frames handed over" block />
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
  const accent = behind ? PALETTE.behind : PALETTE.ahead;
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
          stroke={PALETTE.grid}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <Reveal width={w} height={h}>
        <path d={gapArea} fill={accent} fillOpacity="0.12" />
        <path
          d={path(target)}
          fill="none"
          stroke={PALETTE.baseline}
          strokeWidth="2"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(earned)}
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Reveal>
      <circle cx={lastX - 2} cy={y(finalEarned)} r="3.5" fill={accent} className="chart-dot" />
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
  color = PALETTE.steel,
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
        <p className="shrink-0 text-sm tabular-nums text-muted">{value}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: PALETTE.track }}>
        <div
          className="chart-rail h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            background: color,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </div>
  );
}

/**
 * Thumbnail trend for a KPI card, so a single figure also shows its direction.
 * Deliberately unlabelled: the card's caption carries the meaning, and axis
 * furniture at this size would be unreadable.
 */
export function Sparkline({
  values,
  color = PALETTE.steel,
  fill = true,
}: {
  values: (number | null)[];
  color?: string;
  fill?: boolean;
}) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
  if (points.length < 2) return null;

  const w = 100;
  const h = 28;
  const low = Math.min(...points.map((p) => p.v));
  const high = Math.max(...points.map((p) => p.v));
  const span = high - low || 1;
  const stepX = w / Math.max(1, values.length - 1);
  const y = (v: number) => h - 2 - ((v - low) / span) * (h - 4);
  const line = points
    .map((p, n) => `${n === 0 ? "M" : "L"}${(p.i * stepX).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");
  const lastPoint = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <Reveal width={w} height={h}>
        {fill ? (
          <path
            d={`${line} L${(lastPoint.i * stepX).toFixed(1)},${h} L${(points[0].i * stepX).toFixed(1)},${h} Z`}
            fill={tintOf(color)}
          />
        ) : null}
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Reveal>
    </svg>
  );
}

/**
 * Labelled line chart for a measurement over time, with an optional reference
 * line. Used for cycle time, work in progress and right-first-time, where the
 * direction of travel matters more than any single period's value.
 */
export function TrendLine({
  values,
  labels,
  color = PALETTE.steel,
  reference,
  referenceLabel,
  format = (n: number) => String(Math.round(n)),
  goodWhenDown = false,
}: {
  values: (number | null)[];
  labels: string[];
  color?: string;
  reference?: number;
  referenceLabel?: string;
  format?: (n: number) => string;
  /** Colours the end point by whether the latest move was an improvement. */
  goodWhenDown?: boolean;
}) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));

  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Not enough finished periods yet to show a trend.
      </p>
    );
  }

  const w = 320;
  const h = 132;
  const padY = 14;
  const candidates = [...points.map((p) => p.v), ...(reference === undefined ? [] : [reference])];
  const low = Math.min(...candidates, 0);
  const high = Math.max(...candidates) || 1;
  const span = high - low || 1;
  const stepX = w / Math.max(1, values.length - 1);
  const y = (v: number) => h - padY - ((v - low) / span) * (h - padY * 2);
  const line = points
    .map((p, n) => `${n === 0 ? "M" : "L"}${(p.i * stepX).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  const improving = goodWhenDown ? last.v <= previous.v : last.v >= previous.v;
  const dotColor = improving ? PALETTE.ahead : PALETTE.behind;

  return (
    <div>
      <div className="flex">
        <YAxis top={high} height="h-32" insetPct={(padY / h) * 100} />
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-32 w-full"
            preserveAspectRatio="none"
            role="img"
          >
            <line
              x1="0"
              x2={w}
              y1={y(low)}
              y2={y(low)}
              stroke={PALETTE.grid}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {reference === undefined ? null : (
              <line
                x1="0"
                x2={w}
                y1={y(reference)}
                y2={y(reference)}
                stroke={PALETTE.baseline}
                strokeWidth="1.5"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <Reveal width={w} height={h}>
              <path
                d={`${line} L${(last.i * stepX).toFixed(1)},${h} L${(points[0].i * stepX).toFixed(1)},${h} Z`}
                fill={tintOf(color)}
              />
              <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </Reveal>
            <circle
              cx={Math.min(last.i * stepX, w - 2)}
              cy={y(last.v)}
              r="3.5"
              fill={dotColor}
              className="chart-dot"
            />
            <title>
              {`Latest ${format(last.v)}${referenceLabel ? `, reference ${referenceLabel}` : ""}`}
            </title>
          </svg>
          <LineLabels
            labels={labels}
            shown={(i) =>
              i === 0 || i === labels.length - 1 || i === Math.floor(labels.length / 2)
            }
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Frames left to hand over, with the two forward projections. Where each dashed
 * line meets the floor is the finish date it implies, so the cost of the current
 * pace is a horizontal distance rather than a number to interpret.
 */
export function Burndown({
  history,
  atTarget,
  atRecentRate,
  labels,
  todayIndex,
}: {
  history: (number | null)[];
  atTarget: (number | null)[];
  atRecentRate: (number | null)[];
  labels: string[];
  todayIndex: number;
}) {
  const w = 320;
  const h = 140;
  const padY = 12;
  const all = [...history, ...atTarget, ...atRecentRate].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (all.length < 2) return null;

  const top = niceTop(Math.max(...all, 1));
  const stepX = w / Math.max(1, labels.length - 1);
  const y = (v: number) => h - padY - (v / top) * (h - padY * 2);
  const path = (values: (number | null)[]) => {
    const pts = values
      .map((v, i) => ({ v, i }))
      .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
    if (pts.length < 2) return "";
    return pts
      .map((p, n) => `${n === 0 ? "M" : "L"}${(p.i * stepX).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" ");
  };

  const todayX = todayIndex * stepX;

  return (
    <div>
      <div className="flex">
        <YAxis top={top} height="h-36" insetPct={(padY / h) * 100} />
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-36 w-full"
            preserveAspectRatio="none"
            role="img"
          >
            <line
              x1="0"
              x2={w}
              y1={y(0)}
              y2={y(0)}
              stroke={PALETTE.baseline}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={todayX}
              x2={todayX}
              y1={padY / 2}
              y2={y(0)}
              stroke={PALETTE.muted}
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <Reveal width={w} height={h}>
              <path
                d={path(atTarget)}
                fill="none"
                stroke={PALETTE.ahead}
                strokeWidth="2"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={path(atRecentRate)}
                fill="none"
                stroke={PALETTE.behind}
                strokeWidth="2"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={path(history)}
                fill="none"
                stroke={PALETTE.ink}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </Reveal>
            <title>Frames remaining, with projections at the target and current rate</title>
          </svg>
          <LineLabels
            labels={labels}
            shown={(i) => i === 0 || i === todayIndex || i === labels.length - 1}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <LegendKey color={PALETTE.ink} label="Work left" />
        <LegendKey color={PALETTE.ahead} label="At target rate" dashed />
        <LegendKey color={PALETTE.behind} label="At current rate" dashed />
      </div>
    </div>
  );
}

function LegendKey({
  color,
  label,
  dashed = false,
  block = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  block?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {block ? (
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: color }}
        />
      ) : (
        <span
          className="inline-block h-0 w-4 shrink-0"
          style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
        />
      )}
      {label}
    </span>
  );
}

/**
 * The finish window the recent periods imply: the band is the spread between a
 * good run and a bad one, the notch is the typical case, and the flag is where
 * the target rate would land. One date is a promise nobody can keep; a band with
 * the target inside or outside it is a decision.
 */
export function FinishWindow({
  from,
  best,
  likely,
  worst,
  target,
  formatDate,
}: {
  from: number;
  best: number;
  likely: number;
  worst: number;
  target: number;
  formatDate: (ms: number) => string;
}) {
  // A little headroom past the last date, so a marker sitting on the end still
  // has a track under it.
  const last = Math.max(worst, target, best, from + 1);
  const span = (last - from) * 1.04;
  const at = (ms: number) => Math.min(100, Math.max(0, ((ms - from) / span) * 100));
  const targetBeforeBest = target < best;
  const targetAfterWorst = target > worst;

  return (
    <div>
      <div className="relative h-9">
        <div
          className="absolute inset-x-0 top-4 h-2 rounded-full"
          style={{ background: PALETTE.track }}
        />
        <div
          className="chart-rail absolute top-4 h-2 origin-left rounded-full"
          style={{
            left: `${at(best)}%`,
            width: `${Math.max(1.5, at(worst) - at(best))}%`,
            background: `linear-gradient(90deg, ${PALETTE.ahead}, ${PALETTE.warn})`,
          }}
        />
        <span
          className="absolute top-[10px] h-5 w-[3px] -translate-x-1/2 rounded-full"
          style={{ left: `${at(likely)}%`, background: PALETTE.ink }}
        />
        {/* Where the target rate would land, marked whether or not the shop has
            been running anywhere near it. */}
        <span
          className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${at(target)}%` }}
        >
          <span
            className="text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: targetBeforeBest ? PALETTE.behind : PALETTE.ahead }}
          >
            target
          </span>
          <span
            className="h-4 w-[2px] rounded-full"
            style={{ background: targetBeforeBest ? PALETTE.behind : PALETTE.ahead }}
          />
        </span>
        <span className="absolute bottom-0 left-0 text-[10px] text-muted">
          {formatDate(from)}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Milestone label="Good run" value={formatDate(best)} color={PALETTE.ahead} />
        <Milestone label="Likely" value={formatDate(likely)} color={PALETTE.ink} />
        <Milestone label="Bad run" value={formatDate(worst)} color={PALETTE.warn} />
      </dl>
      <p className="mt-3 text-xs leading-snug text-muted">
        {targetBeforeBest
          ? `Hitting ${formatDate(target)} needs a better week than any of the last few, so the target date is not in reach on current form.`
          : targetAfterWorst
            ? `The target date of ${formatDate(target)} is behind even a bad run, so it is comfortable on current form.`
            : `The target date of ${formatDate(target)} sits inside this range, so it is reachable but not safe.`}
      </p>
    </div>
  );
}

function Milestone({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-[13px] font-medium tabular-nums" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Frames that have cleared each stage, read top to bottom like the job.
 * Bar length is against the busiest stage so the fall-off is visible; the
 * number beside it is still out of the planned total.
 */
export function StageFunnel({
  steps,
  plannedFrames,
}: {
  steps: { stage: string; label: string; cleared: number; pct: number }[];
  plannedFrames: number;
}) {
  const biggestDrop = steps.reduce(
    (worst, step, i) => {
      if (i === 0) return worst;
      const drop = steps[i - 1].cleared - step.cleared;
      return drop > worst.drop ? { drop, stage: step.stage, label: step.label } : worst;
    },
    { drop: 0, stage: "", label: "" },
  );
  const peak = Math.max(1, ...steps.map((step) => step.cleared));

  return (
    <div id="stage-funnel">
      <ol className="space-y-2.5">
        {steps.map((step, i) => {
          const isChoke = step.stage === biggestDrop.stage && biggestDrop.drop > 0;
          const drop = i === 0 ? 0 : steps[i - 1].cleared - step.cleared;
          const fill = Math.min(100, (step.cleared / peak) * 100);
          return (
            <li key={step.stage} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className={`min-w-0 truncate text-sm ${isChoke ? "font-semibold text-ink" : "text-ink"}`}>
                  {step.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  <span className={isChoke ? "font-semibold text-ink" : "text-ink"}>{step.cleared}</span>
                  <span className="text-muted/70"> / {plannedFrames}</span>
                  {isChoke && drop > 0 ? (
                    <span className="ml-1.5 font-medium" style={{ color: PALETTE.warn }}>
                      −{drop}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="chart-rail block h-full rounded-full"
                  style={{
                    width: `${fill}%`,
                    background: isChoke ? PALETTE.warn : PALETTE.steel,
                    animationDelay: `${i * 28}ms`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {biggestDrop.drop > 0 ? (
        <p className="mt-3 text-xs text-muted">
          Biggest fall-off is into{" "}
          <span className="font-medium text-ink">{biggestDrop.label}</span>, where{" "}
          {biggestDrop.drop === 1 ? "1 frame has" : `${biggestDrop.drop} frames have`} not followed
          through from the stage before.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Attainment dial: output as a share of what the period should have produced by
 * now. Reads at a glance, and the colour is the whole message.
 */
export function AttainmentDial({
  attainment,
  actual,
  target,
  onDark = false,
}: {
  attainment: number;
  actual: number;
  target: number;
  /** Inverts the track and label colours for use on the dark hero panel. */
  onDark?: boolean;
}) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const capped = Math.min(1, Math.max(0, attainment));
  const dash = capped * circumference;
  const color = attainment >= 1 ? PALETTE.ahead : attainment >= 0.85 ? PALETTE.warn : PALETTE.behind;
  const onDarkColor =
    attainment >= 1 ? "#34d399" : attainment >= 0.85 ? "#fbbf24" : "#fb7185";

  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 136 136" className="h-[128px] w-[128px] -rotate-90">
        <circle
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke={onDark ? "rgba(255,255,255,0.12)" : PALETTE.track}
          strokeWidth="11"
        />
        <circle
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke={onDark ? onDarkColor : color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="chart-slice"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-[30px] font-semibold leading-none tracking-tight tabular-nums ${
            onDark ? "text-white" : ""
          }`}
        >
          <CountUp value={Math.round(attainment * 100)} format={(n) => `${Math.round(n)}%`} />
        </span>
        <span className={`mt-1 text-[11px] ${onDark ? "text-white/55" : "text-muted"}`}>
          {actual} of {Math.round(target * 10) / 10}
        </span>
      </div>
    </div>
  );
}
