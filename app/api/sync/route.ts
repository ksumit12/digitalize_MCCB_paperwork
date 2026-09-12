import { NextRequest, NextResponse } from "next/server";
import {
  deleteServerFrame,
  deleteServerStringRun,
  listServerDefects,
  listServerFrames,
  listServerInstallers,
  listServerStock,
  listServerStringRuns,
  listServerTrades,
  upsertServerDefect,
  upsertServerFrame,
  upsertServerInstaller,
  upsertServerStock,
  upsertServerStringRun,
  upsertServerTrade,
} from "@/lib/serverDb";
import type { SyncDelta } from "@/lib/serverSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full snapshot — used by browsers to merge server data into their local IndexedDB.
export async function GET() {
  return NextResponse.json({
    frames: listServerFrames(),
    installers: listServerInstallers(),
    stringRuns: listServerStringRuns(),
    trades: listServerTrades(),
    defects: listServerDefects(),
    stock: listServerStock(),
  });
}

// Apply one change — called after every local save so results land in the SQLite file.
export async function POST(req: NextRequest) {
  let body: SyncDelta;
  try {
    body = (await req.json()) as SyncDelta;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  switch (body.op) {
    case "frame":
      upsertServerFrame(body.frame);
      break;
    case "deleteFrame":
      deleteServerFrame(body.id);
      break;
    case "installer":
      upsertServerInstaller(body.installer);
      break;
    case "stringRun":
      upsertServerStringRun(body.run);
      break;
    case "deleteStringRun":
      deleteServerStringRun(body.key);
      break;
    case "trade":
      upsertServerTrade(body.trade);
      break;
    case "defect":
      upsertServerDefect(body.defect);
      break;
    case "stock":
      upsertServerStock(body.stock);
      break;
    default:
      return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
