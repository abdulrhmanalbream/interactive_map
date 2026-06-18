import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { parseGoogleMapsUrl } from "@/lib/google-maps-link";

/**
 * فكّ روابط خرائط جوجل المختصرة (maps.app.goo.gl / goo.gl) لاستخراج الإحداثيات.
 * نتبع التحويل على الخادم ثم نحلّل الرابط النهائي.
 *
 * أمان: للأدمن فقط، ومحصور في نطاقات جوجل المعروفة فقط لمنع استخدامه
 * كوسيط لجلب روابط عشوائية (SSRF).
 */

const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
  "maps.google.com",
  "www.google.com",
  "google.com",
]);

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url")?.trim();
  if (!target) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return NextResponse.json({ error: "host_not_allowed" }, { status: 400 });
  }

  // قد يكون الرابط كاملًا أصلًا (لا يحتاج فكًّا)
  const direct = parseGoogleMapsUrl(target);
  if (direct) {
    return NextResponse.json({ ...direct, resolved: target });
  }

  try {
    const res = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "interactive-map-demo/1.0 (abdullahstc808@gmail.com)",
        "Accept-Language": "ar",
      },
    });

    const finalUrl = res.url || target;
    let coords = parseGoogleMapsUrl(finalUrl);
    if (!coords) {
      // احتياطي: قد يحوي جسم الصفحة دبوس !3d!4d
      const body = await res.text();
      coords = parseGoogleMapsUrl(body);
    }
    if (!coords) {
      return NextResponse.json({ error: "no_coords" }, { status: 422 });
    }
    return NextResponse.json({ ...coords, resolved: finalUrl });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
