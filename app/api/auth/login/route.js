import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE = "job_tracker_access";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(req) {
  const token = process.env.SITE_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "SITE_ACCESS_TOKEN is not configured" }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submitted = typeof body?.token === "string" ? body.token.trim() : "";
  if (submitted !== token) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}
