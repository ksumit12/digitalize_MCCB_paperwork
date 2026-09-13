"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CountUp, Donut, RailBar, Sparkbars, TrendArea } from "@/components/progress/charts";
import { SyncBadge } from "@/components/SyncBadge";
import { SyncStatsPanel } from "@/components/SyncStatsPanel";
import { listFaults, listFrames, onSharedSync } from "@/lib/db";
import { buildProgress, PERIODS, trend, type Period, type ProgressStats } from "@/lib/progress";
import type { Fault, Frame } from "@/lib/types";

const ACCENT = {
  scans: "#4f46e5",
  cumulative: "#0ea5e9",
  installing: "#f59e0b",
  testing: "#10b981",
  submitted: "#0284c7",
  fault: "#e11d48",
};

function Card({
  title,
  subtitle,
  children,
  delay = 0,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <section
      className={`card-rise rounded-xl border border-black/10 bg-white p-4 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title ? (
        <header className="mb-3">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  delta,
  unit = "",
  caption,
  goodWhenDown = false,
  icon,
  delay = 0,
}: {
  label: string;
  value: number;
  delta: number | null;
  unit?: string;
  /** Replaces the trend line for figures a percentage change makes no sense of. */
  caption?: string;
  goodWhenDown?: boolean;
  icon: React.ReactNode;
  delay?: number;
}) {
  const rising = delta != null && delta > 0;
  const flat = delta === 0 || delta == null;
  const good = flat ? null : goodWhenDown ? !rising : rising;

  return (
    <div
      className="card-rise rounded-xl border border-black/10 bg-white p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-neutral-600">{label}</p>
        <span className="text-neutral-400">{icon}</span>
      </div>
      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight">
        <CountUp value={value} />
        {unit ? <span className="text-lg font-medium text-neutral-400">{unit}</span> : null}
      </p>
      <p
        className={`mt-2 text-xs ${
          caption || good == null ? "text-neutral-400" : good ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {caption
          ? caption
          : delta == null
            ? value > 0
              ? "no earlier figure to compare"
              : "nothing yet"
            : delta === 0
              ? "level with the period before"
              : `${rising ? "↑" : "↓"} ${Math.abs(delta)}% vs period before`}
      </p>
    </div>
  );
}

function relative(at: number, now: number): string {
  const secs = Math.round((now - at) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86_400)}d ago`;
}

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  async function refresh() {
    try {
      setError("");
      const [f, x] = await Promise.all([listFrames(), listFaults()]);
      setFrames(f);
      setFaults(x);
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this device's data");
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void refresh();
    return onSharedSync(() => void refresh());
  }, []);

  // Keeps "2m ago" honest without re-reading the database.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const stats: ProgressStats = useMemo(
    () => buildProgress(frames, faults, period, new Date(now)),
    // now is deliberately excluded: re-bucketing every 30s would replay the
    // animations. A sync or a period change is what should refresh the charts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frames, faults, period],
  );

  const phases = [
    { label: "Installing", value: stats.phases.installing, color: ACCENT.installing },
    { label: "Testing", value: stats.phases.testing, color: ACCENT.testing },
    { label: "Submitted", value: stats.phases.submitted, color: ACCENT.submitted },
  ].filter((s) => s.value > 0);

  const topInstaller = stats.installers[0];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-5">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="home-rise min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-neutral-600"
              aria-label="Back to strings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          </div>
          <p className="mt-1 pl-11 text-sm text-neutral-500">{stats.rangeLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncBadge />
        </div>
      </header>

      {/* Period switch. Changing it remounts the charts below, so everything
          animates in again rather than snapping to new numbers. */}
      <div className="mb-5 inline-flex rounded-xl bg-zinc-100 p-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            aria-pressed={period === p.id}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p.id ? "bg-white text-ink shadow-sm" : "text-neutral-500"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-neutral-500">Reading this device…</p>
      ) : (
        <div key={period} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Serials scanned"
              value={stats.scans.value}
              delta={trend(stats.scans)}
              delay={0}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M4 7V5h4M20 7V5h-4M4 17v2h4M20 17v2h-4M7 12h10" strokeLinecap="round" />
                </svg>
              }
            />
            <Kpi
              label="Frames submitted"
              value={stats.submitted.value}
              delta={trend(stats.submitted)}
              delay={60}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            />
            <Kpi
              label="Faults raised"
              value={stats.faults.value}
              delta={trend(stats.faults)}
              goodWhenDown
              delay={120}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M12 9v4M12 17h.01M10.3 4.3L2.6 18a1.5 1.5 0 001.3 2.2h16.2a1.5 1.5 0 001.3-2.2L13.7 4.3a1.5 1.5 0 00-2.6 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            />
            <Kpi
              label="Holes complete"
              value={stats.completion.pct}
              unit="%"
              delta={null}
              caption={
                stats.completion.total
                  ? `${stats.completion.done} of ${stats.completion.total} used holes, all time`
                  : "no holes in use yet"
              }
              delay={180}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" strokeLinecap="round" />
                </svg>
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              title="Scan activity"
              subtitle={period === "day" ? "Serials per hour" : "Serials per day"}
              delay={220}
              className="lg:col-span-2"
            >
              <Sparkbars buckets={stats.buckets} accent={ACCENT.scans} />
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
                <span>
                  Busiest {period === "day" ? "hour" : "day"}:{" "}
                  <span className="font-medium text-ink">
                    {stats.busiest ? `${stats.busiest.label} · ${stats.busiest.scans}` : "—"}
                  </span>
                </span>
                {period !== "day" ? (
                  <span>
                    Average on days worked:{" "}
                    <span className="font-medium text-ink">{stats.perDayAverage}</span>
                  </span>
                ) : null}
              </div>
            </Card>

            <Card title="Frame phases" subtitle="Every frame on this job" delay={280}>
              {phases.length ? (
                <Donut
                  slices={phases}
                  centerValue={String(stats.phases.installing + stats.phases.testing + stats.phases.submitted)}
                  centerLabel="frames"
                />
              ) : (
                <p className="py-8 text-center text-sm text-neutral-400">No frames yet.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              title="Running total"
              subtitle={`Serials accumulating across the ${period === "day" ? "day" : period}`}
              delay={320}
              className="lg:col-span-2"
            >
              <TrendArea
                values={stats.cumulative}
                labels={stats.buckets.map((b) => b.label)}
                accent={ACCENT.cumulative}
              />
              <p className="mt-2 text-xs text-neutral-500">
                Ends at{" "}
                <span className="font-medium text-ink">
                  {stats.cumulative[stats.cumulative.length - 1] ?? 0}
                </span>{" "}
                serials for this period.
              </p>
            </Card>

            <Card title="Who scanned" subtitle="Serials recorded in this period" delay={360}>
              {stats.installers.length ? (
                <div className="space-y-3">
                  {stats.installers.map((person, i) => (
                    <RailBar
                      key={person.name}
                      label={person.name}
                      pct={topInstaller ? (person.scans / topInstaller.scans) * 100 : 0}
                      value={String(person.scans)}
                      color={ACCENT.scans}
                      delay={400 + i * 70}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-neutral-400">Nothing scanned in this period.</p>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="String completion"
              subtitle="Holes with both serials recorded, all time"
              delay={400}
            >
              {stats.strings.length ? (
                <div className="space-y-3.5">
                  {stats.strings.map((s, i) => (
                    <RailBar
                      key={s.key}
                      label={`String ${s.key}`}
                      caption={`${s.slots} frame${s.slots === 1 ? "" : "s"} started`}
                      pct={s.pct}
                      value={`${s.done}/${s.total}`}
                      color={s.pct >= 100 ? ACCENT.testing : "#111827"}
                      delay={440 + i * 60}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-neutral-400">No strings yet.</p>
              )}
            </Card>

            <Card title="Recent activity" subtitle="Scans and faults, newest first" delay={440}>
              {stats.activity.length ? (
                <ul className="space-y-3">
                  {stats.activity.map((item, i) => (
                    <li
                      key={`${item.at}-${item.title}-${i}`}
                      className="chart-legend flex items-start gap-3"
                      style={{ animationDelay: `${480 + i * 40}ms` }}
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: item.kind === "fault" ? ACCENT.fault : ACCENT.testing }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="truncate text-xs text-neutral-500">
                          {item.detail}
                          {item.by ? ` · ${item.by}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-neutral-400">{relative(item.at, now)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-neutral-400">
                  Nothing recorded in this period yet.
                </p>
              )}
            </Card>
          </div>

          <p className="pt-1 text-center text-xs text-neutral-400">
            Counts come from this device&apos;s copy, which syncs with the shared database.
            {stats.completion.total > 0
              ? ` ${stats.completion.done} of ${stats.completion.total} used holes have both serials.`
              : ""}
          </p>
        </div>
      )}
      <SyncStatsPanel />
    </main>
  );
}
