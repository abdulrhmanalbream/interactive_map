import { createClient, type Client } from "@libsql/client";
import { PLACES } from "./places";

/**
 * عميل قاعدة بيانات SQLite عبر libSQL.
 * - محليًا: ملف local.db (مجاني، بدون إعداد).
 * - للإنتاج لاحقًا: يكفي ضبط DATABASE_URL و DATABASE_AUTH_TOKEN لخدمة Turso المجانية.
 */
const globalForDb = globalThis as unknown as {
  _libsql?: Client;
  _dbInit?: Promise<void>;
};

function createDbClient(): Client {
  const url = process.env.DATABASE_URL ?? "file:local.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  return createClient(authToken ? { url, authToken } : { url });
}

const client = globalForDb._libsql ?? createDbClient();
if (process.env.NODE_ENV !== "production") globalForDb._libsql = client;

/** ينشئ الجدول ويعبّئ البيانات التجريبية مرة واحدة عند أول استخدام. */
async function initOnce(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS places (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      name_en     TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL,
      lng         REAL NOT NULL,
      lat         REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
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
}

export async function getDb(): Promise<Client> {
  if (!globalForDb._dbInit) globalForDb._dbInit = initOnce();
  await globalForDb._dbInit;
  return client;
}
