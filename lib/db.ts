import Dexie, { type EntityTable } from "dexie";
import {
  explodeBreakers,
  hydrateFrame,
  withFrameDefaults,
  DEFAULT_PROJECT_ID,
  currentProjectId,
  setCurrentProjectId,
  type StringRecord,
  type StringRun,
} from "./project";
import type { BreakerRow, Fault, Frame, Installer, Project } from "./types";

export type { StringRecord, StringRun };

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

export const db = new FrameDb();

async function apiGet<T>(action: string, extra: Record<string, string> = {}): Promise<T | null> {
  try {
    const params = new URLSearchParams({ action, projectId: currentProjectId(), ...extra });
    const res = await fetch(`/api/data?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return null;
    return data as T;
  } catch {
    return null;
  }
}

async function apiPost(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type Outbox = {
  frames: string[];
  deletedFrames: string[];
  strings: StringRecord[];
  deletedStrings: { projectId: string; key: string }[];
  projects: Project[];
  deletedProjects: string[];
  faults: Fault[];
  installers: Installer[];
};

const OUTBOX_KEY = "mccb-outbox";
const SYNC_EVENT = "mccb-sync";

function emptyOutbox(): Outbox {
  return {
    frames: [],
    deletedFrames: [],
    strings: [],
    deletedStrings: [],
    projects: [],
    deletedProjects: [],
    faults: [],
    installers: [],
  };
}

function readOutbox(): Outbox {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return emptyOutbox();
    return { ...emptyOutbox(), ...JSON.parse(raw) };
  } catch {
    return emptyOutbox();
  }
}

function writeOutbox(box: Outbox) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(box));
}

function queueFrame(id: string) {
  const box = readOutbox();
  if (!box.frames.includes(id)) box.frames.push(id);
  box.deletedFrames = box.deletedFrames.filter((x) => x !== id);
  writeOutbox(box);
  scheduleFlush();
}

function queueDeletedFrame(id: string) {
  const box = readOutbox();
  box.frames = box.frames.filter((x) => x !== id);
  if (!box.deletedFrames.includes(id)) box.deletedFrames.push(id);
  writeOutbox(box);
  scheduleFlush();
}

function queueString(row: StringRecord) {
  const box = readOutbox();
  box.strings = box.strings.filter((s) => s.id !== row.id);
  box.strings.push(row);
  box.deletedStrings = box.deletedStrings.filter((s) => !(s.projectId === row.projectId && s.key === row.key));
  writeOutbox(box);
  scheduleFlush();
}

function queueDeletedString(projectId: string, key: string) {
  const box = readOutbox();
  box.strings = box.strings.filter((s) => !(s.projectId === projectId && s.key === key));
  if (!box.deletedStrings.some((s) => s.projectId === projectId && s.key === key)) {
    box.deletedStrings.push({ projectId, key });
  }
  writeOutbox(box);
  scheduleFlush();
}

function queueProject(project: Project) {
  const box = readOutbox();
  box.projects = box.projects.filter((p) => p.id !== project.id);
  box.projects.push(project);
  box.deletedProjects = box.deletedProjects.filter((id) => id !== project.id);
  writeOutbox(box);
  scheduleFlush();
}

function queueDeletedProject(id: string) {
  const box = readOutbox();
  box.projects = box.projects.filter((p) => p.id !== id);
  if (!box.deletedProjects.includes(id)) box.deletedProjects.push(id);
  writeOutbox(box);
  scheduleFlush();
}

function queueFault(fault: Fault) {
  const box = readOutbox();
  box.faults = box.faults.filter((f) => f.id !== fault.id);
  box.faults.push(fault);
  writeOutbox(box);
  scheduleFlush();
}

function queueInstaller(installer: Installer) {
  const box = readOutbox();
  box.installers = box.installers.filter((i) => i.initials !== installer.initials);
  box.installers.push(installer);
  writeOutbox(box);
  scheduleFlush();
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let syncStarted = false;
let lastPull = 0;

function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushOutbox();
  }, 2000);
}

function notifySync() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_EVENT));
}

async function flushOutbox() {
  if (flushing || typeof window === "undefined") return;
  flushing = true;
  try {
    const box = readOutbox();
    const next = emptyOutbox();
    for (const id of box.deletedFrames) {
      if (!(await apiPost({ action: "deleteFrame", id }))) next.deletedFrames.push(id);
    }
    for (const id of box.frames) {
      const frame = await db.frames.get(id);
      if (!frame) continue;
      if (!(await apiPost({ action: "saveFrame", frame }))) next.frames.push(id);
    }
    for (const row of box.deletedStrings) {
      if (!(await apiPost({ action: "deleteString", projectId: row.projectId, key: row.key }))) {
        next.deletedStrings.push(row);
      }
    }
    for (const row of box.strings) {
      if (!(await apiPost({ action: "putString", string: row }))) next.strings.push(row);
    }
    for (const id of box.deletedProjects) {
      if (!(await apiPost({ action: "deleteProject", id }))) next.deletedProjects.push(id);
    }
    for (const project of box.projects) {
      if (!(await apiPost({ action: "putProject", project }))) next.projects.push(project);
    }
    for (const fault of box.faults) {
      if (!(await apiPost({ action: "addFault", fault }))) next.faults.push(fault);
    }
    for (const installer of box.installers) {
      if (!(await apiPost({ action: "saveInstaller", installer }))) next.installers.push(installer);
    }
    writeOutbox(next);
  } finally {
    flushing = false;
  }
}

async function putLocalFrame(frame: Frame) {
  const next = withFrameDefaults(frame);
  const rows = explodeBreakers(next);
  await db.transaction("rw", db.frames, db.breakers, async () => {
    await db.frames.put(next);
    await db.breakers.where("frameId").equals(next.id).delete();
    if (rows.length) await db.breakers.bulkPut(rows);
  });
}

async function wipeProjectLocal(id: string) {
  const frames = (await db.frames.toArray()).filter((f) => (f.projectId || DEFAULT_PROJECT_ID) === id);
  const frameIds = frames.map((f) => f.id);
  const stringRows = await db.strings.where("projectId").equals(id).toArray();
  await db.transaction("rw", db.frames, db.strings, db.stringRuns, db.breakers, db.faults, async () => {
    if (frameIds.length) {
      await db.frames.bulkDelete(frameIds);
      for (const frameId of frameIds) {
        await db.breakers.where("frameId").equals(frameId).delete();
        await db.faults.where("frameId").equals(frameId).delete();
      }
    }
    for (const row of stringRows) {
      await db.strings.delete(row.id);
    }
    await db.faults.where("projectId").equals(id).delete();
  });
  return { frameIds, keys: stringRows.map((s) => s.key) };
}

function projectIdOf(frame: Frame) {
  return frame.projectId || DEFAULT_PROJECT_ID;
}

function newer(a?: string, b?: string) {
  return Date.parse(a || "") > Date.parse(b || "");
}

async function pullRemote(): Promise<boolean> {
  const box = readOutbox();
  const dirty = new Set(box.frames);
  let changed = false;

  const projects = await apiGet<Project[]>("listProjects");
  if (projects?.length) {
    const remoteIds = new Set(projects.map((p) => p.id));
    for (const p of projects) {
      if (box.deletedProjects.includes(p.id)) continue;
      const local = await db.projects.get(p.id);
      if (!local || local.name !== p.name) {
        await db.projects.put(p);
        changed = true;
      }
    }
    const locals = await db.projects.toArray();
    for (const local of locals) {
      if (remoteIds.has(local.id)) continue;
      if (box.projects.some((p) => p.id === local.id)) continue;
      await wipeProjectLocal(local.id);
      await db.projects.delete(local.id);
      changed = true;
    }
    const still = await db.projects.toArray();
    const liveIds = new Set(still.map((p) => p.id));
    const orphanIds = new Set<string>();
    for (const frame of await db.frames.toArray()) {
      const id = projectIdOf(frame);
      if (!liveIds.has(id)) orphanIds.add(id);
    }
    for (const row of await db.strings.toArray()) {
      if (!liveIds.has(row.projectId)) orphanIds.add(row.projectId);
    }
    for (const id of orphanIds) {
      if (box.projects.some((p) => p.id === id)) continue;
      await wipeProjectLocal(id);
      changed = true;
    }
    const active = currentProjectId();
    if (still.length && !still.some((p) => p.id === active)) {
      setCurrentProjectId(still[0].id);
      changed = true;
    }
  }

  const pid = currentProjectId();

  const strings = await apiGet<StringRun[]>("listStrings");
  if (strings) {
    const remoteKeys = new Set(strings.map((run) => run.key));
    for (const run of strings) {
      if (box.deletedStrings.some((s) => s.projectId === pid && s.key === run.key)) continue;
      const id = `${pid}:${run.key}`;
      const local = await db.strings.get(id);
      if (!local) {
        await db.strings.put({ id, projectId: pid, ...run });
        changed = true;
      } else if (Boolean(local.archivedAt) !== Boolean(run.archivedAt)) {
        await db.strings.put({ ...local, archivedAt: run.archivedAt });
        changed = true;
      }
    }
    const localStrings = await db.strings.where("projectId").equals(pid).toArray();
    for (const row of localStrings) {
      if (remoteKeys.has(row.key)) continue;
      if (box.strings.some((s) => s.id === row.id)) continue;
      await db.strings.delete(row.id);
      changed = true;
    }
  }

  const frames = await apiGet<Frame[]>("listFrames");
  if (frames) {
    const remoteIds = new Set(frames.map((f) => f.id));
    for (const remote of frames) {
      if (dirty.has(remote.id) || box.deletedFrames.includes(remote.id)) continue;
      const local = await db.frames.get(remote.id);
      if (!local || newer(remote.updatedAt, local.updatedAt)) {
        await putLocalFrame(remote);
        changed = true;
      }
    }
    const localFrames = await db.frames.toArray();
    for (const local of localFrames) {
      if (projectIdOf(local) !== pid) continue;
      if (remoteIds.has(local.id) || dirty.has(local.id)) continue;
      await db.transaction("rw", db.frames, db.breakers, db.faults, async () => {
        await db.frames.delete(local.id);
        await db.breakers.where("frameId").equals(local.id).delete();
        await db.faults.where("frameId").equals(local.id).delete();
      });
      changed = true;
    }
  }

  const faults = await apiGet<Fault[]>("listFaults");
  if (faults) {
    for (const fault of faults) {
      const local = await db.faults.get(fault.id);
      if (!local) {
        await db.faults.put(fault);
        changed = true;
      }
    }
  }

  const installers = await apiGet<Installer[]>("listInstallers");
  if (installers) {
    for (const person of installers) {
      const local = await db.installers.get(person.initials);
      if (!local) {
        await db.installers.put(person);
        changed = true;
      }
    }
  }

  lastPull = Date.now();
  return changed;
}

async function seedIfEmpty() {
  const status = await apiGet<{ empty: boolean }>("status");
  if (!status?.empty) return;
  const [projects, strings, frames, faults, installers] = await Promise.all([
    db.projects.toArray(),
    db.strings.toArray(),
    db.frames.toArray(),
    db.faults.toArray().catch(() => [] as Fault[]),
    db.installers.toArray(),
  ]);
  if (!frames.length && !strings.length) return;
  await apiPost({ action: "import", projects, strings, frames, faults, installers });
}

export function startBackgroundSync() {
  if (syncStarted || typeof window === "undefined") return;
  syncStarted = true;
  void (async () => {
    await seedIfEmpty();
    await flushOutbox();
    if (await pullRemote()) notifySync();
  })();
  window.setInterval(() => {
    void (async () => {
      await flushOutbox();
      if (Date.now() - lastPull < 20000) return;
      if (await pullRemote()) notifySync();
    })();
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void (async () => {
      await flushOutbox();
      if (await pullRemote()) notifySync();
    })();
  });
}

export function onSharedSync(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  startBackgroundSync();
  window.addEventListener(SYNC_EVENT, handler);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

async function hydrate(frame: Frame): Promise<Frame> {
  const base = withFrameDefaults(frame);
  const rows = await db.breakers.where("frameId").equals(frame.id).toArray();
  return hydrateFrame(base, rows);
}

export function normalizeInitials(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

export async function listFrames(): Promise<Frame[]> {
  startBackgroundSync();
  const pid = currentProjectId();
  const all = await db.frames.toArray();
  const rows = all.filter((f) => (f.projectId || DEFAULT_PROJECT_ID) === pid);
  const ordered = rows.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return Promise.all(ordered.map(hydrate));
}

export async function getFrame(id: string): Promise<Frame | undefined> {
  startBackgroundSync();
  const found = await db.frames.get(id);
  if (found) return hydrate(found);
  const remote = await apiGet<Frame | null>("getFrame", { id });
  if (!remote) return undefined;
  await putLocalFrame(remote);
  return hydrate(remote);
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
  queueFrame(next.id);
}

export async function deleteFrame(id: string): Promise<void> {
  await db.transaction("rw", db.frames, db.breakers, db.faults, async () => {
    await db.frames.delete(id);
    await db.breakers.where("frameId").equals(id).delete();
    await db.faults.where("frameId").equals(id).delete();
  });
  queueDeletedFrame(id);
}

export async function lookupInstaller(initials: string): Promise<Installer | undefined> {
  const key = normalizeInitials(initials);
  if (!key) return undefined;
  return db.installers.get(key);
}

export async function saveInstaller(installer: Installer): Promise<void> {
  const initials = normalizeInitials(installer.initials);
  if (!initials) return;
  const row = { initials, name: installer.name.trim() };
  await db.installers.put(row);
  queueInstaller(row);
}

export async function listInstallers(): Promise<Installer[]> {
  startBackgroundSync();
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
  startBackgroundSync();
  const pid = currentProjectId();
  const rows = await db.strings.where("projectId").equals(pid).toArray();
  return rows.map((r) => ({ key: r.key, createdAt: r.createdAt, archivedAt: r.archivedAt }));
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
  queueString(row);
}

export async function unarchiveStringRun(key: string): Promise<void> {
  const pid = currentProjectId();
  const id = `${pid}:${key}`;
  const existing = await db.strings.get(id);
  if (!existing) return;
  const row = { ...existing, archivedAt: undefined };
  await db.transaction("rw", db.strings, db.stringRuns, async () => {
    await db.strings.put(row);
    await db.stringRuns.put({ key: existing.key, createdAt: existing.createdAt });
  });
  queueString(row);
}

export async function addStringRun(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) return;
  const pid = currentProjectId();
  const now = new Date().toISOString();
  const row: StringRecord = {
    id: `${pid}:${trimmed}`,
    projectId: pid,
    key: trimmed,
    createdAt: now,
    archivedAt: undefined,
  };
  await db.transaction("rw", db.strings, db.stringRuns, async () => {
    await db.strings.put(row);
    await db.stringRuns.put({ key: trimmed, createdAt: now, archivedAt: undefined });
  });
  queueString(row);
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
  for (const id of ids) queueDeletedFrame(id);
  queueDeletedString(pid, trimmed);
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
  startBackgroundSync();
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
  setCurrentProjectId(project.id);
  queueProject(project);
  return project;
}

export async function deleteProject(id: string): Promise<{ ok: true } | { ok: false; reason: "last" }> {
  const projects = await db.projects.toArray();
  const remaining = projects.filter((p) => p.id !== id);
  if (remaining.length === 0) return { ok: false, reason: "last" };

  const { frameIds } = await wipeProjectLocal(id);
  await db.projects.delete(id);

  if (currentProjectId() === id) {
    setCurrentProjectId(remaining[0].id);
  }
  for (const frameId of frameIds) queueDeletedFrame(frameId);
  queueDeletedProject(id);
  return { ok: true };
}

export async function addFault(fault: Fault): Promise<void> {
  await db.faults.put(fault);
  queueFault(fault);
}

export async function listFaults(): Promise<Fault[]> {
  startBackgroundSync();
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
  startBackgroundSync();
  const pid = currentProjectId();
  const rows = await db.breakers.where("projectId").equals(pid).toArray();
  return rows.filter(
    (r) => r.mccbSerial.includes(q) || r.mlSerial.includes(q) || r.shuntBatch.includes(q),
  );
}
