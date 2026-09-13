import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import {
  explodeBreakers,
  hydrateFrame,
  clampWeeklyTarget,
  DEFAULT_PROJECT_ID,
  DEFAULT_WEEKLY_TARGET,
  withFrameDefaults,
  type StringRecord,
  type StringRun,
} from "./project";
import type { BreakerRow, Fault, Frame, Installer, Project } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  string_key TEXT NOT NULL,
  frame_slot TEXT,
  phase TEXT,
  submitted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  paperwork TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS breakers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  string_key TEXT,
  frame_slot TEXT,
  hole TEXT NOT NULL,
  board TEXT,
  position INTEGER NOT NULL,
  in_use INTEGER NOT NULL DEFAULT 0,
  amps TEXT,
  mccb_serial TEXT,
  ml_serial TEXT,
  ml_model TEXT,
  shunt_batch TEXT,
  scanned_by TEXT,
  scanned_at TEXT,
  mccb_installed INTEGER NOT NULL DEFAULT 0,
  flexibar_caps INTEGER NOT NULL DEFAULT 0,
  whip_terminated INTEGER NOT NULL DEFAULT 0,
  torque_line INTEGER NOT NULL DEFAULT 0,
  torque_load INTEGER NOT NULL DEFAULT 0,
  ml_set INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS faults (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  string_key TEXT,
  frame_slot TEXT,
  hole TEXT,
  kind TEXT NOT NULL,
  old_mccb TEXT,
  old_ml TEXT,
  old_ml_model TEXT,
  old_shunt TEXT,
  reason TEXT,
  raised_by TEXT,
  raised_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS installers (
  initials TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_seq (
  id INTEGER PRIMARY KEY,
  value BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_meta (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL
);
`;

const SEQ_TABLES = ["frames", "breakers", "strings", "faults"] as const;

// Bump this when the migration below changes. A serverless instance reads the
// stored version in one round trip and skips the whole migration when it
// matches, instead of re-running twenty DDL statements on every cold start.
const SCHEMA_VERSION = 4;

type Row = Record<string, unknown>;

type Driver = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T extends Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T extends Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

let driverPromise: Promise<Driver> | null = null;
let pg: Sql | null = null;

function hostedUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_DATABASE_URL ||
    ""
  );
}

function toPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function sqliteDriver(): Promise<Driver> {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "mccb-shared.db"));
  db.exec("PRAGMA journal_mode = WAL");
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...(params as never[]));
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...(params as never[])) as never;
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...(params as never[])) as never;
    },
  };
}

async function postgresDriver(url: string): Promise<Driver> {
  pg = postgres(url, { max: 4, ssl: "require", idle_timeout: 20, connect_timeout: 10 });
  return {
    async exec(sql) {
      await pg!.unsafe(sql);
    },
    async run(sql, params = []) {
      await pg!.unsafe(toPg(sql), params as (string | number | boolean | null)[]);
    },
    async all(sql, params = []) {
      return (await pg!.unsafe(toPg(sql), params as (string | number | boolean | null)[])) as never;
    },
    async get(sql, params = []) {
      const rows = await pg!.unsafe(toPg(sql), params as (string | number | boolean | null)[]);
      return (rows[0] as never) || undefined;
    },
  };
}

async function getDriver(): Promise<Driver> {
  if (!driverPromise) {
    const url = hostedUrl();
    if (process.env.VERCEL && !url) {
      throw new Error("DATABASE_URL is not set. Add a Neon/Postgres database on Vercel.");
    }
    driverPromise = (url ? postgresDriver(url) : sqliteDriver()).then(async (d) => {
      if ((await readSchemaVersion(d)) < SCHEMA_VERSION) await migrate(d);
      return d;
    });
  }
  return driverPromise;
}

/** Absent table means this database has never been migrated. */
async function readSchemaVersion(d: Driver): Promise<number> {
  try {
    return num((await d.get("SELECT version FROM schema_meta WHERE id = 1"))?.version);
  } catch {
    return 0;
  }
}

async function migrate(d: Driver): Promise<void> {
  await d.exec(SCHEMA);
  const addColumn = async (table: string, decl: string) => {
    try {
      await d.exec(`ALTER TABLE ${table} ADD COLUMN ${decl}`);
    } catch {
      /* already present */
    }
  };
  const addIndex = async (name: string, on: string) => {
    try {
      await d.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${on}`);
    } catch {
      /* ignore */
    }
  };

  await addColumn("breakers", "rev INTEGER NOT NULL DEFAULT 0");
  await addIndex("breakers_updated_at", "breakers (updated_at)");
  await addIndex("frames_updated_at", "frames (updated_at)");
  for (const table of SEQ_TABLES) {
    await addColumn(table, "seq BIGINT NOT NULL DEFAULT 0");
    // Which device wrote the row, so the feed can skip echoing it back.
    await addColumn(table, "origin TEXT");
    await addIndex(`${table}_seq`, `${table} (seq)`);
  }
  // Deletions travel through the change feed as tombstones, so devices no
  // longer need a periodic full download just to notice something vanished.
  await addColumn("frames", "deleted INTEGER NOT NULL DEFAULT 0");
  await addColumn("strings", "deleted INTEGER NOT NULL DEFAULT 0");
  // The weekly handover target every rate figure on the progress page is read
  // against. Kept on the project so all devices report the same number.
  await addColumn("projects", `weekly_target INTEGER NOT NULL DEFAULT ${DEFAULT_WEEKLY_TARGET}`);

  await d.run("INSERT INTO sync_seq (id, value) VALUES (1, 0) ON CONFLICT (id) DO NOTHING", []);
  const projects = await d.all("SELECT id FROM projects LIMIT 1");
  if (!projects.length) {
    await d.run("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", [
      DEFAULT_PROJECT_ID,
      "Current project",
      new Date().toISOString(),
    ]);
  }
  await d.run(
    `INSERT INTO schema_meta (id, version) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET version = excluded.version`,
    [SCHEMA_VERSION],
  );
}

