import { NextResponse } from "next/server";
import { createRoute, listRoutes, parseRouteInput } from "@/lib/transit-repo";
import { isAdmin } from "@/lib/auth";

// قائمة خطوط النقل — عامّة
export async function GET() {
  const routes = await listRoutes();
  return NextResponse.json({ routes });
}

// إنشاء خط نقل جديد — للأدمن فقط
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const input = parseRouteInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const route = await createRoute(input);
  return NextResponse.json({ route }, { status: 201 });
}
