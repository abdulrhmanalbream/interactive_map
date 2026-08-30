import type { Client } from "@libsql/client";
import { PLACES } from "./places";

/**
 * عميل قاعدة بيانات SQLite عبر libSQL.
 * - محليًا (file:): العميل الأصلي (native).
 * - الإنتاج/Turso (libsql:// أو https://): عميل الويب (fetch فقط، بدون native)
 *   — وهو الأنسب لبيئة Vercel/serverless.
 */
const globalForDb = globalThis as unknown as {
  _dbInit?: Promise<Client>;
};

async function createDbClient(): Promise<Client> {
  const url = process.env.DATABASE_URL ?? "file:local.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (url.startsWith("file:")) {
    const { createClient } = await import("@libsql/client");
    return createClient({ url });
  }

  const { createClient } = await import("@libsql/client/web");
  return createClient(authToken ? { url, authToken } : { url });
}

/** ينشئ العميل ثم الجدول ويعبّئ البيانات التجريبية مرة واحدة. */
async function init(): Promise<Client> {
  const client = await createDbClient();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS places (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      name_en     TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL,
      lng         REAL NOT NULL,
      lat         REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url   TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // ترقية القواعد القديمة: أضف عمود الصورة إن لم يكن موجودًا
  const cols = await client.execute("PRAGMA table_info(places)");
  const hasImage = cols.rows.some((r) => String(r.name) === "image_url");
  if (!hasImage) {
    await client.execute(
      "ALTER TABLE places ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
    );
  }
  const hasBookable = cols.rows.some((r) => String(r.name) === "bookable");
  if (!hasBookable) {
    await client.execute(
      "ALTER TABLE places ADD COLUMN bookable INTEGER NOT NULL DEFAULT 0",
    );
  }
  const hasPrice = cols.rows.some((r) => String(r.name) === "price");
  if (!hasPrice) {
    await client.execute(
      "ALTER TABLE places ADD COLUMN price REAL NOT NULL DEFAULT 0",
    );
  }
  const hasBookingUrl = cols.rows.some((r) => String(r.name) === "booking_url");
  if (!hasBookingUrl) {
    await client.execute(
      "ALTER TABLE places ADD COLUMN booking_url TEXT NOT NULL DEFAULT ''",
    );
  }

  // --- نظام النقل (خطوط وباصات ومحطات) ---
  await client.execute(`
    CREATE TABLE IF NOT EXISTS transit_routes (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      name_en     TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#2563eb',
      description TEXT NOT NULL DEFAULT '',
      path        TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // ترقية: أضف حقول جدول التوقيت (تكرار أو مواعيد ثابتة) إن لم تكن موجودة
  const routeCols = await client.execute("PRAGMA table_info(transit_routes)");
  const hasScheduleStart = routeCols.rows.some(
    (r) => String(r.name) === "schedule_start",
  );
  if (!hasScheduleStart) {
    await client.execute(
      "ALTER TABLE transit_routes ADD COLUMN schedule_start TEXT NOT NULL DEFAULT ''",
    );
  }
  const hasScheduleEnd = routeCols.rows.some(
    (r) => String(r.name) === "schedule_end",
  );
  if (!hasScheduleEnd) {
    await client.execute(
      "ALTER TABLE transit_routes ADD COLUMN schedule_end TEXT NOT NULL DEFAULT ''",
    );
  }
  const hasFrequency = routeCols.rows.some(
    (r) => String(r.name) === "frequency_minutes",
  );
  if (!hasFrequency) {
    await client.execute(
      "ALTER TABLE transit_routes ADD COLUMN frequency_minutes INTEGER NOT NULL DEFAULT 0",
    );
  }
  const hasFixedTimes = routeCols.rows.some(
    (r) => String(r.name) === "fixed_times",
  );
  if (!hasFixedTimes) {
    await client.execute(
      "ALTER TABLE transit_routes ADD COLUMN fixed_times TEXT NOT NULL DEFAULT '[]'",
    );
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS transit_stops (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      name_en     TEXT NOT NULL DEFAULT '',
      lng         REAL NOT NULL,
      lat         REAL NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS transit_route_stops (
      route_id  TEXT NOT NULL,
      stop_id   TEXT NOT NULL,
      seq       INTEGER NOT NULL,
      PRIMARY KEY (route_id, stop_id)
    )
  `);

  // --- الحجوزات ---
  await client.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id             TEXT PRIMARY KEY,
      place_id       TEXT NOT NULL,
      name           TEXT NOT NULL,
      phone          TEXT NOT NULL,
      party_size     INTEGER NOT NULL DEFAULT 1,
      price          REAL NOT NULL DEFAULT 0,
      reference_code TEXT NOT NULL,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const count = await client.execute("SELECT COUNT(*) AS c FROM places");
  if (Number(count.rows[0].c) === 0) {
    for (const p of PLACES) {
      // OR IGNORE: آمن ضد تكرار التعبئة لو تزامنت عدة نسخ serverless
      await client.execute({
        sql: `INSERT OR IGNORE INTO places (id, name, name_en, category, lng, lat, description)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, p.name, p.nameEn, p.category, p.lng, p.lat, p.description],
      });
    }
  }

  return client;
}

export async function getDb(): Promise<Client> {
  if (!globalForDb._dbInit) globalForDb._dbInit = init();
  return globalForDb._dbInit;
}
