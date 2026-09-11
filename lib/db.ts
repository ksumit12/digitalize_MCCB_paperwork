import Dexie, { type EntityTable } from "dexie";
import type { Frame, Installer } from "./types";

export type StringRun = {
  key: string;
  createdAt: string;
  archivedAt?: string;
};

class FrameDb extends Dexie {
  frames!: EntityTable<Frame, "id">;
  installers!: EntityTable<Installer, "initials">;
  stringRuns!: EntityTable<StringRun, "key">;

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
  }
}

export function withFrameDefaults(frame: Frame): Frame {
  return {
    ...frame,
    manufacturer: frame.manufacturer ?? "",
    phase: frame.phase === "testing" ? "testing" : "installation",
    stringKey: frame.stringKey?.trim() || "1",
    frameSlot: frame.frameSlot || frame.stringId || "",
    stringId: frame.stringId || frame.frameSlot || "",
    testerInitials: frame.testerInitials ?? "",
    testerName: frame.testerName ?? "",
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
  await db.frames.put({ ...frame, updatedAt: new Date().toISOString() });
}

export async function deleteFrame(id: string): Promise<void> {
  await db.frames.delete(id);
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
  await db.installers.put({ initials, name: installer.name.trim() });
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
  await db.stringRuns.put({
    key,
    createdAt: existing?.createdAt || new Date().toISOString(),
    archivedAt: existing?.archivedAt || new Date().toISOString(),
  });
}

export async function unarchiveStringRun(key: string): Promise<void> {
  const existing = await db.stringRuns.get(key);
  if (!existing) return;
  await db.stringRuns.put({ key: existing.key, createdAt: existing.createdAt });
}

export async function addStringRun(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  await db.stringRuns.put({
    key: trimmed,
    createdAt: new Date().toISOString(),
    archivedAt: undefined,
  });
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
}

export async function findFrameBySlot(stringKey: string, frameSlot: string): Promise<Frame | undefined> {
  const rows = (await db.frames.toArray()).map(withFrameDefaults);
  return rows.find(
    (f) => (f.stringKey || "1") === stringKey && (f.frameSlot || f.stringId) === frameSlot,
  );
}
