import { usedCount } from "./breaker";
import { stageEnteredAt, submittedAtOf } from "./frameStamp";
import { DEFAULT_WEEKLY_TARGET, WORKING_DAYS_PER_WEEK } from "./project";
import { effectiveStage, stageChipLabel, stagePercent, stageRank, SHOP_STAGES } from "./shopStage";
import { FRAME_SLOTS, stringKeyFromFrame } from "./stringLayout";
import type { Fault, Frame, ShopStage } from "./types";

/**
 * Progress is reported in *earned frames*: a frame counts for the fraction of
 * the build sequence it has completed, so a shop with thirty frames at the
 * boards stage has earned 10.5 frames. That makes partial work comparable to
 * the weekly handover target and stops a week of heavy work on unfinished
 * frames reading as zero output.
 */

export type Period = "day" | "week" | "month";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

/** How many periods of history each view charts. */
const HISTORY: Record<Period, number> = { day: 14, week: 12, month: 6 };

export type Bucket = {
  start: number;
  end: number;
  label: string;
  /** Worth labelling on a narrow axis. */
  tick: boolean;
  /** Frames handed over inside this bucket. */
  handedOver: number;
  /** Frames opened inside this bucket. Against handovers, this is flow balance. */
  started: number;
  /**
   * Earned frames credited to this bucket, including partial progress. Carried
   * unrounded, since the pace curve and the burndown add these up.
   */
  earned: number;
  /** Faults raised inside this bucket. */
  faults: number;
  /** Handovers this bucket was expected to produce. Zero on a non-working day. */
  target: number;
  /** Frames started but not yet handed over as at the end of this bucket. */
  wip: number;
  /** Median build duration of the frames handed over in this bucket. */
  medianCycleDays: number | null;
  /** Share of this bucket's handovers that needed no fault fixed. */
  firstPassRate: number | null;
  /** Whether the bucket is still running, so a shortfall is not yet a miss. */
  partial: boolean;
};

export type FunnelStep = {
  stage: ShopStage;
  label: string;
  /** Frames that have reached or passed this stage. */
  cleared: number;
  /** Share of the planned frames on the job. */
  pct: number;
};

export type Burndown = {
  /** Frames left to hand over at the end of each charted period. */
  history: (number | null)[];
  /** Projection from today at the target rate, aligned to `labels`. */
  atTarget: (number | null)[];
  /** Projection from today at the trailing rate, aligned to `labels`. */
  atRecentRate: (number | null)[];
  /** Period labels covering history and projection. */
  labels: string[];
  /** Index where the projection starts, so the chart can mark today. */
  todayIndex: number;
};

export type StageLoad = {
  stage: ShopStage;
  label: string;
  frames: number;
  /** Median days frames currently at this stage have been sitting there. */
  medianDaysWaiting: number;
};

export type StageDwell = {
  stage: ShopStage;
  label: string;
  /** Median days frames spent at this stage before moving on. */
  medianDays: number;
  /** Completed stays behind the median, so a thin sample can be discounted. */
  samples: number;
};

/** The single view of how fast the shop is running, in frames a week. */
type RateModel = {
  likely: number;
  best: number;
  worst: number;
  /** Completed weeks with output behind the figures. */
  samples: number;
};

export type Outlook = {
  /** Handovers per week in the best, typical and worst of the recent periods. */
  bestRate: number;
  likelyRate: number;
  worstRate: number;
  /** Finish dates those rates imply, or null when a rate is zero. */
  bestFinish: number | null;
  likelyFinish: number | null;
  worstFinish: number | null;
  /** Finish date if the target rate is met from here. */
  targetFinish: number;
  /** Completed periods behind the spread. */
  samples: number;
};

export type StalledFrame = {
  id: string;
  stringKey: string;
  slot: string;
  stageLabel: string;
  daysWaiting: number;
};

export type StringProgress = {
  key: string;
  earned: number;
  handedOver: number;
  slots: number;
  pct: number;
  /** Days since the first frame in the string was created. */
  daysActive: number;
};

export type Delta = { value: number; previous: number };

