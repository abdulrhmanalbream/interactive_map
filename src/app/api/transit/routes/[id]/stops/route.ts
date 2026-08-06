import { NextResponse } from "next/server";
import { getRouteStopIds, setRouteStops } from "@/lib/transit-repo";
import { isAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// قائمة معرّفات محطات الخط بالترتيب — عامّة
export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const stopIds = await getRouteStopIds(id);
  return NextResponse.json({ stopIds });
}

// استبدال قائمة محطات الخط بالكامل — للأدمن فقط
export async function PUT(request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const stopIds = Array.isArray((body as { stopIds?: unknown })?.stopIds)
    ? ((body as { stopIds: unknown[] }).stopIds.filter(
        (s) => typeof s === "string",
      ) as string[])
    : null;
  if (!stopIds) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  await setRouteStops(id, stopIds);
  return NextResponse.json({ ok: true });
}
