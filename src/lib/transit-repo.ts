import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { TransitRoute, TransitStop } from "./transit";

export type RouteInput = {
  name: string;
  nameEn?: string;
  color: string;
  description?: string;
  path: [number, number][];
  scheduleStart?: string;
  scheduleEnd?: string;
  frequencyMinutes?: number;
  fixedTimes?: string[];
};

export type StopInput = {
  name: string;
  nameEn?: string;
  lng: number;
  lat: number;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

function parseFixedTimes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => validTime(v));
}

function validPath(path: unknown): path is [number, number][] {
  if (!Array.isArray(path) || path.length < 2) return false;
  return path.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      Number.isFinite(Number(p[0])) &&
      Number.isFinite(Number(p[1])) &&
      Number(p[0]) >= -180 &&
      Number(p[0]) <= 180 &&
      Number(p[1]) >= -90 &&
      Number(p[1]) <= 90,
  );
}

/** يتحقّق من جسم طلب خط النقل ويعيد مدخلًا صالحًا أو null. */
export function parseRouteInput(body: unknown): RouteInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const color = typeof b.color === "string" ? b.color.trim() : "";
  if (!name) return null;
  if (!HEX_RE.test(color)) return null;
  if (!validPath(b.path)) return null;
  const frequencyNum = Number(b.frequencyMinutes);
  return {
    name,
    nameEn: typeof b.nameEn === "string" ? b.nameEn.trim() : "",
    color,
    description: typeof b.description === "string" ? b.description.trim() : "",
    path: (b.path as unknown[]).map((p) => {
      const pair = p as [unknown, unknown];
      return [Number(pair[0]), Number(pair[1])] as [number, number];
    }),
    scheduleStart: validTime(b.scheduleStart) ? b.scheduleStart : "",
    scheduleEnd: validTime(b.scheduleEnd) ? b.scheduleEnd : "",
    frequencyMinutes:
      Number.isFinite(frequencyNum) && frequencyNum > 0
        ? Math.floor(frequencyNum)
        : 0,
    fixedTimes: parseFixedTimes(b.fixedTimes),
  };
}

/** يتحقّق من جسم طلب محطة النقل ويعيد مدخلًا صالحًا أو null. */
export function parseStopInput(body: unknown): StopInput | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const lng = Number(b.lng);
  const lat = Number(b.lat);
  if (!name) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  return {
    name,
    nameEn: typeof b.nameEn === "string" ? b.nameEn.trim() : "",
    lng,
    lat,
  };
}

type Row = Record<string, unknown>;

function rowToRoute(row: Row, stopIds: string[] = []): TransitRoute {
  let path: [number, number][] = [];
  try {
    path = JSON.parse(String(row.path)) as [number, number][];
  } catch {
    path = [];
  }
  let fixedTimes: string[] = [];
  try {
    fixedTimes = JSON.parse(String(row.fixed_times ?? "[]")) as string[];
  } catch {
    fixedTimes = [];
  }
  return {
    id: String(row.id),
    name: String(row.name),
    nameEn: String(row.name_en ?? ""),
    color: String(row.color),
    description: String(row.description ?? ""),
    path,
    stopIds,
    scheduleStart: String(row.schedule_start ?? ""),
    scheduleEnd: String(row.schedule_end ?? ""),
    frequencyMinutes: Number(row.frequency_minutes ?? 0),
    fixedTimes,
  };
}

/** يجلب معرّفات محطات كل الخطوط دفعة واحدة، مفهرسة بمعرّف الخط. */
async function fetchAllRouteStopIds(): Promise<Map<string, string[]>> {
  const db = await getDb();
  const res = await db.execute(
    "SELECT route_id, stop_id FROM transit_route_stops ORDER BY route_id ASC, seq ASC",
  );
  const map = new Map<string, string[]>();
  for (const row of res.rows as Row[]) {
    const routeId = String(row.route_id);
    const list = map.get(routeId) ?? [];
    list.push(String(row.stop_id));
    map.set(routeId, list);
  }
  return map;
}

export async function listRoutes(): Promise<TransitRoute[]> {
  const db = await getDb();
  const [routesRes, stopIdsByRoute] = await Promise.all([
    db.execute("SELECT * FROM transit_routes ORDER BY created_at ASC, name ASC"),
    fetchAllRouteStopIds(),
  ]);
  return routesRes.rows.map((r) => {
    const row = r as Row;
    return rowToRoute(row, stopIdsByRoute.get(String(row.id)) ?? []);
  });
}

export async function getRoute(id: string): Promise<TransitRoute | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM transit_routes WHERE id = ?",
    args: [id],
  });
  if (!res.rows[0]) return null;
  const stopIds = await getRouteStopIds(id);
  return rowToRoute(res.rows[0] as Row, stopIds);
}

