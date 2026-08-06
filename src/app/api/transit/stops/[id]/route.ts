import { NextResponse } from "next/server";
import { deleteStop, parseStopInput, updateStop } from "@/lib/transit-repo";
import { isAdmin } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// تعديل محطة — للأدمن فقط
export async function PATCH(request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const input = parseStopInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const stop = await updateStop(id, input);
  if (!stop) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ stop });
}

// حذف محطة — للأدمن فقط
export async function DELETE(_request: Request, { params }: Ctx) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteStop(id);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
