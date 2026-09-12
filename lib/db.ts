import Dexie, { type EntityTable } from "dexie";
import { pushSync } from "./serverSync";
import type { Defect, Frame, Installer, StockEntry, Trade } from "./types";

export type StringRun = {
  key: string;
  createdAt: string;
  archivedAt?: string;
  tradeId?: string;
  tradeName?: string;
};

class FrameDb extends Dexie {
  frames!: EntityTable<Frame, "id">;
  installers!: EntityTable<Installer, "initials">;
  stringRuns!: EntityTable<StringRun, "key">;
  trades!: EntityTable<Trade, "id">;
  defects!: EntityTable<Defect, "id">;
  stock!: EntityTable<StockEntry, "id">;

  constructor() {
    super("mccb-frame-qa");
    this.version(1).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId",
    });
    this.version(3).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer",
      installers: "initials",
    }).upgrade((tx) => {
      tx.table("frames").toCollection().modify((frame) => {
        if (!frame.manufacturer) {
          frame.manufacturer = "";
        }
      });
    });
    this.version(4).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer, phase",
      installers: "initials",
    }).upgrade((tx) => {
      tx.table("frames").toCollection().modify((frame) => {
        if (!frame.manufacturer) frame.manufacturer = "";
        if (frame.phase !== "testing") frame.phase = "installation";
      });
    });
    this.version(5).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer, phase, stringKey",
      installers: "initials",
      stringRuns: "key, createdAt",
    }).upgrade((tx) => {
      tx.table("frames").toCollection().modify((frame) => {
        if (!frame.manufacturer) frame.manufacturer = "";
        if (frame.phase !== "testing") frame.phase = "installation";
        if (!frame.frameSlot && frame.stringId) frame.frameSlot = frame.stringId;
        if (!frame.stringKey) frame.stringKey = "1";
        if (frame.submitted == null) frame.submitted = false;
      });
    });
    this.version(6).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer, phase, stringKey",
      installers: "initials",
      stringRuns: "key, createdAt, archivedAt",
    });
    this.version(7).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer, phase, stringKey",
      installers: "initials",
      stringRuns: "key, createdAt, archivedAt, tradeId",
      trades: "id",
      defects: "id, stringKey, status, raisedAt, updatedAt",
    }).upgrade((tx) => {
      tx.table("frames").toCollection().modify((frame) => {
        if (frame.tradeName == null) frame.tradeName = "";
        if (frame.tradeId == null) frame.tradeId = "";
      });
    });
    this.version(8).stores({
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer, phase, stringKey",
      installers: "initials",
      stringRuns: "key, createdAt, archivedAt, tradeId",
      trades: "id",
      defects: "id, stringKey, status, raisedAt, updatedAt",
      stock: "id, part, receivedAt",
    });
  }
}

