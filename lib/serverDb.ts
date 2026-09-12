import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Defect, Frame, Installer, Trade } from "./types";
import type { StringRun } from "./db";

/*
 * SERVER-SIDE STORE (SQLite file at <project>/data/mccb.db).
 *
 * The browser still works offline on IndexedDB; every change is also pushed
 * here through POST /api/sync so results are durably stored on disk and
 * shared between any device hitting this machine.
 */

const DB_PATH = path.join(process.cwd(), "data", "mccb.db");

function openDb(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS frames (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS installers (
      initials TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS string_runs (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS defects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

// Survive Next.js dev hot-reload (globalThis cache).
const g = globalThis as { __mccbServerDb?: DatabaseSync };

export function getServerDb(): DatabaseSync {
  if (!g.__mccbServerDb) g.__mccbServerDb = openDb();
  return g.__mccbServerDb;
}

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
  db.prepare("INSERT OR REPLACE INTO frames (id, data, updated_at) VALUES (?, ?, ?)").run(
    frame.id,
    JSON.stringify(frame),
    updatedAt,
  );
}

export function deleteServerFrame(id: string): void {
  getServerDb().prepare("DELETE FROM frames WHERE id = ?").run(id);
}

export function listServerInstallers(): Installer[] {
  const rows = getServerDb().prepare("SELECT data FROM installers").all() as Array<{ data: string }>;
  return rows.map((r) => JSON.parse(r.data) as Installer);
}

export function upsertServerInstaller(installer: Installer): void {
  getServerDb()
    .prepare("INSERT OR REPLACE INTO installers (initials, data) VALUES (?, ?)")
    .run(installer.initials, JSON.stringify(installer));
}

export function listServerStringRuns(): StringRun[] {
  const rows = getServerDb().prepare("SELECT data FROM string_runs").all() as Array<{ data: string }>;
  return rows.map((r) => JSON.parse(r.data) as StringRun);
}

export function upsertServerStringRun(run: StringRun): void {
  const db = getServerDb();
  const row = db.prepare("SELECT data FROM string_runs WHERE key = ?").get(run.key) as
    | { data: string }
    | undefined;
  // Keep the archived copy if the server already archived this string.
  if (row) {
    const existing = JSON.parse(row.data) as StringRun;
    if (existing.archivedAt && !run.archivedAt) return;
  }
  db.prepare("INSERT OR REPLACE INTO string_runs (key, data) VALUES (?, ?)").run(
    run.key,
    JSON.stringify(run),
  );
}

export function deleteServerStringRun(key: string): void {
  const db = getServerDb();
  const rows = db.prepare("SELECT id, data FROM frames").all() as Array<{ id: string; data: string }>;
  for (const row of rows) {
    const frame = JSON.parse(row.data) as Frame;
    if ((frame.stringKey?.trim() || "1") === key.trim()) {
      db.prepare("DELETE FROM frames WHERE id = ?").run(row.id);
    }
  }
  db.prepare("DELETE FROM string_runs WHERE key = ?").run(key.trim());
}

export function listServerTrades(): Trade[] {
  const rows = getServerDb().prepare("SELECT data FROM trades").all() as Array<{ data: string }>;
  return rows.map((r) => JSON.parse(r.data) as Trade);
}

export function upsertServerTrade(trade: Trade): void {
  getServerDb()
    .prepare("INSERT OR REPLACE INTO trades (id, data) VALUES (?, ?)")
    .run(trade.id, JSON.stringify(trade));
}

export function listServerDefects(): Defect[] {
  const rows = getServerDb()
    .prepare("SELECT data FROM defects ORDER BY updated_at DESC")
    .all() as Array<{ data: string }>;
  return rows.map((r) => JSON.parse(r.data) as Defect);
}

export function upsertServerDefect(defect: Defect): void {
  const db = getServerDb();
  const updatedAt = defect.updatedAt || new Date().toISOString();
  const row = db.prepare("SELECT updated_at FROM defects WHERE id = ?").get(defect.id) as
    | { updated_at: string }
    | undefined;
  if (row && (row.updated_at || "") > updatedAt) return;
  db.prepare("INSERT OR REPLACE INTO defects (id, data, updated_at) VALUES (?, ?, ?)").run(
    defect.id,
    JSON.stringify(defect),
    updatedAt,
  );
}