/**
 * The seeded placeholder only stops being useful once a real project exists,
 * which is the one moment worth checking. It used to be re-checked on every
 * cold start, which cost round trips on the write path for nothing.
 */
async function pruneSeededProject(d: Driver): Promise<void> {
  const leftover = await d.all("SELECT id FROM frames WHERE project_id = ? AND deleted = 0", [
    DEFAULT_PROJECT_ID,
  ]);
  if (leftover.length) return;
  await d.run("DELETE FROM strings WHERE project_id = ?", [DEFAULT_PROJECT_ID]);
  await d.run("DELETE FROM projects WHERE id = ? AND name = ?", [DEFAULT_PROJECT_ID, "Current project"]);
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  return Number(v) || 0;
}

// One locked counter row, bumped in a single statement, so the numbers a client
// pulls with `seq > cursor` can never arrive out of order the way wall-clock
// timestamps do when a phone and the server disagree about the time.
async function nextSeq(d: Driver): Promise<number> {
  const [seq] = await reserveSeq(d, 1);
  return seq;
}

/** Reserve `n` sequence numbers in one statement. A 70-hole frame used to pay 70 round trips. */
async function reserveSeq(d: Driver, n: number): Promise<number[]> {
  if (n <= 0) return [];
  const row = await d.get("UPDATE sync_seq SET value = value + ? WHERE id = 1 RETURNING value", [n]);
  const last = row
    ? num(row.value)
    : (await d.run("UPDATE sync_seq SET value = value + ? WHERE id = 1", [n]),
      num((await d.get("SELECT value FROM sync_seq WHERE id = 1"))?.value));
  return Array.from({ length: n }, (_, i) => last - n + 1 + i);
}

async function currentSeq(d: Driver): Promise<number> {
  const row = await d.get("SELECT value FROM sync_seq WHERE id = 1");
  return num(row?.value);
}

