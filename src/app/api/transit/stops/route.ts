import { NextResponse } from "next/server";
import { createStop, listStopsWithRoutes, parseStopInput } from "@/lib/transit-repo";
import { isAdmin } from "@/lib/auth";

// قائمة محطات النقل مع معرّفات خطوطها — عامّة
export async function GET() {
  const stops = await listStopsWithRoutes();
  return NextResponse.json({ stops });
}

// إنشاء محطة جديدة — للأدمن فقط
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const input = parseStopInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const stop = await createStop(input);
  return NextResponse.json({ stop }, { status: 201 });
}
