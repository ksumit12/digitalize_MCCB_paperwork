import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { explodeBreakers, hydrateFrame, DEFAULT_PROJECT_ID, withFrameDefaults, type StringRecord, type StringRun } from "./project";
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
`;

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
  pg = postgres(url, { max: 1, ssl: "require", idle_timeout: 20, connect_timeout: 10 });
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
      await d.exec(SCHEMA);
      const projects = await d.all("SELECT id FROM projects LIMIT 1");
      if (!projects.length) {
        await d.run("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", [
          DEFAULT_PROJECT_ID,
          "Current project",
          new Date().toISOString(),
        ]);
      }
      return d;
    });
  }
  return driverPromise;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number {
  return Number(v) || 0;
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
  });
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
  };
}

async function hydrateFromDb(d: Driver, frame: Frame): Promise<Frame> {
  const rows = (await d.all("SELECT * FROM breakers WHERE frame_id = ?", [frame.id])).map(rowToBreaker);
  return hydrateFrame(frame, rows);
}

export async function storeStatus(): Promise<{ empty: boolean; hosted: boolean }> {
  const d = await getDriver();
  const frames = await d.get("SELECT id FROM frames LIMIT 1");
  return { empty: !frames, hosted: Boolean(hostedUrl()) || Boolean(process.env.VERCEL) };
}

export async function storeListProjects(): Promise<Project[]> {
  const d = await getDriver();
  const rows = await d.all("SELECT id, name, created_at FROM projects ORDER BY created_at");
  return rows.map((r) => ({ id: str(r.id), name: str(r.name), createdAt: str(r.created_at) }));
}

export async function storePutProject(project: Project): Promise<void> {
  const d = await getDriver();
  await d.run(
    `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
    [project.id, project.name, project.createdAt],
  );
}

export async function storeAddProject(name: string): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "New project",
    createdAt: new Date().toISOString(),
  };
  await storePutProject(project);
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
    "SELECT * FROM frames WHERE project_id = ? ORDER BY updated_at DESC",
    [projectId],
  );
  const frames = [];
  for (const row of rows) frames.push(await hydrateFromDb(d, paperworkFrame(row)));
  return frames;
}

export async function storeGetFrame(id: string): Promise<Frame | undefined> {
  const d = await getDriver();
  const row = await d.get("SELECT * FROM frames WHERE id = ?", [id]);
  if (!row) return undefined;
  return hydrateFromDb(d, paperworkFrame(row));
}

export async function storeSaveFrame(frame: Frame): Promise<void> {
  const d = await getDriver();
  const next = withFrameDefaults({
    ...frame,
    projectId: frame.projectId || DEFAULT_PROJECT_ID,
    updatedAt: frame.updatedAt || new Date().toISOString(),
  });
  const breakers = explodeBreakers(next);
  await d.run(
    `INSERT INTO frames (id, project_id, string_key, frame_slot, phase, submitted, updated_at, paperwork)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       project_id = excluded.project_id,
       string_key = excluded.string_key,
       frame_slot = excluded.frame_slot,
       phase = excluded.phase,
       submitted = excluded.submitted,
       updated_at = excluded.updated_at,
       paperwork = excluded.paperwork`,
    [
      next.id,
      next.projectId,
      next.stringKey,
      next.frameSlot,
      next.phase,
      next.submitted ? 1 : 0,
      next.updatedAt,
      JSON.stringify(next),
    ],
  );
  await d.run("DELETE FROM breakers WHERE frame_id = ?", [next.id]);
  if (!breakers.length) return;
  const placeholders = breakers.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const params = breakers.flatMap((b) => [
    b.id, b.projectId, b.frameId, b.stringKey, b.frameSlot, b.hole, b.board, b.position, b.inUse, b.amps,
    b.mccbSerial, b.mlSerial, b.mlModel, b.shuntBatch, b.scannedBy, b.scannedAt,
    b.mccbInstalled, b.flexibarCaps, b.whipTerminated, b.torqueLine, b.torqueLoad, b.mlSet, b.updatedAt,
  ]);
  await d.run(
    `INSERT INTO breakers (
      id, project_id, frame_id, string_key, frame_slot, hole, board, position, in_use, amps,
      mccb_serial, ml_serial, ml_model, shunt_batch, scanned_by, scanned_at,
      mccb_installed, flexibar_caps, whip_terminated, torque_line, torque_load, ml_set, updated_at
    ) VALUES ${placeholders}`,
    params,
  );
}

