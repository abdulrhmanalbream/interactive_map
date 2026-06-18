import { NextResponse } from "next/server";

/**
 * وسيط البحث الجغرافي (Geocoding) عبر Nominatim المجاني من OpenStreetMap.
 * - يدعم العربية عبر accept-language=ar
 * - منحاز لنتائج المدينة المنورة عبر viewbox مع السماح بنتائج خارجها
 *
 * ملاحظة للإنتاج: خدمة Nominatim العامة لها حدود استخدام (طلب/ثانية تقريبًا)
 * وتمنع الاستخدام الكثيف. عند التوسّع يُفضّل استضافة Nominatim ذاتيًا.
 */

// مربّع تحيّز حول المدينة المنورة: lon1,lat1,lon2,lat2
const MEDINA_VIEWBOX = "39.40,24.72,39.85,24.28";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "ar");
  url.searchParams.set("countrycodes", "sa");
  url.searchParams.set("viewbox", MEDINA_VIEWBOX);
  url.searchParams.set("bounded", "0");
  url.searchParams.set("limit", "6");

  try {
    const res = await fetch(url, {
      headers: {
        // سياسة Nominatim تتطلب تعريفًا صالحًا بالتطبيق وجهة اتصال
        "User-Agent": "interactive-map-demo/1.0 (abdullahstc808@gmail.com)",
        "Accept-Language": "ar",
      },
      // تخزين مؤقت لنفس الاستعلام لتخفيف الضغط على الخدمة
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "geocoding_failed", results: [] },
        { status: 502 },
      );
    }

    type NominatimItem = {
      place_id: number;
      display_name: string;
      name?: string;
      lat: string;
      lon: string;
      type: string;
    };

    const data: NominatimItem[] = await res.json();
    const results = data.map((item) => ({
      id: String(item.place_id),
      label: item.name || item.display_name.split("،")[0] || item.display_name,
      address: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      type: item.type,
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "network_error", results: [] },
      { status: 502 },
    );
  }
}
