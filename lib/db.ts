import Dexie, { type EntityTable } from "dexie";
import { explodeBreakers, hydrateFrame, DEFAULT_PROJECT_ID, currentProjectId, setCurrentProjectId } from "./project";
import type { BreakerRow, Fault, Frame, Installer, Project } from "./types";

export type StringRun = {
  key: string;
  createdAt: string;
  archivedAt?: string;
};

export type StringRecord = StringRun & {
  id: string;
  projectId: string;
};

class FrameDb extends Dexie {
  frames!: EntityTable<Frame, "id">;
  installers!: EntityTable<Installer, "initials">;
  stringRuns!: EntityTable<StringRun, "key">;
  projects!: EntityTable<Project, "id">;
  strings!: EntityTable<StringRecord, "id">;
  breakers!: EntityTable<BreakerRow, "id">;
  faults!: EntityTable<Fault, "id">;

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
      frames: "id, updatedAt, shepherdFrameId, actswFrameId, stringId, manufacturer, phase, stringKey, projectId",
      installers: "initials",
      stringRuns: "key, createdAt, archivedAt",
      projects: "id, name, createdAt",
      strings: "id, projectId, key, [projectId+key], archivedAt",
      breakers: "id, projectId, frameId, hole, mccbSerial, mlSerial, shuntBatch, [projectId+mccbSerial], [projectId+mlSerial]",
      faults: "id, projectId, frameId, hole, kind, raisedAt",
    }).upgrade(async (tx) => {
      const now = new Date().toISOString();
      await tx.table("projects").put({
        id: DEFAULT_PROJECT_ID,
        name: "Current project",
        createdAt: now,
      });
      const runs = (await tx.table("stringRuns").toArray()) as StringRun[];
      for (const run of runs) {
        await tx.table("strings").put({
          id: `${DEFAULT_PROJECT_ID}:${run.key}`,
          projectId: DEFAULT_PROJECT_ID,
          key: run.key,
          createdAt: run.createdAt,
          archivedAt: run.archivedAt,
        });
      }
      const frames = (await tx.table("frames").toArray()) as Frame[];
      const breakerRows: BreakerRow[] = [];
      for (const frame of frames) {
        frame.projectId = DEFAULT_PROJECT_ID;
        await tx.table("frames").put(frame);
        breakerRows.push(...explodeBreakers(frame));
        const key = frame.stringKey?.trim() || "1";
        const sid = `${DEFAULT_PROJECT_ID}:${key}`;
        const existing = await tx.table("strings").get(sid);
        if (!existing) {
          await tx.table("strings").put({
            id: sid,
            projectId: DEFAULT_PROJECT_ID,
            key,
            createdAt: frame.createdAt || now,
          });
        }
      }
      if (breakerRows.length) await tx.table("breakers").bulkPut(breakerRows);
    });
  }
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

export const db = new FrameDb();

async function hydrate(frame: Frame): Promise<Frame> {
  const base = withFrameDefaults(frame);
  const rows = await db.breakers.where("frameId").equals(frame.id).toArray();
  return hydrateFrame(base, rows);
}

export async function listFrames(): Promise<Frame[]> {
  const pid = currentProjectId();
  const all = await db.frames.toArray();
  const rows = all.filter((f) => (f.projectId || DEFAULT_PROJECT_ID) === pid);
  const ordered = rows.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return Promise.all(ordered.map(hydrate));
}

export async function getFrame(id: string): Promise<Frame | undefined> {
  const found = await db.frames.get(id);
  return found ? hydrate(found) : undefined;
}

export async function saveFrame(frame: Frame): Promise<void> {
  const next: Frame = {
    ...frame,
    projectId: frame.projectId || currentProjectId(),
    updatedAt: new Date().toISOString(),
  };
  const rows = explodeBreakers(next);
  await db.transaction("rw", db.frames, db.breakers, async () => {
    await db.frames.put(next);
    if (rows.length) await db.breakers.bulkPut(rows);
  });
}

export async function deleteFrame(id: string): Promise<void> {
  await db.transaction("rw", db.frames, db.breakers, db.faults, async () => {
    await db.frames.delete(id);
    await db.breakers.where("frameId").equals(id).delete();
    await db.faults.where("frameId").equals(id).delete();
  });
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
  const [people, breakers] = await Promise.all([
    db.installers.toArray(),
    db.breakers.where("projectId").equals(currentProjectId()).toArray(),
  ]);
  const used = new Map<string, number>();
  for (const b of breakers) {
    const key = normalizeInitials(b.scannedBy || "");
    if (key) used.set(key, (used.get(key) || 0) + 1);
  }
  return people.sort(
    (a, b) => (used.get(b.initials) || 0) - (used.get(a.initials) || 0) || a.initials.localeCompare(b.initials),
  );
}

export async function listStringRuns(): Promise<StringRun[]> {
  const pid = currentProjectId();
  const rows = await db.strings.where("projectId").equals(pid).toArray();
  if (rows.length) {
    return rows.map((r) => ({ key: r.key, createdAt: r.createdAt, archivedAt: r.archivedAt }));
  }
  return db.stringRuns.toArray();
}