export type Pace = {
  /** Frames handed over in the current period so far. */
  actual: number;
  /** Frames the target implies for a whole period of this length. */
  target: number;
  /**
   * Frames the target implies for the part of the period already worked. A
   * month judged on its first Tuesday against a whole month's target reads as a
   * disaster whatever the crew does, so the comparison is against where the job
   * should be by now.
   */
  expected: number;
  /** Share of the expected figure achieved, 0-based, uncapped. */
  attainment: number;
  /** Frames ahead (positive) or behind (negative) where they should be by now. */
  variance: number;
  /** Working days worked so far, and in the whole period. */
  workingDaysElapsed: number;
  workingDaysTotal: number;
  /** Whether the period is still running. */
  partial: boolean;
};

export type Forecast = {
  /** Frames still to hand over across the planned slots. */
  remaining: number;
  /** Frames handed over per week averaged over the trailing window. */
  recentRate: number;
  /** Weeks to finish at the recent rate, or null when nothing is moving. */
  weeksAtRecentRate: number | null;
  /** Weeks to finish if the target rate is met from here. */
  weeksAtTarget: number;
  /** Projected finish at the recent rate. */
  finishAtRecentRate: number | null;
  /** Projected finish if the target rate is met. */
  finishAtTarget: number;
  /** Days later than the target-rate finish. Negative means ahead. */
  slipDays: number | null;
};

export type ProgressStats = {
  period: Period;
  start: number;
  end: number;
  rangeLabel: string;
  weeklyTarget: number;
  /** Output against the target for the selected period. */
  pace: Pace;
  /** Earned frames in the period, with the period before it. */
  earned: Delta;
  /** Frames handed over in the period, with the period before it. */
  handedOver: Delta;
  /** Median days from first work to handover, for frames finished in the period. */
  cycleTimeDays: number | null;
  previousCycleTimeDays: number | null;
  /** Share of frames handed over in the period that never needed a fault fixed. */
  firstPassYield: number | null;
  previousFirstPassYield: number | null;
  /** Faults per 100 breakers installed, in the period. */
  faultRate: number | null;
  scope: {
    /** Slots across every string on the job, at 14 per string. */
    plannedFrames: number;
    /** Frames that exist, of the planned slots. */
    startedFrames: number;
    handedOverFrames: number;
    earnedFrames: number;
    pct: number;
  };
  forecast: Forecast;
  buckets: Bucket[];
  /** Cumulative earned frames against the cumulative target, over the buckets. */
  curve: { earned: number[]; target: number[] };
  /** Trailing average of handovers, to separate the trend from weekly noise. */
  rollingAverage: (number | null)[];
  /** Frames left to hand over, historic and projected. */
  burndown: Burndown;
  /** Finish dates implied by the best, typical and worst recent periods. */
  outlook: Outlook;
  /** How many frames have cleared each stage across the whole job. */
  funnel: FunnelStep[];
  stages: StageLoad[];
  /** How long a frame sits at each stage before it moves on. */
  stageDwell: StageDwell[];
  /** Frames sitting longest at their current stage, worst first. */
  stalled: StalledFrame[];
  strings: StringProgress[];
  /** Frames in progress that have not been handed over. */
  openFrames: number;
};

const DAY_MS = 86_400_000;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday-based week start, matching how a shop counts its week. */
function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const shift = (out.getDay() + 6) % 7;
  return addDays(out, -shift);
}

function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Working days from `from` up to but not including `to`. Targets are set per
 * working day, so every figure derived from one has to count days the same way
 * or a long month quietly raises the bar.
 */
