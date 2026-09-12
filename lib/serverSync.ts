import type { Defect, Frame, Installer, StockEntry, Trade } from "./types";
import type { StringRun } from "./db";

/*
 * Keeps the browser's IndexedDB and the server's SQLite file in step.
 * Push: after every local change (see lib/db.ts).
 * Pull: on the home screen load — merges server rows into this browser and
 * pushes anything this browser has that the server doesn't yet.
 */

export type SyncDelta =
  | { op: "frame"; frame: Frame }
  | { op: "deleteFrame"; id: string }
  | { op: "installer"; installer: Installer }
  | { op: "stringRun"; run: StringRun }
  | { op: "deleteStringRun"; key: string }
  | { op: "trade"; trade: Trade }
  | { op: "defect"; defect: Defect }
  | { op: "stock"; stock: StockEntry };

export async function pushSync(delta: SyncDelta): Promise<void> {
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(delta),
      keepalive: true,
    });
    if (!res.ok) console.warn("sync push failed", res.status);
  } catch (e) {
    console.warn("sync push failed (server offline?)", e);
  }
}

export async function pullAndMerge(): Promise<void> {
  let data: {
    frames: Frame[];
    installers: Installer[];
    stringRuns: StringRun[];
    trades: Trade[];
    defects: Defect[];
    stock: StockEntry[];
  };
  try {
    const res = await fetch("/api/sync", { cache: "no-store" });
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return; // server offline — keep working locally
  }

  const { db, withFrameDefaults } = await import("./db");

  // Frames — newest updatedAt wins either way.
  const localFrames = (await db.frames.toArray()).map(withFrameDefaults);
  const localById = new Map(localFrames.map((f) => [f.id, f]));
  const serverIds = new Set(data.frames.map((f) => f.id));

  for (const sf of data.frames) {
    const lf = localById.get(sf.id);
    if (!lf) {
      await db.frames.put(withFrameDefaults(sf));
    } else if ((sf.updatedAt || "") > (lf.updatedAt || "")) {
      await db.frames.put(withFrameDefaults(sf));
    } else if ((lf.updatedAt || "") > (sf.updatedAt || "")) {
      await pushSync({ op: "frame", frame: lf });
    }
  }
  for (const lf of localFrames) {
    if (!serverIds.has(lf.id)) await pushSync({ op: "frame", frame: lf });
  }

  // Installers — union of both sides.
  const localInstallers = await db.installers.toArray();
  const serverInstallers = new Set(data.installers.map((i) => i.initials));
  for (const si of data.installers) {
    const li = localInstallers.find((i) => i.initials === si.initials);
    if (!li) await db.installers.put(si);
  }
  for (const li of localInstallers) {
    if (!serverInstallers.has(li.initials)) await pushSync({ op: "installer", installer: li });
  }

  // String runs — union; an archived server copy wins over an active local one.
  for (const sr of data.stringRuns) {
    const existing = await db.stringRuns.get(sr.key);
    if (!existing || (sr.archivedAt && !existing.archivedAt)) await db.stringRuns.put(sr);
  }
  const serverRunKeys = new Set(data.stringRuns.map((r) => r.key));
  for (const lr of await db.stringRuns.toArray()) {
    if (!serverRunKeys.has(lr.key)) await pushSync({ op: "stringRun", run: lr });
  }

  // Trades — union of both sides.
  const localTrades = await db.trades.toArray();
  const serverTradeIds = new Set(data.trades.map((t) => t.id));
  for (const st of data.trades) {
    if (!localTrades.some((t) => t.id === st.id)) await db.trades.put(st);
  }
  for (const lt of localTrades) {
    if (!serverTradeIds.has(lt.id)) await pushSync({ op: "trade", trade: lt });
  }

  // Defects — newest updatedAt wins either way.
  const localDefects = await db.defects.toArray();
  const localDefectById = new Map(localDefects.map((d) => [d.id, d]));
  const serverDefectIds = new Set(data.defects.map((d) => d.id));
  for (const sd of data.defects) {
    const ld = localDefectById.get(sd.id);
    if (!ld) {
      await db.defects.put(sd);
    } else if ((sd.updatedAt || "") > (ld.updatedAt || "")) {
      await db.defects.put(sd);
    } else if ((ld.updatedAt || "") > (sd.updatedAt || "")) {
      await pushSync({ op: "defect", defect: ld });
    }
  }
  for (const ld of localDefects) {
    if (!serverDefectIds.has(ld.id)) await pushSync({ op: "defect", defect: ld });
  }

  // Stock entries — union of both sides.
  const localStock = await db.stock.toArray();
  const serverStockIds = new Set(data.stock.map((s) => s.id));
  for (const ss of data.stock) {
    if (!localStock.some((s) => s.id === ss.id)) await db.stock.put(ss);
  }
  for (const ls of localStock) {
    if (!serverStockIds.has(ls.id)) await pushSync({ op: "stock", stock: ls });
  }
}
