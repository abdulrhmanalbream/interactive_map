import { NextResponse } from "next/server";
import { deletePlace, parsePlaceInput, updatePlace } from "@/lib/places-repo";
import { isAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// تعديل مكان — للأدمن فقط
export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const input = parsePlaceInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const place = await updatePlace(id, input);
  if (!place) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ place });
}

// حذف مكان — للأدمن فقط
export async function DELETE(_request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deletePlace(id);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
