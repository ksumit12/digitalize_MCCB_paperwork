import { serialsDoneCount, usedCount } from "./breaker";
import { slotFromFrame, stringKeyFromFrame, workStatus } from "./stringLayout";
import type { Fault, Frame } from "./types";

export type Period = "day" | "week" | "month";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export type Bucket = {
  start: number;
  end: number;
  label: string;
  /** Whether this bucket is worth labelling on a narrow axis. */
  tick: boolean;
  scans: number;
  faults: number;
};

export type ScanEvent = {
  at: number;
  by: string;
  stringKey: string;
  slot: string;
  hole: string;
  serial: string;
};

export type Delta = { value: number; previous: number };

export type ProgressStats = {
  period: Period;
  start: number;
  end: number;
  rangeLabel: string;
  scans: Delta;
  submitted: Delta;
  faults: Delta;
  installers: { name: string; scans: number }[];
  buckets: Bucket[];
  cumulative: number[];
  completion: { done: number; total: number; pct: number };
  phases: { installing: number; testing: number; submitted: number };
  strings: { key: string; done: number; total: number; pct: number; slots: number }[];
  busiest: { label: string; scans: number } | null;
  perDayAverage: number;
  activity: {
    at: number;
    kind: "scan" | "fault";
    title: string;
    detail: string;
    by: string;
  }[];
};

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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function hourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/**
 * Buckets are built from local calendar boundaries rather than by subtracting
 * fixed millisecond spans, so a day is the day the crew actually worked even
 * across a daylight-saving change.
 */
export function buildBuckets(period: Period, now: Date): Bucket[] {
  const blank = { scans: 0, faults: 0 };
  if (period === "day") {
    const midnight = startOfDay(now);
    return Array.from({ length: 24 }, (_, hour) => {
      const start = new Date(midnight);
      start.setHours(hour);
      const end = new Date(midnight);
      end.setHours(hour + 1);
      return {
        start: start.getTime(),
        end: end.getTime(),
        label: hourLabel(hour),
        tick: hour % 4 === 0,
        ...blank,
      };
    });
  }

  const days = period === "week" ? 7 : 30;
  const first = startOfDay(addDays(now, -(days - 1)));
  return Array.from({ length: days }, (_, i) => {
    const start = addDays(first, i);
    const end = addDays(first, i + 1);
    return {
      start: start.getTime(),
      end: end.getTime(),
      label: period === "week" ? DAY_NAMES[start.getDay()] : String(start.getDate()),
      tick: period === "week" ? true : i === 0 || i === days - 1 || start.getDate() === 1 || i % 7 === 0,
      ...blank,
    };
  });
}

