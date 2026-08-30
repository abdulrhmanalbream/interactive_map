"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { StyleSpecification } from "maplibre-gl";
import {
  FaArrowsUpDown,
  FaArrowUpRightFromSquare,
  FaBus,
  FaCar,
  FaCircleDot,
  FaFire,
  FaHouse,
  FaLocationCrosshairs,
  FaLocationDot,
  FaMagnifyingGlass,
  FaPersonWalking,
  FaPlus,
  FaRoute,
  FaTicket,
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
import type { TransitRoute, TransitStop } from "@/lib/transit";
import {
  nextDeparture,
  nextDepartureAtStop,
  upcomingDeparturesAtStop,
  type NextDeparture,
} from "@/lib/transit-schedule";
import type { RouteSegment } from "@/lib/route-segment";
import {
  itineraryToSegments,
  planTransitTrip,
  type TransitItinerary,
} from "@/lib/transit-routing";
import BookingSheet from "./BookingSheet";

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
  kind: "place" | "stop" | "route" | "search";
  lng: number;
  lat: number;
  label: string;
  category?: PlaceCategory;
  description?: string;
  address?: string;
  imageUrl?: string;
  // أماكن قابلة للحجز
  placeId?: string;
  bookable?: boolean;
  price?: number;
  bookingUrl?: string;
  // محطات/خطوط نقل
  entityId?: string;
  color?: string;
  routes?: {
    name: string;
    color: string;
    scheduleText: string | null;
    upcomingTimes: string[];
  }[];
  scheduleText?: string | null;
};

/** نقطة في مخطّط الاتجاهات (بداية/وجهة). */
type Stop = {
  key: string;
  label: string;
  lng: number | null;
  lat: number | null;
  myLocation?: boolean;
};

// خريطة/جدول حافلات المدينة الرسمية (هيئة تطوير منطقة المدينة المنورة) — مرجع خارجي
// للشبكة الكاملة، بما أن خطوطنا المُدارة محليًا نسخة مبسّطة قد لا تغطي كل التفاصيل.
const OFFICIAL_MADINAH_BUS_MAP_URL = "https://madinahbus.mda.gov.sa/map.html";
// نفس الخريطة الرسمية كملف PDF قابل للتحميل (خطوط + جدول مواعيد الخدمة).
const OFFICIAL_MADINAH_BUS_PDF_URL = "https://madinahbus.mda.gov.sa/img/BusTable.pdf";

type TravelMode = "drive" | "walk" | "bus";

const TRAVEL_MODE_OPTIONS: { id: TravelMode; label: string; icon: typeof FaCar }[] = [
  { id: "drive", label: "قيادة", icon: FaCar },
  { id: "walk", label: "مشي", icon: FaPersonWalking },
  { id: "bus", label: "باص", icon: FaBus },
];

// خيارات نوع الخريطة المعروضة للمستخدم (مرتبطة بمعرّفات MAP_STYLES)
const MAP_TYPE_OPTIONS = [
  { id: "liberty", label: "عادي" },
  { id: "positron", label: "رمادي" },
  { id: "satellite", label: "قمر صناعي" },
];

/** يحوّل نتيجة موعد الرحلة القادمة إلى نص مختصر، أو null إن لم يتوفر جدول. */
function formatDeparture(dep: NextDeparture | null): string | null {
  if (!dep) return null;
  if (dep.label) return `القادمة الساعة ${dep.label}`;
  if (dep.waitMinutes <= 1) return "متوفرة الآن تقريبًا";
  return `القادمة خلال ~${dep.waitMinutes} د`;
}

