import { usedCount } from "./breaker";
import { stageEnteredAt, submittedAtOf } from "./frameStamp";
import { WORKING_DAYS_PER_WEEK } from "./project";
import { effectiveStage, stageChipLabel, stagePercent, SHOP_STAGES } from "./shopStage";
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
  /** Earned frames credited to this bucket, including partial progress. */
  earned: number;
  /** Faults raised inside this bucket. */
  faults: number;
  /** Whether the bucket is still running, so a shortfall is not yet a miss. */
  partial: boolean;
};

export type StageLoad = {
  stage: ShopStage;
  label: string;
  frames: number;
  /** Median days frames currently at this stage have been sitting there. */
  medianDaysWaiting: number;
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
  /** Share of the target achieved, 0-based, uncapped. */
  attainment: number;
  /** Frames ahead (positive) or behind (negative) the target. */
  variance: number;
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
  stages: StageLoad[];
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
export function buildBuckets(period: Period, now: Date): Bucket[] {
  const count = HISTORY[period];
  const nowMs = now.getTime();
  let cursor = periodStart(period, now);
  for (let i = 1; i < count; i += 1) cursor = previousPeriod(period, cursor);

  const out: Bucket[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = cursor;
    const end = nextPeriod(period, start);
    out.push({
      start: start.getTime(),
      end: end.getTime(),
      label: bucketLabel(period, start),
      tick: period === "day" ? true : period === "week" ? i % 2 === 0 || i === count - 1 : true,
      handedOver: 0,
      earned: 0,
      faults: 0,
      partial: start.getTime() <= nowMs && end.getTime() > nowMs,
    });
    cursor = end;
  }
  return out;
}

/**
 * The target for one bucket of the selected period. A day is the weekly target
 * spread over working days, not calendar days, so a five-day week reads 8 a day
 * against a target of 40 rather than a misleadingly soft 5.7.
 */
export function bucketTarget(period: Period, weeklyTarget: number, bucket?: Bucket): number {
  if (period === "day") return weeklyTarget / WORKING_DAYS_PER_WEEK;
  if (period === "week") return weeklyTarget;
  const days = bucket ? Math.round((bucket.end - bucket.start) / DAY_MS) : 30;
  return (weeklyTarget / 7) * days;
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
  const buckets = buildBuckets(period, now);
  const current = buckets[buckets.length - 1];
  const start = current.start;
  const end = current.end;
  const prevStart = previousPeriod(period, new Date(start)).getTime();

  const faultCounts = faultsByFrame(faults);

  for (const bucket of buckets) {
    for (const frame of frames) {
      if (inRange(handoverTime(frame), bucket.start, bucket.end)) bucket.handedOver += 1;
      if (inRange(earnedAt(frame), bucket.start, bucket.end)) bucket.earned += earnedOf(frame);
    }
    for (const fault of faults) {
      if (inRange(parse(fault.raisedAt), bucket.start, bucket.end)) bucket.faults += 1;
    }
    bucket.earned = round1(bucket.earned);
  }

  const handedOverNow = frames.filter((f) => inRange(handoverTime(f), start, end));
  const handedOverPrev = frames.filter((f) => inRange(handoverTime(f), prevStart, start));
  const earnedNow = frames
    .filter((f) => inRange(earnedAt(f), start, end))
    .reduce((sum, f) => sum + earnedOf(f), 0);
  const earnedPrev = frames
    .filter((f) => inRange(earnedAt(f), prevStart, start))
    .reduce((sum, f) => sum + earnedOf(f), 0);

  const target = bucketTarget(period, weeklyTarget, current);
  const pace: Pace = {
    actual: handedOverNow.length,
    target: round1(target),
    attainment: target ? handedOverNow.length / target : 0,
    variance: round1(handedOverNow.length - target),
  };

  // Scope is the slots on the job: every string carries fourteen frames whether
  // or not the paperwork for them has been opened yet. Counting only frames
  // that exist would make the job look finished on day one.
  const plannedFrames = Math.max(stringCount, 1) * FRAME_SLOTS.length;
  const handedOverFrames = frames.filter((f) => f.submitted).length;
  const earnedFrames = frames.reduce((sum, f) => sum + earnedOf(f), 0);

  const cycleDays = (list: Frame[]) =>
    median(
      list
        .map((f) => {
          const from = startedAt(f);
          const to = handoverTime(f);
          return from !== null && to !== null && to >= from ? (to - from) / DAY_MS : null;
        })
        .filter((v): v is number => v !== null),
    );

  const yieldOf = (list: Frame[]) =>
    list.length ? list.filter((f) => !faultCounts.get(f.id)).length / list.length : null;

  const breakersInPeriod = handedOverNow.reduce((sum, f) => sum + usedCount(f), 0);
  const faultsInPeriod = faults.filter((f) => inRange(parse(f.raisedAt), start, end)).length;

  return {
    period,
    start,
    end,
    rangeLabel: rangeLabel(period, start),
    weeklyTarget,
    pace,
    earned: { value: round1(earnedNow), previous: round1(earnedPrev) },
    handedOver: { value: handedOverNow.length, previous: handedOverPrev.length },
    cycleTimeDays: roundOrNull(cycleDays(handedOverNow)),
    previousCycleTimeDays: roundOrNull(cycleDays(handedOverPrev)),
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
    forecast: buildForecast(frames, plannedFrames, earnedFrames, weeklyTarget, now),
    buckets,
    curve: buildCurve(buckets, period, weeklyTarget),
    stages: buildStageLoad(frames, nowMs),
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
 */
function buildCurve(
  buckets: Bucket[],
  period: Period,
  weeklyTarget: number,
): { earned: number[]; target: number[] } {
  let earnedRunning = 0;
  let targetRunning = 0;
  const earned: number[] = [];
  const target: number[] = [];
  for (const bucket of buckets) {
    earnedRunning += bucket.earned;
    targetRunning += bucketTarget(period, weeklyTarget, bucket);
    earned.push(round1(earnedRunning));
    target.push(round1(targetRunning));
  }
  return { earned, target };
}

/** Weeks of trailing history used to estimate the rate the shop is really running at. */
const RATE_WINDOW_WEEKS = 4;

function buildForecast(
  frames: Frame[],
  plannedFrames: number,
  earnedFrames: number,
  weeklyTarget: number,
  now: Date,
): Forecast {
  const windowStart = addDays(startOfDay(now), -RATE_WINDOW_WEEKS * 7).getTime();
  const nowMs = now.getTime();
  const recent = frames.filter((f) => inRange(handoverTime(f), windowStart, nowMs + 1)).length;
  const recentRate = round1(recent / RATE_WINDOW_WEEKS);
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
