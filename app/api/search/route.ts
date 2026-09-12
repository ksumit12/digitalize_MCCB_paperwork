import { NextRequest, NextResponse } from "next/server";
import { searchServerSerials } from "@/lib/serverDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Office/plain-SQL-friendly lookup: GET /api/search?q=WX2619
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ hits: searchServerSerials(q) });
}