function paperworkFrame(row: Row): Frame {
  const paper = JSON.parse(str(row.paperwork) || "{}") as Frame;
  return withFrameDefaults({
    ...paper,
    id: str(row.id) || paper.id,
    projectId: str(row.project_id) || paper.projectId,
    stringKey: str(row.string_key) || paper.stringKey,
    frameSlot: str(row.frame_slot) || paper.frameSlot,
    phase: (str(row.phase) as Frame["phase"]) || paper.phase,
    submitted: num(row.submitted) === 1 || paper.submitted,
    updatedAt: str(row.updated_at) || paper.updatedAt,
    seq: num(row.seq),
  });
}

function rowToFault(r: Row): Fault {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    frameId: str(r.frame_id),
    stringKey: str(r.string_key),
    frameSlot: str(r.frame_slot),
    hole: str(r.hole),
    kind: str(r.kind) === "shunt" ? "shunt" : "unit",
    oldMccb: str(r.old_mccb),
    oldMl: str(r.old_ml),
    oldMlModel: str(r.old_ml_model) === "5.2E" ? "5.2E" : str(r.old_ml_model) ? "2.2" : "",
    oldShunt: str(r.old_shunt),
    reason: str(r.reason),
    raisedBy: str(r.raised_by),
    raisedAt: str(r.raised_at),
  };
}

function rowToBreaker(r: Row): BreakerRow {
  return {
    id: str(r.id),
    projectId: str(r.project_id),
    frameId: str(r.frame_id),
    stringKey: str(r.string_key),
    frameSlot: str(r.frame_slot),
    hole: str(r.hole),
    board: str(r.board) as BreakerRow["board"],
    position: num(r.position),
    inUse: num(r.in_use),
    amps: (str(r.amps) || "") as BreakerRow["amps"],
    mccbSerial: str(r.mccb_serial),
    mlSerial: str(r.ml_serial),
    mlModel: str(r.ml_model) === "5.2E" ? "5.2E" : "2.2",
    shuntBatch: str(r.shunt_batch),
    scannedBy: str(r.scanned_by),
    scannedAt: str(r.scanned_at),
    mccbInstalled: num(r.mccb_installed),
    flexibarCaps: num(r.flexibar_caps),
    whipTerminated: num(r.whip_terminated),
    torqueLine: num(r.torque_line),
    torqueLoad: num(r.torque_load),
    mlSet: num(r.ml_set),
    updatedAt: str(r.updated_at),
    rev: num(r.rev),
    seq: num(r.seq),
  };
}

async function hydrateFromDb(d: Driver, frame: Frame): Promise<Frame> {
  const rows = (await d.all("SELECT * FROM breakers WHERE frame_id = ?", [frame.id])).map(rowToBreaker);
  return hydrateFrame(frame, rows);
}

export async function storeStatus(): Promise<{ empty: boolean; hosted: boolean }> {
  const d = await getDriver();
  const frames = await d.get("SELECT id FROM frames WHERE deleted = 0 LIMIT 1");
  return { empty: !frames, hosted: Boolean(hostedUrl()) || Boolean(process.env.VERCEL) };
}

export async function storeListProjects(): Promise<Project[]> {
  const d = await getDriver();
  const rows = await d.all(
    "SELECT id, name, created_at, weekly_target FROM projects ORDER BY created_at",
  );
  return rows.map((r) => ({
    id: str(r.id),
    name: str(r.name),
    createdAt: str(r.created_at),
    weeklyTarget: clampWeeklyTarget(r.weekly_target),
  }));
}

export async function storePutProject(project: Project): Promise<void> {
  const d = await getDriver();
  await d.run(
    `INSERT INTO projects (id, name, created_at, weekly_target) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, weekly_target = excluded.weekly_target`,
    [project.id, project.name, project.createdAt, clampWeeklyTarget(project.weeklyTarget)],
  );
}

export async function storeAddProject(name: string): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "New project",
    createdAt: new Date().toISOString(),
    weeklyTarget: DEFAULT_WEEKLY_TARGET,
  };
  await storePutProject(project);
  if (project.id !== DEFAULT_PROJECT_ID) await pruneSeededProject(await getDriver());
  return project;
}

