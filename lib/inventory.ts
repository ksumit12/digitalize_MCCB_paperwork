import { isUsed, serialsComplete } from "./breaker";
import type { StringRun } from "./db";
import type { Frame } from "./types";

/*
 * Inventory & progress numbers, all derived from the frames already captured.
 * No separate stock table — "what has been used" is computed from the work
 * that was actually done, which is what the paperwork needs anyway.
 */

export type StringInventory = {
  key: string;
  tradeName: string;
  framesStarted: number;
  framesTesting: number;
  framesSubmitted: number;
  totalSlots: number; // 14 slots per string (7 levels × L/R)
  usedPositions: number;
  serialsDone: number;
  mccb32: number;
  mccb63: number;
  mccb100: number;
  mccbTotal: number;
  shunts: number;
  micrologics: number;
};

export function inventoryForFrames(frames: Frame[]): Omit<StringInventory, "key" | "tradeName" | "framesStarted"> {
  const inv = {
    framesTesting: 0,
    framesSubmitted: 0,
    totalSlots: 14,
    usedPositions: 0,
    serialsDone: 0,
    mccb32: 0,
    mccb63: 0,
    mccb100: 0,
    mccbTotal: 0,
    shunts: 0,
    micrologics: 0,
  };
  for (const frame of frames) {
    if (frame.submitted) inv.framesSubmitted += 1;
    else if (frame.phase === "testing") inv.framesTesting += 1;
    for (const cbsds of frame.cbsds) {
      for (const b of cbsds.breakerPositions) {
        if (!isUsed(b)) continue;
        inv.usedPositions += 1;
        if (b.micrologicSettingAmps === 32) inv.mccb32 += 1;
        if (b.micrologicSettingAmps === 63) inv.mccb63 += 1;
        if (b.micrologicSettingAmps === 100) inv.mccb100 += 1;
        if (b.mccbSerialNumber.trim()) inv.mccbTotal += 1;
        if (b.microLogicSerialNumber.trim()) inv.micrologics += 1;
        if (b.shuntTripBatchNumber.trim()) inv.shunts += 1;
        if (serialsComplete(b)) inv.serialsDone += 1;
      }
    }
  }
  return inv;
}

export function inventoryByString(frames: Frame[], runs: StringRun[]): StringInventory[] {
  const keys = new Set([...runs.map((r) => r.key), ...frames.map((f) => f.stringKey?.trim() || "1")]);
  return [...keys]
    .map((key) => {
      const group = frames.filter((f) => (f.stringKey?.trim() || "1") === key);
      const run = runs.find((r) => r.key === key);
      return {
        key,
        tradeName: run?.tradeName || group.find((f) => f.tradeName)?.tradeName || "",
        framesStarted: group.length,
        ...inventoryForFrames(group),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

export type ProgressDay = { date: string; submitted: number; breakers: number };

export function dailyProgress(frames: Frame[], days = 7): ProgressDay[] {
  const out: ProgressDay[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, submitted: 0, breakers: 0 });
  }
  const index = new Map(out.map((p, i) => [p.date, i]));
  for (const frame of frames) {
    if (!frame.submitted) continue;
    // Handover date when the handover was signed, otherwise the day the frame was last saved.
    const date = (frame.handover?.date || frame.updatedAt || "").slice(0, 10);
    const slot = index.get(date);
    if (slot == null) continue;
    out[slot].submitted += 1;
  }
  for (const frame of frames) {
    const date = (frame.updatedAt || "").slice(0, 10);
    const slot = index.get(date);
    if (slot == null) continue;
    out[slot].breakers += frame.cbsds
      .flatMap((c) => c.breakerPositions)
      .filter((b) => isUsed(b) && serialsComplete(b)).length;
  }
  return out;
}

export type Pace = {
  submittedTotal: number;
  remainingSlots: number;
  avgPerDay: number;
  last7: number;
  prev7: number;
  etaDays: number | null;
};

export function paceFor(frames: Frame[], runs: StringRun[]): Pace {
  const inv = inventoryByString(frames, runs);
  const submittedTotal = inv.reduce((s, i) => s + i.framesSubmitted, 0);
  const active = inv.filter((i) => i.framesSubmitted < i.totalSlots);
  const remainingSlots = active.reduce((s, i) => s + (i.totalSlots - i.framesSubmitted), 0);

  const all = dailyProgress(frames, 14);
  const last7 = all.slice(7).reduce((s, d) => s + d.submitted, 0);
  const prev7 = all.slice(0, 7).reduce((s, d) => s + d.submitted, 0);
  const avgPerDay = last7 / 7;
  const etaDays = remainingSlots > 0 ? Math.ceil(remainingSlots / Math.max(avgPerDay, 1 / 7)) : null;

  return { submittedTotal, remainingSlots, avgPerDay, last7, prev7, etaDays };
}

/** Whose hands a slot has been through — used to point at responsibility on a fault. */
export function peopleForSlot(
  frames: Frame[],
  stringKey: string,
  slot: string,
): { installer: string; tester: string } {
  const frame = frames.find(
    (f) => (f.stringKey?.trim() || "1") === stringKey && (f.frameSlot || f.stringId || "").toUpperCase() === slot.toUpperCase(),
  );
  return {
    installer: frame ? `${frame.installerName || ""} ${frame.installerInitials || ""}`.trim() : "",
    tester: frame ? `${frame.testerName || ""} ${frame.testerInitials || ""}`.trim() : "",
  };
}
