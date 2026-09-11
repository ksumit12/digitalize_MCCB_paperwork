import { irHasValue } from "./ir";
import { needsShuntTrip } from "./emptyFrame";
import type { BreakerPosition, BreakerTest, CbsdsLabel, Frame } from "./types";

export const AMP_COLORS: Record<32 | 63 | 100, { fill: string; ring: string; label: string }> = {
  32: { fill: "bg-sky-500", ring: "ring-sky-500", label: "text-sky-700" },
  63: { fill: "bg-orange-500", ring: "ring-orange-500", label: "text-orange-700" },
  100: { fill: "bg-violet-500", ring: "ring-violet-500", label: "text-violet-700" },
};

export function isUsed(b: BreakerPosition): boolean {
  if (b.inUse === false) return false;
  if (b.inUse === true) return true;
  return Boolean(b.micrologicSettingAmps || b.mccbSerialNumber || b.microLogicSerialNumber);
}

export function serialsComplete(b: BreakerPosition): boolean {
  if (!isUsed(b) || !b.micrologicSettingAmps) return false;
  if (!b.mccbSerialNumber.trim() || !b.microLogicSerialNumber.trim()) return false;
  if (needsShuntTrip(b.micrologicSettingAmps) && !b.shuntTripBatchNumber.trim()) return false;
  return true;
}

export function meggerComplete(test: BreakerTest): boolean {
  return irHasValue(test.irTest) || Object.values(test.polarityTest).some(Boolean);
}

export function slotId(label: CbsdsLabel, position: number): string {
  return `${label}${position}`;
}

export function parseSlot(raw: string | null): { label: CbsdsLabel; position: number } | null {
  if (!raw) return null;
  const m = raw.match(/^([ABCD])([1-8])$/i);
  if (!m) return null;
  return { label: m[1].toUpperCase() as CbsdsLabel, position: Number(m[2]) };
}

export function getBreaker(frame: Frame, label: CbsdsLabel, position: number): BreakerPosition | undefined {
  return frame.cbsds.find((c) => c.label === label)?.breakerPositions[position - 1];
}

export function getTest(frame: Frame, label: CbsdsLabel, position: number): BreakerTest | undefined {
  return frame.electricalTesting.perBreakerTest[label]?.[position - 1];
}

export function patchBreaker(
  frame: Frame,
  label: CbsdsLabel,
  position: number,
  next: BreakerPosition,
): Frame {
  return {
    ...frame,
    cbsds: frame.cbsds.map((c) =>
      c.label === label
        ? {
            ...c,
            breakerPositions: c.breakerPositions.map((b) => (b.position === position ? next : b)),
          }
        : c,
    ),
  };
}

export function emptySlot(b: BreakerPosition): BreakerPosition {
  return {
    ...b,
    inUse: false,
    mccbSerialNumber: "",
    microLogicSerialNumber: "",
    shuntTripBatchNumber: "",
    micrologicSettingAmps: "",
    micrologicSettingConfirmed: false,
  };
}

export function setAmp(b: BreakerPosition, amps: 32 | 63 | 100): BreakerPosition {
  return {
    ...b,
    inUse: true,
    micrologicSettingAmps: amps,
    shuntTripBatchNumber: amps === 32 ? "" : b.shuntTripBatchNumber,
  };
}

export function usedCount(frame: Frame): number {
  return frame.cbsds.flatMap((c) => c.breakerPositions).filter(isUsed).length;
}

export function serialsDoneCount(frame: Frame): number {
  return frame.cbsds.flatMap((c) => c.breakerPositions).filter(serialsComplete).length;
}

export function nextMapSlot(
  label: CbsdsLabel,
  position: number,
): { label: CbsdsLabel; position: number } | null {
  if (position < 8) return { label, position: position + 1 };
  const order: CbsdsLabel[] = ["A", "B", "C", "D"];
  const i = order.indexOf(label);
  if (i >= 0 && i < order.length - 1) return { label: order[i + 1], position: 1 };
  return null;
}