export async function storeDeleteProject(id: string): Promise<{ ok: true } | { ok: false; reason: "last" }> {
  const d = await getDriver();
  const projects = await storeListProjects();
  const remaining = projects.filter((p) => p.id !== id);
  if (!remaining.length) return { ok: false, reason: "last" };
  const frames = await d.all("SELECT id FROM frames WHERE project_id = ?", [id]);
  for (const f of frames) {
    await d.run("DELETE FROM breakers WHERE frame_id = ?", [str(f.id)]);
    await d.run("DELETE FROM faults WHERE frame_id = ?", [str(f.id)]);
  }
  await d.run("DELETE FROM frames WHERE project_id = ?", [id]);
  await d.run("DELETE FROM strings WHERE project_id = ?", [id]);
  await d.run("DELETE FROM faults WHERE project_id = ?", [id]);
  await d.run("DELETE FROM projects WHERE id = ?", [id]);
  return { ok: true };
}

export async function storeListFrames(projectId: string): Promise<Frame[]> {
  const d = await getDriver();
  const rows = await d.all(
    "SELECT * FROM frames WHERE project_id = ? AND deleted = 0 ORDER BY updated_at DESC",
    [projectId],
  );
  // Paperwork only. Holes travel as their own rows, so hydrating each frame
  // here used to re-query every breaker and ship the same payload twice.
  return rows.map(paperworkFrame);
}

export async function storeListBreakers(projectId: string): Promise<BreakerRow[]> {
  const d = await getDriver();
  const rows = await d.all("SELECT * FROM breakers WHERE project_id = ?", [projectId]);
  return rows.map(rowToBreaker);
}

export async function storeGetFrame(id: string): Promise<Frame | undefined> {
  const d = await getDriver();
  const row = await d.get("SELECT * FROM frames WHERE id = ? AND deleted = 0", [id]);
  if (!row) return undefined;
  return hydrateFromDb(d, paperworkFrame(row));
}

export async function storeSaveFrame(frame: Frame, origin?: string): Promise<Frame> {
  return saveFrameWith(await getDriver(), frame, origin);
}

async function saveFrameWith(d: Driver, frame: Frame, origin?: string): Promise<Frame> {
  const seq = await nextSeq(d);
  const next = withFrameDefaults({
    ...frame,
    projectId: frame.projectId || DEFAULT_PROJECT_ID,
    updatedAt: new Date().toISOString(),
    seq,
  });
  await d.run(
    `INSERT INTO frames (id, project_id, string_key, frame_slot, phase, submitted, updated_at, paperwork, seq, origin, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (id) DO UPDATE SET
       project_id = excluded.project_id,
       string_key = excluded.string_key,
       frame_slot = excluded.frame_slot,
       phase = excluded.phase,
       submitted = excluded.submitted,
       updated_at = excluded.updated_at,
       paperwork = excluded.paperwork,
       seq = excluded.seq,
       origin = excluded.origin,
       deleted = 0`,
    [
      next.id,
      next.projectId,
      next.stringKey,
      next.frameSlot,
      next.phase,
      next.submitted ? 1 : 0,
      next.updatedAt,
      JSON.stringify(next),
      seq,
      origin ?? null,
    ],
  );
  const existing = await d.get("SELECT id FROM breakers WHERE frame_id = ?", [next.id]);
  if (existing) return next;
  const holes = explodeBreakers(next);
  const seqs = await reserveSeq(d, holes.length);
  for (let i = 0; i < holes.length; i += 1) {
    await upsertBreaker(d, { ...holes[i], rev: 0, seq: seqs[i] }, origin);
  }
  return next;
}

