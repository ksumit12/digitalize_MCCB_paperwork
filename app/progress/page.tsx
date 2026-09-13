"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AttainmentDial, CountUp, PaceCurve, RailBar, TargetBars } from "@/components/progress/charts";
import { SyncBadge } from "@/components/SyncBadge";
import { SyncStatsPanel } from "@/components/SyncStatsPanel";
import {
  listFaults,
  listFrames,
  listProjects,
  listStringRuns,
  onSharedSync,
  setWeeklyTarget,
  weeklyTarget as readWeeklyTarget,
} from "@/lib/db";
import { currentProjectId } from "@/lib/project";
import {
  bucketTarget,
  buildProgress,
  PERIODS,
  trend,
  type Period,
  type ProgressStats,
} from "@/lib/progress";
import type { Fault, Frame } from "@/lib/types";

const AHEAD = "#059669";
const BEHIND = "#dc2626";
const WARN = "#d97706";

const PERIOD_NOUN: Record<Period, string> = { day: "day", week: "week", month: "month" };
/** Reads naturally in a sentence, where "this day" would not. */
const PERIOD_PHRASE: Record<Period, string> = {
  day: "today",
  week: "this week",
  month: "this month",
};

function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

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
  unit = "",
  delta,
  caption,
  goodWhenDown = false,
  decimals = 0,
  delay = 0,
}: {
  label: string;
  value: number;
  unit?: string;
  /** Percentage change against the period before, or null when there is none. */
  delta?: number | null;
  /** Replaces the trend line where a percentage change would not mean anything. */
  caption?: string;
  goodWhenDown?: boolean;
  decimals?: number;
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
      <p className="text-[13px] text-neutral-600">{label}</p>
      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight tabular-nums">
        <CountUp
          value={value}
          format={(n) => (decimals ? fmt1(n) : String(Math.round(n)))}
        />
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
            ? "no earlier figure to compare"
            : delta === 0
              ? "level with the period before"
              : `${rising ? "↑" : "↓"} ${Math.abs(delta)}% vs the period before`}
      </p>
    </div>
  );
}

/** The one sentence the page exists to produce. */
function forecastSentence(stats: ProgressStats): { text: string; tone: "ahead" | "behind" | "unknown" } {
  const { forecast, weeklyTarget } = stats;
  if (forecast.remaining <= 0) {
    return { text: "Every planned frame is handed over. The job is complete.", tone: "ahead" };
  }
  if (forecast.recentRate <= 0 || forecast.finishAtRecentRate === null) {
    return {
      text: `Nothing has been handed over in the last four weeks, so there is no rate to forecast from. At ${weeklyTarget} a week the remaining ${fmt1(forecast.remaining)} frames would take ${fmt1(forecast.weeksAtTarget)} weeks.`,
      tone: "unknown",
    };
  }
  const slip = forecast.slipDays ?? 0;
  const gap = `${fmt1(forecast.recentRate)} a week against a target of ${weeklyTarget}`;
  const weeks = `${fmt1(forecast.weeksAtRecentRate ?? 0)} weeks rather than ${fmt1(forecast.weeksAtTarget)}`;
  const finish = shortDate(forecast.finishAtRecentRate);
  if (slip > 0) {
    return {
      text: `Running at ${gap}, the remaining ${fmt1(forecast.remaining)} frames take ${weeks} — finishing around ${finish}, ${slip} days later than hitting the target would.`,
      tone: "behind",
    };
  }
  return {
    text: `Running at ${gap}, the remaining ${fmt1(forecast.remaining)} frames take ${weeks} — finishing around ${finish}, ${Math.abs(slip)} days inside the target pace.`,
    tone: "ahead",
  };
}