export async function archiveStringRun(key: string): Promise<void> {
  const pid = currentProjectId();
  const id = `${pid}:${key}`;
  const existing = (await db.strings.get(id)) || (await db.stringRuns.get(key));
  const row: StringRecord = {
    id,
    projectId: pid,
    key,
    createdAt: existing?.createdAt || new Date().toISOString(),
    archivedAt: existing && "archivedAt" in existing && existing.archivedAt ? existing.archivedAt : new Date().toISOString(),
  };
  await db.transaction("rw", db.strings, db.stringRuns, async () => {
    await db.strings.put(row);
    await db.stringRuns.put({ key: row.key, createdAt: row.createdAt, archivedAt: row.archivedAt });
  });
}

export async function unarchiveStringRun(key: string): Promise<void> {
  const pid = currentProjectId();
  const id = `${pid}:${key}`;
  const existing = await db.strings.get(id);
  if (!existing) return;
  await db.transaction("rw", db.strings, db.stringRuns, async () => {
    await db.strings.put({ ...existing, archivedAt: undefined });
    await db.stringRuns.put({ key: existing.key, createdAt: existing.createdAt });
  });
}

export async function addStringRun(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  const pid = currentProjectId();
  const now = new Date().toISOString();
  await db.transaction("rw", db.strings, db.stringRuns, async () => {
    await db.strings.put({
      id: `${pid}:${trimmed}`,
      projectId: pid,
      key: trimmed,
      createdAt: now,
      archivedAt: undefined,
    });
    await db.stringRuns.put({ key: trimmed, createdAt: now, archivedAt: undefined });
  });
}

export async function deleteStringAndFrames(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  const pid = currentProjectId();
  const rows = (await db.frames.toArray()).map(withFrameDefaults);
  const ids = rows
    .filter((frame) => (frame.projectId || DEFAULT_PROJECT_ID) === pid && (frame.stringKey?.trim() || "1") === trimmed)
    .map((frame) => frame.id);
  await db.transaction("rw", db.frames, db.stringRuns, db.strings, db.breakers, db.faults, async () => {
    if (ids.length) {
      await db.frames.bulkDelete(ids);
      for (const id of ids) {
        await db.breakers.where("frameId").equals(id).delete();
        await db.faults.where("frameId").equals(id).delete();
      }
    }
    await db.stringRuns.delete(trimmed);
    await db.strings.delete(`${pid}:${trimmed}`);
  });
}

export async function findFrameBySlot(stringKey: string, frameSlot: string): Promise<Frame | undefined> {
  const pid = currentProjectId();
  const rows = (await db.frames.toArray()).map(withFrameDefaults);
  const found = rows.find(
    (f) =>
      (f.projectId || DEFAULT_PROJECT_ID) === pid &&
      (f.stringKey || "1") === stringKey &&
      (f.frameSlot || f.stringId) === frameSlot,
  );
  return found ? hydrate(found) : undefined;
}

export async function listProjects(): Promise<Project[]> {
  const rows = await db.projects.toArray();
  if (rows.length) return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [{ id: DEFAULT_PROJECT_ID, name: "Current project", createdAt: new Date().toISOString() }];
}

export async function addProject(name: string): Promise<Project> {
  const trimmed = name.trim();
  const project: Project = {
    id: crypto.randomUUID(),
    name: trimmed || "New project",
    createdAt: new Date().toISOString(),
  };
  await db.projects.put(project);
  return project;
}

export async function deleteProject(id: string): Promise<{ ok: true } | { ok: false; reason: "last" }> {
  const projects = await db.projects.toArray();
  const remaining = projects.filter((p) => p.id !== id);
  if (remaining.length === 0) return { ok: false, reason: "last" };

  const frames = (await db.frames.toArray()).filter((f) => (f.projectId || DEFAULT_PROJECT_ID) === id);
  const frameIds = frames.map((f) => f.id);

  await db.transaction("rw", db.projects, db.frames, db.strings, db.breakers, db.faults, async () => {
    if (frameIds.length) {
      await db.frames.bulkDelete(frameIds);
      for (const frameId of frameIds) {
        await db.breakers.where("frameId").equals(frameId).delete();
        await db.faults.where("frameId").equals(frameId).delete();
      }
    }
    await db.strings.where("projectId").equals(id).delete();
    await db.faults.where("projectId").equals(id).delete();
    await db.projects.delete(id);
  });

  if (currentProjectId() === id) {
    setCurrentProjectId(remaining[0].id);
  }
  return { ok: true };
}

export async function addFault(fault: Fault): Promise<void> {
  await db.faults.put(fault);
}

export async function listFaults(): Promise<Fault[]> {
  const pid = currentProjectId();
  const rows = await db.faults.where("projectId").equals(pid).toArray();
  return rows.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
}

function normSerial(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export async function searchBreakerRows(query: string): Promise<BreakerRow[]> {
  const q = normSerial(query);
  if (q.length < 3) return [];
  const pid = currentProjectId();
  const rows = await db.breakers.where("projectId").equals(pid).toArray();
  return rows.filter(
    (r) => r.mccbSerial.includes(q) || r.mlSerial.includes(q) || r.shuntBatch.includes(q),
  );
}
