import Dexie, { type EntityTable } from "dexie";
import {
  breakerFingerprint,
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

const DEVICE_KEY = "mccb-device-id";

/**
 * Stable per-browser id. The change feed uses it to skip rows this device
 * wrote, which it already has, so a busy phone stops downloading its own work.
 */
function deviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function apiGet<T>(action: string, extra: Record<string, string> = {}): Promise<T | null> {
  try {
    const params = new URLSearchParams({ action, projectId: currentProjectId(), ...extra });
    const res = await fetch(`/api/data?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    markReachable(res.ok);
    if (!res.ok) return null;
    return data as T;
  } catch {
    markReachable(false);
    return null;
  }
}

async function apiPost(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, origin: deviceId() }),
    });
    markReachable(res.ok);
    return res.ok;
  } catch {
    markReachable(false);
    return false;
  }
}

async function apiPostJson<T>(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
}> {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, origin: deviceId() }),
    });
    const data = (await res.json()) as T;
    // A 409 is the server correctly rejecting a stale hole, not a broken link.
    markReachable(res.ok || res.status === 409);
    return { ok: res.ok, status: res.status, data };
  } catch {
    markReachable(false);
    return { ok: false, status: 0, data: null };
  }
}

type Outbox = {
  frames: string[];
  breakers: string[];
  deletedFrames: string[];
  strings: StringRecord[];
  deletedStrings: { projectId: string; key: string }[];
  projects: Project[];
  deletedProjects: string[];
  faults: Fault[];
  installers: Installer[];
};

const OUTBOX_KEY = "mccb-outbox";
const CURSOR_KEY = "mccb-changes-cursor";
const SYNC_EVENT = "mccb-sync";
const STATUS_EVENT = "mccb-sync-status";

type ChangeFeed = {
  cursor: number;
  frames: Frame[];
  breakers: BreakerRow[];
  strings: StringRecord[];
  faults: Fault[];
  deletedFrames: string[];
  deletedStrings: string[];
};

// The cursor is a server-assigned counter, not a timestamp. Older builds stored
// an ISO string here, which reads back as NaN and re-bootstraps.
function readCursor(): number | null {
  try {
    const raw = localStorage.getItem(CURSOR_KEY);
    if (raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCursor(value: number) {
  try {
    localStorage.setItem(CURSOR_KEY, String(value));
  } catch {
    /* private mode */
  }
}

function emptyOutbox(): Outbox {
  return {
    frames: [],
    breakers: [],
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
  markQueued(`frame:${id}`);
  scheduleFlush();
}

function queueBreaker(id: string) {
  const box = readOutbox();
  if (!box.breakers.includes(id)) box.breakers.push(id);
  writeOutbox(box);
  markQueued(`breaker:${id}`);
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
let tickInFlight = false;
let tickQueued = false;

const SEEN_FRAMES_KEY = "mccb-seen-frames";

function readSeenFrames(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_FRAMES_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeenFrames(ids: Set<string>) {
  localStorage.setItem(SEEN_FRAMES_KEY, JSON.stringify([...ids]));
}

function mergeOutboxAfterFlush(attempted: Outbox, failed: Outbox): Outbox {
  const live = readOutbox();
  const merged = emptyOutbox();

  const keepIds = (tried: string[], leftover: string[], current: string[]) => {
    const failedSet = new Set(leftover);
    const triedSet = new Set(tried);
    const out = [...leftover];
    for (const id of current) {
      if (out.includes(id)) continue;
      if (triedSet.has(id) && !failedSet.has(id)) continue;
      out.push(id);
    }
    return out;
  };

  merged.frames = keepIds(attempted.frames, failed.frames, live.frames);
  merged.breakers = keepIds(attempted.breakers, failed.breakers, live.breakers);
  merged.deletedFrames = keepIds(attempted.deletedFrames, failed.deletedFrames, live.deletedFrames);
  merged.deletedProjects = keepIds(attempted.deletedProjects, failed.deletedProjects, live.deletedProjects);

  const keepRows = <T,>(tried: T[], leftover: T[], current: T[], key: (row: T) => string) => {
    const failedKeys = new Set(leftover.map(key));
    const triedKeys = new Set(tried.map(key));
    const out = [...leftover];
    const seenKeys = new Set(out.map(key));
    for (const row of current) {
      const k = key(row);
      if (seenKeys.has(k)) continue;
      if (triedKeys.has(k) && !failedKeys.has(k)) continue;
      out.push(row);
      seenKeys.add(k);
    }
    return out;
  };

  merged.strings = keepRows(attempted.strings, failed.strings, live.strings, (s) => s.id);
  merged.deletedStrings = keepRows(
    attempted.deletedStrings,
    failed.deletedStrings,
    live.deletedStrings,
    (s) => `${s.projectId}:${s.key}`,
  );
  merged.projects = keepRows(attempted.projects, failed.projects, live.projects, (p) => p.id);
  merged.faults = keepRows(attempted.faults, failed.faults, live.faults, (f) => f.id);
  merged.installers = keepRows(
    attempted.installers,
    failed.installers,
    live.installers,
    (i) => i.initials,
  );
  return merged;
}

function scheduleFlush() {
  if (typeof window === "undefined") return;
  notifyStatus();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushOutbox();
  }, 150);
}

function notifySync() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_EVENT));
}

export type SyncStatus = {
  /** Writes made on this device that Neon has not accepted yet. */
  pending: number;
  /** False once a request fails, until one succeeds again. */
  reachable: boolean;
  /** When the shared database last accepted everything we had. */
  lastSyncedAt: string | null;
};

let reachable = true;
let lastSyncedAt: string | null = null;

function markReachable(ok: boolean) {
  if (reachable === ok) return;
  reachable = ok;
  notifyStatus();
}

function countPending(box: Outbox): number {
  return (
    box.frames.length +
    box.breakers.length +
    box.deletedFrames.length +
    box.strings.length +
    box.deletedStrings.length +
    box.projects.length +
    box.deletedProjects.length +
    box.faults.length +
    box.installers.length
  );
}

export function getSyncStatus(): SyncStatus {
  if (typeof window === "undefined") return { pending: 0, reachable: true, lastSyncedAt: null };
  return { pending: countPending(readOutbox()), reachable, lastSyncedAt };
}

function notifyStatus() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STATUS_EVENT));
}

/** Fires whenever the queue or reachability changes, even if no data changed. */
export function onSyncStatus(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  startBackgroundSync();
  window.addEventListener(STATUS_EVENT, handler);
  return () => window.removeEventListener(STATUS_EVENT, handler);
}

/* ------------------------------------------------------------------------- *
 * TEMPORARY DIAGNOSTICS — remove this block and components/SyncStatsPanel.tsx
 * together when the sync timings are no longer interesting.
 * ------------------------------------------------------------------------- */

export type SyncStats = {
  /** True when this device is talking to Neon, false for a local SQLite file. */
  hosted: boolean | null;
  /** Server clock minus this device's clock, in ms. Near zero is healthy. */
  clockOffsetMs: number | null;
  roundTripMs: number | null;
  upstream: {
    /** Wall time of the last flush, queue drain included. */
    lastFlushMs: number | null;
    /** Queued on this device until Neon accepted it. The number that matters. */
    lastWriteLatencyMs: number | null;
    slowestWriteMs: number | null;
    accepted: number;
    rejected: number;
    conflicts: number;
    /** Rows in the last batch, against the one request that carried them. */
    lastBatchRows: number;
    requests: number;
    lastAt: number | null;
  };
  downstream: {
    /** Wall time of the last incremental change-feed request. */
    lastPollMs: number | null;
    rowsLastPoll: number;
    polls: number;
    emptyPolls: number;
    /** Written on the server until applied here, corrected for clock offset. */
    lastChangeLagMs: number | null;
    lastChangeAt: number | null;
    lastReconcileMs: number | null;
    lastReconcileAt: number | null;
    cursor: number | null;
  };
};

const stats: SyncStats = {
  hosted: null,
  clockOffsetMs: null,
  roundTripMs: null,
  upstream: {
    lastFlushMs: null,
    lastWriteLatencyMs: null,
    slowestWriteMs: null,
    accepted: 0,
    rejected: 0,
    conflicts: 0,
    lastBatchRows: 0,
    requests: 0,
    lastAt: null,
  },
  downstream: {
    lastPollMs: null,
    rowsLastPoll: 0,
    polls: 0,
    emptyPolls: 0,
    lastChangeLagMs: null,
    lastChangeAt: null,
    lastReconcileMs: null,
    lastReconcileAt: null,
    cursor: null,
  },
};

// When each queued item entered the outbox, so upstream latency is measured
// from the moment of the scan rather than from the start of the flush.
const queuedAt = new Map<string, number>();

function markQueued(key: string) {
  if (!queuedAt.has(key)) queuedAt.set(key, Date.now());
}

function markAccepted(key: string) {
  const started = queuedAt.get(key);
  queuedAt.delete(key);
  stats.upstream.accepted += 1;
  stats.upstream.lastAt = Date.now();
  if (started == null) return;
  const took = Date.now() - started;
  stats.upstream.lastWriteLatencyMs = took;
  stats.upstream.slowestWriteMs = Math.max(stats.upstream.slowestWriteMs ?? 0, took);
}

export function getSyncStats(): SyncStats {
  return {
    ...stats,
    upstream: { ...stats.upstream },
    downstream: { ...stats.downstream, cursor: readCursor() },
  };
}

export function resetSyncStats() {
  stats.upstream = {
    lastFlushMs: null,
    lastWriteLatencyMs: null,
    slowestWriteMs: null,
    accepted: 0,
    rejected: 0,
    conflicts: 0,
    lastBatchRows: 0,
    requests: 0,
    lastAt: null,
  };
  stats.downstream = {
    ...stats.downstream,
    lastPollMs: null,
    rowsLastPoll: 0,
    polls: 0,
    emptyPolls: 0,
    lastChangeLagMs: null,
    lastChangeAt: null,
  };
  notifyStatus();
}

/** Server time as this device best understands it, using the measured offset. */
function serverNow(): number {
  return Date.now() + (stats.clockOffsetMs ?? 0);
}

function recordChangeLag(serverStampedAt: string | undefined) {
  if (!serverStampedAt) return;
  const written = Date.parse(serverStampedAt);
  if (!Number.isFinite(written)) return;
  stats.downstream.lastChangeLagMs = Math.max(0, serverNow() - written);
  stats.downstream.lastChangeAt = Date.now();
}

async function pingServerClock() {
  const sentAt = Date.now();
  const data = await apiGet<{ cursor: number; now: string; hosted: boolean }>("cursor");
  if (!data?.now) return data;
  const roundTrip = Date.now() - sentAt;
  stats.roundTripMs = roundTrip;
  stats.hosted = data.hosted;
  stats.clockOffsetMs = Date.parse(data.now) - (sentAt + Math.round(roundTrip / 2));
  return data;
}

async function flushOutbox() {
  if (flushing || typeof window === "undefined") return;
  flushing = true;
  const flushStartedAt = Date.now();
  try {
    const box = readOutbox();
    const hadWork =
      box.frames.length +
        box.breakers.length +
        box.deletedFrames.length +
        box.strings.length +
        box.deletedStrings.length +
        box.projects.length +
        box.deletedProjects.length +
        box.faults.length +
        box.installers.length >
      0;
    const next = emptyOutbox();
    for (const id of box.deletedFrames) {
      if (!(await apiPost({ action: "deleteFrame", id }))) next.deletedFrames.push(id);
    }
    // Frames and holes go up together in one request. Sending them one at a
    // time meant a 70-hole frame paid the network round trip 70 times over.
    const frames = (await Promise.all(box.frames.map((id) => db.frames.get(id)))).filter(
      (f): f is Frame => Boolean(f),
    );
    const breakers = (await Promise.all(box.breakers.map((id) => db.breakers.get(id)))).filter(
      (b): b is BreakerRow => Boolean(b),
    );
    if (frames.length || breakers.length) {
      stats.upstream.lastBatchRows = frames.length + breakers.length;
      stats.upstream.requests += 1;
      const batch = await apiPostJson<{
        ok: boolean;
        frames: Frame[];
        breakers: { id: string; ok: boolean; row: BreakerRow }[];
      }>({ action: "saveBatch", frames, breakers });

      if (!batch.ok || !batch.data) {
        next.frames.push(...box.frames);
        next.breakers.push(...box.breakers);
        stats.upstream.rejected += frames.length + breakers.length;
      } else {
        const savedFrames = new Map(batch.data.frames.map((f) => [f.id, f]));
        for (const id of box.frames) {
          const saved = savedFrames.get(id);
          if (!saved) {
            next.frames.push(id);
            stats.upstream.rejected += 1;
            continue;
          }
          markAccepted(`frame:${id}`);
          // Adopt the server's seq and clock so the feed can tell later whether
          // a remote edit is actually newer than what this device already has.
          const current = await db.frames.get(id);
          if (current) {
            await db.frames.put({ ...current, seq: saved.seq, updatedAt: saved.updatedAt });
          }
        }

        const results = new Map(batch.data.breakers.map((r) => [r.id, r]));
        for (const id of box.breakers) {
          const result = results.get(id);
          if (!result) {
            next.breakers.push(id);
            stats.upstream.rejected += 1;
            continue;
          }
          // A rejected hole still carries the server's winning row, so take it.
          await db.breakers.put(result.row);
          if (result.ok) {
            markAccepted(`breaker:${id}`);
          } else {
            stats.upstream.conflicts += 1;
            queuedAt.delete(`breaker:${id}`);
          }
        }
      }
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
    const remaining = mergeOutboxAfterFlush(box, next);
    writeOutbox(remaining);
    if (countPending(remaining) === 0 && reachable) lastSyncedAt = new Date().toISOString();
    if (hadWork) {
      stats.upstream.lastFlushMs = Date.now() - flushStartedAt;
      notifySync();
      notifyStatus();
    }
  } finally {
    flushing = false;
  }
}

async function putLocalFrame(frame: Frame) {
  const next = withFrameDefaults(frame);
  const rows = explodeBreakers(next);
  const dirtyHoles = new Set(readOutbox().breakers);
  await db.transaction("rw", db.frames, db.breakers, async () => {
    await db.frames.put(next);
    for (const row of rows) {
      if (dirtyHoles.has(row.id)) continue;
      const local = await db.breakers.get(row.id);
      if (!local || (row.rev ?? 0) >= (local.rev ?? 0)) {
        await db.breakers.put(row);
      }
    }
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

async function applyRemoteBreaker(row: BreakerRow, dirtyHoles?: Set<string>): Promise<boolean> {
  const dirty = dirtyHoles ?? new Set(readOutbox().breakers);
  if (dirty.has(row.id)) return false;
  const local = await db.breakers.get(row.id);
  if (!local) {
    await db.breakers.put(row);
    return true;
  }
  if ((row.rev ?? 0) < (local.rev ?? 0)) return false;
  if ((row.rev ?? 0) === (local.rev ?? 0) && breakerFingerprint(local) === breakerFingerprint(row)) {
    return false;
  }
  await db.breakers.put(row);
  return true;
}

async function applyRemoteFrame(remote: Frame): Promise<boolean> {
  const local = await db.frames.get(remote.id);
  if (local && (local.seq ?? 0) >= (remote.seq ?? 0)) return false;
  await db.frames.put(withFrameDefaults({ ...local, ...remote, cbsds: local?.cbsds || remote.cbsds }));
  return true;
}

async function applyRemoteString(row: StringRecord, box: Outbox): Promise<boolean> {
  if (box.deletedStrings.some((s) => s.projectId === row.projectId && s.key === row.key)) return false;
  if (box.strings.some((s) => s.id === row.id)) return false;
  const local = await db.strings.get(row.id);
  if (local && Boolean(local.archivedAt) === Boolean(row.archivedAt)) return false;
  await db.strings.put(row);
  return true;
}

async function pullChanges(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const since = readCursor();
  if (since == null) {
    const boot = await pingServerClock();
    if (boot) writeCursor(boot.cursor);
    return false;
  }
  const pollStartedAt = Date.now();
  const data = await apiGet<ChangeFeed>("changes", { since: String(since), origin: deviceId() });
  if (!data) return false;

  stats.downstream.polls += 1;
  stats.downstream.lastPollMs = Date.now() - pollStartedAt;
  stats.downstream.rowsLastPoll =
    data.frames.length +
    data.breakers.length +
    data.strings.length +
    data.faults.length +
    data.deletedFrames.length +
    data.deletedStrings.length;
  if (stats.downstream.rowsLastPoll === 0) stats.downstream.emptyPolls += 1;
  // Newest server stamp in this batch, so the lag reflects the freshest edit.
  const freshest = [...data.breakers, ...data.frames]
    .map((row) => row.updatedAt)
    .sort()
    .pop();
  recordChangeLag(freshest);

  let changed = false;
  const box = readOutbox();
  const dirtyFrames = new Set(box.frames);
  const dirtyHoles = new Set(box.breakers);

  for (const frame of data.frames) {
    if (dirtyFrames.has(frame.id) || box.deletedFrames.includes(frame.id)) continue;
    if (await applyRemoteFrame(frame)) changed = true;
  }
  for (const row of data.breakers) {
    if (await applyRemoteBreaker(row, dirtyHoles)) changed = true;
  }
  for (const row of data.strings) {
    if (await applyRemoteString(row, box)) changed = true;
  }
  for (const fault of data.faults) {
    if (await db.faults.get(fault.id)) continue;
    await db.faults.put(fault);
    changed = true;
  }

  // Deletions arrive as tombstones now, which is what lets this device drop the
  // periodic full download it used to need just to notice a frame had gone.
  for (const id of data.deletedFrames) {
    if (dirtyFrames.has(id)) continue;
    if (!(await db.frames.get(id))) continue;
    await purgeLocalFrame(id);
    changed = true;
  }
  for (const id of data.deletedStrings) {
    if (!(await db.strings.get(id))) continue;
    await db.strings.delete(id);
    changed = true;
  }

  if (data.cursor > since) writeCursor(data.cursor);
  return changed;
}

async function purgeLocalFrame(id: string) {
  const holes = await db.breakers.where("frameId").equals(id).primaryKeys();
  await db.transaction("rw", db.frames, db.breakers, async () => {
    await db.breakers.bulkDelete(holes as string[]);
    await db.frames.delete(id);
  });
  const seen = readSeenFrames();
  if (seen.delete(id)) writeSeenFrames(seen);
}

const RECONCILE_EVERY_MS = 10 * 60_000;

export function startBackgroundSync() {
  if (syncStarted || typeof window === "undefined") return;
  syncStarted = true;
  let lastFullPull = 0;
  const tick = async (forceFull = false) => {
    if (tickInFlight) {
      tickQueued = true;
      return;
    }
    tickInFlight = true;
    try {
      do {
        tickQueued = false;
        await flushOutbox();
        const now = Date.now();
        let changed = false;
        // Tombstones carry deletions through the feed, so the full download is
        // no longer part of steady-state sync. It stays only as a slow safety
        // net against a device that somehow drifted out of step.
        if (forceFull || now - lastFullPull > RECONCILE_EVERY_MS) {
          lastFullPull = now;
          // Snapshot the cursor first: anything written while the reconcile runs
          // then still comes back through the feed instead of being skipped.
          const boot = await pingServerClock();
          const reconcileStartedAt = Date.now();
          changed = await pullRemote();
          stats.downstream.lastReconcileMs = Date.now() - reconcileStartedAt;
          stats.downstream.lastReconcileAt = Date.now();
          if (boot) writeCursor(boot.cursor);
        } else {
          changed = await pullChanges();
        }
        if (changed) notifySync();
        forceFull = false;
      } while (tickQueued);
    } finally {
      tickInFlight = false;
    }
  };
  void (async () => {
    await seedIfEmpty();
    await tick(true);
  })();
  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    void tick();
  }, 1000);
  window.addEventListener("focus", () => {
    void tick();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void tick();
  });
}

async function pullRemote(): Promise<boolean> {
  const box = readOutbox();
  const dirty = new Set(box.frames);
  const seen = readSeenFrames();
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
    if (still.length === 1 && currentProjectId() !== still[0].id) {
      setCurrentProjectId(still[0].id);
      changed = true;
    }
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

  const syncTargets =
    projects && projects.length
      ? projects.filter((p) => !box.deletedProjects.includes(p.id)).map((p) => p.id)
      : [currentProjectId()];

  for (const pid of syncTargets) {
    const strings = await apiGet<StringRun[]>("listStrings", { projectId: pid });
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

    const frames = await apiGet<Frame[]>("listFrames", { projectId: pid });
    if (frames) {
      const remoteIds = new Set(frames.map((f) => f.id));
      for (const id of remoteIds) seen.add(id);
      for (const remote of frames) {
        if (box.deletedFrames.includes(remote.id)) continue;
        if (dirty.has(remote.id)) continue;
        if (await applyRemoteFrame(remote)) changed = true;
      }
      const localFrames = await db.frames.toArray();
      for (const local of localFrames) {
        if (projectIdOf(local) !== pid) continue;
        if (remoteIds.has(local.id) || dirty.has(local.id)) continue;
        if (box.deletedFrames.includes(local.id)) continue;
        // Only ever drop a frame Neon has actually shown us before, so a slot
        // this device just created cannot be mistaken for a remote delete.
        if (!seen.has(local.id)) continue;
        await db.transaction("rw", db.frames, db.breakers, db.faults, async () => {
          await db.frames.delete(local.id);
          await db.breakers.where("frameId").equals(local.id).delete();
          await db.faults.where("frameId").equals(local.id).delete();
        });
        seen.delete(local.id);
        changed = true;
      }
    }

    const breakers = await apiGet<BreakerRow[]>("listBreakers", { projectId: pid });
    if (breakers) {
      const dirtyHoles = new Set(box.breakers);
      for (const row of breakers) {
        if (await applyRemoteBreaker(row, dirtyHoles)) changed = true;
      }
    }

    const faults = await apiGet<Fault[]>("listFaults", { projectId: pid });
    if (faults) {
      for (const fault of faults) {
        const local = await db.faults.get(fault.id);
        if (!local) {
          await db.faults.put(fault);
          changed = true;
        }
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

  writeSeenFrames(seen);
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
  const [all, holes] = await Promise.all([db.frames.toArray(), db.breakers.toArray()]);
  const mine = all
    .filter((f) => (f.projectId || DEFAULT_PROJECT_ID) === pid)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  // One pass over the holes grouped in memory, rather than an index lookup per
  // frame. Keyed on frameId only, so a row whose projectId drifted still lands.
  const wanted = new Set(mine.map((f) => f.id));
  const byFrame = new Map<string, BreakerRow[]>();
  for (const row of holes) {
    if (!wanted.has(row.frameId)) continue;
    const list = byFrame.get(row.frameId);
    if (list) list.push(row);
    else byFrame.set(row.frameId, [row]);
  }
  return mine.map((frame) => hydrateFrame(withFrameDefaults(frame), byFrame.get(frame.id) || []));
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
  const now = new Date().toISOString();
  const next: Frame = {
    ...frame,
    projectId: frame.projectId || currentProjectId(),
    updatedAt: now,
  };
  const incoming = explodeBreakers(next);
  const dirtyIds: string[] = [];
  await db.transaction("rw", db.frames, db.breakers, async () => {
    await db.frames.put(next);
    for (const row of incoming) {
      const local = await db.breakers.get(row.id);
      if (!local) {
        await db.breakers.put({ ...row, rev: 0, updatedAt: now });
        continue;
      }
      if (breakerFingerprint(local) === breakerFingerprint(row)) continue;
      const updated = { ...row, rev: local.rev ?? 0, seq: local.seq ?? 0, updatedAt: now };
      await db.breakers.put(updated);
      dirtyIds.push(updated.id);
    }
  });
  queueFrame(next.id);
  for (const id of dirtyIds) queueBreaker(id);
  if (flushTimer) clearTimeout(flushTimer);
  void flushOutbox();
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
  if (flushTimer) clearTimeout(flushTimer);
  void flushOutbox();
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
