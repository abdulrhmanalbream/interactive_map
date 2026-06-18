"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DEFAULT_ZOOM,
  MEDINA_CENTER,
  PLACES,
  type Place,
  type PlaceCategory,
} from "@/lib/places";
import { MAP_STYLES } from "@/lib/mapStyle";
import type { LngLat } from "./MapView";

// تحميل الخريطة في المتصفح فقط (MapLibre يعتمد على window)
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
      جارٍ تحميل الخريطة…
    </div>
  ),
});

type SearchResult = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
};

type Selected = {
  lng: number;
  lat: number;
  label: string;
  category?: PlaceCategory;
  description?: string;
  address?: string;
};

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
}
function formatDuration(s: number) {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} دقيقة` : `${Math.floor(min / 60)} س ${min % 60} د`;
}

/** يطلب موقع المستخدم ويعيد الإحداثيات أو null عند الرفض/الفشل. */
function getCurrentLocation(): Promise<LngLat | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

const ALL_ON: Record<PlaceCategory, boolean> = {
  mosque: true,
  landmark: true,
  transport: true,
  commercial: true,
};

export default function MapApp() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [filters, setFilters] = useState<Record<PlaceCategory, boolean>>(ALL_ON);
  const [styleUrl, setStyleUrl] = useState<string>(MAP_STYLES[0].url);
  const [collapsed, setCollapsed] = useState(false);
  const [showList, setShowList] = useState(false);

  const [focus, setFocus] = useState<
    { lng: number; lat: number; zoom?: number } | null
  >(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [origin, setOrigin] = useState<LngLat | null>(null);

  const [routeGeometry, setRouteGeometry] = useState<{
    type: "LineString";
    coordinates: number[][];
  } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [routing, setRouting] = useState(false);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // البيانات الافتراضية كحل احتياطي ريثما تصل بيانات قاعدة البيانات
  const [allPlaces, setAllPlaces] = useState<Place[]>(PLACES);

  const visiblePlaces = useMemo(
    () => allPlaces.filter((p) => filters[p.category]),
    [allPlaces, filters],
  );

  // جلب الأماكن من قاعدة البيانات
  useEffect(() => {
    fetch("/api/places")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.places) && d.places.length) setAllPlaces(d.places);
      })
      .catch(() => {
        /* نُبقي البيانات الافتراضية عند الفشل */
      });
  }, []);

  // بحث مع debounce وإلغاء الطلبات القديمة
  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        /* أُلغي الطلب أو فشل — نتجاهله */
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function clearRouteState() {
    setRouteGeometry(null);
    setRouteInfo(null);
  }

  function pickResult(r: SearchResult) {
    setFocus({ lng: r.lng, lat: r.lat, zoom: 16 });
    setSelected({ lng: r.lng, lat: r.lat, label: r.label, address: r.address });
    setResults([]);
    setQuery(r.label);
    clearRouteState();
  }

  function selectPlace(place: Place) {
    setFocus({ lng: place.lng, lat: place.lat, zoom: 16 });
    setSelected({
      lng: place.lng,
      lat: place.lat,
      label: place.name,
      category: place.category,
      description: place.description,
    });
    setQuery("");
    setResults([]);
    clearRouteState();
  }

  function toggleCategory(cat: PlaceCategory) {
    setFilters((f) => ({ ...f, [cat]: !f[cat] }));
  }

  function resetView() {
    setFocus({
      lng: MEDINA_CENTER[0],
      lat: MEDINA_CENTER[1],
      zoom: DEFAULT_ZOOM,
    });
  }

  async function locateMe() {
    setStatus("جارٍ تحديد موقعك…");
    const loc = await getCurrentLocation();
    if (loc) {
      setOrigin(loc);
      setFocus({ ...loc, zoom: 14 });
      setStatus("تم تحديد موقعك.");
    } else {
      setStatus("تعذّر تحديد الموقع (تأكد من السماح بالإذن).");
    }
  }

  async function getDirections() {
    if (!selected) return;
    setRouting(true);
    setStatus(null);

    // نقطة البداية: موقع المستخدم — نحدّده تلقائيًا إن لم يكن محددًا
    let start = origin;
    if (!start) {
      setStatus("جارٍ تحديد موقعك…");
      const loc = await getCurrentLocation();
      if (loc) {
        start = loc;
        setOrigin(loc);
        setStatus(null);
      } else {
        start = { lng: MEDINA_CENTER[0], lat: MEDINA_CENTER[1] };
        setStatus("تعذّر تحديد موقعك — المسار من مركز المدينة (اسمح بالإذن لمسار أدق).");
      }
    }

    try {
      const res = await fetch(
        `/api/directions?from=${start.lng},${start.lat}&to=${selected.lng},${selected.lat}`,
      );
      const data = await res.json();
      if (data.geometry) {
        setRouteGeometry(data.geometry);
        setRouteInfo({ distance: data.distance, duration: data.duration });
      } else {
        setStatus("تعذّر حساب المسار.");
      }
    } catch {
      setStatus("خطأ في الاتصال بخدمة المسارات.");
    } finally {
      setRouting(false);
    }
  }

  const searchMarker = selected
    ? { lng: selected.lng, lat: selected.lat }
    : null;

  return (
    <div className="relative h-full w-full">
      <MapView
        places={visiblePlaces}
        styleUrl={styleUrl}
        focus={focus}
        searchMarker={searchMarker}
        origin={origin}
        routeGeometry={routeGeometry}
        showHeatmap={showHeatmap}
        onSelectPlace={selectPlace}
      />

      {/* لوحة التحكم */}
      <div className="absolute inset-x-2 top-2 z-10 flex max-h-[50dvh] flex-col gap-3 overflow-auto rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur sm:inset-x-auto sm:right-4 sm:top-4 sm:max-h-[calc(100dvh-2rem)] sm:w-[340px]">
        {/* الرأس */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              خريطة المدينة المنورة
            </h1>
            <p className="text-xs text-slate-500">
              بحث · معالم · اتجاهات — مجانية بالكامل
            </p>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "عرض الخيارات" : "إخفاء الخيارات"}
            aria-expanded={!collapsed}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 transition-transform ${
                collapsed ? "" : "rotate-180"
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* مربع البحث */}
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setResults([])}
            placeholder="ابحث عن مكان…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
          {searching && (
            <span className="absolute left-2 top-2.5 text-xs text-slate-400">
              …
            </span>
          )}
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => pickResult(r)}
                    className="block w-full px-3 py-2 text-right text-sm hover:bg-slate-100"
                  >
                    <span className="font-medium text-slate-800">{r.label}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {r.address}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* بقية الخيارات (قابلة للطيّ) */}
        {!collapsed && (
          <>
            {/* بطاقة المكان المختار */}
            {selected && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  {selected.category && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor: CATEGORY_COLORS[selected.category],
                      }}
                    >
                      {CATEGORY_LABELS[selected.category]}
                    </span>
                  )}
                  <span className="font-semibold text-slate-800">
                    {selected.label}
                  </span>
                </div>
                {(selected.description || selected.address) && (
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    {selected.description || selected.address}
                  </p>
                )}
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={getDirections}
                    disabled={routing}
                    className="flex-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40"
                  >
                    {routing ? "جارٍ الحساب…" : "اتجاهات"}
                  </button>
                  <button
                    onClick={() => {
                      setSelected(null);
                      clearRouteState();
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            {/* معلومات المسار */}
            {routeInfo && (
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-2 text-sm">
                <span className="text-blue-800">
                  🚗 {formatDistance(routeInfo.distance)} ·{" "}
                  {formatDuration(routeInfo.duration)}
                </span>
                <button
                  onClick={clearRouteState}
                  className="text-xs text-blue-600 hover:underline"
                >
                  مسح المسار
                </button>
              </div>
            )}

            {/* أزرار عامة */}
            <div className="flex gap-2">
              <button
                onClick={locateMe}
                className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                📍 موقعي
              </button>
              <button
                onClick={resetView}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                العودة للمدينة
              </button>
            </div>

            {/* الفلترة + مفتاح الألوان */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                التصنيفات
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ORDER.map((cat) => {
                  const active = filters[cat];
                  const count = allPlaces.filter(
                    (p) => p.category === cat,
                  ).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        active
                          ? "border-transparent text-white"
                          : "border-slate-300 bg-white text-slate-400"
                      }`}
                      style={
                        active
                          ? { backgroundColor: CATEGORY_COLORS[cat] }
                          : undefined
                      }
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: active
                            ? "#fff"
                            : CATEGORY_COLORS[cat],
                        }}
                      />
                      {CATEGORY_LABELS[cat]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* مبدّل نمط الخريطة */}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-500">
                نمط الخريطة
              </span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {MAP_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyleUrl(s.url)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs transition ${
                      styleUrl === s.url
                        ? "bg-white font-medium text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* قائمة الأماكن */}
            <div>
              <button
                onClick={() => setShowList((v) => !v)}
                aria-expanded={showList}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <span>قائمة المعالم ({visiblePlaces.length})</span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 text-slate-500 transition-transform ${
                    showList ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {showList && (
                <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-auto">
                  {visiblePlaces.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => selectPlace(p)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm hover:bg-slate-100"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[p.category] }}
                        />
                        <span className="truncate text-slate-700">{p.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* تبديل الخريطة الحرارية */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="h-4 w-4 accent-teal-600"
              />
              إظهار الخريطة الحرارية للمعالم
            </label>

            {status && <p className="text-xs text-amber-600">{status}</p>}
          </>
        )}
      </div>
    </div>
  );
}