export function scanEvents(frames: Frame[]): ScanEvent[] {
  const out: ScanEvent[] = [];
  for (const frame of frames) {
    const stringKey = stringKeyFromFrame(frame);
    const slot = slotFromFrame(frame) || frame.frameSlot || "";
    for (const board of frame.cbsds || []) {
      for (const pos of board.breakerPositions || []) {
        const at = Date.parse(pos.mccbScannedAt || "");
        if (!Number.isFinite(at)) continue;
        out.push({
          at,
          by: (pos.mccbScannedBy || "").trim(),
          stringKey,
          slot,
          hole: `${board.label}${pos.position}`,
          serial: pos.mccbSerialNumber || "",
        });
      }
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

function countBetween(times: number[], start: number, end: number): number {
  return times.filter((t) => t >= start && t < end).length;
}

function rangeLabel(period: Period, start: number, end: number): string {
  const from = new Date(start);
  const to = new Date(end - 1);
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (period === "day") {
    return from.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  }
  return `${day(from)} – ${day(to)}`;
}

export function buildProgress(
  frames: Frame[],
  faults: Fault[],
  period: Period,
  now: Date = new Date(),
): ProgressStats {
  const buckets = buildBuckets(period, now);
  const start = buckets[0].start;
  const end = buckets[buckets.length - 1].end;
  // The window immediately before this one, same length, for the deltas.
  const previousStart = start - (end - start);

  const scans = scanEvents(frames);
  const scanTimes = scans.map((s) => s.at);
  const faultTimes = faults
    .map((f) => Date.parse(f.raisedAt || ""))
    .filter((t) => Number.isFinite(t));
  // Submission time is not recorded separately, so a submitted frame is
  // credited to when it was last touched. Close enough for a trend, and it is
  // never used to claim an exact moment.
  const submitTimes = frames
    .filter((f) => f.submitted)
    .map((f) => Date.parse(f.updatedAt || ""))
    .filter((t) => Number.isFinite(t));

  for (const bucket of buckets) {
    bucket.scans = countBetween(scanTimes, bucket.start, bucket.end);
    bucket.faults = countBetween(faultTimes, bucket.start, bucket.end);
  }

  let running = 0;
  const cumulative = buckets.map((b) => (running += b.scans));

  const inWindow = scans.filter((s) => s.at >= start && s.at < end);
  const byInstaller = new Map<string, number>();
  for (const scan of inWindow) {
    const name = scan.by || "Unsigned";
    byInstaller.set(name, (byInstaller.get(name) || 0) + 1);
  }

  const done = frames.reduce((sum, f) => sum + serialsDoneCount(f), 0);
  const total = frames.reduce((sum, f) => sum + usedCount(f), 0);

  const phases = { installing: 0, testing: 0, submitted: 0 };
  for (const frame of frames) phases[workStatus(frame)] += 1;

  const stringMap = new Map<string, { done: number; total: number; slots: Set<string> }>();
  for (const frame of frames) {
    const key = stringKeyFromFrame(frame);
    const entry = stringMap.get(key) || { done: 0, total: 0, slots: new Set<string>() };
    entry.done += serialsDoneCount(frame);
    entry.total += usedCount(frame);
    const slot = slotFromFrame(frame);
    if (slot) entry.slots.add(slot);
    stringMap.set(key, entry);
  }

  const withScans = buckets.filter((b) => b.scans > 0);
  const busiest = withScans.length
    ? withScans.reduce((best, b) => (b.scans > best.scans ? b : best))
    : null;

  // Averaged over days that saw work, not over the whole window, so a weekend
  // does not quietly halve the figure.
  const activeDays = period === "day" ? 1 : new Set(
    inWindow.map((s) => startOfDay(new Date(s.at)).getTime()),
  ).size;

  const faultActivity = faults
    .map((f) => ({ fault: f, at: Date.parse(f.raisedAt || "") }))
    .filter((x) => Number.isFinite(x.at) && x.at >= start && x.at < end);

  const activity = [
    ...inWindow.map((s) => ({
      at: s.at,
      kind: "scan" as const,
      title: s.serial || "Serial recorded",
      detail: `String ${s.stringKey} · ${s.slot || "?"} · ${s.hole}`,
      by: s.by,
    })),
    ...faultActivity.map(({ fault, at }) => ({
      at,
      kind: "fault" as const,
      title: fault.kind === "shunt" ? "Shunt trip replaced" : "Unit replaced",
      detail: `String ${fault.stringKey} · ${fault.frameSlot || "?"} · ${fault.hole || "?"}`,
      by: fault.raisedBy || "",
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 12);

  return {
    period,
    start,
    end,
    rangeLabel: rangeLabel(period, start, end),
    scans: {
      value: inWindow.length,
      previous: countBetween(scanTimes, previousStart, start),
    },
    submitted: {
      value: countBetween(submitTimes, start, end),
      previous: countBetween(submitTimes, previousStart, start),
    },
    faults: {
      value: countBetween(faultTimes, start, end),
      previous: countBetween(faultTimes, previousStart, start),
    },
    installers: [...byInstaller.entries()]
      .map(([name, count]) => ({ name, scans: count }))
      .sort((a, b) => b.scans - a.scans || a.name.localeCompare(b.name))
      .slice(0, 6),
    buckets,
    cumulative,
    completion: { done, total, pct: total ? Math.round((done / total) * 100) : 0 },
    phases,
    strings: [...stringMap.entries()]
      .map(([key, v]) => ({
        key,
        done: v.done,
        total: v.total,
        pct: v.total ? Math.round((v.done / v.total) * 100) : 0,
        slots: v.slots.size,
      }))
      .sort((a, b) => b.pct - a.pct || a.key.localeCompare(b.key, undefined, { numeric: true })),
    busiest: busiest ? { label: busiest.label, scans: busiest.scans } : null,
    perDayAverage: activeDays ? Math.round(inWindow.length / activeDays) : 0,
    activity,
  };
}

/** Percentage change, or null when there is no baseline to compare against. */
export function trend(delta: Delta): number | null {
  if (delta.previous === 0) return delta.value > 0 ? null : 0;
  return Math.round(((delta.value - delta.previous) / delta.previous) * 100);
}
