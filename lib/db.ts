import Dexie, { type EntityTable } from "dexie";
import type { Frame, Installer } from "./types";

class FrameDb extends Dexie {
  frames!: EntityTable<Frame, "id">;
  installers!: EntityTable<Installer, "initials">;

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
  }
}

export const db = new FrameDb();

export async function listFrames(): Promise<Frame[]> {
  return db.frames.orderBy("updatedAt").reverse().toArray();
}

export async function getFrame(id: string): Promise<Frame | undefined> {
  return db.frames.get(id);
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
