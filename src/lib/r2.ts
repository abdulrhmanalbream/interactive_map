import { AwsClient } from "aws4fetch";
import { randomUUID } from "node:crypto";

/**
 * رفع الصور إلى Cloudflare R2 عبر واجهة S3 المتوافقة (توقيع SigV4 بمكتبة aws4fetch).
 * المفاتيح تُقرأ من متغيّرات البيئة (يضبطها المستخدم) — لا شيء مكتوب في الكود.
 */

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function getConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

/** هل ضُبطت مفاتيح R2 كاملة؟ */
export function isR2Configured(): boolean {
  return getConfig() !== null;
}

/** الامتداد المناسب لنوع MIME، أو null إن كان غير مدعوم. */
export function extForType(type: string): string | null {
  return ALLOWED[type] ?? null;
}

/** يرفع صورة إلى R2 ويعيد رابطها العام. يرمي خطأً عند فشل الإعداد/الرفع. */
export async function uploadImage(
  body: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const cfg = getConfig();
  if (!cfg) throw new Error("r2_not_configured");
  const ext = extForType(contentType);
  if (!ext) throw new Error("unsupported_type");

  const key = `places/${randomUUID()}.${ext}`;
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`;

  // نوقّع الطلب ثم نرسله عبر fetch الأصلي غير المُرقّع.
  // Next.js يستبدل globalThis.fetch بغلاف يُسقط Content-Length للأجسام الثنائية،
  // فيرفضه R2 بالخطأ 411. fetch الأصلي محفوظ في _nextOriginalFetch.
  const signed = await client.sign(endpoint, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  const g = globalThis as unknown as {
    fetch: typeof fetch & { _nextOriginalFetch?: typeof fetch };
  };
  const rawFetch = g.fetch._nextOriginalFetch ?? g.fetch;
  const res = await rawFetch(signed);
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);

  const base = cfg.publicBaseUrl.replace(/\/+$/, "");
  return `${base}/${key}`;
}