export async function createRoute(input: RouteInput): Promise<TransitRoute> {
  const db = await getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO transit_routes
            (id, name, name_en, color, description, path, schedule_start, schedule_end, frequency_minutes, fixed_times)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.nameEn ?? "",
      input.color,
      input.description ?? "",
      JSON.stringify(input.path),
      input.scheduleStart ?? "",
      input.scheduleEnd ?? "",
      input.frequencyMinutes ?? 0,
      JSON.stringify(input.fixedTimes ?? []),
    ],
  });
  return {
    id,
    name: input.name,
    nameEn: input.nameEn ?? "",
    color: input.color,
    description: input.description ?? "",
    path: input.path,
    stopIds: [],
    scheduleStart: input.scheduleStart ?? "",
    scheduleEnd: input.scheduleEnd ?? "",
    frequencyMinutes: input.frequencyMinutes ?? 0,
    fixedTimes: input.fixedTimes ?? [],
  };
}

export async function updateRoute(
  id: string,
  input: RouteInput,
): Promise<TransitRoute | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: `UPDATE transit_routes
          SET name = ?, name_en = ?, color = ?, description = ?, path = ?,
              schedule_start = ?, schedule_end = ?, frequency_minutes = ?, fixed_times = ?
          WHERE id = ?`,
    args: [
      input.name,
      input.nameEn ?? "",
      input.color,
      input.description ?? "",
      JSON.stringify(input.path),
      input.scheduleStart ?? "",
      input.scheduleEnd ?? "",
      input.frequencyMinutes ?? 0,
      JSON.stringify(input.fixedTimes ?? []),
      id,
    ],
  });
  if (res.rowsAffected === 0) return null;
  return getRoute(id);
}

export async function deleteRoute(id: string): Promise<boolean> {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM transit_route_stops WHERE route_id = ?",
    args: [id],
  });
  const res = await db.execute({
    sql: "DELETE FROM transit_routes WHERE id = ?",
    args: [id],
  });
  return res.rowsAffected > 0;
}

function rowToStop(row: Row, routeIds: string[] = []): TransitStop {
  return {
    id: String(row.id),
    name: String(row.name),
    nameEn: String(row.name_en ?? ""),
    lng: Number(row.lng),
    lat: Number(row.lat),
    routeIds,
  };
}

export async function listStops(): Promise<TransitStop[]> {
  const db = await getDb();
  const res = await db.execute(
    "SELECT * FROM transit_stops ORDER BY created_at ASC, name ASC",
  );
  return res.rows.map((r) => rowToStop(r as Row));
}

/** يجلب كل المحطات مع معرّفات الخطوط الخادمة لكل واحدة (للعرض العام على الخريطة). */
export async function listStopsWithRoutes(): Promise<TransitStop[]> {
  const db = await getDb();
  const [stopsRes, linksRes] = await Promise.all([
    db.execute("SELECT * FROM transit_stops ORDER BY created_at ASC, name ASC"),
    db.execute("SELECT route_id, stop_id FROM transit_route_stops"),
  ]);
  const routesByStop = new Map<string, string[]>();
  for (const row of linksRes.rows as Row[]) {
    const stopId = String(row.stop_id);
    const routeId = String(row.route_id);
    const list = routesByStop.get(stopId) ?? [];
    list.push(routeId);
    routesByStop.set(stopId, list);
  }
  return stopsRes.rows.map((r) =>
    rowToStop(r as Row, routesByStop.get(String((r as Row).id)) ?? []),
  );
}

export async function getStop(id: string): Promise<TransitStop | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT * FROM transit_stops WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? rowToStop(res.rows[0] as Row) : null;
}

export async function createStop(input: StopInput): Promise<TransitStop> {
  const db = await getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO transit_stops (id, name, name_en, lng, lat)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, input.name, input.nameEn ?? "", input.lng, input.lat],
  });
  return {
    id,
    name: input.name,
    nameEn: input.nameEn ?? "",
    lng: input.lng,
    lat: input.lat,
    routeIds: [],
  };
}

export async function updateStop(
  id: string,
  input: StopInput,
): Promise<TransitStop | null> {
  const db = await getDb();
  const res = await db.execute({
    sql: `UPDATE transit_stops SET name = ?, name_en = ?, lng = ?, lat = ? WHERE id = ?`,
    args: [input.name, input.nameEn ?? "", input.lng, input.lat, id],
  });
  if (res.rowsAffected === 0) return null;
  return getStop(id);
}

export async function deleteStop(id: string): Promise<boolean> {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM transit_route_stops WHERE stop_id = ?",
    args: [id],
  });
  const res = await db.execute({
    sql: "DELETE FROM transit_stops WHERE id = ?",
    args: [id],
  });
  return res.rowsAffected > 0;
}

/** يستبدل قائمة محطات الخط بالكامل بالترتيب المُعطى. */
export async function setRouteStops(
  routeId: string,
  stopIds: string[],
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM transit_route_stops WHERE route_id = ?",
    args: [routeId],
  });
  for (let i = 0; i < stopIds.length; i++) {
    await db.execute({
      sql: `INSERT INTO transit_route_stops (route_id, stop_id, seq) VALUES (?, ?, ?)`,
      args: [routeId, stopIds[i], i],
    });
  }
}

export async function getRouteStopIds(routeId: string): Promise<string[]> {
  const db = await getDb();
  const res = await db.execute({
    sql: "SELECT stop_id FROM transit_route_stops WHERE route_id = ? ORDER BY seq ASC",
    args: [routeId],
  });
  return res.rows.map((r) => String((r as Row).stop_id));
}