/** نصّ موعد الرحلة القادمة لخط نقل من بداية مساره. */
function formatScheduleText(route: TransitRoute): string | null {
  return formatDeparture(nextDeparture(route));
}

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

  // طريقة التنقّل في مخطّط الاتجاهات: قيادة / مشي / باص
  const [travelMode, setTravelMode] = useState<TravelMode>("drive");
  const [routeSegments, setRouteSegments] = useState<RouteSegment[] | null>(
    null,
  );
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [routing, setRouting] = useState(false);
  // مخطّط رحلة الباص (مشي + ركوب + مشي) عند travelMode === "bus"
  const [itinerary, setItinerary] = useState<TransitItinerary | null>(null);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // البيانات الافتراضية كحل احتياطي ريثما تصل بيانات قاعدة البيانات
  const [allPlaces, setAllPlaces] = useState<Place[]>(PLACES);

  // نظام النقل (خطوط + محطات)
  const [transitRoutes, setTransitRoutes] = useState<TransitRoute[]>([]);
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [showTransit, setShowTransit] = useState(false);
  const [isolatedRouteIds, setIsolatedRouteIds] = useState<Set<string> | null>(
    null,
  );

  // نموذج الحجز
  const [bookingOpen, setBookingOpen] = useState(false);

  const visiblePlaces = useMemo(
    () => allPlaces.filter((p) => filters[p.category]),
    [allPlaces, filters],
  );

  const selectedKind: "place" | "stop" | null =
    selected?.kind === "place"
      ? "place"
      : selected?.kind === "stop"
        ? "stop"
        : null;
  const selectedId =
    selectedKind === "place"
      ? (selected?.placeId ?? null)
      : selectedKind === "stop"
        ? (selected?.entityId ?? null)
        : null;

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

  // جلب خطوط النقل ومحطاته
  useEffect(() => {
    fetch("/api/transit/routes")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.routes)) setTransitRoutes(d.routes);
      })
      .catch(() => {});
    fetch("/api/transit/stops")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.stops)) setTransitStops(d.stops);
      })
      .catch(() => {});
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
    let cancelled = false;

    const run = async () => {
      setRouting(true);
      try {
        if (travelMode === "bus") {
          const origin: [number, number] = [valid[0].lng!, valid[0].lat!];
          const destination: [number, number] = [
            valid[valid.length - 1].lng!,
            valid[valid.length - 1].lat!,
          ];
          const trip = planTransitTrip(
            origin,
            destination,
            transitRoutes,
            transitStops,
          );
          if (cancelled) return;
          if (trip) {
            setItinerary(trip);
            setRouteSegments(itineraryToSegments(trip));
            setRouteInfo({
              distance: trip.totalDistanceMeters,
              duration: trip.totalDurationSeconds,
            });
            const busRouteIds = trip.legs
              .filter((l): l is Extract<typeof l, { mode: "bus" }> => l.mode === "bus")
              .map((l) => l.routeId);
            if (busRouteIds.length) {
              setIsolatedRouteIds(new Set(busRouteIds));
              setShowTransit(true);
            }
          } else {
            setItinerary(null);
            setRouteSegments(null);
            setRouteInfo(null);
            setStatus("لا تتوفر بيانات خطوط نقل قريبة كفاية بين هاتين النقطتين.");
          }
        } else {
          const coords = valid.map((s) => `${s.lng},${s.lat}`).join(";");
          const profile = travelMode === "walk" ? "walking" : "driving";
          const res = await fetch(
            `/api/directions?profile=${profile}&coords=${encodeURIComponent(coords)}`,
          );
          const d = await res.json();
          if (cancelled) return;
          if (d.geometry) {
            setItinerary(null);
            setRouteSegments([
              {
                mode: travelMode === "walk" ? "walk" : "drive",
                coordinates: d.geometry.coordinates,
              },
            ]);
            setRouteInfo({ distance: d.distance, duration: d.duration });
          } else {
            setStatus("تعذّر حساب المسار بين النقاط.");
          }
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
  }, [stops, mode, travelMode, transitRoutes, transitStops]);

  function clearRouteState() {
    setRouteSegments(null);
    setRouteInfo(null);
    setItinerary(null);
    setIsolatedRouteIds(null);
  }

  /** يختار طريقة التنقّل — ويحصر نقاط الاتجاهات في نقطتين فقط عند اختيار الباص. */
  function selectTravelMode(m: TravelMode) {
    setTravelMode(m);
    if (m === "bus") {
      setStops((list) =>
        list.length > 2 ? [list[0], list[list.length - 1]] : list,
      );
    }
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
    setSelected({
      kind: "search",
      lng: r.lng,
      lat: r.lat,
      label: r.label,
      address: r.address,
    });
    setBookingOpen(false);
    setIsolatedRouteIds(null);
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
      kind: "place",
      lng: place.lng,
      lat: place.lat,
      label: place.name,
      category: place.category,
      description: place.description,
      imageUrl: place.imageUrl,
      placeId: place.id,
      bookable: place.bookable,
      price: place.price,
      bookingUrl: place.bookingUrl,
    });
    setBookingOpen(false);
    setIsolatedRouteIds(null);
    setQuery("");
    setResults([]);
  }

  function handleSelectStop(stop: TransitStop) {
    if (mode === "directions") return;
    const stopCoords = new Map<string, [number, number]>(
      transitStops.map((s) => [s.id, [s.lng, s.lat]]),
    );
    const routes = stop.routeIds
      .map((id) => transitRoutes.find((r) => r.id === id))
      .filter((r): r is TransitRoute => !!r)
      .map((r) => ({
        name: r.name,
        color: r.color,
        // موعد الرحلة القادمة عند هذه المحطة تحديدًا (مع احتساب زمن السير من بداية الخط)
        scheduleText: formatDeparture(nextDepartureAtStop(r, stop.id, stopCoords)),
        upcomingTimes: upcomingDeparturesAtStop(r, stop.id, stopCoords),
      }));
    setFocus({ lng: stop.lng, lat: stop.lat, zoom: 16 });
    setSelected({
      kind: "stop",
      lng: stop.lng,
      lat: stop.lat,
      label: stop.name,
      entityId: stop.id,
      routes,
    });
    setBookingOpen(false);
    setShowTransit(true);
    setIsolatedRouteIds(new Set(stop.routeIds));
    setQuery("");
    setResults([]);
  }

  function handleSelectRoute(route: TransitRoute) {
    if (mode === "directions") return;
    const mid = route.path[Math.floor(route.path.length / 2)];
    setSelected({
      kind: "route",
      lng: mid?.[0] ?? MEDINA_CENTER[0],
      lat: mid?.[1] ?? MEDINA_CENTER[1],
      label: route.name,
      description: route.description,
      entityId: route.id,
      color: route.color,
      scheduleText: formatScheduleText(route),
    });
    setBookingOpen(false);
    setShowTransit(true);
    setIsolatedRouteIds(new Set([route.id]));
    setQuery("");
    setResults([]);
  }

  function handleClearSelection() {
    if (mode === "directions") return;
    setSelected(null);
    setBookingOpen(false);
    setIsolatedRouteIds(null);
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
    mode === "browse" && selected?.kind === "search"
      ? { lng: selected.lng, lat: selected.lat }
      : null;

  const googleMapsLink = selected
    ? `https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`
    : "#";

  return (
    <div className="relative h-full w-full" dir="rtl">
      <MapView
        places={visiblePlaces}
        transitRoutes={transitRoutes}
        transitStops={transitStops}
        showTransit={showTransit}
        isolatedRouteIds={isolatedRouteIds}
        mapStyle={resolvedStyle}
        focus={focus}
        searchMarker={searchMarker}
        origin={origin}
        routeSegments={routeSegments}
        showHeatmap={showHeatmap}
        selectedKind={selectedKind}
        selectedId={selectedId}
        onSelectPlace={handleSelectPlace}
        onSelectStop={handleSelectStop}
        onSelectRoute={handleSelectRoute}
        onClearSelection={handleClearSelection}
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
            <button
              onClick={() => {
                setShowTransit((v) => !v);
                if (showTransit) setIsolatedRouteIds(null);
              }}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
                showTransit
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <FaBus />
              النقل
            </button>
            {showTransit && (
              <a
                href={OFFICIAL_MADINAH_BUS_MAP_URL}
                target="_blank"
                rel="noreferrer"
                title="الخريطة الرسمية لحافلات المدينة (هيئة تطوير منطقة المدينة المنورة)"
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
              >
                <FaArrowUpRightFromSquare />
                الخريطة الرسمية
              </a>
            )}
            {showTransit && (
              <a
                href={OFFICIAL_MADINAH_BUS_PDF_URL}
                target="_blank"
                rel="noreferrer"
                title="دليل خطوط وجدول مواعيد حافلات المدينة (PDF)"
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
              >
                <FaArrowUpRightFromSquare />
                الدليل PDF
              </a>
            )}
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

      {/* ===== بطاقة الاختيار (مكان / محطة / خط نقل) — تصفّح ===== */}
      {mode === "browse" && selected && !bookingOpen && (
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
              {selected.kind === "stop" && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                  <FaBus className="text-[10px]" />
                  محطة نقل
                </span>
              )}
              {selected.kind === "route" && (
                <span
                  className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: selected.color ?? "#2563eb" }}
                >
                  <FaRoute className="text-[10px]" />
                  خط نقل
                </span>
              )}
            </div>
            <button
              onClick={handleClearSelection}
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
          {selected.kind === "stop" && selected.routes && (
            <div className="mt-2 space-y-1.5">
              {selected.routes.length ? (
                selected.routes.map((r) => (
                  <div
                    key={r.name}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.name}
                      </span>
                      {r.scheduleText && (
                        <span className="text-slate-400">{r.scheduleText}</span>
                      )}
                    </div>
                    {r.upcomingTimes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.upcomingTimes.map((t, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-xs text-slate-400">
                  لا تخدم هذه المحطة أي خط حاليًا.
                </span>
              )}
            </div>
          )}
          {selected.kind === "route" && selected.scheduleText && (
            <p className="mt-2 text-xs font-medium text-slate-500">
              {selected.scheduleText}
            </p>
          )}

          {selected.kind === "place" && selected.bookable && (
            <button
              onClick={() => setBookingOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-400"
            >
              <FaTicket />
              احجز{selected.price ? ` · ${selected.price} ريال` : ""}
            </button>
          )}

          {selected.kind === "place" && selected.bookingUrl && (
            <a
              href={selected.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50"
            >
              <FaArrowUpRightFromSquare />
              حجز عبر موقع الجهة
            </a>
          )}

          {(selected.kind === "place" || selected.kind === "search") && (
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
          )}
        </div>
      )}

      {/* ===== نموذج الحجز ===== */}
      {mode === "browse" &&
        bookingOpen &&
        selected?.kind === "place" &&
        selected.placeId && (
          <BookingSheet
            placeId={selected.placeId}
            placeName={selected.label}
            price={selected.price ?? 0}
            onClose={() => setBookingOpen(false)}
          />
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

          {/* طريقة التنقّل: قيادة / مشي / باص */}
          <div className="mb-3 flex gap-1 rounded-full bg-slate-100 p-1">
            {TRAVEL_MODE_OPTIONS.map((o) => {
              const Icon = o.icon;
              const active = travelMode === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => selectTravelMode(o.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon />
                  {o.label}
                </button>
              );
            })}
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

          {travelMode !== "bus" && (
            <button
              onClick={addStop}
              className="mt-2 flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-50"
            >
              <FaPlus />
              إضافة وجهة
            </button>
          )}

          {routing && (
            <p className="mt-2 text-xs text-slate-400">جارٍ حساب المسار…</p>
          )}

          {travelMode !== "bus" && routeInfo && (
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

          {travelMode === "bus" && itinerary && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between rounded-2xl bg-sky-50 px-3 py-2.5 text-sm">
                <span className="font-medium text-sky-800">
                  {formatDistance(itinerary.totalDistanceMeters)} ·{" "}
                  {formatDuration(itinerary.totalDurationSeconds)}
                </span>
                <button
                  onClick={clearRouteState}
                  className="text-xs text-sky-600 hover:underline"
                >
                  مسح
                </button>
              </div>
              <ol className="space-y-1.5">
                {itinerary.legs.map((leg, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {leg.mode === "walk" ? (
                      <FaPersonWalking className="mt-0.5 shrink-0 text-slate-400" />
                    ) : (
                      <span
                        className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: leg.color }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      {leg.mode === "walk" ? (
                        <p className="text-slate-700">
                          امشِ {formatDistance(leg.distanceMeters)} (
                          {formatDuration(leg.durationSeconds)})
                        </p>
                      ) : (
                        <>
                          <p className="font-medium text-slate-800">
                            {leg.routeName}
                          </p>
                          <p className="text-xs text-slate-500">
                            من {leg.boardStopName} إلى {leg.alightStopName} ·{" "}
                            {leg.numStops} محطة
                            {leg.departureLabel
                              ? ` · القادمة الساعة ${leg.departureLabel}`
                              : leg.waitSeconds > 0
                                ? ` · انتظار ~${Math.round(leg.waitSeconds / 60)} د`
                                : ""}
                          </p>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {travelMode === "bus" && !itinerary && !routing && (
            <p className="mt-2 text-xs text-slate-400">
              اختر نقطة بداية ووجهة لعرض رحلة الباص المقترحة.
            </p>
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