async function upsertBreaker(d: Driver, b: BreakerRow, origin?: string): Promise<void> {
  const rev = b.rev ?? 0;
  await d.run(
    `INSERT INTO breakers (
      id, project_id, frame_id, string_key, frame_slot, hole, board, position, in_use, amps,
      mccb_serial, ml_serial, ml_model, shunt_batch, scanned_by, scanned_at,
      mccb_installed, flexibar_caps, whip_terminated, torque_line, torque_load, ml_set, updated_at, rev, seq, origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       project_id = excluded.project_id,
       frame_id = excluded.frame_id,
       string_key = excluded.string_key,
       frame_slot = excluded.frame_slot,
       hole = excluded.hole,
       board = excluded.board,
       position = excluded.position,
       in_use = excluded.in_use,
       amps = excluded.amps,
       mccb_serial = excluded.mccb_serial,
       ml_serial = excluded.ml_serial,
       ml_model = excluded.ml_model,
       shunt_batch = excluded.shunt_batch,
       scanned_by = excluded.scanned_by,
       scanned_at = excluded.scanned_at,
       mccb_installed = excluded.mccb_installed,
       flexibar_caps = excluded.flexibar_caps,
       whip_terminated = excluded.whip_terminated,
       torque_line = excluded.torque_line,
       torque_load = excluded.torque_load,
       ml_set = excluded.ml_set,
       updated_at = excluded.updated_at,
       rev = excluded.rev,
       seq = excluded.seq,
       origin = excluded.origin`,
    [
      b.id, b.projectId, b.frameId, b.stringKey, b.frameSlot, b.hole, b.board, b.position, b.inUse, b.amps,
      b.mccbSerial, b.mlSerial, b.mlModel, b.shuntBatch, b.scannedBy, b.scannedAt,
      b.mccbInstalled, b.flexibarCaps, b.whipTerminated, b.torqueLine, b.torqueLoad, b.mlSet, b.updatedAt, rev,
      b.seq ?? 0, origin ?? null,
    ],
  );
}

export async function storeSaveBreaker(
  incoming: BreakerRow,
  origin?: string,
): Promise<{ ok: true; breaker: BreakerRow } | { ok: false; conflict: BreakerRow }> {
  return saveBreakerWith(await getDriver(), incoming, origin);
}

async function saveBreakerWith(
  d: Driver,
  incoming: BreakerRow,
  origin?: string,
  seq?: number,
): Promise<{ ok: true; breaker: BreakerRow } | { ok: false; conflict: BreakerRow }> {
  const now = new Date().toISOString();
  const current = await d.get("SELECT * FROM breakers WHERE id = ?", [incoming.id]);
  const clientRev = incoming.rev ?? 0;
  if (current && num(current.rev) > clientRev) {
    return { ok: false, conflict: rowToBreaker(current) };
  }
  const nextRev = (current ? num(current.rev) : 0) + 1;
  const row: BreakerRow = { ...incoming, updatedAt: now, rev: nextRev, seq: seq ?? (await nextSeq(d)) };
  await upsertBreaker(d, row, origin);
  return { ok: true, breaker: row };
}

export type BatchInput = {
  frames?: Frame[];
  breakers?: BreakerRow[];
  origin?: string;
};

export type BatchResult = {
  frames: Frame[];
  breakers: { id: string; ok: boolean; row: BreakerRow }[];
};

/**
 * One request for a whole queue. The client used to send a separate HTTP
 * request per hole, so a 70-hole frame paid the network round trip 70 times.
 */
export async function storeSaveBatch(input: BatchInput): Promise<BatchResult> {
  const d = await getDriver();
  const frames: Frame[] = [];
  for (const frame of input.frames ?? []) {
    frames.push(await saveFrameWith(d, frame, input.origin));
  }
  const incoming = input.breakers ?? [];
  const seqs = await reserveSeq(d, incoming.length);
  const breakers: BatchResult["breakers"] = [];
  for (let i = 0; i < incoming.length; i += 1) {
    const breaker = incoming[i];
    const result = await saveBreakerWith(d, breaker, input.origin, seqs[i]);
    breakers.push(
      result.ok
        ? { id: breaker.id, ok: true, row: result.breaker }
        : { id: breaker.id, ok: false, row: result.conflict },
    );
  }
  return { frames, breakers };
}

export type ChangeFeed = {
  cursor: number;
  frames: Frame[];
  breakers: BreakerRow[];
  strings: StringRecord[];
  faults: Fault[];
  deletedFrames: string[];
  deletedStrings: string[];
};

const CHANGE_PAGE = 400;

