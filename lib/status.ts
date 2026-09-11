import { irHasValue } from "./ir";
import type { Frame, FrameStatus } from "./types";

export function frameStatus(frame: Frame): FrameStatus {
  const h = frame.handover;
  if (
    h.shepherdName.trim() &&
    h.benmaxName.trim() &&
    h.date.trim() &&
    (h.installChecklistComplete || h.electricalTestingComplete)
  ) {
    return "handed_over";
  }

  const et = frame.electricalTesting;
  const testingStarted =
    Object.values(et.visualInspection).some(Boolean) ||
    et.frameIrSign.trim() !== "" ||
    Object.values(et.perCbsdsIr).some((c) => irHasValue(c.readings)) ||
    Object.values(et.perBreakerTest)
      .flat()
      .some(
        (b) =>
          irHasValue(b.irTest) ||
          Object.values(b.polarityTest).some(Boolean) ||
          b.sign.trim() !== "",
      ) ||
    Object.values(et.shuntTripLiveTest).some(Boolean);

  return testingStarted ? "testing" : "in_progress";
}

export function statusLabel(status: FrameStatus): string {
  if (status === "handed_over") return "Handed over";
  if (status === "testing") return "Testing";
  return "In progress";
}

export function serialsDiffer(install: string, testing: string): boolean {
  const a = install.trim().toUpperCase().replace(/\s+/g, "");
  const b = testing.trim().toUpperCase().replace(/\s+/g, "");
  return a !== "" && b !== "" && a !== b;
}
