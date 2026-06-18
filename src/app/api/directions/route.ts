import { NextResponse } from "next/server";

/**
 * وسيط حساب المسارات عبر OSRM المجاني (سيرفر demo عام، بدون مفتاح).
 * يستقبل from و to بصيغة "lng,lat" ويعيد خط المسار + المسافة + الزمن.
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = parseCoord(searchParams.get("from"));
  const to = parseCoord(searchParams.get("to"));

  if (!from || !to) {
    return NextResponse.json(
      { error: "invalid_coordinates" },
      { status: 400 },
    );
  }

  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
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
