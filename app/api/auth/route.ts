import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  SESSION_DAYS,
  gateEnabled,
  issueCookieValue,
  passcodeMatches,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ locked: gateEnabled() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { passcode?: string; action?: string };

  if (body.action === "signOut") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  if (!gateEnabled()) {
    return NextResponse.json({ ok: false, error: "no passcode configured" }, { status: 400 });
  }

  if (!(await passcodeMatches(String(body.passcode ?? "")))) {
    // Slows down guessing a short shared passcode without troubling a person
    // who simply mistyped it.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ ok: false, error: "wrong passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, await issueCookieValue(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
