import type { BreakerPosition, BreakerRow, Frame, MicrologicModel } from "./types";

export const DEFAULT_PROJECT_ID = "default";
const PROJECT_KEY = "mccb-current-project";

export function currentProjectId(): string {
  try {
    return localStorage.getItem(PROJECT_KEY) || DEFAULT_PROJECT_ID;
  } catch {
    return DEFAULT_PROJECT_ID;
  }
}

export function setCurrentProjectId(id: string): void {
  localStorage.setItem(PROJECT_KEY, id);
}

export function breakerRowId(frameId: string, hole: string): string {
  return `${frameId}:${hole}`;
}

export function mlModelOf(b: Pick<BreakerPosition, "micrologicModel">): MicrologicModel {
  return b.micrologicModel === "5.2E" ? "5.2E" : "2.2";
}

export function explodeBreakers(frame: Frame): BreakerRow[] {
  const projectId = frame.projectId || DEFAULT_PROJECT_ID;
  const stringKey = frame.stringKey?.trim() || "1";
  const frameSlot = frame.frameSlot || frame.stringId || "";
  const updatedAt = frame.updatedAt || new Date().toISOString();
  const rows: BreakerRow[] = [];
  for (const cbsds of frame.cbsds || []) {
    for (const b of cbsds.breakerPositions || []) {
      const used = b.inUse !== false && Boolean(b.inUse || b.mccbSerialNumber || b.microLogicSerialNumber);
      const hole = `${cbsds.label}${b.position}`;
      rows.push({
        id: breakerRowId(frame.id, hole),
        projectId,
        frameId: frame.id,
        stringKey,
        frameSlot,
        hole,
        board: cbsds.label,
        position: b.position,
        inUse: used ? 1 : 0,
        amps: b.micrologicSettingAmps || "",
        mccbSerial: (b.mccbSerialNumber || "").trim().toUpperCase(),
        mlSerial: (b.microLogicSerialNumber || "").trim().toUpperCase(),
        mlModel: mlModelOf(b),
        shuntBatch: (b.shuntTripBatchNumber || "").trim().toUpperCase(),
        scannedBy: b.mccbScannedBy || "",
        scannedAt: b.mccbScannedAt || "",
        mccbInstalled: b.mccbInstalled ? 1 : 0,
        flexibarCaps: b.flexibarCapsRemoved ? 1 : 0,
        whipTerminated: b.whipTerminated ? 1 : 0,
        torqueLine: b.torqueLineSideConfirmed ? 1 : 0,
        torqueLoad: b.torqueLoadSideConfirmed ? 1 : 0,
        mlSet: b.micrologicSettingConfirmed ? 1 : 0,
        updatedAt,
      });
    }
  }
  return rows;
}

export function applyBreakerRow(b: BreakerPosition, row: BreakerRow): BreakerPosition {
  return {
    ...b,
    inUse: row.inUse ? true : false,
    mccbSerialNumber: row.mccbSerial,
    microLogicSerialNumber: row.mlSerial,
    micrologicModel: row.mlModel || "2.2",
    shuntTripBatchNumber: row.shuntBatch,
    mccbScannedBy: row.scannedBy,
    mccbScannedAt: row.scannedAt,
    micrologicSettingAmps: row.amps || "",
    mccbInstalled: Boolean(row.mccbInstalled),
    flexibarCapsRemoved: Boolean(row.flexibarCaps),
    whipTerminated: Boolean(row.whipTerminated),
    torqueLineSideConfirmed: Boolean(row.torqueLine),
    torqueLoadSideConfirmed: Boolean(row.torqueLoad),
    micrologicSettingConfirmed: Boolean(row.mlSet),
  };
}

export function hydrateFrame(frame: Frame, rows: BreakerRow[]): Frame {
  if (!rows.length) {
    return {
      ...frame,
      projectId: frame.projectId || DEFAULT_PROJECT_ID,
      cbsds: (frame.cbsds || []).map((c) => ({
        ...c,
        breakerPositions: c.breakerPositions.map((b) => ({
          ...b,
          micrologicModel: mlModelOf(b),
        })),
      })),
    };
  }
  const byHole = new Map(rows.map((r) => [r.hole, r]));
  return {
    ...frame,
    projectId: frame.projectId || rows[0]?.projectId || DEFAULT_PROJECT_ID,
    cbsds: (frame.cbsds || []).map((c) => ({
      ...c,
      breakerPositions: c.breakerPositions.map((b) => {
        const row = byHole.get(`${c.label}${b.position}`);
        return row ? applyBreakerRow(b, row) : { ...b, micrologicModel: mlModelOf(b) };
      }),
    })),
  };
}

export function withFrameDefaults(frame: Frame): Frame {
  return {
    ...frame,
    projectId: frame.projectId || DEFAULT_PROJECT_ID,
    manufacturer: frame.manufacturer ?? "",
    phase: frame.phase === "testing" ? "testing" : "installation",
    stringKey: frame.stringKey?.trim() || "1",
    frameSlot: frame.frameSlot || frame.stringId || "",
    stringId: frame.stringId || frame.frameSlot || "",
    testerInitials: frame.testerInitials ?? "",
    testerName: frame.testerName ?? "",
    shopStage: frame.shopStage ?? "",
    moduleFrameSerialNumber:
      frame.moduleFrameSerialNumber?.trim() ||
      [frame.stringKey?.trim() || "1", frame.frameSlot || frame.stringId || ""]
        .filter(Boolean)
        .join("-"),
    handover: {
      ...frame.handover,
      notes: frame.handover?.notes ?? "",
    },
  };
}

export type StringRun = {
  key: string;
  createdAt: string;
  archivedAt?: string;
};

export type StringRecord = StringRun & {
  id: string;
  projectId: string;
};