export function withFrameDefaults(frame: Frame): Frame {
  return {
    ...frame,
    cbsds: frame.cbsds.map((c) => ({
      ...c,
      breakerPositions: c.breakerPositions.map((b) => ({
        ...b,
        serialHistory: b.serialHistory ?? [],
        serialCapturedBy: b.serialCapturedBy ?? "",
        serialCapturedAt: b.serialCapturedAt ?? "",
        installedBy: b.installedBy ?? "",
        installedAt: b.installedAt ?? "",
      })),
    })),
    manufacturer: frame.manufacturer ?? "",
    phase: frame.phase === "testing" ? "testing" : "installation",
    stringKey: frame.stringKey?.trim() || "1",
    frameSlot: frame.frameSlot || frame.stringId || "",
    stringId: frame.stringId || frame.frameSlot || "",
    testerInitials: frame.testerInitials ?? "",
    testerName: frame.testerName ?? "",
    electricalTesting: {
      ...frame.electricalTesting,
      mechanical: frame.electricalTesting?.mechanical ?? {
        A: Array.from({ length: 8 }, () => ""),
        B: Array.from({ length: 8 }, () => ""),
        C: Array.from({ length: 8 }, () => ""),
        D: Array.from({ length: 8 }, () => ""),
      },
    },
    tradeId: frame.tradeId ?? "",
    tradeName: frame.tradeName ?? "",
    paperImport: frame.paperImport ?? false,
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

export const db = new FrameDb();

export async function listFrames(): Promise<Frame[]> {
  const rows = await db.frames.orderBy("updatedAt").reverse().toArray();
  return rows.map(withFrameDefaults);
}

export async function getFrame(id: string): Promise<Frame | undefined> {
  const found = await db.frames.get(id);
  return found ? withFrameDefaults(found) : undefined;
}

export async function saveFrame(frame: Frame): Promise<void> {
  const next = { ...frame, updatedAt: new Date().toISOString() };
  await db.frames.put(next);
  void pushSync({ op: "frame", frame: next });
}

export async function deleteFrame(id: string): Promise<void> {
  await db.frames.delete(id);
  void pushSync({ op: "deleteFrame", id });
}

export function normalizeInitials(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export async function lookupInstaller(initials: string): Promise<Installer | undefined> {
  const key = normalizeInitials(initials);
  if (!key) return undefined;
  return db.installers.get(key);
}

export async function saveInstaller(installer: Installer): Promise<void> {
  const initials = normalizeInitials(installer.initials);
  if (!initials) return;
  const record = { initials, name: installer.name.trim() };
  await db.installers.put(record);
  void pushSync({ op: "installer", installer: record });
}

export async function listInstallers(): Promise<Installer[]> {
  const [people, frames] = await Promise.all([db.installers.toArray(), db.frames.toArray()]);
  const used = new Map<string, number>();
  for (const frame of frames) {
    for (const raw of [frame.installerInitials, frame.testerInitials]) {
      const key = normalizeInitials(raw || "");
      if (key) used.set(key, (used.get(key) || 0) + 1);
    }
  }
  return people.sort(
    (a, b) => (used.get(b.initials) || 0) - (used.get(a.initials) || 0) || a.initials.localeCompare(b.initials),
  );
}

export async function listStringRuns(): Promise<StringRun[]> {
  return db.stringRuns.toArray();
}

export async function archiveStringRun(key: string): Promise<void> {
  const existing = await db.stringRuns.get(key);
  const run: StringRun = {
    key,
    createdAt: existing?.createdAt || new Date().toISOString(),
    archivedAt: existing?.archivedAt || new Date().toISOString(),
  };
  await db.stringRuns.put(run);
  void pushSync({ op: "stringRun", run });
}

export async function unarchiveStringRun(key: string): Promise<void> {
  const existing = await db.stringRuns.get(key);
  if (!existing) return;
  const run: StringRun = { key: existing.key, createdAt: existing.createdAt };
  await db.stringRuns.put(run);
  void pushSync({ op: "stringRun", run });
}

export async function addStringRun(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  const run: StringRun = {
    key: trimmed,
    createdAt: new Date().toISOString(),
    archivedAt: undefined,
  };
  await db.stringRuns.put(run);
  void pushSync({ op: "stringRun", run });
}

export async function saveStringRun(run: StringRun): Promise<void> {
  await db.stringRuns.put(run);
  void pushSync({ op: "stringRun", run });
}

export async function deleteStringAndFrames(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  const rows = (await db.frames.toArray()).map(withFrameDefaults);
  const ids = rows
    .filter((frame) => (frame.stringKey?.trim() || "1") === trimmed)
    .map((frame) => frame.id);
  await db.transaction("rw", db.frames, db.stringRuns, async () => {
    if (ids.length) await db.frames.bulkDelete(ids);
    await db.stringRuns.delete(trimmed);
  });
  void pushSync({ op: "deleteStringRun", key: trimmed });
}

export async function findFrameBySlot(stringKey: string, frameSlot: string): Promise<Frame | undefined> {
  const rows = (await db.frames.toArray()).map(withFrameDefaults);
  return rows.find(
    (f) => (f.stringKey || "1") === stringKey && (f.frameSlot || f.stringId) === frameSlot,
  );
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listTrades(): Promise<Trade[]> {
  return (await db.trades.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTrade(trade: Trade): Promise<void> {
  await db.trades.put(trade);
  void pushSync({ op: "trade", trade });
}

export async function findTradeByName(name: string): Promise<Trade | undefined> {
  const rows = await db.trades.toArray();
  return rows.find((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase());
}

export async function listDefects(): Promise<Defect[]> {
  return (await db.defects.orderBy("updatedAt").reverse().toArray());
}

export async function saveDefect(defect: Defect): Promise<void> {
  const next = { ...defect, updatedAt: new Date().toISOString() };
  await db.defects.put(next);
  void pushSync({ op: "defect", defect: next });
}

export async function listStockEntries(): Promise<StockEntry[]> {
  return (await db.stock.orderBy("receivedAt").reverse().toArray());
}

export async function saveStockEntry(entry: StockEntry): Promise<void> {
  await db.stock.put(entry);
  void pushSync({ op: "stock", stock: entry });
}
