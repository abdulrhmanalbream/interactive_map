"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { StyleSpecification } from "maplibre-gl";
import {
  FaArrowsUpDown,
  FaArrowUpRightFromSquare,
  FaCircleDot,
  FaFire,
  FaHouse,
  FaLocationCrosshairs,
  FaLocationDot,
  FaMagnifyingGlass,
  FaPlus,
  FaRoute,
  FaXmark,
} from "react-icons/fa6";
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
import { CATEGORY_ICON } from "@/lib/category-icons";
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
  imageUrl?: string;
};

/** نقطة في مخطّط الاتجاهات (بداية/وجهة). */
type Stop = {
  key: string;
  label: string;
  lng: number | null;
  lat: number | null;
  myLocation?: boolean;
};

// خيارات نوع الخريطة المعروضة للمستخدم (مرتبطة بمعرّفات MAP_STYLES)
const MAP_TYPE_OPTIONS = [
  { id: "liberty", label: "عادي" },
  { id: "positron", label: "رمادي" },
  { id: "satellite", label: "قمر صناعي" },
];

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

/** قائمة نتائج البحث المنسدلة — مشتركة بين البحث العلوي وحقول الاتجاهات. */
function ResultsDropdown({
  results,
  onPick,
}: {
  results: SearchResult[];
  onPick: (r: SearchResult) => void;
}) {
  if (!results.length) return null;
  return (
    <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
      {results.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onPick(r)}
            className="flex w-full items-start gap-2 px-3 py-2 text-right hover:bg-slate-100"
          >
            <FaLocationDot className="mt-0.5 shrink-0 text-slate-400" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">
                {r.label}
              </span>
              <span className="block truncate text-xs text-slate-400">
                {r.address}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function MapApp() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [filters, setFilters] = useState<Record<PlaceCategory, boolean>>(ALL_ON);
  const [styleId, setStyleId] = useState<string>(MAP_STYLES[0].id);
  const [resolvedStyle, setResolvedStyle] = useState<
    string | StyleSpecification
  >(MAP_STYLES[0].style ?? "");
  const [styleLoading, setStyleLoading] = useState(false);
  const styleReqRef = useRef<string>(MAP_STYLES[0].id);

  const [focus, setFocus] = useState<
    { lng: number; lat: number; zoom?: number } | null
  >(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [origin, setOrigin] = useState<LngLat | null>(null);

  // وضع الواجهة: تصفّح عادي أو مخطّط اتجاهات متعدد الوجهات
  const [mode, setMode] = useState<"browse" | "directions">("browse");
  const [stops, setStops] = useState<Stop[]>([]);
  const [editingStopKey, setEditingStopKey] = useState<string | null>(null);
  const stopCounter = useRef(0);

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

  // اختيار النمط: الجاهز فورًا، والهجين عبر جلب غير متزامن (مع حماية من السباق)
  function chooseStyle(id: string) {
    setStyleId(id);
    styleReqRef.current = id;
    const def = MAP_STYLES.find((s) => s.id === id);
    if (!def) return;
    if (def.style) {
      setResolvedStyle(def.style);
      return;
    }
    if (!def.build) return;
    setStyleLoading(true);
    def
      .build()
      .then((s) => {
        if (styleReqRef.current === id) setResolvedStyle(s);
      })
      .catch(() => {
        /* أبقِ النمط الحالي عند فشل الجلب */
      })
      .finally(() => {
        if (styleReqRef.current === id) setStyleLoading(false);
      });
  }

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

  // إخفاء رسالة الحالة تلقائيًا بعد لحظات
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 3500);
    return () => clearTimeout(t);
  }, [status]);

  // حساب المسار عبر جميع نقاط الاتجاهات كلما تغيّرت (تنظيف المسار البائد
  // يتم داخل معالِجات تعديل النقاط، لا هنا، تجنّبًا لتحديث الحالة المتزامن).
  useEffect(() => {
    if (mode !== "directions") return;
    const valid = stops.filter((s) => s.lng != null && s.lat != null);
    if (valid.length < 2) return;
    const coords = valid.map((s) => `${s.lng},${s.lat}`).join(";");
    let cancelled = false;
    const run = async () => {
      setRouting(true);
      try {
        const res = await fetch(
          `/api/directions?coords=${encodeURIComponent(coords)}`,
        );
        const d = await res.json();
        if (cancelled) return;
        if (d.geometry) {
          setRouteGeometry(d.geometry);
          setRouteInfo({ distance: d.distance, duration: d.duration });
        } else {
          setStatus("تعذّر حساب المسار بين النقاط.");
        }
      } catch {
        if (!cancelled) setStatus("خطأ في الاتصال بخدمة المسارات.");
      } finally {
        if (!cancelled) setRouting(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [stops, mode]);

  function clearRouteState() {
    setRouteGeometry(null);
    setRouteInfo(null);
  }

  function newStop(init?: Partial<Stop>): Stop {
    return {
      key: `stop-${stopCounter.current++}`,
      label: "",
      lng: null,
      lat: null,
      ...init,
    };
  }

  function updateStop(key: string, patch: Partial<Stop>) {
    setStops((list) =>
      list.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );
  }

  // ——— التصفّح (browse) ———

  function pickSearchResult(r: SearchResult) {
    setFocus({ lng: r.lng, lat: r.lat, zoom: 16 });
    setSelected({ lng: r.lng, lat: r.lat, label: r.label, address: r.address });
    setResults([]);
    setQuery("");
  }

  function handleSelectPlace(place: Place) {
    // داخل الاتجاهات: تعبئة الحقل قيد التحرير بدل فتح البطاقة
    if (mode === "directions" && editingStopKey) {
      updateStop(editingStopKey, {
        label: place.name,
        lng: place.lng,
        lat: place.lat,
        myLocation: false,
      });
      setEditingStopKey(null);
      setQuery("");
      setResults([]);
      return;
    }
    if (mode === "directions") return; // تجاهل النقر دون حقل نشط
    setFocus({ lng: place.lng, lat: place.lat, zoom: 16 });
    setSelected({
      lng: place.lng,
      lat: place.lat,
      label: place.name,
      category: place.category,
      description: place.description,
      imageUrl: place.imageUrl,
    });
    setQuery("");
    setResults([]);
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

  // ——— الاتجاهات (directions) ———

  async function enterDirections(dest?: {
    label: string;
    lng: number;
    lat: number;
  }) {
    const start = newStop({ myLocation: true, label: "موقعي" });
    if (origin) {
      start.lng = origin.lng;
      start.lat = origin.lat;
    }
    const end = dest
      ? newStop({ label: dest.label, lng: dest.lng, lat: dest.lat })
      : newStop();

    setStops([start, end]);
    setSelected(null);
    setMode("directions");
    setEditingStopKey(dest ? null : end.key);
    setQuery("");
    setResults([]);

    // محاولة تعبئة نقطة البداية بموقع المستخدم إن لم تكن محددة
    if (start.lng == null) {
      const loc = await getCurrentLocation();
      if (loc) {
        setOrigin(loc);
        updateStop(start.key, { lng: loc.lng, lat: loc.lat });
      } else {
        setStatus("فعّل إذن الموقع أو اختر نقطة البداية يدويًا.");
      }
    }
  }

  function exitDirections() {
    setMode("browse");
    setStops([]);
    setEditingStopKey(null);
    clearRouteState();
    setQuery("");
    setResults([]);
  }

  function startEditStop(key: string) {
    setEditingStopKey(key);
    setQuery("");
    setResults([]);
  }

  function fillStopFromResult(key: string, r: SearchResult) {
    updateStop(key, {
      label: r.label,
      lng: r.lng,
      lat: r.lat,
      myLocation: false,
    });
    setEditingStopKey(null);
    setQuery("");
    setResults([]);
  }

  async function setMyLocationOrigin(key: string) {
    setStatus("جارٍ تحديد موقعك…");
    const loc = await getCurrentLocation();
    if (loc) {
      setOrigin(loc);
      updateStop(key, {
        label: "موقعي",
        lng: loc.lng,
        lat: loc.lat,
        myLocation: true,
      });
      setEditingStopKey(null);
      setStatus(null);
    } else {
      setStatus("تعذّر تحديد الموقع (تأكد من السماح بالإذن).");
    }
  }

  function addStop() {
    const s = newStop();
    setStops((list) => [...list, s]);
    setEditingStopKey(s.key);
    setQuery("");
    setResults([]);
  }

  function removeStop(key: string) {
    if (stops.length <= 2) return;
    const next = stops.filter((s) => s.key !== key);
    setStops(next);
    // إن قلّت النقاط الصالحة عن نقطتين، نظّف المسار البائد (لن يُعاد حسابه)
    const validCount = next.filter((s) => s.lng != null && s.lat != null).length;
    if (validCount < 2) clearRouteState();
    if (editingStopKey === key) setEditingStopKey(null);
  }

  function swapStops() {
    setStops((list) => [...list].reverse());
  }

  const searchMarker =
    mode === "browse" && selected
      ? { lng: selected.lng, lat: selected.lat }
      : null;

  const googleMapsLink = selected
    ? `https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`
    : "#";

  return (
    <div className="relative h-full w-full" dir="rtl">
      <MapView
        places={visiblePlaces}
        mapStyle={resolvedStyle}
        focus={focus}
        searchMarker={searchMarker}
        origin={origin}
        routeGeometry={routeGeometry}
        showHeatmap={showHeatmap}
        onSelectPlace={handleSelectPlace}
      />

      {/* ===== الشريط العلوي: بحث + أوسمة + نوع الخريطة (وضع التصفّح) ===== */}
      {mode === "browse" && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[390px]">
          {/* البحث */}
          <div className="pointer-events-auto relative">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-3 shadow-lg ring-1 ring-black/5">
              <FaMagnifyingGlass className="shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setResults([])}
                placeholder="ابحث في الخريطة…"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {searching && (
                <span className="shrink-0 text-xs text-slate-400">…</span>
              )}
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                  aria-label="مسح البحث"
                  className="shrink-0 text-slate-400 hover:text-slate-600"
                >
                  <FaXmark />
                </button>
              )}
            </div>
            <ResultsDropdown results={results} onPick={pickSearchResult} />
          </div>

          {/* أوسمة التصنيفات */}
          <div
            className="pointer-events-auto flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            {CATEGORY_ORDER.map((cat) => {
              const active = filters[cat];
              const Icon = CATEGORY_ICON[cat];
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                    active
                      ? "border-transparent text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  style={
                    active ? { backgroundColor: CATEGORY_COLORS[cat] } : undefined
                  }
                >
                  <Icon />
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>

          {/* نوع الخريطة + الكثافة */}
          <div className="pointer-events-auto flex w-fit items-center gap-1 rounded-full bg-white p-1 shadow-lg ring-1 ring-black/5">
            {MAP_TYPE_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => chooseStyle(o.id)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  styleId === o.id
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {o.label}
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-slate-200" />
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                showHeatmap
                  ? "bg-orange-500 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <FaFire />
              كثافة
            </button>
            {styleLoading && (
              <span className="px-1 text-xs text-slate-400">…</span>
            )}
          </div>
        </div>
      )}

      {/* ===== شريط الأزرار السفلي (تصفّح، بلا اختيار) ===== */}
      {mode === "browse" && !selected && (
        <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 sm:inset-x-auto sm:right-4 sm:w-[390px]">
          <button
            onClick={resetView}
            aria-label="العودة لمركز المدينة"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-1 ring-black/5 transition hover:bg-slate-50"
          >
            <FaHouse />
          </button>
          <button
            onClick={locateMe}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg ring-1 ring-black/5 transition hover:bg-slate-50"
          >
            <FaLocationCrosshairs />
            موقعي
          </button>
          <button
            onClick={() => enterDirections()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-teal-600 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-teal-500"
          >
            <FaRoute />
            الاتجاهات
          </button>
        </div>
      )}

      {/* ===== بطاقة المكان المختار (تصفّح) ===== */}
      {mode === "browse" && selected && (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-white p-4 pb-6 shadow-2xl ring-1 ring-black/5 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[390px] sm:rounded-3xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
          {selected.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.imageUrl}
              alt={selected.label}
              className="mb-3 h-36 w-full rounded-2xl object-cover"
            />
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800">
                {selected.label}
              </h2>
              {selected.category && (
                <span
                  className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: CATEGORY_COLORS[selected.category] }}
                >
                  {CATEGORY_LABELS[selected.category]}
                </span>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="إغلاق"
              className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <FaXmark />
            </button>
          </div>
          {(selected.description || selected.address) && (
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {selected.description || selected.address}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() =>
                enterDirections({
                  label: selected.label,
                  lng: selected.lng,
                  lat: selected.lat,
                })
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500"
            >
              <FaRoute />
              الاتجاهات
            </button>
            <a
              href={googleMapsLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              <FaArrowUpRightFromSquare />
              خرائط جوجل
            </a>
          </div>
        </div>
      )}

      {/* ===== مخطّط الاتجاهات متعدد الوجهات ===== */}
      {mode === "directions" && (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-3xl bg-white p-4 pb-6 shadow-2xl ring-1 ring-black/5 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[390px] sm:rounded-3xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <FaRoute className="text-teal-600" />
              الاتجاهات
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={swapStops}
                aria-label="عكس الترتيب"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <FaArrowsUpDown />
              </button>
              <button
                onClick={exitDirections}
                aria-label="إغلاق"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <FaXmark />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {stops.map((s, i) => {
              const isFirst = i === 0;
              const isEditing = editingStopKey === s.key;
              return (
                <div key={s.key} className="relative">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5">
                    <span className="shrink-0">
                      {isFirst ? (
                        <FaCircleDot className="text-teal-600" />
                      ) : (
                        <FaLocationDot className="text-rose-500" />
                      )}
                    </span>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={isFirst ? "نقطة البداية" : "اختر وجهة"}
                        className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      />
                    ) : (
                      <button
                        onClick={() => startEditStop(s.key)}
                        className="min-w-0 flex-1 truncate text-right text-sm text-slate-700"
                      >
                        {s.label || (
                          <span className="text-slate-400">
                            {isFirst ? "اختر نقطة البداية" : "اختر وجهة"}
                          </span>
                        )}
                      </button>
                    )}
                    {isFirst && (
                      <button
                        onClick={() => setMyLocationOrigin(s.key)}
                        aria-label="استخدام موقعي الحالي"
                        className="shrink-0 text-slate-400 hover:text-teal-600"
                      >
                        <FaLocationCrosshairs />
                      </button>
                    )}
                    {stops.length > 2 && (
                      <button
                        onClick={() => removeStop(s.key)}
                        aria-label="حذف الوجهة"
                        className="shrink-0 text-slate-300 hover:text-rose-500"
                      >
                        <FaXmark />
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <ResultsDropdown
                      results={results}
                      onPick={(r) => fillStopFromResult(s.key, r)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={addStop}
            className="mt-2 flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-50"
          >
            <FaPlus />
            إضافة وجهة
          </button>

          {routing && (
            <p className="mt-2 text-xs text-slate-400">جارٍ حساب المسار…</p>
          )}
          {routeInfo && (
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-teal-50 px-3 py-2.5 text-sm">
              <span className="font-medium text-teal-800">
                {formatDistance(routeInfo.distance)} ·{" "}
                {formatDuration(routeInfo.duration)}
              </span>
              <button
                onClick={clearRouteState}
                className="text-xs text-teal-600 hover:underline"
              >
                مسح
              </button>
            </div>
          )}
        </div>
      )}

      {/* رسالة حالة عابرة */}
      {status && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 mx-auto w-fit max-w-[90%] rounded-full bg-slate-900/90 px-4 py-2 text-center text-xs text-white shadow-lg">
          {status}
        </div>
      )}
    </div>
  );
}
