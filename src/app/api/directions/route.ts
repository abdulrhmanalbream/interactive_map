import { NextResponse } from "next/server";

/**
 * وسيط حساب المسارات عبر OSRM المجاني (سيرفر demo عام، بدون مفتاح).
 * يقبل إمّا:
 *   - coords="lng,lat;lng,lat;..."  (وجهات متعددة، نقطتان فأكثر)
 *   - from="lng,lat" & to="lng,lat" (الصيغة القديمة — للتوافق)
 * ويعيد خط المسار + المسافة الكليّة + الزمن الكلي.
 *
 * ملاحظة للإنتاج: router.project-osrm.org سيرفر تجريبي بلا ضمان توفّر.
 * عند التوسّع استضِف OSRM ذاتيًا أو استخدم خدمة موجّهات بديلة.
 */

function parseCoord(value: string | null): [number, number] | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1]]; // [lng, lat]
}

/** يحلّل قائمة إحداثيات "lng,lat;lng,lat;..." — يعيد null عند أي عنصر غير صالح. */
function parseCoordList(value: string | null): [number, number][] | null {
  if (!value) return null;
  const pairs = value.split(";").map((p) => parseCoord(p));
  if (pairs.length < 2 || pairs.some((p) => p === null)) return null;
  return pairs as [number, number][];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // نقاط المسار: من coords (متعددة) أو من from/to (نقطتان)
  let points = parseCoordList(searchParams.get("coords"));
  if (!points) {
    const from = parseCoord(searchParams.get("from"));
    const to = parseCoord(searchParams.get("to"));
    if (from && to) points = [from, to];
  }

  if (!points) {
    return NextResponse.json(
      { error: "invalid_coordinates" },
      { status: 400 },
    );
  }

  const coords = points.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${coords}`,
  );
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: "routing_failed" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) {
      return NextResponse.json({ error: "no_route" }, { status: 404 });
    }

    return NextResponse.json({
      geometry: route.geometry, // GeoJSON LineString
      distance: route.distance, // متر
      duration: route.duration, // ثانية
    });
  } catch {
    return NextResponse.json({ error: "network_error" }, { status: 502 });
  }
}
