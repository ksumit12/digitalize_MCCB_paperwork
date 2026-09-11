import type { Frame, WorkStatus } from "./types";

export const STRING_LEVELS = [7, 6, 5, 4, 3, 2, 1] as const;
export const FRAME_SLOTS = STRING_LEVELS.flatMap((n) => [`${n}L`, `${n}R`] as const);
export type FrameSlot = (typeof FRAME_SLOTS)[number];

const SLOT_RE = /^([1-7])([LR])$/i;

export function parseFrameSlot(raw: string | undefined): FrameSlot | "" {
  const m = raw?.trim().toUpperCase().match(SLOT_RE);
  return m ? (`${m[1]}${m[2]}` as FrameSlot) : "";
}

export function workStatus(frame: Frame): WorkStatus {
  if (frame.submitted) return "submitted";
  if (frame.phase === "testing") return "testing";
  return "installing";
}

export function workStatusLabel(status: WorkStatus): string {
  if (status === "submitted") return "Submitted";
  if (status === "testing") return "Testing";
  return "Installing";
}

export function workStatusClass(status: WorkStatus): string {
  if (status === "submitted") return "bg-sky-600 text-white";
  if (status === "testing") return "bg-emerald-600 text-white";
  return "bg-amber-500 text-white";
}

export function slotFromFrame(frame: Frame): FrameSlot | "" {
  return parseFrameSlot(frame.frameSlot) || parseFrameSlot(frame.stringId);
}

export function stringKeyFromFrame(frame: Frame): string {
  const key = frame.stringKey?.trim();
  if (key) return key;
  return "1";
}
