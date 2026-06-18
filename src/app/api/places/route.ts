import { NextResponse } from "next/server";
import { createPlace, listPlaces, parsePlaceInput } from "@/lib/places-repo";
import { isAdmin } from "@/lib/auth";

// قائمة الأماكن — عامّة (يستخدمها الموقع لعرض النقاط)
export async function GET() {
  const places = await listPlaces();
  return NextResponse.json({ places });
}

// إنشاء مكان جديد — للأدمن فقط
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const input = parsePlaceInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const place = await createPlace(input);
  return NextResponse.json({ place }, { status: 201 });
}
