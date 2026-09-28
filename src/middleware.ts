import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/session";

const PUBLIC = new Set(["/login", "/register"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userId = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId && !PUBLIC.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (userId && (PUBLIC.has(pathname) || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api).*)"],
};
