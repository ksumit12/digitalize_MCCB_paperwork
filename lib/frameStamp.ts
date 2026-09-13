import { effectiveStage } from "./shopStage";
import type { Frame, StageVisit } from "./types";

/**
 * Defensive ceiling on the stage timeline. Stages only ever move forward for a
 * given frame, so thirteen entries is the natural maximum; the extra room
 * covers frames that are reopened and reworked.
 */
const MAX_VISITS = 40;

/**
 * Records the two things progress reporting needs that a frame edit does not
 * otherwise leave behind: when the frame was handed over, and when it entered
 * the stage it is now in.
 *
 * Called for local edits only. Frames arriving from another device already
 * carry their own stamps, and re-stamping them here would reset the clock to
 * whenever this device happened to receive them.
 */
export function stampFrameProgress(
  prev: Frame | undefined,
  next: Frame,
  nowIso: string,
): Frame {
  const history = stampStageHistory(prev, next, nowIso);
  return {
    ...next,
    submittedAt: stampSubmittedAt(prev, next, nowIso),
    stageHistory: history,
  };
}

function stampSubmittedAt(
  prev: Frame | undefined,
  next: Frame,
  nowIso: string,
): string | undefined {
  // Reopening a frame clears the stamp so it stops counting as output.
  if (!next.submitted) return undefined;
  return next.submittedAt || prev?.submittedAt || nowIso;
}

function stampStageHistory(
  prev: Frame | undefined,
  next: Frame,
  nowIso: string,
): StageVisit[] {
  const base = next.stageHistory?.length ? next.stageHistory : prev?.stageHistory ?? [];
  const stage = effectiveStage(next);
  // A frame that has not started any stage has nothing to time yet; createdAt
  // already marks that moment.
  if (!stage) return base;
  if (base[base.length - 1]?.stage === stage) return base;
  const appended = [...base, { stage, at: nowIso }];
  return appended.length > MAX_VISITS ? appended.slice(-MAX_VISITS) : appended;
}

/**
 * When the frame entered the stage it is currently sitting at, or undefined if
 * the frame predates stage tracking. Callers fall back to `updatedAt`.
 */
export function stageEnteredAt(frame: Frame): string | undefined {
  const stage = effectiveStage(frame);
  if (!stage) return undefined;
  const history = frame.stageHistory ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].stage === stage) return history[i].at;
  }
  return undefined;
}

/**
 * Best available handover time. Frames stamped before `submittedAt` existed
 * fall back to the handover date typed on the paperwork, then to the last edit.
 */
export function submittedAtOf(frame: Frame): string | undefined {
  if (!frame.submitted) return undefined;
  if (frame.submittedAt) return frame.submittedAt;
  const typed = handoverStamp(frame);
  return typed || frame.updatedAt || undefined;
}

/** Parses the handover date and time typed on the frame, if both look sane. */
export function handoverStamp(frame: Frame): string | undefined {
  const date = frame.handover?.date?.trim();
  if (!date) return undefined;
  const time = frame.handover?.time?.trim() || "00:00";
  const parsed = new Date(`${date}T${time.length === 5 ? time : "00:00"}`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}
