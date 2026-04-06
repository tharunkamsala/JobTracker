import { NextResponse } from "next/server";

const COOKIE = "job_tracker_access";

export function middleware(request) {
  const access = process.env.SITE_ACCESS_TOKEN;
  if (!access) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth/login")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie === access) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("from", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|svg|gif|webp)$).*)",
  ],
};
