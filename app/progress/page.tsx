"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AttainmentDial,
  Burndown,
  CountUp,
  FinishWindow,
  FlowBars,
  PALETTE,
  PaceCurve,
  RailBar,
  Sparkline,
  StageFunnel,
  TargetBars,
  TrendLine,
} from "@/components/progress/charts";
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
  buildProgress,
  PERIODS,
  trend,
  type Period,
  type ProgressStats,
} from "@/lib/progress";
import type { Fault, Frame } from "@/lib/types";

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
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      className={`card-rise rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(20,25,35,0.05)] ring-1 ring-black/[0.06] sm:p-5 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title ? (
        <header className="mb-4">
          <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs leading-snug text-neutral-500">{subtitle}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Small coloured pill carrying the change against the period before. */
function DeltaChip({
  delta,
  goodWhenDown = false,
}: {
  delta: number | null | undefined;
  goodWhenDown?: boolean;
}) {
  if (delta == null || delta === 0) return null;
  const rising = delta > 0;
  const good = goodWhenDown ? !rising : rising;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      {rising ? "↑" : "↓"} {Math.abs(delta)}%
    </span>
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
  spark,
  color = PALETTE.steel,
  delay = 0,
  empty = false,
}: {
  label: string;
  value: number;
  unit?: string;
  /** Percentage change against the period before, or null when there is none. */
  delta?: number | null;
  caption: string;
  goodWhenDown?: boolean;
  decimals?: number;
  /** History for the thumbnail trend, oldest first. */
  spark?: (number | null)[];
  color?: string;
  delay?: number;
  /** Nothing to report this period, so a dash beats a misleading zero. */
  empty?: boolean;
}) {
  return (
    <div
      className="card-rise flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(20,25,35,0.05)] ring-1 ring-black/[0.06]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-1 flex-col p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] leading-tight text-neutral-600">{label}</p>
          <DeltaChip delta={delta} goodWhenDown={goodWhenDown} />
        </div>
        <p className="mt-2.5 text-[28px] font-semibold leading-none tracking-tight tabular-nums">
          {empty ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <>
              <CountUp value={value} format={(n) => (decimals ? fmt1(n) : String(Math.round(n)))} />
              {unit ? <span className="text-lg font-medium text-neutral-400">{unit}</span> : null}
            </>
          )}
        </p>
        <p className="mt-2 flex-1 text-xs leading-snug text-neutral-400">{caption}</p>
      </div>
      {spark ? <Sparkline values={spark} color={color} /> : null}
    </div>
  );
}

/** The one sentence the page exists to produce. */
function forecastSentence(stats: ProgressStats): {
  text: string;
  tone: "ahead" | "behind" | "unknown";
} {
  const { forecast, weeklyTarget } = stats;
  if (forecast.remaining <= 0) {
    return { text: "Every planned frame is handed over. The job is complete.", tone: "ahead" };
  }
  if (forecast.recentRate <= 0 || forecast.finishAtRecentRate === null) {
    return {
      text: `No week has finished with a handover yet, so there is no rate to forecast from. At ${weeklyTarget} a week the remaining ${fmt1(forecast.remaining)} frames would take ${fmt1(forecast.weeksAtTarget)} weeks.`,
      tone: "unknown",
    };
  }
  const slip = forecast.slipDays ?? 0;
  const gap = `${fmt1(forecast.recentRate)} a week against a target of ${weeklyTarget}`;
  const weeks = `${fmt1(forecast.weeksAtRecentRate ?? 0)} weeks rather than ${fmt1(forecast.weeksAtTarget)}`;
  const finish = longDate(forecast.finishAtRecentRate);
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

/** One figure in the dark hero strip. */
function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ahead" | "behind";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
      <p
        className={`mt-1 truncate text-[17px] font-semibold tracking-tight tabular-nums ${
          tone === "behind" ? "text-rose-300" : tone === "ahead" ? "text-emerald-300" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
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
        className="rounded-full border border-rule px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-white"
      >
        Target {value} a week — change
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
  const behind = forecast.tone === "behind";
  const labels = stats.buckets.map((b) => b.label);
  const cycle = stats.cycleTimeDays;
  const fpy = stats.firstPassYield;
  const worstStage = [...stats.stages].sort((a, b) => b.frames - a.frames)[0];
  const stagePeak = Math.max(1, ...stats.stages.map((s) => s.frames));
  const dwellPeak = Math.max(1, ...stats.stageDwell.map((s) => s.medianDays));
  const paceGap =
    (stats.curve.earned[stats.curve.earned.length - 1] ?? 0) -
    (stats.curve.target[stats.curve.target.length - 1] ?? 0);
  const wipNow = stats.buckets[stats.buckets.length - 1]?.wip ?? 0;
  /** A weekend in the day view: nothing was asked for, so nothing was missed. */
  const noTarget = stats.pace.expected <= 0;
  const startedNow = stats.buckets[stats.buckets.length - 1]?.started ?? 0;
  const flowNet = startedNow - stats.pace.actual;
  const cycleDelta =
    cycle === null || stats.previousCycleTimeDays === null || stats.previousCycleTimeDays === 0
      ? null
      : Math.round(((cycle - stats.previousCycleTimeDays) / stats.previousCycleTimeDays) * 100);
  const fpyDelta =
    fpy === null || stats.previousFirstPassYield === null || stats.previousFirstPassYield === 0
      ? null
      : Math.round(((fpy - stats.previousFirstPassYield) / stats.previousFirstPassYield) * 100);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-5">
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
          {/* Headline. Dark so it reads as the answer and everything below is
              the explanation. */}
          <section
            className="card-rise overflow-hidden rounded-2xl bg-ink p-5 text-white"
            style={{ animationDelay: "0ms" }}
          >
            <div className="flex flex-wrap items-center gap-6">
              {noTarget ? (
                <div className="flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-full border border-white/10">
                  <span className="text-[30px] font-semibold leading-none tracking-tight tabular-nums">
                    {stats.pace.actual}
                  </span>
                  <span className="mt-1 text-[11px] text-white/55">handed over</span>
                </div>
              ) : (
                <AttainmentDial
                  attainment={stats.pace.attainment}
                  actual={stats.pace.actual}
                  target={stats.pace.expected}
                  onDark
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white/55">
                  {noTarget
                    ? `Frames handed over ${phrase}`
                    : `Frames handed over ${phrase}, against the pace the target sets`}
                </p>
                <p className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
                  {noTarget ? (
                    <>
                      {stats.pace.actual}
                      <span className="text-white/40"> · nothing was due</span>
                    </>
                  ) : (
                    <>
                      {stats.pace.actual} of {fmt1(stats.pace.expected)}
                      {stats.pace.variance < 0 ? (
                        <span className="text-white/40">
                          {" "}
                          · {fmt1(-stats.pace.variance)} behind
                        </span>
                      ) : (
                        <span className="text-emerald-300"> · pace held</span>
                      )}
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {noTarget
                    ? "The target is set per working day, so a weekend asks for nothing."
                    : period === "day"
                      ? `A working day of the ${fmt1(target)} a week target`
                      : stats.pace.partial
                        ? `${stats.pace.workingDaysElapsed} of ${stats.pace.workingDaysTotal} working days in, against ${fmt1(stats.pace.target)} for the whole ${noun}`
                        : `The ${noun} is complete, against ${fmt1(stats.pace.target)}`}
                </p>
                <p
                  className={`mt-2.5 max-w-2xl text-sm leading-snug ${
                    behind
                      ? "text-rose-200"
                      : forecast.tone === "ahead"
                        ? "text-emerald-200"
                        : "text-white/60"
                  }`}
                >
                  {forecast.text}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
              <HeroStat label="Current rate" value={`${fmt1(stats.forecast.recentRate)} / wk`} />
              <HeroStat
                label="Projected finish"
                value={
                  stats.forecast.finishAtRecentRate === null
                    ? "—"
                    : longDate(stats.forecast.finishAtRecentRate)
                }
                // Nothing to project from is neither good news nor bad, so it
                // stays uncoloured rather than reading as on track.
                tone={forecast.tone === "unknown" ? undefined : behind ? "behind" : "ahead"}
              />
              <HeroStat
                label="Against target"
                value={
                  stats.forecast.slipDays === null
                    ? "—"
                    : stats.forecast.slipDays > 0
                      ? `${stats.forecast.slipDays} days late`
                      : `${Math.abs(stats.forecast.slipDays)} days early`
                }
                tone={forecast.tone === "unknown" ? undefined : behind ? "behind" : "ahead"}
              />
              <HeroStat label="Frames left" value={fmt1(stats.forecast.remaining)} />
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Earned frames"
              value={stats.earned.value}
              decimals={1}
              delta={trend(stats.earned)}
              caption={`part-built work counted at its stage · ${fmt1(stats.scope.earnedFrames)} of ${stats.scope.plannedFrames} on the job`}
              spark={stats.buckets.map((b) => b.earned)}
              delay={40}
            />
            <Kpi
              label="Job complete"
              value={stats.scope.pct}
              unit="%"
              caption={`${stats.scope.handedOverFrames} handed over, ${stats.openFrames} open, ${stringCount} strings planned`}
              spark={stats.curve.earned}
              delay={80}
            />
            <Kpi
              label="Frame cycle time"
              value={cycle ?? 0}
              empty={cycle === null}
              unit=" d"
              decimals={1}
              goodWhenDown
              delta={cycleDelta}
              caption={
                cycle === null
                  ? `none handed over ${phrase}`
                  : stats.previousCycleTimeDays === null
                    ? "median from first work to handover"
                    : `median · was ${fmt1(stats.previousCycleTimeDays)} d before`
              }
              spark={stats.buckets.map((b) => b.medianCycleDays)}
              color={PALETTE.warn}
              delay={120}
            />
            <Kpi
              label="Right first time"
              value={fpy === null ? 0 : Math.round(fpy * 100)}
              empty={fpy === null}
              unit="%"
              delta={fpyDelta}
              caption={
                fpy === null
                  ? `none handed over ${phrase}`
                  : stats.faultRate === null
                    ? "handed over with no fault raised"
                    : `rework ran at ${fmt1(stats.faultRate)} per 100 breakers`
              }
              spark={stats.buckets.map((b) => (b.firstPassRate === null ? null : b.firstPassRate * 100))}
              color={PALETTE.ahead}
              delay={160}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              title={`Frames handed over each ${noun}`}
              subtitle={`Steel is what was handed over, the dashed line is that ${noun}'s target, and the wash above it is the shortfall · the ${noun} still running is striped`}
              delay={200}
              className="lg:col-span-2"
            >
              <TargetBars
                buckets={stats.buckets}
                unitLabel="frames"
                average={stats.rollingAverage}
                averageLabel={`Four-${noun} average`}
              />
            </Card>

            <Card
              title="Frames left to build"
              subtitle="Counted in earned frames, so a part-built frame counts for the part that is done · dashed lines project forward from today at the target rate and at the current rate"
              delay={240}
            >
              <Burndown
                history={stats.burndown.history}
                atTarget={stats.burndown.atTarget}
                atRecentRate={stats.burndown.atRecentRate}
                labels={stats.burndown.labels}
                todayIndex={stats.burndown.todayIndex}
              />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              title="When the job lands"
              subtitle={`From the spread of the last ${stats.outlook.samples} week${stats.outlook.samples === 1 ? "" : "s"} worked, not from a single average`}
              delay={280}
            >
              {stats.outlook.bestFinish === null ||
              stats.outlook.likelyFinish === null ||
              stats.outlook.worstFinish === null ? (
                <p className="py-6 text-sm text-neutral-400">
                  Nothing has been handed over recently, so there is no range to project from.
                </p>
              ) : (
                <FinishWindow
                  from={now}
                  best={stats.outlook.bestFinish}
                  likely={stats.outlook.likelyFinish}
                  worst={stats.outlook.worstFinish}
                  target={stats.outlook.targetFinish}
                  formatDate={shortDate}
                />
              )}
            </Card>

            <Card
              title="Against the target pace"
              subtitle={`Cumulative earned frames against the cumulative target over the last ${stats.buckets.length} ${noun}s · the shaded gap is the accumulated surplus or deficit`}
              delay={320}
              className="lg:col-span-2"
            >
              <PaceCurve earned={stats.curve.earned} target={stats.curve.target} labels={labels} />
              <p className="mt-2 text-xs text-neutral-500">
                {Math.abs(paceGap) < 0.5
                  ? "Level with the target pace over this window."
                  : paceGap > 0
                    ? `${fmt1(paceGap)} frames ahead of the target pace over this window.`
                    : `${fmt1(Math.abs(paceGap))} frames behind the target pace over this window.`}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={`Frames opened against frames finished, by ${noun}`}
              subtitle="Starting frames faster than they are finished fills the floor with part-built work and stretches every frame's build time"
              delay={360}
            >
              <FlowBars buckets={stats.buckets} />
              <p className="mt-2 text-xs text-neutral-500">
                {flowNet === 0
                  ? `Opened and finished the same number ${phrase}.`
                  : flowNet > 0
                    ? `${flowNet} more frames were opened than finished ${phrase}, so work in progress grew.`
                    : `${Math.abs(flowNet)} more frames were finished than opened ${phrase}, so the floor cleared a little.`}
              </p>
            </Card>

            <Card
              title="Frames open at once"
              subtitle={`Frames started but not handed over, at the close of each ${noun} · rising work in progress with flat output means frames are being opened faster than they are finished`}
              delay={400}
            >
              <TrendLine
                values={stats.buckets.map((b) => b.wip)}
                labels={labels}
                color={PALETTE.steel}
                goodWhenDown
              />
              <p className="mt-2 text-xs text-neutral-500">
                {wipNow} open now against {fmt1(stats.forecast.recentRate)} finished a week, which is
                roughly {fmt1(stats.forecast.recentRate > 0 ? wipNow / stats.forecast.recentRate : 0)}{" "}
                weeks of work in the shop.
              </p>
            </Card>
          </div>

          <Card
            title="How far the job has got through each stage"
            subtitle={`Frames that have reached or passed each stage, out of the ${stats.scope.plannedFrames} planned · the amber step is the biggest fall-off`}
            delay={440}
          >
            <StageFunnel steps={stats.funnel} plannedFrames={stats.scope.plannedFrames} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={`Build time per frame, by ${noun}`}
              subtitle="Median days from first work to handover · a rising line means frames are taking longer even if output holds"
              delay={480}
            >
              <TrendLine
                values={stats.buckets.map((b) => b.medianCycleDays)}
                labels={labels}
                color={PALETTE.warn}
                goodWhenDown
                format={(n) => `${fmt1(n)} d`}
              />
            </Card>

            <Card
              title={`Right first time, by ${noun}`}
              subtitle="Share of handovers that needed no fault fixed · the dashed line is 100%, and speed bought with rework shows up here"
              delay={520}
            >
              <TrendLine
                values={stats.buckets.map((b) =>
                  b.firstPassRate === null ? null : Math.round(b.firstPassRate * 100),
                )}
                labels={labels}
                color={PALETTE.ahead}
                reference={100}
                referenceLabel="100%"
                format={(n) => `${Math.round(n)}%`}
              />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Where the open frames are sitting"
              subtitle={
                worstStage
                  ? `Biggest pile is ${worstStage.label} with ${worstStage.frames} frames · the caption under each bar is the median days waiting there`
                  : "No open frames"
              }
              delay={560}
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
                      color={
                        stage.medianDaysWaiting >= 7
                          ? PALETTE.behind
                          : stage.medianDaysWaiting >= 3
                            ? PALETTE.warn
                            : PALETTE.ahead
                      }
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
              title="How long each stage takes"
              subtitle="Median days a frame spends at a stage before it moves on, taken from frames that have already passed through · the count of frames waiting says where the queue is, this says which step is slow"
              delay={600}
            >
              {stats.stageDwell.length ? (
                <div className="space-y-3">
                  {stats.stageDwell.map((stage, i) => (
                    <RailBar
                      key={stage.stage}
                      label={stage.label}
                      value={`${fmt1(stage.medianDays)} d`}
                      pct={(stage.medianDays / dwellPeak) * 100}
                      caption={`${stage.samples} frame${stage.samples === 1 ? "" : "s"} measured`}
                      color={
                        stage.medianDays >= 5
                          ? PALETTE.behind
                          : stage.medianDays >= 2
                            ? PALETTE.warn
                            : PALETTE.steel
                      }
                      delay={i * 50}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  No frame has moved between stages yet, so there is nothing to time. This fills in
                  as frames are advanced through the shop.
                </p>
              )}
            </Card>
          </div>

          <Card
            title="Longest without moving"
            subtitle="Open frames ranked by days at their current stage, so they can be chased by name"
            delay={640}
          >
            {stats.stalled.length ? (
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {stats.stalled.map((frame, i) => (
                  <li
                    key={frame.id}
                    className="chart-legend flex items-center justify-between gap-3 border-b border-black/5 py-2.5"
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

          <Card
            title="Strings, least complete first"
            subtitle="Earned percentage across each string's 14 slots, with how long the string has been open"
            delay={680}
          >
            {stats.strings.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {stats.strings.map((run, i) => (
                  <RailBar
                    key={run.key}
                    label={`String ${run.key}`}
                    value={`${run.pct}%`}
                    pct={run.pct}
                    caption={`${run.handedOver} of 14 handed over · open ${run.daysActive} d`}
                    color={
                      run.pct >= 100
                        ? PALETTE.ahead
                        : run.pct >= 50
                          ? PALETTE.steel
                          : PALETTE.warn
                    }
                    delay={i * 30}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No strings on this project yet.</p>
            )}
          </Card>

          <p className="pt-2 text-center text-xs text-neutral-400">
            Figures cover {stats.rangeLabel} · charts show the last {stats.buckets.length} {noun}s ·
            updated {shortDate(now)}
          </p>
        </div>
      )}

      <SyncStatsPanel />
    </main>
  );
}