export async function storeCursor(): Promise<{ cursor: number; now: string; hosted: boolean }> {
  const started = Date.now();
  const cursor = await currentSeq(await getDriver());
  return {
    cursor,
    // Lets a device measure its own clock skew against the shared database
    // instead of guessing, and prove which database it is actually talking to.
    now: new Date(started + Math.round((Date.now() - started) / 2)).toISOString(),
    hosted: Boolean(hostedUrl()) || Boolean(process.env.VERCEL),
  };
}

export async function storeChanges(since: number, origin?: string): Promise<ChangeFeed> {
  const d = await getDriver();
  let cursor = await currentSeq(d);
  const empty: ChangeFeed = {
    cursor,
    frames: [],
    breakers: [],
    strings: [],
    faults: [],
    deletedFrames: [],
    deletedStrings: [],
  };
  if (!Number.isFinite(since) || since < 0) return empty;

  // A device already has its own writes, and the POST reply gave it the
  // canonical row, so shipping them back is pure waste.
  const skipOwn = origin ? " AND (origin IS NULL OR origin <> ?)" : "";
  const args = origin ? [since, origin] : [since];
  const page = async (table: string) =>
    d.all(
      `SELECT * FROM ${table} WHERE seq > ?${skipOwn} ORDER BY seq LIMIT ${CHANGE_PAGE}`,
      args,
    );

  const [frameRows, breakerRows, stringRows, faultRows] = await Promise.all([
    page("frames"),
    page("breakers"),
    page("strings"),
    page("faults"),
  ]);

  // A truncated page means there is more after it, so only claim up to the last
  // row we actually handed over. The extra rows come back on the next tick.
  for (const rows of [frameRows, breakerRows, stringRows, faultRows]) {
    if (rows.length === CHANGE_PAGE) cursor = Math.min(cursor, num(rows[rows.length - 1].seq));
  }

  const liveFrames = frameRows.filter((r) => num(r.deleted) !== 1);
  const liveStrings = stringRows.filter((r) => num(r.deleted) !== 1);

  return {
    cursor,
    frames: liveFrames.map(paperworkFrame),
    breakers: breakerRows.map(rowToBreaker),
    strings: liveStrings.map((r) => ({
      id: str(r.id),
      projectId: str(r.project_id),
      key: str(r.key),
      createdAt: str(r.created_at),
      archivedAt: str(r.archived_at) || undefined,
    })),
    faults: faultRows.map(rowToFault),
    deletedFrames: frameRows.filter((r) => num(r.deleted) === 1).map((r) => str(r.id)),
    deletedStrings: stringRows.filter((r) => num(r.deleted) === 1).map((r) => str(r.id)),
  };
}

export async function storeDeleteFrame(id: string, origin?: string): Promise<void> {
  await deleteFrameWith(await getDriver(), id, origin);
}

// Tombstoned rather than removed: the row keeps a fresh seq so the deletion
// reaches other devices through the ordinary feed within a second.
async function deleteFrameWith(d: Driver, id: string, origin?: string): Promise<void> {
  await d.run("DELETE FROM breakers WHERE frame_id = ?", [id]);
  await d.run("DELETE FROM faults WHERE frame_id = ?", [id]);
  await d.run("UPDATE frames SET deleted = 1, seq = ?, origin = ? WHERE id = ?", [
    await nextSeq(d),
    origin ?? null,
    id,
  ]);
}

export async function storeListStrings(projectId: string): Promise<StringRun[]> {
  const d = await getDriver();
  const rows = await d.all(
    "SELECT key, created_at, archived_at FROM strings WHERE project_id = ? AND deleted = 0",
    [projectId],
  );
  return rows.map((r) => ({
    key: str(r.key),
    createdAt: str(r.created_at),
    archivedAt: str(r.archived_at) || undefined,
  }));
}

export async function storePutString(row: StringRecord, origin?: string): Promise<void> {
  const d = await getDriver();
  await d.run(
    `INSERT INTO strings (id, project_id, key, created_at, archived_at, seq, origin, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (id) DO UPDATE SET
       archived_at = excluded.archived_at,
       created_at = excluded.created_at,
       seq = excluded.seq,
       origin = excluded.origin,
       deleted = 0`,
    [row.id, row.projectId, row.key, row.createdAt, row.archivedAt || null, await nextSeq(d), origin ?? null],
  );
}