export async function storeDeleteFrame(id: string): Promise<void> {
  const d = await getDriver();
  await d.run("DELETE FROM breakers WHERE frame_id = ?", [id]);
  await d.run("DELETE FROM faults WHERE frame_id = ?", [id]);
  await d.run("DELETE FROM frames WHERE id = ?", [id]);
}

export async function storeListStrings(projectId: string): Promise<StringRun[]> {
  const d = await getDriver();
  const rows = await d.all("SELECT key, created_at, archived_at FROM strings WHERE project_id = ?", [projectId]);
  return rows.map((r) => ({
    key: str(r.key),
    createdAt: str(r.created_at),
    archivedAt: str(r.archived_at) || undefined,
  }));
}

export async function storePutString(row: StringRecord): Promise<void> {
  const d = await getDriver();
  await d.run(
    `INSERT INTO strings (id, project_id, key, created_at, archived_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET archived_at = excluded.archived_at, created_at = excluded.created_at`,
    [row.id, row.projectId, row.key, row.createdAt, row.archivedAt || null],
  );
}

export async function storeDeleteString(projectId: string, key: string): Promise<void> {
  const d = await getDriver();
  const frames = await storeListFrames(projectId);
  const ids = frames.filter((f) => (f.stringKey || "1") === key).map((f) => f.id);
  for (const id of ids) await storeDeleteFrame(id);
  await d.run("DELETE FROM strings WHERE project_id = ? AND key = ?", [projectId, key]);
}

export async function storeFindFrameBySlot(
  projectId: string,
  stringKey: string,
  frameSlot: string,
): Promise<Frame | undefined> {
  const d = await getDriver();
  const row = await d.get(
    "SELECT * FROM frames WHERE project_id = ? AND string_key = ? AND frame_slot = ?",
    [projectId, stringKey, frameSlot],
  );
  if (!row) return undefined;
  return hydrateFromDb(d, paperworkFrame(row));
}

export async function storeListInstallers(): Promise<Installer[]> {
  const d = await getDriver();
  const people = await d.all("SELECT initials, name FROM installers");
  const breakers = await d.all("SELECT scanned_by FROM breakers");
  const used = new Map<string, number>();
  for (const b of breakers) {
    const key = str(b.scanned_by).trim().toUpperCase();
    if (key) used.set(key, (used.get(key) || 0) + 1);
  }
  return people
    .map((p) => ({ initials: str(p.initials), name: str(p.name) }))
    .sort(
      (a, b) => (used.get(b.initials) || 0) - (used.get(a.initials) || 0) || a.initials.localeCompare(b.initials),
    );
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
      old_mccb, old_ml, old_ml_model, old_shunt, reason, raised_by, raised_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET reason = excluded.reason`,
    [
      fault.id, fault.projectId, fault.frameId, fault.stringKey, fault.frameSlot, fault.hole, fault.kind,
      fault.oldMccb, fault.oldMl, fault.oldMlModel, fault.oldShunt, fault.reason, fault.raisedBy, fault.raisedAt,
    ],
  );
}

export async function storeListFaults(projectId: string): Promise<Fault[]> {
  const d = await getDriver();
  const rows = await d.all(
    "SELECT * FROM faults WHERE project_id = ? ORDER BY raised_at DESC",
    [projectId],
  );
  return rows.map((r) => ({
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
  }));
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
  for (const p of dump.projects || []) {
    const d = await getDriver();
    await d.run(
      `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
      [p.id, p.name, p.createdAt],
    );
  }
  for (const s of dump.strings || []) await storePutString(s);
  for (const f of dump.frames || []) await storeSaveFrame(f);
  for (const f of dump.faults || []) await storeAddFault(f);
  for (const i of dump.installers || []) await storeSaveInstaller(i);
}
