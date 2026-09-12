import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { isUsed, serialsComplete } from "./breaker";
import type { Defect, Frame, Installer, StockEntry, Trade } from "./types";
import type { StringRun } from "./db";

/*
 * SERVER-SIDE STORE (SQLite file at <project>/data/mccb.db) — RELATIONAL.
 *
 * The browser model is the frame object; the database is real tables so the
 * office can ask SQL directly:
 *
 *   strings   — key, trade, archived
 *   frames    — id, string, slot, phase, submitted, ids, dates (JSON kept in
 *               `data` only as a round-trip copy for the sync protocol)
 *   breakers  — one row per hole (A1..D8): serials, amps, Micrologic set,
 *               torque, tasks
 *   serials   — every serial (active and replaced) for lookup
 *   defects   — one row per fault
 *   trades / installers — people and teams
 */

const DB_PATH = path.join(process.cwd(), "data", "mccb.db");

const NEW_SCHEMA = `
  CREATE TABLE IF NOT EXISTS strings (
    key TEXT PRIMARY KEY,
    trade_id TEXT,
    trade_name TEXT,
    created_at TEXT,
    archived_at TEXT
  );
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS installers (
    initials TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    string_key TEXT NOT NULL,
    frame_slot TEXT,
    phase TEXT,
    submitted INTEGER NOT NULL DEFAULT 0,
    paper_import INTEGER NOT NULL DEFAULT 0,
    manufacturer TEXT,
    market TEXT,
    trade_name TEXT,
    installer_initials TEXT,
    installer_name TEXT,
    tester_initials TEXT,
    tester_name TEXT,
    shepherd_frame_id TEXT,
    actsw_frame_id TEXT,
    module_serial TEXT,
    start_date TEXT,
    finish_date TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_frames_string ON frames(string_key);
  CREATE INDEX IF NOT EXISTS idx_frames_updated ON frames(updated_at);
  CREATE TABLE IF NOT EXISTS breakers (
    frame_id TEXT NOT NULL,
    string_key TEXT,
    frame_slot TEXT,
    slot TEXT NOT NULL,
    position INTEGER NOT NULL,
    amps INTEGER,
    mccb_serial TEXT,
    ml_serial TEXT,
    shunt_batch TEXT,
    micrologic_set INTEGER NOT NULL DEFAULT 0,
    torque_line INTEGER NOT NULL DEFAULT 0,
    torque_load INTEGER NOT NULL DEFAULT 0,
    mccb_installed INTEGER NOT NULL DEFAULT 0,
    flexibar_caps INTEGER NOT NULL DEFAULT 0,
    whip_terminated INTEGER NOT NULL DEFAULT 0,
    serials_complete INTEGER NOT NULL DEFAULT 0,
    captured_by TEXT,
    captured_at TEXT,
    installed_by TEXT,
    installed_at TEXT,
    PRIMARY KEY (frame_id, slot)
  );
  CREATE INDEX IF NOT EXISTS idx_breakers_string ON breakers(string_key);
  CREATE TABLE IF NOT EXISTS serials (
    serial TEXT NOT NULL,
    kind TEXT NOT NULL,
    frame_id TEXT NOT NULL,
    string_key TEXT,
    frame_slot TEXT,
    slot TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (serial, frame_id, slot)
  );
  CREATE INDEX IF NOT EXISTS idx_serials_lookup ON serials(serial, active);
  CREATE TABLE IF NOT EXISTS defects (
    id TEXT PRIMARY KEY,
    string_key TEXT,
    frame_slot TEXT,
    slot TEXT,
    part TEXT,
    serial TEXT,
    description TEXT,
    raised_by TEXT,
    raised_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_by TEXT,
    resolved_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_defects_status ON defects(status);
  CREATE INDEX IF NOT EXISTS idx_defects_string ON defects(string_key);
  CREATE TABLE IF NOT EXISTS stock (
    id TEXT PRIMARY KEY,
    part TEXT NOT NULL,
    per_box INTEGER NOT NULL,
    boxes INTEGER NOT NULL,
    received_by TEXT,
    received_at TEXT,
    note TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_stock_part ON stock(part);
`;

function tableExists(db: DatabaseSync, name: string): boolean {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) != null
  );
}