function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  let cursor = startOfDay(from);
  const limit = to.getTime();
  // A month is the longest span asked for; the guard just stops a bad date
  // turning into a hang.
  for (let i = 0; i < 400 && cursor.getTime() < limit; i += 1) {
    if (isWorkingDay(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function periodStart(period: Period, d: Date): Date {
  if (period === "day") return startOfDay(d);
  if (period === "week") return startOfWeek(d);
  return startOfMonth(d);
}

function nextPeriod(period: Period, d: Date): Date {
  if (period === "day") return addDays(d, 1);
  if (period === "week") return addDays(d, 7);
  return addMonths(d, 1);
}

function previousPeriod(period: Period, d: Date): Date {
  if (period === "day") return addDays(d, -1);
  if (period === "week") return addDays(d, -7);
  return addMonths(d, -1);
}

function bucketLabel(period: Period, start: Date): string {
  if (period === "day") return DAY_NAMES[start.getDay()];
  if (period === "week") return `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
  return MONTH_NAMES[start.getMonth()];
}

/**
 * Buckets run on local calendar boundaries rather than fixed millisecond spans,
 * so a day is the day the crew actually worked even across a clock change, and
 * a month is a real month rather than thirty days.
 */
export function buildBuckets(
  period: Period,
  now: Date,
  weeklyTarget: number = DEFAULT_WEEKLY_TARGET,
): Bucket[] {
  const count = HISTORY[period];
  const nowMs = now.getTime();
  let cursor = periodStart(period, now);
  for (let i = 1; i < count; i += 1) cursor = previousPeriod(period, cursor);

  const out: Bucket[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = cursor;
    const end = nextPeriod(period, start);
    const span = { start: start.getTime(), end: end.getTime() };
    out.push({
      ...span,
      label: bucketLabel(period, start),
      // Every other week, and always the last one — but never the week beside
      // the last, or the two labels collide.
      tick:
        period === "week" ? i === count - 1 || (i % 2 === 0 && i !== count - 2) : true,
      handedOver: 0,
      started: 0,
      earned: 0,
      faults: 0,
      target: round1(bucketTarget(period, weeklyTarget, span)),
      wip: 0,
      medianCycleDays: null,
      firstPassRate: null,
      partial: span.start <= nowMs && span.end > nowMs,
    });
    cursor = end;
  }
  return out;
}

/** Just the span of a bucket, so a target can be worked out before one exists. */
type Span = { start: number; end: number };

/**
 * The target for one bucket of the selected period. Everything is derived from
 * the weekly target divided over working days, so a day reads 8 against a
 * target of 40 rather than a misleadingly soft 5.7, and a long month asks for
 * more than a short one without ever asking for output on a Sunday.
 */
export function bucketTarget(period: Period, weeklyTarget: number, bucket?: Span): number {
  const perWorkingDay = weeklyTarget / WORKING_DAYS_PER_WEEK;
  if (period === "day") {
    if (!bucket) return perWorkingDay;
    return isWorkingDay(new Date(bucket.start)) ? perWorkingDay : 0;
  }
  if (period === "week") return weeklyTarget;
  if (!bucket) return perWorkingDay * 22;
  return perWorkingDay * workingDaysBetween(new Date(bucket.start), new Date(bucket.end));
}

/**
 * The share of a bucket's target that the days worked so far have earned the
 * right to be judged against. A period that has finished is judged in full.
 */
function expectedToDate(period: Period, bucket: Bucket, now: Date): number {
  if (!bucket.partial) return bucket.target;
  // A day is the smallest unit reported, so it is judged whole rather than
  // sliced by the clock; half a day's target at lunchtime is false precision.
  if (period === "day") return bucket.target;
  const total = workingDaysBetween(new Date(bucket.start), new Date(bucket.end));
  if (!total) return bucket.target;
  const elapsed = workingDaysElapsed(bucket, now);
  return round1((bucket.target * Math.min(total, elapsed)) / total);
}

/** Working days of a bucket already worked, counting today once it has begun. */
function workingDaysElapsed(bucket: Bucket, now: Date): number {
  const from = new Date(bucket.start);
  const to = new Date(Math.min(bucket.end, addDays(startOfDay(now), 1).getTime()));
  return workingDaysBetween(from, to);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Earned frames for one frame: its position through the build sequence. */
export function earnedOf(frame: Frame): number {
  return stagePercent(frame) / 100;
}

function parse(value: string | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/**
 * When work on a frame first started. `createdAt` is the moment the paperwork
 * was opened, which is the earliest evidence of work on that slot.
 */
function startedAt(frame: Frame): number | null {
  return parse(frame.createdAt) ?? parse(frame.updatedAt);
}

function handoverTime(frame: Frame): number | null {
  return parse(submittedAtOf(frame));
}

function inRange(at: number | null, start: number, end: number): boolean {
  return at !== null && at >= start && at < end;
}

/**
 * Earned frames credited to a bucket. Only handovers carry a timestamp we can
 * attribute precisely, so partial progress is credited to the bucket holding
 * the frame's latest stage change. A frame that advanced two stages in one week
 * is credited its whole earned value that week, which is the intent: the
 * question is how much of the job got done, not exactly when each bolt went in.
 */
function earnedAt(frame: Frame): number | null {
  if (frame.submitted) return handoverTime(frame);
  return parse(stageEnteredAt(frame)) ?? parse(frame.updatedAt);
}

/** Median days from first work to handover across a set of finished frames. */
function cycleDaysOf(list: Frame[]): number | null {
  return median(
    list
      .map((f) => {
        const from = startedAt(f);
        const to = handoverTime(f);
        return from !== null && to !== null && to >= from ? (to - from) / DAY_MS : null;
      })
      .filter((v): v is number => v !== null),
  );
}

function faultsByFrame(faults: Fault[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const fault of faults) out.set(fault.frameId, (out.get(fault.frameId) || 0) + 1);
  return out;
}

/** Median days that frames now sitting at a stage have been waiting there. */
function waitingDays(frame: Frame, nowMs: number): number {
  const since = parse(stageEnteredAt(frame)) ?? parse(frame.updatedAt) ?? nowMs;
  return Math.max(0, (nowMs - since) / DAY_MS);
}

function rangeLabel(period: Period, start: number): string {
  const from = new Date(start);
  if (period === "day") {
    return from.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  }
  if (period === "week") {
    const to = new Date(nextPeriod("week", from).getTime() - 1);
    const day = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
    return `${day(from)} – ${day(to)}`;
  }
  return from.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function buildProgress(
  frames: Frame[],
  faults: Fault[],
  period: Period,
  weeklyTarget: number,
  stringCount: number,
  now: Date = new Date(),
): ProgressStats {
  const nowMs = now.getTime();
  const buckets = buildBuckets(period, now, weeklyTarget);
  const current = buckets[buckets.length - 1];
  const start = current.start;
  const end = current.end;
  const prevStart = previousPeriod(period, new Date(start)).getTime();

  const faultCounts = faultsByFrame(faults);

  for (const bucket of buckets) {
    const finishedHere: Frame[] = [];
    for (const frame of frames) {
      const handed = handoverTime(frame);
      if (inRange(handed, bucket.start, bucket.end)) {
        bucket.handedOver += 1;
        finishedHere.push(frame);
      }
      if (inRange(earnedAt(frame), bucket.start, bucket.end)) bucket.earned += earnedOf(frame);
      if (inRange(startedAt(frame), bucket.start, bucket.end)) bucket.started += 1;
      // Open at the close of this bucket: started by then, not yet finished by
      // then. Rising work in progress against flat output is a clog forming.
      const began = startedAt(frame);
      if (began !== null && began < bucket.end && (handed === null || handed >= bucket.end)) {
        bucket.wip += 1;
      }
    }
    for (const fault of faults) {
      if (inRange(parse(fault.raisedAt), bucket.start, bucket.end)) bucket.faults += 1;
    }
    // Deliberately not rounded: the curve and the burndown accumulate these, and
    // rounding each bucket first drifts the total away from the figure the page
    // quotes as work left.
    bucket.medianCycleDays = roundOrNull(cycleDaysOf(finishedHere));
    bucket.firstPassRate = finishedHere.length
      ? finishedHere.filter((f) => !faultCounts.get(f.id)).length / finishedHere.length
      : null;
  }

  const handedOverNow = frames.filter((f) => inRange(handoverTime(f), start, end));
  const handedOverPrev = frames.filter((f) => inRange(handoverTime(f), prevStart, start));
  const earnedNow = frames
    .filter((f) => inRange(earnedAt(f), start, end))
    .reduce((sum, f) => sum + earnedOf(f), 0);
  const earnedPrev = frames
    .filter((f) => inRange(earnedAt(f), prevStart, start))
    .reduce((sum, f) => sum + earnedOf(f), 0);

  const expected = expectedToDate(period, current, now);
  const pace: Pace = {
    actual: handedOverNow.length,
    target: current.target,
    expected,
    attainment: expected ? handedOverNow.length / expected : 0,
    variance: round1(handedOverNow.length - expected),
    workingDaysElapsed: workingDaysElapsed(current, now),
    workingDaysTotal: workingDaysBetween(new Date(current.start), new Date(current.end)),
    partial: current.partial,
  };

  // Scope is the slots on the job: every string carries fourteen frames whether
  // or not the paperwork for them has been opened yet. Counting only frames
  // that exist would make the job look finished on day one.
  const plannedFrames = Math.max(stringCount, 1) * FRAME_SLOTS.length;
  const handedOverFrames = frames.filter((f) => f.submitted).length;
  const earnedFrames = frames.reduce((sum, f) => sum + earnedOf(f), 0);

  const yieldOf = (list: Frame[]) =>
    list.length ? list.filter((f) => !faultCounts.get(f.id)).length / list.length : null;

  const breakersInPeriod = handedOverNow.reduce((sum, f) => sum + usedCount(f), 0);
  const faultsInPeriod = faults.filter((f) => inRange(parse(f.raisedAt), start, end)).length;

  const rate = buildRateModel(frames, now);
  const forecast = buildForecast(plannedFrames, earnedFrames, weeklyTarget, rate, now);
  const earnedBefore = Math.max(0, earnedFrames - buckets.reduce((sum, b) => sum + b.earned, 0));

  return {
    period,
    start,
    end,
    rangeLabel: rangeLabel(period, start),
    weeklyTarget,
    pace,
    earned: { value: round1(earnedNow), previous: round1(earnedPrev) },
    handedOver: { value: handedOverNow.length, previous: handedOverPrev.length },
    cycleTimeDays: roundOrNull(cycleDaysOf(handedOverNow)),
    previousCycleTimeDays: roundOrNull(cycleDaysOf(handedOverPrev)),
    firstPassYield: yieldOf(handedOverNow),
    previousFirstPassYield: yieldOf(handedOverPrev),
    faultRate: breakersInPeriod ? round1((faultsInPeriod / breakersInPeriod) * 100) : null,
    scope: {
      plannedFrames,
      startedFrames: frames.length,
      handedOverFrames,
      earnedFrames: round1(earnedFrames),
      pct: Math.round((earnedFrames / plannedFrames) * 100),
    },
    forecast,
    buckets,
    // Work credited before the window opened, so the charts start where the job
    // actually stood rather than at the full scope.
    curve: buildCurve(buckets, Math.max(0, plannedFrames - earnedBefore)),
    rollingAverage: buildRollingAverage(buckets),
    burndown: buildBurndown(
      buckets,
      period,
      plannedFrames,
      weeklyTarget,
      earnedBefore,
      forecast.recentRate,
    ),
    outlook: buildOutlook(plannedFrames, earnedFrames, weeklyTarget, rate, now),
    funnel: buildFunnel(frames, plannedFrames),
    stages: buildStageLoad(frames, nowMs),
    stageDwell: buildStageDwell(frames),
    stalled: buildStalled(frames, nowMs),
    strings: buildStrings(frames, nowMs),
    openFrames: frames.filter((f) => !f.submitted).length,
  };
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : round1(value);
}

/**
 * Cumulative earned frames against the cumulative target across the charted
 * window. The gap between the two lines is the accumulated surplus or deficit,
 * which is the schedule position expressed in frames rather than in days.
 *
 * The target stops climbing once it reaches the work the window actually had to
 * give: a rate held past the end of the job would otherwise report a deficit of
 * frames nobody ever had to build.
 */
function buildCurve(
  buckets: Bucket[],
  /** Frames left to build when the window opened. */
  availableWork: number,
): { earned: number[]; target: number[] } {
  let earnedRunning = 0;
  let targetRunning = 0;
  const earned: number[] = [];
  const target: number[] = [];
  for (const bucket of buckets) {
    earnedRunning += bucket.earned;
    targetRunning = Math.min(targetRunning + bucket.target, availableWork);
    earned.push(round1(earnedRunning));
    target.push(round1(targetRunning));
  }
  return { earned, target };
}

/** Periods averaged over for the trend line on the output chart. */
const ROLLING_WINDOW = 4;

/**
 * Trailing average of handovers. The individual bars bounce around with public
 * holidays and material deliveries; this is the line that shows whether the
 * shop is actually speeding up or slowing down. Null until there is a full
 * window, rather than a misleading average of one or two periods. The period
 * still running is excluded so a half-finished week cannot drag it down.
 */
function buildRollingAverage(buckets: Bucket[]): (number | null)[] {
  return buckets.map((bucket, i) => {
    if (bucket.partial) return null;
    if (i < ROLLING_WINDOW - 1) return null;
    const window = buckets.slice(i - ROLLING_WINDOW + 1, i + 1);
    return round1(window.reduce((sum, b) => sum + b.handedOver, 0) / ROLLING_WINDOW);
  });
}

/**
 * Work left, historic then projected forward at both the target rate and the
 * rate the shop is actually running at. Where the two projections cross zero is
 * the difference the current pace makes, without needing anyone to have
 * committed to a finish date.
 *
 * Measured in earned frames, the same unit as the forecast, so the figure the
 * chart ends on is the figure quoted as frames left rather than a second,
 * slightly different remainder.
 */
function buildBurndown(
  buckets: Bucket[],
  period: Period,
  plannedFrames: number,
  weeklyTarget: number,
  /** Earned frames credited before the charted window opened. */
  earnedBefore: number,
  /** Frames a week the shop is running at, shared with the headline forecast. */
  recentWeeklyRate: number,
): Burndown {
  let earnedSoFar = earnedBefore;
  const cumulative = buckets.map((b) => (earnedSoFar += b.earned));
  const history = cumulative.map((done) => round1(Math.max(0, plannedFrames - done)));
  const remaining = history[history.length - 1] ?? plannedFrames;

  // Each projected step is measured against its own span, so a Sunday in the day
  // view is not expected to deliver and a short month is not asked for a long
  // month's output.
  const steps: Span[] = [];
  let cursor = new Date(buckets[buckets.length - 1].end);
  const perStepTarget = bucketTarget(period, weeklyTarget);
  const maxSteps = Math.min(
    Math.max(perStepTarget > 0 ? Math.ceil(remaining / perStepTarget) : 1, 1),
    buckets.length,
  );
  for (let i = 0; i < maxSteps; i += 1) {
    const next = nextPeriod(period, cursor);
    steps.push({ start: cursor.getTime(), end: next.getTime() });
    cursor = next;
  }

  const labels = [
    ...buckets.map((b) => b.label),
    ...steps.map((s) => bucketLabel(period, new Date(s.start))),
  ];

  const pad = (values: (number | null)[], length: number) =>
    values.concat(Array.from({ length: length - values.length }, () => null));

  /** Burns the remainder down step by step at `weeklyRate` frames a week. */
  const project = (weeklyRate: number): (number | null)[] => {
    if (weeklyRate <= 0) return Array.from({ length: labels.length }, () => null);
    const out: (number | null)[] = Array.from({ length: buckets.length - 1 }, () => null);
    let left = remaining;
    out.push(round1(left));
    for (const step of steps) {
      const share = bucketTarget(period, weeklyTarget, step) / Math.max(weeklyTarget, 1);
      left = Math.max(0, left - weeklyRate * share);
      out.push(round1(left));
    }
    return pad(out, labels.length);
  };

  return {
    history: pad(history, labels.length),
    atTarget: project(weeklyTarget),
    atRecentRate: project(recentWeeklyRate),
    labels,
    todayIndex: buckets.length - 1,
  };
}

/**
 * How far the job has got through each stage. Read left to right it shows where
 * the pipeline narrows: a wide step followed by a much thinner one is the point
 * everything is queuing behind.
 */
function buildFunnel(frames: Frame[], plannedFrames: number): FunnelStep[] {
  return SHOP_STAGES.map((stage) => {
    const target = stageRank(stage);
    const cleared = frames.filter((f) => stageRank(effectiveStage(f)) >= target).length;
    return {
      stage,
      label: stageChipLabel(stage),
      cleared,
      pct: Math.round((cleared / plannedFrames) * 100),
    };
  });
}

/**
 * A finish date from one average is a false promise: the shop has good weeks and
 * bad ones, and the honest answer is a window. The spread of the periods already
 * worked gives that window without pretending to model anything.
 */
function buildOutlook(
  plannedFrames: number,
  earnedFrames: number,
  weeklyTarget: number,
  rate: RateModel,
  now: Date,
): Outlook {
  const remaining = Math.max(0, plannedFrames - earnedFrames);
  const finish = (weekly: number) =>
    weekly > 0 ? addDays(now, Math.ceil((remaining / weekly) * 7)).getTime() : null;

  return {
    bestRate: round1(rate.best),
    likelyRate: round1(rate.likely),
    worstRate: round1(rate.worst),
    bestFinish: finish(rate.best),
    likelyFinish: finish(rate.likely),
    worstFinish: finish(rate.worst),
    targetFinish: addDays(now, Math.ceil((remaining / weeklyTarget) * 7)).getTime(),
    samples: rate.samples,
  };
}

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index];
}

/**
 * How long a frame sits at each stage before it moves on, taken from the stage
 * timeline rather than from what is sitting there now. The count of frames at a
 * stage says where the queue is; this says which step is actually slow.
 */
function buildStageDwell(frames: Frame[]): StageDwell[] {
  const spans = new Map<ShopStage, number[]>();
  for (const frame of frames) {
    const visits = frame.stageHistory || [];
    for (let i = 0; i < visits.length - 1; i += 1) {
      const from = parse(visits[i].at);
      const to = parse(visits[i + 1].at);
      if (from === null || to === null || to < from) continue;
      const list = spans.get(visits[i].stage) || [];
      list.push((to - from) / DAY_MS);
      spans.set(visits[i].stage, list);
    }
  }

  return SHOP_STAGES.filter((stage) => stage !== "submitted")
    .map((stage) => {
      const list = spans.get(stage) || [];
      return {
        stage,
        label: stageChipLabel(stage),
        medianDays: round1(median(list) ?? 0),
        samples: list.length,
      };
    })
    .filter((s) => s.samples > 0);
}

/** Weeks of trailing history the rate the shop is running at is read from. */
const RATE_WINDOW_WEEKS = 8;

/**
 * One rate, quoted in frames a week, used by everything on the page that talks
 * about pace: the headline rate, the burndown projection and the finish window.
 * Three separate estimates would have the page contradict itself.
 *
 * It is the median of the completed weeks worked, not an average over the last
 * month. A median shrugs off the week a shipment was late, and only counting
 * weeks with output keeps a job that started recently from being judged on the
 * empty weeks before it began.
 */
function buildRateModel(frames: Frame[], now: Date): RateModel {
  const thisWeek = startOfWeek(now).getTime();
  const counts = new Map<number, number>();
  for (const frame of frames) {
    const at = handoverTime(frame);
    if (at === null) continue;
    const week = startOfWeek(new Date(at)).getTime();
    // The week still running is a part week, and would read as a slow one.
    if (week >= thisWeek) continue;
    counts.set(week, (counts.get(week) || 0) + 1);
  }

  const from = addDays(startOfWeek(now), -RATE_WINDOW_WEEKS * 7).getTime();
  const weeks = [...counts.entries()]
    .filter(([week]) => week >= from)
    .map(([, count]) => count)
    .sort((a, b) => a - b);

  if (!weeks.length) return { likely: 0, best: 0, worst: 0, samples: 0 };

  return {
    likely: percentile(weeks, 0.5),
    best: percentile(weeks, 0.8),
    worst: percentile(weeks, 0.2),
    samples: weeks.length,
  };
}

function buildForecast(
  plannedFrames: number,
  earnedFrames: number,
  weeklyTarget: number,
  rate: RateModel,
  now: Date,
): Forecast {
  const recentRate = round1(rate.likely);
  const remaining = round1(Math.max(0, plannedFrames - earnedFrames));

  const weeksAtTarget = remaining / weeklyTarget;
  const weeksAtRecentRate = recentRate > 0 ? remaining / recentRate : null;
  const finishAtTarget = addDays(now, Math.ceil(weeksAtTarget * 7)).getTime();
  const finishAtRecentRate =
    weeksAtRecentRate === null ? null : addDays(now, Math.ceil(weeksAtRecentRate * 7)).getTime();

  return {
    remaining,
    recentRate,
    weeksAtRecentRate: weeksAtRecentRate === null ? null : round1(weeksAtRecentRate),
    weeksAtTarget: round1(weeksAtTarget),
    finishAtRecentRate,
    finishAtTarget,
    slipDays:
      finishAtRecentRate === null
        ? null
        : Math.round((finishAtRecentRate - finishAtTarget) / DAY_MS),
  };
}

/**
 * Where the open frames are sitting. Read top to bottom this is the shop floor:
 * a pile at one stage with a long wait beside it is the constraint.
 */
function buildStageLoad(frames: Frame[], nowMs: number): StageLoad[] {
  const open = frames.filter((f) => !f.submitted);
  const notStarted = open.filter((f) => !effectiveStage(f));
  const out: StageLoad[] = [];

  if (notStarted.length) {
    out.push({
      stage: "",
      label: "Not started",
      frames: notStarted.length,
      medianDaysWaiting: Math.round(
        median(notStarted.map((f) => waitingDays(f, nowMs))) ?? 0,
      ),
    });
  }

  for (const stage of SHOP_STAGES) {
    if (stage === "submitted") continue;
    const here = open.filter((f) => effectiveStage(f) === stage);
    if (!here.length) continue;
    out.push({
      stage,
      label: stageChipLabel(stage),
      frames: here.length,
      medianDaysWaiting: Math.round(median(here.map((f) => waitingDays(f, nowMs))) ?? 0),
    });
  }
  return out;
}

/** Frames that have sat at the same stage longest, so they can be chased by name. */
function buildStalled(frames: Frame[], nowMs: number): StalledFrame[] {
  return frames
    .filter((f) => !f.submitted)
    .map((f) => ({
      id: f.id,
      stringKey: stringKeyFromFrame(f),
      slot: f.frameSlot || f.stringId || "?",
      stageLabel: effectiveStage(f) ? stageChipLabel(effectiveStage(f) as Exclude<ShopStage, "">) : "Not started",
      daysWaiting: Math.floor(waitingDays(f, nowMs)),
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting)
    .slice(0, 6);
}

function buildStrings(frames: Frame[], nowMs: number): StringProgress[] {
  const map = new Map<string, { earned: number; handedOver: number; slots: Set<string>; first: number }>();
  for (const frame of frames) {
    const key = stringKeyFromFrame(frame);
    const entry = map.get(key) || { earned: 0, handedOver: 0, slots: new Set<string>(), first: nowMs };
    entry.earned += earnedOf(frame);
    if (frame.submitted) entry.handedOver += 1;
    const slot = frame.frameSlot || frame.stringId;
    if (slot) entry.slots.add(slot);
    const began = startedAt(frame);
    if (began !== null && began < entry.first) entry.first = began;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      earned: round1(v.earned),
      handedOver: v.handedOver,
      slots: v.slots.size,
      pct: Math.round((v.earned / FRAME_SLOTS.length) * 100),
      daysActive: Math.max(0, Math.floor((nowMs - v.first) / DAY_MS)),
    }))
    .sort((a, b) => a.pct - b.pct || a.key.localeCompare(b.key, undefined, { numeric: true }));
}

/** Percentage change against the previous period, or null with no baseline. */
export function trend(delta: Delta): number | null {
  if (delta.previous === 0) return delta.value > 0 ? null : 0;
  return Math.round(((delta.value - delta.previous) / delta.previous) * 100);
}
