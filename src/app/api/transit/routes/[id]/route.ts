import { NextResponse } from "next/server";
import { deleteRoute, parseRouteInput, updateRoute } from "@/lib/transit-repo";
import { isAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// تعديل خط نقل — للأدمن فقط
export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const input = parseRouteInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const route = await updateRoute(id, input);
  if (!route) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ route });
}

// حذف خط نقل — للأدمن فقط
export async function DELETE(_request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteRoute(id);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