function ensureColumn(db: DatabaseSync, table: string, column: string, decl: string): void {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

function legacyRows(db: DatabaseSync, table: string): Record<string, unknown>[] {
  if (!tableExists(db, table)) return [];
  return db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
}

function openDb(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // One-time migration from the old JSON-blob schema to relational tables.
  if (!tableExists(db, "breakers")) {
    const oldFrames = legacyRows(db, "frames");
    const oldInstallers = legacyRows(db, "installers");
    const oldStringRuns = legacyRows(db, "string_runs");
    const oldTrades = legacyRows(db, "trades");
    const oldDefects = legacyRows(db, "defects");

    db.exec(`
      DROP TABLE IF EXISTS frames;
      DROP TABLE IF EXISTS installers;
      DROP TABLE IF EXISTS string_runs;
      DROP TABLE IF EXISTS defects;
      DROP TABLE IF EXISTS trades;
      DROP TABLE IF EXISTS serials;
      ${NEW_SCHEMA}
    `);

    for (const row of oldFrames) {
      try {
        const frame = JSON.parse(String(row.data)) as Frame;
        insertFrame(db, frame);
      } catch {
        /* skip unreadable rows */
      }
    }
    for (const row of oldInstallers) {
      try {
        const i = JSON.parse(String(row.data)) as Installer;
        upsertInstallerRow(db, i);
      } catch {
        /* skip */
      }
    }
    for (const row of oldStringRuns) {
      try {
        const run = JSON.parse(String(row.data)) as StringRun;
        upsertStringRow(db, run);
      } catch {
        /* skip */
      }
    }
    for (const row of oldTrades) {
      try {
        const t = JSON.parse(String(row.data)) as Trade;
        upsertTradeRow(db, t);
      } catch {
        /* skip */
      }
    }
    for (const row of oldDefects) {
      try {
        const d = JSON.parse(String(row.data)) as Defect;
        upsertDefectRow(db, d);
      } catch {
        /* skip */
      }
    }
  } else {
    // Idempotent on a new relational DB.
    db.exec(NEW_SCHEMA);
  }

  // Mid-development databases may already have breakers without the newer columns.
  ensureColumn(db, "breakers", "captured_by", "TEXT");
  ensureColumn(db, "breakers", "captured_at", "TEXT");
  ensureColumn(db, "breakers", "installed_by", "TEXT");
  ensureColumn(db, "breakers", "installed_at", "TEXT");

  return db;
}

// Survive Next.js dev hot-reload (globalThis cache).
const g = globalThis as { __mccbServerDb?: DatabaseSync };

export function getServerDb(): DatabaseSync {
  if (!g.__mccbServerDb) g.__mccbServerDb = openDb();
  return g.__mccbServerDb;
}

function insertFrame(db: DatabaseSync, frame: Frame): void {
  const updatedAt = frame.updatedAt || new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO frames (
      id, data, string_key, frame_slot, phase, submitted, paper_import,
      manufacturer, market, trade_name, installer_initials, installer_name,
      tester_initials, tester_name, shepherd_frame_id, actsw_frame_id,
      module_serial, start_date, finish_date, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    frame.id,
    JSON.stringify(frame),
    frame.stringKey?.trim() || "1",
    frame.frameSlot || frame.stringId || "",
    frame.phase,
    frame.submitted ? 1 : 0,
    frame.paperImport ? 1 : 0,
    frame.manufacturer || "",
    frame.market || "",
    frame.tradeName || "",
    frame.installerInitials || "",
    frame.installerName || "",
    frame.testerInitials || "",
    frame.testerName || "",
    frame.shepherdFrameId || "",
    frame.actswFrameId || "",
    frame.moduleFrameSerialNumber || "",
    frame.startDate || "",
    frame.finishDate || "",
    updatedAt,
    frame.createdAt || updatedAt,
  );
  indexFrame(db, frame);
}

/** One row per hole (A1..D8) + serial index, rebuilt on every save. */
function indexFrame(db: DatabaseSync, frame: Frame): void {
  db.prepare("DELETE FROM breakers WHERE frame_id = ?").run(frame.id);
  db.prepare("DELETE FROM serials WHERE frame_id = ?").run(frame.id);

  const insBreaker = db.prepare(
    `INSERT OR REPLACE INTO breakers (
      frame_id, string_key, frame_slot, slot, position, amps,
      mccb_serial, ml_serial, shunt_batch, micrologic_set, torque_line,
      torque_load, mccb_installed, flexibar_caps, whip_terminated, serials_complete,
      captured_by, captured_at, installed_by, installed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insSerial = db.prepare(
    "INSERT OR REPLACE INTO serials (serial, kind, frame_id, string_key, frame_slot, slot, active) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const stringKey = frame.stringKey?.trim() || "1";
  const frameSlot = frame.frameSlot || frame.stringId || "";

  for (const c of frame.cbsds ?? []) {
    for (const b of c.breakerPositions ?? []) {
      const slot = `${c.label}${b.position}`;
      const used = isUsed(b);
      insBreaker.run(
        frame.id,
        stringKey,
        frameSlot,
        slot,
        b.position,
        b.micrologicSettingAmps || null,
        b.mccbSerialNumber.trim() || null,
        b.microLogicSerialNumber.trim() || null,
        b.shuntTripBatchNumber.trim() || null,
        b.micrologicSettingConfirmed ? 1 : 0,
        b.torqueLineSideConfirmed ? 1 : 0,
        b.torqueLoadSideConfirmed ? 1 : 0,
        b.mccbInstalled ? 1 : 0,
        b.flexibarCapsRemoved ? 1 : 0,
        b.whipTerminated ? 1 : 0,
        used && serialsComplete(b) ? 1 : 0,
        b.serialCapturedBy || null,
        b.serialCapturedAt || null,
        b.installedBy || null,
        b.installedAt || null,
      );
      if (!used) continue;
      const current: Array<[string, string]> = [
        [b.mccbSerialNumber, "mccb"],
        [b.microLogicSerialNumber, "ml"],
        [b.shuntTripBatchNumber, "shunt"],
      ];
      for (const [serial, kind] of current) {
        const s = (serial || "").trim().toUpperCase();
        if (s) insSerial.run(s, kind, frame.id, stringKey, frameSlot, slot, 1);
      }
      for (const r of b.serialHistory ?? []) {
        const old = (r.oldSerial || "").trim().toUpperCase();
        if (old) insSerial.run(old, r.kind, frame.id, stringKey, frameSlot, slot, 0);
      }
    }
  }
}

// --- frames ---

export function listServerFrames(): Frame[] {
  const rows = getServerDb()
    .prepare("SELECT data FROM frames ORDER BY updated_at DESC")
    .all() as Array<{ data: string }>;
  return rows.map((r) => JSON.parse(r.data) as Frame);
}

export function upsertServerFrame(frame: Frame): void {
  const db = getServerDb();
  const row = db.prepare("SELECT updated_at FROM frames WHERE id = ?").get(frame.id) as
    | { updated_at: string }
    | undefined;
  const updatedAt = frame.updatedAt || new Date().toISOString();
  if (row && (row.updated_at || "") > updatedAt) return; // keep newer server copy
  insertFrame(db, frame);
}

export function deleteServerFrame(id: string): void {
  const db = getServerDb();
  db.prepare("DELETE FROM frames WHERE id = ?").run(id);
  db.prepare("DELETE FROM breakers WHERE frame_id = ?").run(id);
  db.prepare("DELETE FROM serials WHERE frame_id = ?").run(id);
}

// --- installers ---

function upsertInstallerRow(db: DatabaseSync, installer: Installer): void {
  db.prepare("INSERT OR REPLACE INTO installers (initials, name) VALUES (?, ?)").run(
    installer.initials,
    installer.name,
  );
}

export function listServerInstallers(): Installer[] {
  const rows = getServerDb()
    .prepare("SELECT initials, name FROM installers ORDER BY initials")
    .all() as Array<{ initials: string; name: string }>;
  return rows.map((r) => ({ initials: r.initials, name: r.name }));
}

export function upsertServerInstaller(installer: Installer): void {
  upsertInstallerRow(getServerDb(), installer);
}

// --- trades ---

function upsertTradeRow(db: DatabaseSync, trade: Trade): void {
  db.prepare("INSERT OR REPLACE INTO trades (id, name, created_at) VALUES (?, ?, ?)").run(
    trade.id,
    trade.name,
    trade.createdAt || new Date().toISOString(),
  );
}

export function listServerTrades(): Trade[] {
  const rows = getServerDb()
    .prepare("SELECT id, name, created_at FROM trades ORDER BY name")
    .all() as Array<{ id: string; name: string; created_at: string }>;
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

export function upsertServerTrade(trade: Trade): void {
  upsertTradeRow(getServerDb(), trade);
}

// --- strings ---

function upsertStringRow(db: DatabaseSync, run: StringRun): void {
  const row = db.prepare("SELECT archived_at FROM strings WHERE key = ?").get(run.key) as
    | { archived_at: string | null }
    | undefined;
  if (row?.archived_at && !run.archivedAt) return; // keep the archived copy
  db.prepare(
    "INSERT OR REPLACE INTO strings (key, trade_id, trade_name, created_at, archived_at) VALUES (?, ?, ?, ?, ?)",
  ).run(run.key, run.tradeId || "", run.tradeName || "", run.createdAt || new Date().toISOString(), run.archivedAt || null);
}

export function listServerStringRuns(): StringRun[] {
  const rows = getServerDb()
    .prepare("SELECT key, trade_id, trade_name, created_at, archived_at FROM strings")
    .all() as Array<{
    key: string;
    trade_id: string;
    trade_name: string;
    created_at: string;
    archived_at: string | null;
  }>;
  return rows.map((r) => ({
    key: r.key,
    tradeId: r.trade_id || "",
    tradeName: r.trade_name || "",
    createdAt: r.created_at,
    archivedAt: r.archived_at ?? undefined,
  }));
}

export function upsertServerStringRun(run: StringRun): void {
  upsertStringRow(getServerDb(), run);
}

export function deleteServerStringRun(key: string): void {
  const db = getServerDb();
  const ids = db
    .prepare("SELECT id FROM frames WHERE string_key = ?")
    .all(key.trim()) as Array<{ id: string }>;
  for (const { id } of ids) {
    db.prepare("DELETE FROM breakers WHERE frame_id = ?").run(id);
    db.prepare("DELETE FROM serials WHERE frame_id = ?").run(id);
    db.prepare("DELETE FROM frames WHERE id = ?").run(id);
  }
  db.prepare("DELETE FROM strings WHERE key = ?").run(key.trim());
}

// --- defects ---

function upsertDefectRow(db: DatabaseSync, defect: Defect): void {
  const updatedAt = defect.updatedAt || new Date().toISOString();
  const row = db.prepare("SELECT updated_at FROM defects WHERE id = ?").get(defect.id) as
    | { updated_at: string }
    | undefined;
  if (row && (row.updated_at || "") > updatedAt) return;
  db.prepare(
    `INSERT OR REPLACE INTO defects (
      id, string_key, frame_slot, slot, part, serial, description,
      raised_by, raised_at, status, resolved_by, resolved_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    defect.id,
    defect.stringKey,
    defect.frameSlot || null,
    defect.slot || null,
    defect.part,
    defect.serial || null,
    defect.description,
    defect.raisedBy,
    defect.raisedAt,
    defect.status,
    defect.resolvedBy || null,
    defect.resolvedAt || null,
    updatedAt,
  );
}

export function listServerDefects(): Defect[] {
  const rows = getServerDb()
    .prepare(
      `SELECT id, string_key, frame_slot, slot, part, serial, description,
              raised_by, raised_at, status, resolved_by, resolved_at, updated_at
       FROM defects ORDER BY updated_at DESC`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    stringKey: String(r.string_key ?? ""),
    frameSlot: (r.frame_slot as string) || undefined,
    slot: (r.slot as string) || undefined,
    part: String(r.part ?? ""),
    serial: (r.serial as string) || undefined,
    description: String(r.description ?? ""),
    raisedBy: String(r.raised_by ?? ""),
    raisedAt: String(r.raised_at ?? ""),
    status: String(r.status ?? "open") as Defect["status"],
    resolvedBy: (r.resolved_by as string) || undefined,
    resolvedAt: (r.resolved_at as string) || undefined,
    updatedAt: String(r.updated_at ?? ""),
  }));
}

