import { NextResponse } from "next/server";
import { setAdminCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password =
    body && typeof body.password === "string" ? body.password : "";

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
