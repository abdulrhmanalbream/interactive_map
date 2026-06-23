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
