import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { CATEGORY_ORDER, type Place, type PlaceCategory } from "./places";

export type PlaceInput = {
  name: string;
  nameEn?: string;
  category: PlaceCategory;
  lng: number;
  lat: number;
  description?: string;
};

/** يتحقّق من جسم الطلب ويعيد مدخلًا صالحًا أو null. */
export function parsePlaceInput(body: unknown): PlaceInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const category = b.category as PlaceCategory;
  const lng = Number(b.lng);
  const lat = Number(b.lat);
  if (!name) return null;
  if (!CATEGORY_ORDER.includes(category)) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  return {
    name,
    nameEn: typeof b.nameEn === "string" ? b.nameEn.trim() : "",
    category,
    lng,
    lat,
    description: typeof b.description === "string" ? b.description.trim() : "",
  };
}

type Row = Record<string, unknown>;

function rowToPlace(row: Row): Place {
  return {
    id: String(row.id),
    name: String(row.name),
    nameEn: String(row.name_en ?? ""),
    category: String(row.category) as PlaceCategory,
    lng: Number(row.lng),
    lat: Number(row.lat),
    description: String(row.description ?? ""),
  };
}

export async function listPlaces(): Promise<Place[]> {
  const db = await getDb();
  const res = await db.execute(
    "SELECT * FROM places ORDER BY created_at ASC, name ASC",
  );
  return res.rows.map((r) => rowToPlace(r as Row));
}

export async function getPlace(id: string): Promise<Place | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM places WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? rowToPlace(res.rows[0] as Row) : null;
}

export async function createPlace(input: PlaceInput): Promise<Place> {
  const db = await getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO places (id, name, name_en, category, lng, lat, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.nameEn ?? "",
      input.category,
      input.lng,
      input.lat,
      input.description ?? "",
    ],
  });
  return {
    id,
    name: input.name,
    nameEn: input.nameEn ?? "",
    category: input.category,
    lng: input.lng,
    lat: input.lat,
    description: input.description ?? "",
  };
}

export async function updatePlace(
  id: string,
  input: PlaceInput,
): Promise<Place | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: `UPDATE places
          SET name = ?, name_en = ?, category = ?, lng = ?, lat = ?, description = ?
          WHERE id = ?`,
    args: [
      input.name,
      input.nameEn ?? "",
      input.category,
      input.lng,
      input.lat,
      input.description ?? "",
      id,
    ],
  });
  if (res.rowsAffected === 0) return null;
  return getPlace(id);
}

export async function deletePlace(id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.execute({
    sql: "DELETE FROM places WHERE id = ?",
    args: [id],
  });
  return res.rowsAffected > 0;
}