export function upsertServerDefect(defect: Defect): void {
  upsertDefectRow(getServerDb(), defect);
}

// --- serial lookup (used by /api/search) ---

export function searchServerSerials(query: string): Array<Record<string, unknown>> {
  const q = query.trim().toUpperCase().replace(/\s+/g, "");
  if (q.length < 3) return [];
  return getServerDb()
    .prepare(
      `SELECT serial, kind, string_key, frame_slot, slot, active
       FROM serials WHERE serial LIKE ? ORDER BY active DESC, serial`,
    )
    .all(`%${q}%`) as Array<Record<string, unknown>>;
}

// --- stock ---

export function listServerStock(): StockEntry[] {
  const rows = getServerDb()
    .prepare(
      "SELECT id, part, per_box, boxes, received_by, received_at, note FROM stock ORDER BY received_at DESC",
    )
    .all() as Array<{
    id: string;
    part: string;
    per_box: number;
    boxes: number;
    received_by: string | null;
    received_at: string | null;
    note: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    part: r.part as StockEntry["part"],
    perBox: r.per_box,
    boxes: r.boxes,
    receivedBy: r.received_by ?? "",
    receivedAt: r.received_at ?? "",
    note: r.note ?? undefined,
  }));
}

export function upsertServerStock(entry: StockEntry): void {
  getServerDb()
    .prepare(
      "INSERT OR REPLACE INTO stock (id, part, per_box, boxes, received_by, received_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(entry.id, entry.part, entry.perBox, entry.boxes, entry.receivedBy, entry.receivedAt, entry.note ?? null);
}
