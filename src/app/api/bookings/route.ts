import { NextResponse } from "next/server";
import { createBooking, listBookings, parseBookingInput } from "@/lib/bookings-repo";
import { isAdmin } from "@/lib/auth";

// قائمة الحجوزات — للأدمن فقط
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const bookings = await listBookings();
  return NextResponse.json({ bookings });
}

// إنشاء حجز جديد — عامّ (لا حساب مستخدم في هذا النظام)
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const input = parseBookingInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const result = await createBooking(input);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ booking: result }, { status: 201 });
}
