import Dexie, { type EntityTable } from "dexie";
import type { Frame, Installer } from "./types";

export type StringRun = {
  key: string;
  createdAt: string;
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
    submitted: Boolean(frame.submitted),
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

export async function listStringKeys(): Promise<string[]> {
  const runs = await db.stringRuns.toArray();
  const fromFrames = (await db.frames.toArray()).map((f) => withFrameDefaults(f).stringKey || "1");
  return [...new Set([...runs.map((r) => r.key), ...fromFrames])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

export async function addStringRun(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  await db.stringRuns.put({ key: trimmed, createdAt: new Date().toISOString() });
}

export async function findFrameBySlot(stringKey: string, frameSlot: string): Promise<Frame | undefined> {
  const rows = (await db.frames.toArray()).map(withFrameDefaults);
  return rows.find(
    (f) => (f.stringKey || "1") === stringKey && (f.frameSlot || f.stringId) === frameSlot,
  );
}
