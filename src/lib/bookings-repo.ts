import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getPlace } from "./places-repo";

export type Booking = {
  id: string;
  placeId: string;
  placeName: string;
  name: string;
  phone: string;
  partySize: number;
  price: number;
  referenceCode: string;
  createdAt: number;
};

export type BookingInput = {
  placeId: string;
  name: string;
  phone: string;
  partySize?: number;
};

export type ParsedBookingInput = {
  placeId: string;
  name: string;
  phone: string;
  partySize: number;
};

/** يتحقّق من جسم طلب الحجز ويعيد مدخلًا صالحًا أو null (بدون التحقق من قابلية الحجز). */
export function parseBookingInput(body: unknown): ParsedBookingInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const placeId = typeof b.placeId === "string" ? b.placeId.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const partySize = Number(b.partySize);
  if (!placeId || !name || !phone) return null;
  return {
    placeId,
    name,
    phone,
    partySize: Number.isFinite(partySize) && partySize > 0 ? Math.floor(partySize) : 1,
  };
}

function generateReferenceCode(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** ينشئ حجزًا جديدًا بعد التحقق من أن المكان موجود وقابل للحجز فعليًا. */
export async function createBooking(
  input: ParsedBookingInput,
): Promise<Booking | { error: "not_found" | "not_bookable" }> {
  const place = await getPlace(input.placeId);
  if (!place) return { error: "not_found" };
  if (!place.bookable) return { error: "not_bookable" };

  const db = await getDb();
  const id = randomUUID();
  const referenceCode = generateReferenceCode();
  const price = place.price ?? 0;
  await db.execute({
    sql: `INSERT INTO bookings (id, place_id, name, phone, party_size, price, reference_code)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.placeId, input.name, input.phone, input.partySize, price, referenceCode],
  });

  return {
    id,
    placeId: input.placeId,
    placeName: place.name,
    name: input.name,
    phone: input.phone,
    partySize: input.partySize,
    price,
    referenceCode,
    createdAt: Date.now(),
  };
}

type Row = Record<string, unknown>;

export async function listBookings(): Promise<Booking[]> {
  const db = await getDb();
  const res = await db.execute(`
    SELECT b.*, p.name AS place_name
    FROM bookings b
    LEFT JOIN places p ON p.id = b.place_id
    ORDER BY b.created_at DESC
  `);
  return res.rows.map((row) => {
    const r = row as Row;
    return {
      id: String(r.id),
      placeId: String(r.place_id),
      placeName: String(r.place_name ?? ""),
      name: String(r.name),
      phone: String(r.phone),
      partySize: Number(r.party_size),
      price: Number(r.price),
      referenceCode: String(r.reference_code),
      createdAt: Number(r.created_at) * 1000,
    };
  });
}
