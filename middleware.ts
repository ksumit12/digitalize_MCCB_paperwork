import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, cookieValueIsValid, gateEnabled } from "@/lib/auth";

export const config = {
  // Everything except the login screen, the endpoint that grants access, and
  // static assets. /api/data is the one that matters: it is the database.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webmanifest)$).*)"],
};

export async function middleware(req: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();
  if (await cookieValueIsValid(req.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();

  // The client can tell a locked door from a dead network and stop retrying.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  const back = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (back && back !== "/") login.searchParams.set("next", back);
  return NextResponse.redirect(login);
}