export async function storeDeleteString(projectId: string, key: string, origin?: string): Promise<void> {
  const d = await getDriver();
  const frames = await storeListFrames(projectId);
  const ids = frames.filter((f) => (f.stringKey || "1") === key).map((f) => f.id);
  for (const id of ids) await deleteFrameWith(d, id, origin);
  await d.run("UPDATE strings SET deleted = 1, seq = ?, origin = ? WHERE project_id = ? AND key = ?", [
    await nextSeq(d),
    origin ?? null,
    projectId,
    key,
  ]);
}

export async function storeFindFrameBySlot(
  projectId: string,
  stringKey: string,
  frameSlot: string,
): Promise<Frame | undefined> {
  const d = await getDriver();
  const row = await d.get(
    "SELECT * FROM frames WHERE project_id = ? AND string_key = ? AND frame_slot = ? AND deleted = 0",
    [projectId, stringKey, frameSlot],
  );
  if (!row) return undefined;
  return hydrateFromDb(d, paperworkFrame(row));
}

export async function storeListInstallers(): Promise<Installer[]> {
  const d = await getDriver();
  const people = await d.all("SELECT initials, name FROM installers");
  return people
    .map((p) => ({ initials: str(p.initials), name: str(p.name) }))
    .sort((a, b) => a.initials.localeCompare(b.initials));
}

export async function storeSaveInstaller(installer: Installer): Promise<void> {
  const d = await getDriver();
  const initials = installer.initials.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (!initials) return;
  await d.run(
    `INSERT INTO installers (initials, name) VALUES (?, ?)
     ON CONFLICT (initials) DO UPDATE SET name = excluded.name`,
    [initials, installer.name.trim() || initials],
  );
}

export async function storeGetInstaller(initials: string): Promise<Installer | undefined> {
  const d = await getDriver();
  const key = initials.trim().toUpperCase().replace(/[^A-Z]/g, "");
  const row = await d.get("SELECT initials, name FROM installers WHERE initials = ?", [key]);
  if (!row) return undefined;
  return { initials: str(row.initials), name: str(row.name) };
}

export async function storeAddFault(fault: Fault): Promise<void> {
  const d = await getDriver();
  await d.run(
    `INSERT INTO faults (
      id, project_id, frame_id, string_key, frame_slot, hole, kind,
      old_mccb, old_ml, old_ml_model, old_shunt, reason, raised_by, raised_at, seq
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET reason = excluded.reason, seq = excluded.seq`,
    [
      fault.id, fault.projectId, fault.frameId, fault.stringKey, fault.frameSlot, fault.hole, fault.kind,
      fault.oldMccb, fault.oldMl, fault.oldMlModel, fault.oldShunt, fault.reason, fault.raisedBy, fault.raisedAt,
      await nextSeq(d),
    ],
  );
}

export async function storeListFaults(projectId: string): Promise<Fault[]> {
  const d = await getDriver();
  const rows = await d.all(
    "SELECT * FROM faults WHERE project_id = ? ORDER BY raised_at DESC",
    [projectId],
  );
  return rows.map(rowToFault);
}

export async function storeSearchBreakers(projectId: string, query: string): Promise<BreakerRow[]> {
  const q = `%${query.trim().toUpperCase()}%`;
  const d = await getDriver();
  const rows = await d.all(
    `SELECT * FROM breakers WHERE project_id = ? AND (
      mccb_serial LIKE ? OR ml_serial LIKE ? OR shunt_batch LIKE ?
    )`,
    [projectId, q, q, q],
  );
  return rows.map(rowToBreaker);
}

export async function storeImport(dump: {
  projects?: Project[];
  strings?: StringRecord[];
  frames?: Frame[];
  faults?: Fault[];
  installers?: Installer[];
}): Promise<void> {
  for (const p of dump.projects || []) await storePutProject(p);
  for (const s of dump.strings || []) await storePutString(s);
  for (const f of dump.frames || []) await storeSaveFrame(f);
  for (const f of dump.faults || []) await storeAddFault(f);
  for (const i of dump.installers || []) await storeSaveInstaller(i);
}