function TargetEditor({
  value,
  onSave,
}: {
  value: number;
  onSave: (next: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-neutral-500 underline decoration-dotted underline-offset-2"
      >
        Target {value} frames a week — change
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(Number(draft));
        setSaving(false);
        setEditing(false);
      }}
    >
      <label className="text-xs text-neutral-500" htmlFor="weekly-target">
        Frames a week
      </label>
      <input
        id="weekly-target"
        type="number"
        min={1}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-20 rounded-lg border border-rule px-2 py-1 text-sm tabular-nums"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [stringCount, setStringCount] = useState(0);
  const [target, setTarget] = useState(40);
  const [projectName, setProjectName] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  async function refresh() {
    try {
      setError("");
      const [f, x, strings, weekly, projects] = await Promise.all([
        listFrames(),
        listFaults(),
        listStringRuns(),
        readWeeklyTarget(),
        listProjects(),
      ]);
      setFrames(f);
      setFaults(x);
      setStringCount(strings.length);
      setTarget(weekly);
      setProjectName(projects.find((p) => p.id === currentProjectId())?.name || "");
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

  const stats: ProgressStats = useMemo(
    () => buildProgress(frames, faults, period, target, stringCount, new Date(now)),
    // now is deliberately excluded: re-bucketing on a timer would replay the
    // animations. A sync or a period change is what should refresh the charts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frames, faults, period, target, stringCount],
  );

  const noun = PERIOD_NOUN[period];
  const phrase = PERIOD_PHRASE[period];
  const forecast = forecastSentence(stats);
  const shortfall = Math.max(0, stats.pace.target - stats.pace.actual);
  const cycle = stats.cycleTimeDays;
  const fpy = stats.firstPassYield;
  const worstStage = [...stats.stages].sort((a, b) => b.frames - a.frames)[0];
  const stagePeak = Math.max(1, ...stats.stages.map((s) => s.frames));

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
          <p className="mt-1 pl-11 text-sm text-neutral-500">
            {projectName ? `${projectName} · ` : ""}
            {stats.rangeLabel}
          </p>
        </div>
        <SyncBadge />
      </header>

      {/* Period switch. Changing it remounts the charts below, so everything
          animates in again rather than snapping to new numbers. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-zinc-100 p-1">
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
        <TargetEditor
          value={target}
          onSave={async (next) => {
            const saved = await setWeeklyTarget(next);
            setTarget(saved);
          }}
        />
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-neutral-500">Reading this device…</p>
      ) : (
        <div key={period} className="space-y-4">
          {/* Headline: are we hitting the rate, and where does that land us. */}
          <section
            className="card-rise rounded-xl border border-black/10 bg-white p-4"
            style={{ animationDelay: "0ms" }}
          >
            <div className="flex flex-wrap items-center gap-5">
              <AttainmentDial
                attainment={stats.pace.attainment}
                actual={stats.pace.actual}
                target={stats.pace.target}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-neutral-600">
                  Frames handed over {phrase}, against the target
                </p>
                <p className="mt-1 text-[22px] font-semibold leading-tight tracking-tight">
                  {stats.pace.actual} of {fmt1(stats.pace.target)}
                  {shortfall > 0 ? (
                    <span className="text-neutral-400"> · {fmt1(shortfall)} short</span>
                  ) : (
                    <span className="text-emerald-600"> · target met</span>
                  )}
                </p>
                <p
                  className={`mt-2 text-sm leading-snug ${
                    forecast.tone === "behind"
                      ? "text-rose-700"
                      : forecast.tone === "ahead"
                        ? "text-emerald-700"
                        : "text-neutral-500"
                  }`}
                >
                  {forecast.text}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Earned frames"
              value={stats.earned.value}
              decimals={1}
              delta={trend(stats.earned)}
              caption={`includes part-built frames · ${fmt1(stats.scope.earnedFrames)} of ${stats.scope.plannedFrames} on the job`}
              delay={40}
            />
            <Kpi
              label="Job complete"
              value={stats.scope.pct}
              unit="%"
              caption={`${stats.scope.handedOverFrames} handed over, ${stats.openFrames} open, ${stringCount} strings planned`}
              delay={80}
            />
            <Kpi
              label="Frame cycle time"
              value={cycle ?? 0}
              unit=" d"
              decimals={1}
              caption={
                cycle === null
                  ? `none handed over ${phrase}`
                  : stats.previousCycleTimeDays === null
                    ? "median first work to handover"
                    : `median · was ${fmt1(stats.previousCycleTimeDays)} d before`
              }
              delay={120}
            />
            <Kpi
              label="Right first time"
              value={fpy === null ? 0 : Math.round(fpy * 100)}
              unit="%"
              caption={
                fpy === null
                  ? `none handed over ${phrase}`
                  : stats.faultRate === null
                    ? "handed over with no fault raised"
                    : `rework ran at ${fmt1(stats.faultRate)} per 100 breakers`
              }
              delay={160}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={`Frames handed over each ${noun}`}
              subtitle={`Bars are frames · dashed line is the target of ${fmt1(bucketTarget(period, target))} a ${noun} · green clears it, red misses, dashed bar is the ${noun} still running`}
              delay={200}
            >
              <TargetBars
                buckets={stats.buckets}
                target={bucketTarget(period, target)}
                unitLabel="frames"
              />
            </Card>

            <Card
              title="Against the target pace"
              subtitle={`Cumulative earned frames (solid) against the cumulative target (dashed), over the last ${stats.buckets.length} ${noun}s · shaded gap is how far ahead or behind`}
              delay={240}
            >
              <PaceCurve
                earned={stats.curve.earned}
                target={stats.curve.target}
                labels={stats.buckets.map((b) => b.label)}
              />
              <p className="mt-2 text-xs text-neutral-500">
                {(() => {
                  const earnedEnd = stats.curve.earned[stats.curve.earned.length - 1] ?? 0;
                  const targetEnd = stats.curve.target[stats.curve.target.length - 1] ?? 0;
                  const gap = earnedEnd - targetEnd;
                  if (Math.abs(gap) < 0.5) return "Level with the target pace over this window.";
                  return gap > 0
                    ? `${fmt1(gap)} frames ahead of the target pace over this window.`
                    : `${fmt1(Math.abs(gap))} frames behind the target pace over this window.`;
                })()}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Where the open frames are sitting"
              subtitle={
                worstStage
                  ? `Biggest pile is ${worstStage.label} with ${worstStage.frames} frames · the number beside each stage is the median days waiting there`
                  : "No open frames"
              }
              delay={280}
            >
              {stats.stages.length ? (
                <div className="space-y-3">
                  {stats.stages.map((stage, i) => (
                    <RailBar
                      key={stage.stage || "none"}
                      label={stage.label}
                      value={`${stage.frames}`}
                      pct={(stage.frames / stagePeak) * 100}
                      caption={
                        stage.medianDaysWaiting > 0
                          ? `${stage.medianDaysWaiting} d median wait`
                          : "moved today"
                      }
                      color={stage.medianDaysWaiting >= 7 ? BEHIND : stage.medianDaysWaiting >= 3 ? WARN : AHEAD}
                      delay={i * 50}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  Nothing open — every frame that exists has been handed over.
                </p>
              )}
            </Card>

            <Card
              title="Longest without moving"
              subtitle="Open frames ranked by days at their current stage, so they can be chased by name"
              delay={320}
            >
              {stats.stalled.length ? (
                <ul className="divide-y divide-black/5">
                  {stats.stalled.map((frame, i) => (
                    <li
                      key={frame.id}
                      className="chart-legend flex items-center justify-between gap-3 py-2.5"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <Link href={`/frames/${frame.id}/map`} className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          String {frame.stringKey} · {frame.slot}
                        </p>
                        <p className="text-xs text-neutral-500">at {frame.stageLabel}</p>
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                          frame.daysWaiting >= 7
                            ? "bg-rose-50 text-rose-700"
                            : frame.daysWaiting >= 3
                              ? "bg-amber-50 text-amber-700"
                              : "bg-zinc-100 text-neutral-600"
                        }`}
                      >
                        {frame.daysWaiting} d
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">Nothing open to chase.</p>
              )}
            </Card>
          </div>

          <Card
            title="Strings, least complete first"
            subtitle="Earned percentage across each string's 14 slots, with how long the string has been open"
            delay={360}
          >
            {stats.strings.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {stats.strings.map((run, i) => (
                  <RailBar
                    key={run.key}
                    label={`String ${run.key}`}
                    value={`${run.pct}%`}
                    pct={run.pct}
                    caption={`${run.handedOver} of 14 handed over · ${fmt1(run.earned)} earned · open ${run.daysActive} d`}
                    color={run.pct >= 100 ? AHEAD : run.pct >= 50 ? "#111827" : WARN}
                    delay={i * 40}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No strings on this project yet.</p>
            )}
          </Card>
        </div>
      )}

      <SyncStatsPanel />
    </main>
  );
}
